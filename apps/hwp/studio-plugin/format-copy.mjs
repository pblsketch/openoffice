/**
 * Hancom Hangul's 모양 복사 (format copy) for the rhwp-studio editor.
 *
 * The editor already has a one-shot format copy: Alt+C copies the character,
 * paragraph and cell properties at the caret, the next Alt+C with a block
 * pastes them, and the copy is gone afterwards. Hangul instead opens a dialog
 * (what to copy: character, paragraph, both, a character style or a paragraph
 * style, plus cell properties, borders and background), keeps the last copied
 * look until Hangul is closed, and applies it as one undo step.
 *
 * This module fills that gap from the app's side. The studio's edit command
 * calls ieumFormatCopy/ieumFormatPaste (see the studio-format-copy patch), and
 * its hasCopiedFormat asks ieumHasCopiedFormat so the existing Paste Format
 * menu entry is enabled at the right times. Nothing here imports the studio:
 * the caller passes the modal dialog, the undo commands, the cell-block helpers
 * and the locale. Changes go through the editor's own command history, so one
 * apply is one undo step and a failed apply changes nothing.
 */

/** Module specifier the studio-format-copy patches import; build-studio.mjs aliases it. */
export const FORMAT_COPY_MODULE = '@ieum/format-copy'

const VERSION = 1
/** Cells one apply may touch. */
const MAX_CELLS = 500
/** Paragraphs one apply may touch. */
const MAX_PARAGRAPHS = 5000
/** Bytes of copied state; a font name and a style name are the longest parts. */
const MAX_STATE_BYTES = 32 * 1024
const MAX_FONT_NAME = 64
const MAX_STYLE_NAME = 250
const MAX_TAB_STOPS = 512
/** The seven font languages of a character shape. */
const FONT_LANGUAGES = 7
/** A page pixel is 75 HWPUNIT; indents, margins and spacing go in at twice that. */
const PX_TO_MARGIN = 150
const PX_TO_SPACING = 75
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const BODY_OPTIONS = new Set(['chars', 'paragraph', 'both', 'charStyle', 'paragraphStyle'])
const TOAST_MS = 3200

const CHAR_KEYS = [
  'fontSize',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'textColor',
  'shadeColor',
  'emboss',
  'engrave',
  'underlineType',
  'underlineColor',
  'outlineType',
  'shadowType',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'strikeColor',
  'subscript',
  'superscript',
  'ratios',
  'spacings',
  'relativeSizes',
  'charOffsets',
  'emphasisDot',
  'underlineShape',
  'strikeShape',
  'kerning',
  'borderLeft',
  'borderRight',
  'borderTop',
  'borderBottom',
  'fillType',
  'fillColor',
  'patternColor',
  'patternType',
]

const PARA_KEYS = [
  'alignment',
  'lineSpacing',
  'lineSpacingType',
  'marginLeft',
  'marginRight',
  'indent',
  'spacingBefore',
  'spacingAfter',
  'headType',
  'paraLevel',
  'numberingId',
  'widowOrphan',
  'keepWithNext',
  'keepLines',
  'pageBreakBefore',
  'fontLineHeight',
  'singleLine',
  'autoSpaceKrEn',
  'autoSpaceKrNum',
  'verticalAlign',
  'englishBreakUnit',
  'koreanBreakUnit',
  'borderLeft',
  'borderRight',
  'borderTop',
  'borderBottom',
  'fillType',
  'fillColor',
  'patternColor',
  'patternType',
  'borderSpacing',
  'borderConnect',
  'borderIgnoreMargin',
  'tabAutoLeft',
  'tabAutoRight',
  'tabStops',
]

const CELL_PROPERTY_KEYS = [
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'applyInnerMargin',
  'verticalAlign',
  'textDirection',
  'isHeader',
  'cellProtect',
]
const CELL_BORDER_KEYS = [
  'borderLeft',
  'borderRight',
  'borderTop',
  'borderBottom',
  'diagonalLine',
  'diagonalSlash',
  'diagonalBackSlash',
  'diagonalWidth',
  'diagonalColor',
  'centerLine',
]
const CELL_BACKGROUND_KEYS = ['fillType', 'fillColor', 'patternColor', 'patternType']
const CHAR_ARRAYS = ['ratios', 'spacings', 'relativeSizes', 'charOffsets']

const COLOR_KEYS = new Set([
  'textColor',
  'shadeColor',
  'underlineColor',
  'shadowColor',
  'strikeColor',
  'fillColor',
  'patternColor',
  'diagonalColor',
])

const MESSAGES = {
  noEditor: { ko: '편집기를 찾지 못했습니다.', en: 'The editor is not ready.' },
  formMode: {
    ko: '양식 모드에서는 모양을 복사할 수 없습니다.',
    en: 'Format copy is off in form mode.',
  },
  note: {
    ko: '머리말·꼬리말·각주·미주에서는 아직 모양을 복사할 수 없습니다.',
    en: 'Format copy is not available in headers, footers or notes yet.',
  },
  object: {
    ko: '글자나 표 칸을 골라 주세요.',
    en: 'Select text or table cells first.',
  },
  unsupported: {
    ko: '이 자리에서는 모양을 복사할 수 없습니다.',
    en: 'The format cannot be copied here.',
  },
  noFormat: { ko: '복사한 모양이 없습니다.', en: 'There is no copied format.' },
  noTarget: {
    ko: '모양을 적용할 부분을 선택하세요.',
    en: 'Select where to apply the format.',
  },
  mixed: {
    ko: '본문과 표에 걸친 선택에는 모양을 복사할 수 없습니다.',
    en: 'Format copy does not cross between the body and a table.',
  },
  nestedParagraph: {
    ko: '표 안의 표에는 문단 모양을 복사할 수 없습니다. 글자 모양이나 글자 스타일만 골라 다시 시도하세요.',
    en: 'Paragraph formats cannot be copied into a table inside a cell. Choose character format or character style.',
  },
  nestedCell: {
    ko: '표 안의 표에는 셀 모양을 복사할 수 없습니다.',
    en: 'Cell formats cannot be copied into a table inside a cell.',
  },
  cellOnlyOutside: {
    ko: '셀 모양만 적용하려면 표 안의 칸을 선택하세요.',
    en: 'Select table cells to apply cell formats only.',
  },
  noCharStyle: {
    ko: '이 자리에는 글자 스타일이 없습니다.',
    en: 'There is no character style at this place.',
  },
  noParaStyle: {
    ko: '이 자리에는 문단 스타일이 없습니다.',
    en: 'There is no paragraph style at this place.',
  },
  styleGone: {
    ko: '복사해 둔 스타일이 이 문서에 없습니다.',
    en: 'The copied style is not in this document.',
  },
  tooBig: {
    ko: '선택한 범위가 너무 큽니다. 범위를 줄여 다시 시도하세요.',
    en: 'The selection is too large. Select less and try again.',
  },
  failed: {
    ko: '모양을 적용하지 못했습니다.',
    en: 'The format could not be applied.',
  },
  copied: { ko: '모양을 복사했습니다.', en: 'Format copied.' },
}

/** The copied look, per editor; the editor instance is the key, so it dies with the tab. */
const copiedFormats = new WeakMap()
/** The last choices in this editor, used as the next dialog's first choices. */
let lastChoices = null
/** The open dialog, so a second Alt+C does not stack another one. */
let openDialog = null

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isString = (value) => typeof value === 'string'
const clone = (value) => JSON.parse(JSON.stringify(value))

function pick(source, keys) {
  const out = {}
  if (!isObject(source)) return out
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

function cappedText(value, max) {
  return isString(value) ? value.slice(0, max) : ''
}

function pickChar(source) {
  if (!isObject(source)) return null
  const chars = pick(source, CHAR_KEYS)
  for (const key of COLOR_KEYS) {
    if (chars[key] !== undefined && (!isString(chars[key]) || !HEX_COLOR.test(chars[key]))) {
      delete chars[key]
    }
  }
  if (chars.fontSize !== undefined && (!isNumber(chars.fontSize) || chars.fontSize <= 0)) {
    delete chars.fontSize
  }
  for (const key of CHAR_ARRAYS) {
    const value = chars[key]
    if (value !== undefined && (!Array.isArray(value) || value.length !== FONT_LANGUAGES)) {
      delete chars[key]
    }
  }
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom']) {
    if (chars[key] !== undefined && !isObject(chars[key])) delete chars[key]
  }
  for (const key of [
    'outlineType',
    'shadowType',
    'shadowOffsetX',
    'shadowOffsetY',
    'emphasisDot',
    'underlineShape',
    'strikeShape',
    'patternType',
  ]) {
    if (chars[key] !== undefined && !isNumber(chars[key])) delete chars[key]
  }
  const families = source.fontFamilies
  if (Array.isArray(families)) {
    chars.fontFamilies = Array.from({ length: FONT_LANGUAGES }, (_, lang) =>
      cappedText(families[lang], MAX_FONT_NAME),
    )
  }
  return Object.keys(chars).length > 0 ? chars : null
}

function pickPara(source) {
  if (!isObject(source)) return null
  const para = pick(source, PARA_KEYS)
  for (const key of [
    'marginLeft',
    'marginRight',
    'indent',
    'spacingBefore',
    'spacingAfter',
    'lineSpacing',
    'paraLevel',
    'numberingId',
    'verticalAlign',
    'englishBreakUnit',
    'koreanBreakUnit',
  ]) {
    if (para[key] !== undefined && !isNumber(para[key])) delete para[key]
  }
  for (const key of COLOR_KEYS) {
    if (para[key] !== undefined && (!isString(para[key]) || !HEX_COLOR.test(para[key]))) {
      delete para[key]
    }
  }
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom']) {
    if (para[key] !== undefined && !isObject(para[key])) delete para[key]
  }
  if (para.borderSpacing !== undefined) {
    if (!Array.isArray(para.borderSpacing) || para.borderSpacing.length !== 4) {
      delete para.borderSpacing
    }
  }
  if (para.tabStops !== undefined) {
    if (!Array.isArray(para.tabStops)) delete para.tabStops
    else {
      para.tabStops = para.tabStops
        .filter(
          (stop) =>
            isObject(stop) && isNumber(stop.position) && isNumber(stop.type) && isNumber(stop.fill),
        )
        .slice(0, MAX_TAB_STOPS)
        .map((stop) => ({ position: stop.position, type: stop.type, fill: stop.fill }))
    }
  }
  return Object.keys(para).length > 0 ? para : null
}

function pickCell(source, sets) {
  if (!isObject(source) || !isObject(sets)) return null
  const out = {}
  if (sets.properties) Object.assign(out, pick(source, CELL_PROPERTY_KEYS))
  if (sets.border) Object.assign(out, pick(source, CELL_BORDER_KEYS))
  if (sets.background) Object.assign(out, pick(source, CELL_BACKGROUND_KEYS))
  for (const key of COLOR_KEYS) {
    if (out[key] !== undefined && (!isString(out[key]) || !HEX_COLOR.test(out[key]))) {
      delete out[key]
    }
  }
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom']) {
    if (out[key] !== undefined && !isObject(out[key])) delete out[key]
  }
  for (const key of [
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'paddingBottom',
    'verticalAlign',
    'textDirection',
    'diagonalLine',
    'diagonalSlash',
    'diagonalBackSlash',
    'diagonalWidth',
    'patternType',
  ]) {
    if (out[key] !== undefined && !isNumber(out[key])) delete out[key]
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Character properties as the engine's applyCharFormat takes them, with fonts by name. */
function resolveChars(wasm, chars) {
  const out = { ...chars }
  if (Array.isArray(out.fontFamilies)) {
    const names = out.fontFamilies
    const ids = names.map((name, lang) => {
      if (!isString(name) || !name.trim()) return null
      try {
        const id = wasm.findOrCreateFontIdForLang(lang, name.slice(0, MAX_FONT_NAME))
        return Number.isInteger(id) && id >= 0 ? id : null
      } catch {
        return null
      }
    })
    const fallback = ids.find((id) => id !== null)
    if (fallback !== null && fallback !== undefined) {
      out.fontIds = ids.map((id) => (id === null ? fallback : id))
    }
  }
  delete out.fontFamilies
  delete out.fontFamily
  delete out.fontId
  delete out.charShapeId
  delete out.fontName
  return JSON.stringify(out)
}

/** Paragraph properties as applyParaFormat takes them, with page pixels in engine units. */
function resolvePara(para) {
  const out = { ...para }
  for (const key of ['marginLeft', 'marginRight', 'indent']) {
    if (isNumber(out[key])) out[key] = Math.round(out[key] * PX_TO_MARGIN)
  }
  for (const key of ['spacingBefore', 'spacingAfter']) {
    if (isNumber(out[key])) out[key] = Math.round(out[key] * PX_TO_SPACING)
  }
  if (Array.isArray(out.borderSpacing)) out.borderSpacing = [...out.borderSpacing]
  if (Array.isArray(out.tabStops)) {
    out.tabStops = out.tabStops.map((stop) => ({ ...stop }))
  }
  delete out.paraShapeId
  delete out.defaultTabSpacing
  delete out.borderFillId
  return JSON.stringify(out)
}

/**
 * One end of a position in this module's terms: the paragraph (for a cell, the
 * body paragraph holding it and the path inside) and the character offset.
 */
function endOf(position) {
  if (!position) return null
  if (!Number.isInteger(position.sectionIndex) || !Number.isInteger(position.charOffset)) {
    return null
  }
  const cells =
    Array.isArray(position.cellPath) && position.cellPath.length > 0
      ? position.cellPath
      : Number.isInteger(position.cellIndex)
        ? [position]
        : null
  if (!cells) {
    return {
      sec: position.sectionIndex,
      para: position.paragraphIndex,
      path: null,
      k: position.paragraphIndex,
      offset: position.charOffset,
      isTextBox: position.isTextBox === true,
    }
  }
  const path = cells.map((entry) => ({
    controlIndex: entry.controlIndex,
    cellIndex: Number.isInteger(entry.cellIndex) ? entry.cellIndex : 0,
    cellParaIndex: entry.cellParaIndex,
  }))
  if (
    path.some(
      (entry) => !Number.isInteger(entry.controlIndex) || !Number.isInteger(entry.cellParaIndex),
    )
  ) {
    return null
  }
  return {
    sec: position.sectionIndex,
    para: Number.isInteger(position.parentParaIndex)
      ? position.parentParaIndex
      : position.paragraphIndex,
    path,
    k: path[path.length - 1].cellParaIndex,
    offset: position.charOffset,
    isTextBox: position.isTextBox === true,
  }
}

/** Whether two ends lie in the same cell (the paragraph inside may differ). */
function sameCell(a, b) {
  if (!a?.path || !b?.path) return false
  if (a.sec !== b.sec || a.para !== b.para || a.path.length !== b.path.length) return false
  return a.path.every((entry, index) => {
    const other = b.path[index]
    return (
      entry.controlIndex === other.controlIndex &&
      entry.cellIndex === other.cellIndex &&
      (index + 1 < a.path.length ? entry.cellParaIndex === other.cellParaIndex : true)
    )
  })
}

function hasBlock(ih) {
  try {
    return ih.hasSelection?.() === true || ih.isInCellSelectionMode?.() === true
  } catch {
    return false
  }
}

/** The reasons a place cannot be the source of, or the target for, a copied format. */
function placeRefusal(ih) {
  try {
    if (!ih) return 'noEditor'
    if (ih.isFormMode?.() === true) return 'formMode'
    const cursor = ih.cursor
    if (cursor?.isInHeaderFooter?.() === true || cursor?.isInFootnote?.() === true) return 'note'
    if (
      cursor?.isInPictureObjectSelection?.() === true ||
      cursor?.isInTableObjectSelection?.() === true
    ) {
      return 'object'
    }
  } catch {
    return 'unsupported'
  }
  return null
}

function sourcePlace(ih) {
  const selected = ih.hasSelection?.() === true ? ih.getSelection?.() : null
  const position = selected ? selected.start : ih.getCursorPosition?.()
  return { position, fromSelection: !!selected }
}

function styleRef(style) {
  if (!style) return null
  return {
    name: cappedText(style.name, MAX_STYLE_NAME),
    englishName: cappedText(style.englishName, MAX_STYLE_NAME),
  }
}

function findStyle(wasm, ref, type) {
  if (!ref) return null
  const wanted = [ref.name, ref.englishName]
    .filter((name) => isString(name) && name.trim())
    .map((name) => name.toLowerCase())
  if (wanted.length === 0) return null
  try {
    return (
      wasm.getStyleList().find((style) => {
        if (style.type !== type) return false
        const names = [style.name, style.englishName]
          .filter((name) => isString(name))
          .map((name) => name.toLowerCase())
        return names.some((name) => wanted.includes(name))
      }) ?? null
    )
  } catch {
    return null
  }
}

/** The one character style whose shape is this shape, or null when none or several match. */
function charStyleAt(wasm, shapeId) {
  if (!Number.isInteger(shapeId)) return null
  try {
    const styles = wasm
      .getStyleList()
      .filter((style) => style.type === 1 && style.charShapeId === shapeId)
    return styles.length === 1 ? styleRef(styles[0]) : null
  } catch {
    return null
  }
}

function paraStyleAt(wasm, sec, para, path) {
  try {
    let style = null
    if (path && path.length === 1) {
      style = wasm.getCellStyleAt(
        sec,
        para,
        path[0].controlIndex,
        path[0].cellIndex,
        path[0].cellParaIndex,
      )
    } else if (!path) {
      style = wasm.getStyleAt(sec, para)
    }
    if (!style) return null
    if (!style.englishName) {
      const listed = wasm.getStyleList().find((candidate) => candidate.id === style.id)
      if (listed) return styleRef(listed)
    }
    return styleRef(style)
  } catch {
    return null
  }
}

/** What the caret (or the start of the block) holds, in the terms the dialog and state use. */
function describeSource(ih, wasm, place) {
  const at = endOf(place.position)
  if (!at) return { refusal: 'unsupported' }
  const offset = place.fromSelection ? at.offset : at.offset > 0 ? at.offset - 1 : 0
  try {
    if (at.path) {
      const pathJson = JSON.stringify(at.path)
      const isTextBox = at.isTextBox || place.position?.isTextBox === true
      const nested = at.path.length > 1
      const byPath = wasm.getCellCharPropertiesAtByPath
      const chars =
        typeof byPath === 'function'
          ? byPath.call(wasm, at.sec, at.para, pathJson, offset)
          : wasm.getCellCharPropertiesAt(
              at.sec,
              at.para,
              at.path[0].controlIndex,
              at.path[0].cellIndex,
              at.k,
              offset,
            )
      const para = nested
        ? null
        : wasm.getCellParaPropertiesAt(
            at.sec,
            at.para,
            at.path[0].controlIndex,
            at.path[0].cellIndex,
            at.k,
          )
      const style = nested ? null : paraStyleAt(wasm, at.sec, at.para, at.path)
      const cellProps =
        !isTextBox && !nested
          ? wasm.getCellOwnProperties(
              at.sec,
              at.para,
              at.path[0].controlIndex,
              at.path[0].cellIndex,
            )
          : !isTextBox && nested
            ? wasm.getCellPropertiesByPath(
                at.sec,
                at.para,
                pathJson,
                at.path[at.path.length - 1].cellIndex,
              )
            : null
      return {
        char: chars,
        para,
        charStyle: charStyleAt(wasm, chars?.charShapeId),
        paraStyle: style,
        cellProps,
        source: { kind: isTextBox ? 'textBox' : 'cell', inTable: !isTextBox, nested, isTextBox },
      }
    }
    const chars = wasm.getCharPropertiesAt(at.sec, at.para, offset)
    return {
      char: chars,
      para: wasm.getParaPropertiesAt(at.sec, at.para),
      charStyle: charStyleAt(wasm, chars?.charShapeId),
      paraStyle: paraStyleAt(wasm, at.sec, at.para, null),
      cellProps: null,
      source: { kind: 'body', inTable: false, nested: false, isTextBox: false },
    }
  } catch {
    return { refusal: 'unsupported' }
  }
}

function initialOptions(described) {
  const nested = described.source.nested === true
  const allowed = nested ? ['chars', 'charStyle'] : [...BODY_OPTIONS]
  let body =
    lastChoices?.body && allowed.includes(lastChoices.body)
      ? lastChoices.body
      : nested
        ? 'chars'
        : 'both'
  if (body === 'charStyle' && !described.charStyle) body = nested ? 'chars' : 'both'
  const cell =
    described.source.inTable && !nested
      ? {
          properties: lastChoices?.cell?.properties !== false,
          border: lastChoices?.cell?.border !== false,
          background: lastChoices?.cell?.background !== false,
          target: lastChoices?.cell?.target === 'cellOnly' ? 'cellOnly' : 'bodyAndCell',
        }
      : null
  return { body, cell }
}

function normalizeOptions(options, described) {
  const nested = described.source.nested === true
  let body = BODY_OPTIONS.has(options?.body) ? options.body : nested ? 'chars' : 'both'
  if (nested && !['chars', 'charStyle'].includes(body)) body = 'chars'
  if (body === 'charStyle' && !described.charStyle) body = nested ? 'chars' : 'both'
  let cell = null
  if (described.source.inTable && !nested) {
    const given = isObject(options?.cell) ? options.cell : {}
    const properties = given.properties !== false
    const border = given.border !== false
    const background = given.background !== false
    if (properties || border || background) {
      cell = {
        properties,
        border,
        background,
        target: given.target === 'cellOnly' ? 'cellOnly' : 'bodyAndCell',
      }
    }
  }
  return { body, cell }
}

/** Capture the source look with the chosen parts; nothing is written here. */
function capture(ih, services, options) {
  const place = sourcePlace(ih)
  const described = describeSource(ih, services.wasm, place)
  if (described.refusal) return { refusal: described.refusal }
  const chosen = normalizeOptions(options, described)
  if (chosen.body === 'charStyle' && !described.charStyle) return { refusal: 'noCharStyle' }
  if (chosen.body === 'paragraphStyle' && !described.paraStyle) {
    return { refusal: 'noParaStyle' }
  }
  const chars = chosen.body === 'chars' || chosen.body === 'both' ? pickChar(described.char) : null
  const para =
    chosen.body === 'paragraph' || chosen.body === 'both' ? pickPara(described.para) : null
  if ((chosen.body === 'chars' || chosen.body === 'both') && !chars) {
    return { refusal: 'unsupported' }
  }
  if ((chosen.body === 'paragraph' || chosen.body === 'both') && !para) {
    return { refusal: 'unsupported' }
  }
  const cell = chosen.cell ? pickCell(described.cellProps, chosen.cell) : null
  const state = {
    version: VERSION,
    body: chosen.body,
    cell: cell ? { ...chosen.cell, props: cell } : null,
    chars,
    para,
    charStyle: chosen.body === 'charStyle' ? described.charStyle : null,
    paraStyle: chosen.body === 'paragraphStyle' ? described.paraStyle : null,
    source: {
      kind: described.source.kind,
      inTable: described.source.inTable,
      nested: described.source.nested,
    },
  }
  if (JSON.stringify(state).length > MAX_STATE_BYTES) return { refusal: 'tooBig' }
  return { state }
}

/** The cells a target covers, for cell-format application. */
function targetCells(target) {
  if (target.kind === 'cellBlock') return target.cellIndices
  if (target.kind === 'cellText' && !target.isTextBox && !target.nested) {
    const last = target.path[target.path.length - 1]
    return [last.cellIndex]
  }
  return []
}

function targetOf(ih, wasm, studio) {
  try {
    if (ih.isInCellSelectionMode?.() === true) {
      const ctx = ih.getCellTableContext?.()
      const range = ih.getSelectedCellRange?.()
      if (!ctx || !range) return { refusal: 'noTarget' }
      const path = Array.isArray(ctx.cellPath) && ctx.cellPath.length > 0 ? ctx.cellPath : null
      const nested = path ? path.length > 1 : false
      const dims = nested
        ? wasm.getTableDimensionsByPath(ctx.sec, ctx.ppi, JSON.stringify(path))
        : wasm.getTableDimensions(ctx.sec, ctx.ppi, ctx.ci)
      const cellAt = nested
        ? (cellIdx) =>
            wasm.getCellInfoByPath(
              ctx.sec,
              ctx.ppi,
              JSON.stringify(studio.withCellPathTarget(path, cellIdx)),
            )
        : (cellIdx) => wasm.getCellInfo(ctx.sec, ctx.ppi, ctx.ci, cellIdx)
      const excluded = new Set(ih.cursor?.getExcludedCells?.() ?? [])
      const cellIndices = studio.selectCellIndicesInRange(dims.cellCount, cellAt, range, excluded)
      return {
        kind: 'cellBlock',
        sec: ctx.sec,
        ppi: ctx.ppi,
        ci: ctx.ci,
        path,
        nested,
        cellIndices,
      }
    }
    if (ih.hasSelection?.() !== true) return { refusal: 'noTarget' }
    const selection = ih.getSelection?.()
    if (!selection) return { refusal: 'noTarget' }
    const start = endOf(selection.start)
    const end = endOf(selection.end)
    if (!start || !end) return { refusal: 'unsupported' }
    if (start.path && end.path && sameCell(start, end)) {
      return {
        kind: 'cellText',
        sec: start.sec,
        para: start.para,
        path: start.path,
        nested: start.path.length > 1,
        isTextBox: start.isTextBox || selection.start.isTextBox === true,
        sel: selection,
      }
    }
    if (!start.path && !end.path && start.sec === end.sec) {
      return {
        kind: 'body',
        sec: start.sec,
        startPara: start.k,
        endPara: end.k,
        sel: selection,
      }
    }
    return { refusal: 'mixed' }
  } catch {
    return { refusal: 'unsupported' }
  }
}

function cellPosition(target, cellIdx, cellPara, offset, studio) {
  const path =
    target.nested || target.path
      ? studio.withCellPathTarget(target.path, cellIdx, cellPara)
      : [{ controlIndex: target.ci, cellIndex: cellIdx, cellParaIndex: cellPara }]
  return {
    sectionIndex: target.sec,
    paragraphIndex: target.ppi,
    parentParaIndex: target.ppi,
    controlIndex: path[path.length - 1].controlIndex,
    cellIndex: cellIdx,
    cellParaIndex: cellPara,
    ...(target.nested ? { cellPath: path } : {}),
    charOffset: offset,
  }
}

function cellParent(target) {
  return target.kind === 'cellText' ? target.para : target.ppi
}

function cellControl(target) {
  return target.kind === 'cellText' ? target.path[0].controlIndex : target.ci
}

function cellIndexAt(target, cellIdx) {
  return target.kind === 'cellText' ? target.path[0].cellIndex : cellIdx
}

function cellParagraphCount(target, cellIdx, wasm, studio) {
  return target.nested
    ? wasm.getCellParagraphCountByPath(
        target.sec,
        cellParent(target),
        cellPathJson(target, cellIdx, 0, studio),
      )
    : wasm.getCellParagraphCount(
        target.sec,
        cellParent(target),
        cellControl(target),
        cellIndexAt(target, cellIdx),
      )
}

function cellPathJson(target, cellIdx, cellPara, studio) {
  if (target.path) return JSON.stringify(studio.withCellPathTarget(target.path, cellIdx, cellPara))
  return JSON.stringify([{ controlIndex: target.ci, cellIndex: cellIdx, cellParaIndex: cellPara }])
}

function cellParagraphLength(target, cellIdx, cellPara, wasm, studio) {
  return target.nested
    ? wasm.getCellParagraphLengthByPath(
        target.sec,
        cellParent(target),
        cellPathJson(target, cellIdx, cellPara, studio),
      )
    : wasm.getCellParagraphLength(
        target.sec,
        cellParent(target),
        cellControl(target),
        cellIndexAt(target, cellIdx),
        cellPara,
      )
}

function charRanges(target, wasm, studio) {
  if (target.kind === 'body' || target.kind === 'cellText') {
    return target.sel ? [{ start: target.sel.start, end: target.sel.end }] : []
  }
  if (target.kind !== 'cellBlock') return []
  const ranges = []
  for (const cellIdx of target.cellIndices) {
    const count = cellParagraphCount(target, cellIdx, wasm, studio)
    if (count <= 0) continue
    const last = count - 1
    const length = cellParagraphLength(target, cellIdx, last, wasm, studio)
    if (last === 0 && length === 0) continue
    ranges.push({
      start: cellPosition(target, cellIdx, 0, 0, studio),
      end: cellPosition(target, cellIdx, last, length, studio),
    })
    if (ranges.length > MAX_CELLS) return null
  }
  return ranges
}

function charStyleEntries(target, wasm, studio, shapeId) {
  const entries = []
  if (target.kind === 'body' || target.kind === 'cellText') {
    const start = endOf(target.sel?.start)
    const end = endOf(target.sel?.end)
    if (!start || !end) return entries
    for (let k = start.k; k <= end.k; k += 1) {
      const length =
        target.kind === 'body'
          ? wasm.getParagraphLength(target.sec, k)
          : cellParagraphLength(
              target,
              target.path[target.path.length - 1].cellIndex,
              k,
              wasm,
              studio,
            )
      const from = k === start.k ? start.offset : 0
      const to = k === end.k ? end.offset : length
      if (to <= from) continue
      if (target.kind === 'body') {
        entries.push({
          kind: 'body',
          sec: target.sec,
          para: k,
          start: from,
          end: to,
          shapeId,
        })
      } else {
        const cellIdx = target.path[target.path.length - 1].cellIndex
        entries.push({
          kind: 'cell',
          sec: target.sec,
          parentPara: target.para,
          pathJson: cellPathJson(target, cellIdx, k, studio),
          start: from,
          end: to,
          shapeId,
        })
      }
      if (entries.length > MAX_PARAGRAPHS) return null
    }
    return entries
  }
  if (target.kind !== 'cellBlock') return entries
  for (const cellIdx of target.cellIndices) {
    const count = cellParagraphCount(target, cellIdx, wasm, studio)
    for (let k = 0; k < count; k += 1) {
      const length = cellParagraphLength(target, cellIdx, k, wasm, studio)
      if (length <= 0) continue
      entries.push({
        kind: 'cell',
        sec: target.sec,
        parentPara: target.ppi,
        pathJson: cellPathJson(target, cellIdx, k, studio),
        start: 0,
        end: length,
        shapeId,
      })
      if (entries.length > MAX_PARAGRAPHS) return null
    }
    if (entries.length > MAX_PARAGRAPHS) return null
  }
  return entries
}

function paraTargets(target, wasm, studio) {
  const targets = []
  if (target.nested) return null
  if (target.kind === 'body') {
    for (let k = target.startPara; k <= target.endPara; k += 1) {
      targets.push({ kind: 'body', sec: target.sec, para: k })
      if (targets.length > MAX_PARAGRAPHS) return null
    }
    return targets
  }
  if (target.kind === 'cellText') {
    const last = target.path[target.path.length - 1]
    const startK = Number.isInteger(target.sel?.start?.cellParaIndex)
      ? target.sel.start.cellParaIndex
      : last.cellParaIndex
    const endK = Number.isInteger(target.sel?.end?.cellParaIndex)
      ? target.sel.end.cellParaIndex
      : last.cellParaIndex
    for (let k = startK; k <= endK; k += 1) {
      targets.push({
        kind: 'cell',
        sec: target.sec,
        parentPara: target.para,
        controlIdx: last.controlIndex,
        cellIdx: last.cellIndex,
        cellParaIdx: k,
      })
      if (targets.length > MAX_PARAGRAPHS) return null
    }
    return targets
  }
  if (target.kind === 'cellBlock') {
    const block = {
      sec: target.sec,
      ppi: target.ppi,
      ci: target.ci,
      cellIndices: target.cellIndices,
    }
    const list = studio.paraFormatTargetsForCellBlock(block, (cellIdx) =>
      wasm.getCellParagraphCount(target.sec, target.ppi, target.ci, cellIdx),
    )
    return list.length > MAX_PARAGRAPHS ? null : list
  }
  return targets
}

function cellEntries(target, props) {
  if (!props || !isObject(props)) return []
  if (target.kind !== 'cellBlock' && target.kind !== 'cellText') return []
  if (target.isTextBox || target.nested) return []
  const cells = targetCells(target)
  const entries = []
  for (const cellIdx of cells) {
    entries.push({
      sec: target.sec,
      parentPara: target.kind === 'cellBlock' ? target.ppi : target.para,
      controlIdx:
        target.kind === 'cellBlock' ? target.ci : target.path[target.path.length - 1].controlIndex,
      cellIdx,
      props,
    })
    if (entries.length > MAX_CELLS) return null
  }
  return entries
}

/** One command that applies cell properties and restores their full previous values. */
function cellFormatCommand(entries, cursor) {
  return {
    type: 'applyCellFormat',
    timestamp: Date.now(),
    entries,
    execute(wasm) {
      if (this.entries.every((entry) => entry.after !== undefined)) {
        wasm.runInBatch(() => {
          for (const entry of this.entries) {
            wasm.setCellProperties(
              entry.sec,
              entry.parentPara,
              entry.controlIdx,
              entry.cellIdx,
              JSON.stringify(entry.after),
            )
          }
        })
        return cursor
      }
      const done = []
      try {
        wasm.runInBatch(() => {
          for (const entry of this.entries) {
            entry.before = wasm.getCellOwnProperties(
              entry.sec,
              entry.parentPara,
              entry.controlIdx,
              entry.cellIdx,
            )
            wasm.setCellProperties(
              entry.sec,
              entry.parentPara,
              entry.controlIdx,
              entry.cellIdx,
              JSON.stringify(entry.props),
            )
            entry.after = wasm.getCellOwnProperties(
              entry.sec,
              entry.parentPara,
              entry.controlIdx,
              entry.cellIdx,
            )
            done.push(entry)
          }
        })
      } catch (error) {
        for (const entry of done.reverse()) {
          try {
            wasm.setCellProperties(
              entry.sec,
              entry.parentPara,
              entry.controlIdx,
              entry.cellIdx,
              JSON.stringify(entry.before),
            )
          } catch {
            // keep the first failure
          }
        }
        throw error
      }
      return cursor
    },
    undo(wasm) {
      for (const entry of [...this.entries].reverse()) {
        if (entry.before !== undefined) {
          wasm.setCellProperties(
            entry.sec,
            entry.parentPara,
            entry.controlIdx,
            entry.cellIdx,
            JSON.stringify(entry.before),
          )
        }
      }
      return cursor
    },
    isNoOp() {
      return this.entries.length === 0
    },
    mergeWith() {
      return null
    },
  }
}

/** One command that applies a character style and restores the previous character runs. */
function charStyleCommand(entries, cursor) {
  const read = (wasm, entry) =>
    entry.kind === 'body'
      ? wasm.getCharShapeRuns(entry.sec, entry.para, entry.start, entry.end)
      : wasm.getCharShapeRunsInCellByPath(
          entry.sec,
          entry.parentPara,
          entry.pathJson,
          entry.start,
          entry.end,
        )
  const writeShape = (wasm, entry) =>
    entry.kind === 'body'
      ? wasm.setCharShapeId(entry.sec, entry.para, entry.start, entry.end, entry.shapeId)
      : wasm.setCharShapeIdInCellByPath(
          entry.sec,
          entry.parentPara,
          entry.pathJson,
          entry.start,
          entry.end,
          entry.shapeId,
        )
  const writeRuns = (wasm, entry, runs) =>
    entry.kind === 'body'
      ? wasm.setCharShapeRuns(entry.sec, entry.para, entry.start, entry.end, runs)
      : wasm.setCharShapeRunsInCellByPath(
          entry.sec,
          entry.parentPara,
          entry.pathJson,
          entry.start,
          entry.end,
          runs,
        )
  return {
    type: 'applyCharFormat',
    timestamp: Date.now(),
    entries,
    execute(wasm) {
      if (this.entries.every((entry) => entry.afterRuns !== undefined)) {
        wasm.runInBatch(() => {
          for (const entry of this.entries) writeRuns(wasm, entry, entry.afterRuns)
        })
        return cursor
      }
      const done = []
      try {
        wasm.runInBatch(() => {
          for (const entry of this.entries) {
            entry.beforeRuns = read(wasm, entry)
            writeShape(wasm, entry)
            entry.afterRuns = read(wasm, entry)
            done.push(entry)
          }
        })
      } catch (error) {
        for (const entry of done.reverse()) {
          try {
            writeRuns(wasm, entry, entry.beforeRuns)
          } catch {
            // keep the first failure
          }
        }
        throw error
      }
      return cursor
    },
    undo(wasm) {
      for (const entry of [...this.entries].reverse()) {
        if (entry.beforeRuns !== undefined) writeRuns(wasm, entry, entry.beforeRuns)
      }
      return cursor
    },
    isNoOp() {
      return this.entries.length === 0
    },
    mergeWith() {
      return null
    },
  }
}

/** One command that resolves the fonts and applies the character properties to every range. */
function charFormatCommand(studio, ranges, chars, cursor) {
  return {
    type: 'applyCharFormat',
    timestamp: Date.now(),
    ranges,
    chars,
    children: null,
    execute(wasm) {
      if (!this.children) {
        const props = resolveChars(wasm, this.chars)
        this.children = this.ranges.map(
          (range) => new studio.ApplyCharFormatCommand(range.start, range.end, props),
        )
      }
      const done = []
      try {
        for (const child of this.children) {
          child.execute(wasm)
          done.push(child)
        }
      } catch (error) {
        for (const child of done.reverse()) {
          try {
            child.undo(wasm)
          } catch {
            // keep the first failure
          }
        }
        throw error
      }
      return cursor
    },
    undo(wasm) {
      if (!this.children) return cursor
      for (const child of [...this.children].reverse()) child.undo(wasm)
      return cursor
    },
    isNoOp() {
      return (
        this.ranges.length === 0 ||
        this.children?.every((child) => child.isNoOp?.() === true) === true
      )
    },
    mergeWith() {
      return null
    },
  }
}

function composite(children, type, cursor) {
  return {
    type,
    timestamp: Date.now(),
    children,
    execute(wasm) {
      const done = []
      try {
        for (const child of this.children) {
          child.execute(wasm)
          done.push(child)
        }
      } catch (error) {
        for (const child of done.reverse()) {
          try {
            child.undo(wasm)
          } catch {
            // keep the first failure
          }
        }
        throw error
      }
      return cursor
    },
    undo(wasm) {
      for (const child of [...this.children].reverse()) child.undo(wasm)
      return cursor
    },
    isNoOp() {
      return this.children.every((child) => child.isNoOp?.() === true)
    },
    mergeWith() {
      return null
    },
  }
}

function planApply(services, studio, ih, state, target) {
  const wasm = services.wasm
  const body = state.body
  const cellSelected = !!state.cell
  const cellOnly = state.cell?.target === 'cellOnly'
  const applyBody = !cellOnly
  const nested = target.nested === true
  if (
    applyBody &&
    nested &&
    (body === 'paragraph' || body === 'both' || body === 'paragraphStyle')
  ) {
    return { refusal: 'nestedParagraph' }
  }
  if (nested && cellSelected) return { refusal: 'nestedCell' }
  if (cellSelected && (target.kind === 'body' || target.isTextBox) && cellOnly) {
    return { refusal: 'cellOnlyOutside' }
  }
  if (applyBody && body === 'charStyle' && !state.charStyle) return { refusal: 'noCharStyle' }
  if (applyBody && body === 'paragraphStyle' && !state.paraStyle) return { refusal: 'noParaStyle' }
  if (applyBody && (body === 'chars' || body === 'both') && !state.chars) {
    return { refusal: 'noFormat' }
  }
  if (applyBody && (body === 'paragraph' || body === 'both') && !state.para) {
    return { refusal: 'noFormat' }
  }

  const cells = cellSelected ? cellEntries(target, state.cell.props) : []
  if (cells === null) return { refusal: 'tooBig' }
  if (cellSelected && cellOnly && cells.length === 0) {
    return { refusal: target.kind === 'body' || target.isTextBox ? 'cellOnlyOutside' : 'noTarget' }
  }
  if (cellOnly) {
    return { children: [cellFormatCommand(cells, ih.getCursorPosition())], type: 'applyParaFormat' }
  }

  if (applyBody && body === 'paragraphStyle') {
    const style = findStyle(wasm, state.paraStyle, 0)
    if (!style) return { refusal: 'styleGone' }
    const targets = paraTargets(target, wasm, studio)
    if (targets === null) return { refusal: 'tooBig' }
    if (targets.length === 0) return { refusal: 'noTarget' }
    return {
      snapshot: {
        styleId: style.id,
        targets,
        cells,
      },
    }
  }

  const children = []
  let type = 'applyParaFormat'
  if (body === 'charStyle') {
    const style = findStyle(wasm, state.charStyle, 1)
    if (!style) return { refusal: 'styleGone' }
    const entries = charStyleEntries(target, wasm, studio, style.charShapeId)
    if (entries === null) return { refusal: 'tooBig' }
    if (entries.length === 0) return { refusal: 'noTarget' }
    children.push(charStyleCommand(entries, ih.getCursorPosition()))
    type = 'applyCharFormat'
  }
  if (body === 'chars' || body === 'both') {
    const ranges = charRanges(target, wasm, studio)
    if (ranges === null) return { refusal: 'tooBig' }
    if (ranges.length > 0) {
      children.push(charFormatCommand(studio, ranges, state.chars, ih.getCursorPosition()))
      type = 'applyCharFormat'
    }
  }
  if (body === 'paragraph' || body === 'both') {
    const targets = paraTargets(target, wasm, studio)
    if (targets === null) return { refusal: 'tooBig' }
    if (targets.length > 0) {
      children.push(
        new studio.ApplyParaFormatCommand(targets, resolvePara(state.para), ih.getCursorPosition()),
      )
    }
  }
  if (cells.length > 0) {
    children.push(cellFormatCommand(cells, ih.getCursorPosition()))
  }
  if (children.length === 0) return { refusal: 'noTarget' }
  return { children, type }
}

function runSnapshot(ih, plan) {
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'formatCopyStyle',
    operation: (wasm) => {
      const run = () => {
        for (const target of plan.targets) {
          if (target.kind === 'body') wasm.applyStyle(target.sec, target.para, plan.styleId)
          else {
            wasm.applyCellStyle(
              target.sec,
              target.parentPara,
              target.controlIdx,
              target.cellIdx,
              target.cellParaIdx,
              plan.styleId,
            )
          }
        }
        for (const entry of plan.cells) {
          wasm.setCellProperties(
            entry.sec,
            entry.parentPara,
            entry.controlIdx,
            entry.cellIdx,
            JSON.stringify(entry.props),
          )
        }
      }
      if (typeof wasm.runInBatch === 'function') wasm.runInBatch(run)
      else run()
      return ih.getCursorPosition()
    },
  })
}

function say(studio, key, custom) {
  const message = custom ?? MESSAGES[key]?.[studio.locale === 'ko' ? 'ko' : 'en']
  if (!message) return
  try {
    studio.showToast?.({ message, durationMs: TOAST_MS })
  } catch {
    // a toast is a help, not part of the change
  }
}

function applyCopied(services, studio, ih, state) {
  const target = targetOf(ih, services.wasm, studio)
  if (target.refusal) {
    say(studio, target.refusal)
    return { ok: false, reason: target.refusal }
  }
  const plan = (() => {
    try {
      return planApply(services, studio, ih, state, target)
    } catch {
      return { refusal: 'failed' }
    }
  })()
  if (plan.refusal) {
    say(studio, plan.refusal)
    return { ok: false, reason: plan.refusal }
  }
  try {
    if (plan.snapshot) runSnapshot(ih, plan.snapshot)
    else {
      ih.executeOperation({
        kind: 'command',
        command: composite(plan.children, plan.type, ih.getCursorPosition()),
      })
    }
    ih.focus?.()
    return { ok: true }
  } catch {
    say(studio, 'failed')
    return { ok: false, reason: 'failed' }
  }
}

function openCopy(services, studio, ih, described) {
  const locale = studio.locale === 'ko' ? 'ko' : 'en'
  const ko = locale === 'ko'
  const initial = initialOptions(described)
  const Dialog = studio.ModalDialog
  if (!Dialog) {
    let result
    try {
      result = capture(ih, services, initial)
    } catch {
      say(studio, 'failed')
      return { ok: false, reason: 'failed' }
    }
    if (result.refusal) {
      say(studio, result.refusal)
      return { ok: false, reason: result.refusal }
    }
    copiedFormats.set(ih, result.state)
    lastChoices = clone(initial)
    say(studio, 'copied')
    ih.focus?.()
    return { ok: true }
  }
  if (openDialog) return { ok: false, reason: 'dialog_open' }

  const finish = (options) => {
    let result
    try {
      result = capture(ih, services, options)
    } catch {
      say(studio, 'failed')
      return false
    }
    if (result.refusal) {
      say(studio, result.refusal)
      return false
    }
    copiedFormats.set(ih, result.state)
    lastChoices = clone(options)
    say(studio, 'copied')
    ih.focus?.()
    return true
  }

  class FormatCopyDialog extends Dialog {
    constructor() {
      super(ko ? '모양 복사' : 'Format Painter', 440)
      this.options = clone(initial)
    }

    createBody() {
      const doc = globalThis.document
      const body = doc.createElement('div')
      body.style.padding = '12px 16px'
      const heading = (text) => {
        const h = doc.createElement('div')
        h.className = 'dialog-section-title'
        h.textContent = text
        return h
      }
      const radio = (name, value, label, disabled) => {
        const wrap = doc.createElement('label')
        wrap.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:2px 0;white-space:nowrap'
        const input = doc.createElement('input')
        input.type = 'radio'
        input.name = name
        input.value = value
        input.checked = this.options.body === value
        input.disabled = disabled === true
        input.addEventListener('change', () => {
          if (input.checked) this.options.body = value
        })
        wrap.append(input, label)
        return wrap
      }

      body.appendChild(heading(ko ? '본문 모양 복사' : 'Text format'))
      const nested = described.source.nested === true
      body.appendChild(
        radio('ieum-format-copy-body', 'chars', ko ? '글자 모양' : 'Character format'),
      )
      body.appendChild(
        radio('ieum-format-copy-body', 'paragraph', ko ? '문단 모양' : 'Paragraph format', nested),
      )
      body.appendChild(
        radio(
          'ieum-format-copy-body',
          'both',
          ko ? '글자 모양과 문단 모양 둘 다' : 'Character and paragraph formats',
          nested,
        ),
      )
      body.appendChild(
        radio(
          'ieum-format-copy-body',
          'charStyle',
          ko ? '글자 스타일' : 'Character style',
          !described.charStyle,
        ),
      )
      body.appendChild(
        radio(
          'ieum-format-copy-body',
          'paragraphStyle',
          ko ? '문단 스타일' : 'Paragraph style',
          nested,
        ),
      )

      if (described.source.inTable && !nested) {
        body.appendChild(heading(ko ? '셀 모양 복사' : 'Cell format'))
        const checks = doc.createElement('div')
        checks.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;padding:2px 0 8px'
        const check = (key, label) => {
          const wrap = doc.createElement('label')
          wrap.style.cssText = 'display:flex;align-items:center;gap:4px;white-space:nowrap'
          const input = doc.createElement('input')
          input.type = 'checkbox'
          input.checked = this.options.cell?.[key] !== false
          input.addEventListener('change', () => {
            if (!this.options.cell) this.options.cell = {}
            this.options.cell[key] = input.checked
            syncTarget()
          })
          wrap.append(input, label)
          return wrap
        }
        checks.append(
          check('properties', ko ? '셀 속성' : 'Cell properties'),
          check('border', ko ? '셀 테두리' : 'Cell borders'),
          check('background', ko ? '셀 배경' : 'Cell background'),
        )
        body.appendChild(checks)
        const targetHeading = heading(ko ? '표에서 적용 대상' : 'Apply in tables')
        body.appendChild(targetHeading)
        const targetWrap = doc.createElement('div')
        const targetRadio = (value, label) => {
          const wrap = doc.createElement('label')
          wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0'
          const input = doc.createElement('input')
          input.type = 'radio'
          input.name = 'ieum-format-copy-target'
          input.value = value
          input.checked = this.options.cell?.target === value
          input.addEventListener('change', () => {
            if (input.checked && this.options.cell) this.options.cell.target = value
          })
          wrap.append(input, label)
          targetWrap.appendChild(wrap)
          return input
        }
        const both = targetRadio(
          'bodyAndCell',
          ko ? '본문 모양과 셀 모양 둘 다' : 'Text and cell formats',
        )
        const only = targetRadio('cellOnly', ko ? '셀 모양만' : 'Cell formats only')
        const syncTarget = () => {
          const cell = this.options.cell
          const any =
            !!cell &&
            (cell.properties !== false || cell.border !== false || cell.background !== false)
          only.disabled = !any
          targetHeading.style.display = any ? '' : 'none'
          targetWrap.style.display = any ? '' : 'none'
          if (!any) {
            both.checked = true
            if (cell) cell.target = 'bodyAndCell'
          }
        }
        body.appendChild(targetWrap)
        syncTarget()
      }
      return body
    }

    onConfirm() {
      return finish(this.options)
    }

    show() {
      super.show()
      const button = this.dialog?.querySelector('.dialog-btn-primary')
      if (button) button.textContent = ko ? '복사' : 'Copy'
    }
  }

  const dialog = new FormatCopyDialog()
  openDialog = dialog
  dialog.afterClose = () => {
    if (openDialog === dialog) openDialog = null
  }
  dialog.show()
  return { ok: true, opened: true }
}

/** The editor's edit command: copy a look, or apply the copied one to the block. */
export function ieumFormatCopy(services, studio = {}) {
  const ih = services?.getInputHandler?.()
  const refusal = placeRefusal(ih)
  if (refusal) {
    say(studio, refusal)
    return { ok: false, reason: refusal }
  }
  const state = copiedFormats.get(ih)
  if (state && hasBlock(ih)) return applyCopied(services, studio, ih, state)
  let place
  try {
    place = sourcePlace(ih)
  } catch {
    say(studio, 'unsupported')
    return { ok: false, reason: 'unsupported' }
  }
  const described = describeSource(ih, services.wasm, place)
  if (described.refusal) {
    say(studio, described.refusal)
    return { ok: false, reason: described.refusal }
  }
  return openCopy(services, studio, ih, described)
}

/** The editor's paste command: apply the copied look to the current block. */
export function ieumFormatPaste(services, studio = {}) {
  const ih = services?.getInputHandler?.()
  const refusal = placeRefusal(ih)
  if (refusal) {
    say(studio, refusal)
    return { ok: false, reason: refusal }
  }
  const state = copiedFormats.get(ih)
  if (!state) {
    say(studio, 'noFormat')
    return { ok: false, reason: 'noFormat' }
  }
  return applyCopied(services, studio, ih, state)
}

/** Whether this editor has a copied look; the studio's Paste Format enablement asks this. */
export function ieumHasCopiedFormat(ih) {
  return !!ih && copiedFormats.has(ih)
}

/** Drops the copied look (tests and a future explicit cancel); not a user-facing command yet. */
export function clearCopiedFormat(ih) {
  copiedFormats.delete(ih)
}

/** Parts of the module that the tests exercise directly. */
export const __formatCopyTest = {
  endOf,
  sameCell,
  pickChar,
  pickPara,
  pickCell,
  resolveChars,
  resolvePara,
  normalizeOptions,
  initialOptions,
  describeSource,
  capture,
  targetOf,
  planApply,
  composite,
  cellFormatCommand,
  charStyleCommand,
  charRanges,
  charStyleEntries,
  paraTargets,
  cellEntries,
  targetCells,
  findStyle,
  charStyleAt,
}
