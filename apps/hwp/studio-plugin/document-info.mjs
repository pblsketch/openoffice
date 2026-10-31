/**
 * 문서 정보 (Hangul: 파일 → 문서 정보, Ctrl+Q,I / Ctrl+Q,D): the [문서 통계] panel of Hangul's
 * dialog, counted from the document the editor already holds.
 *
 * Hangul's counting rules, from its own help (문서 정보: 문서 통계):
 *   - 글자(공백 포함): a blank or a tab is one character; a Hangul syllable is one character and
 *     a letter or digit is one character.
 *   - 글자(공백 제외): the same without blanks and tabs.
 *   - 글자에 포함된 한자 수: the Han characters among them.
 *   - 낱말: one word per run of characters between blanks.
 *   - 문단: a table cell is one paragraph, so a 5×5 table is 25 paragraphs.
 *   - 원고지(200자 기준): what the body text takes at 200 characters a sheet, plus one sheet each
 *     for the tables, pictures and text boxes a sheet cannot hold.
 *   - 표, 그림, 글상자: how many the document has.
 *
 * The numbers cover the body: paragraphs, the cells of every table (a table inside a cell too)
 * and the text box of a paragraph. Headers, footers, footnotes and endnotes are not counted, as
 * in Hangul, where they only enter the manuscript-sheet count.
 *
 * Reading is one engine call per paragraph and per cell paragraph, so a large document takes a
 * moment; the dialog shows itself first and fills the numbers in afterwards.
 */

/** Deepest table nesting walked; a table deeper than this is counted by its cells only. */
const MAX_TABLE_DEPTH = 3
/** Control slots tried in one cell paragraph for a table inside it, as the AI plugin does. */
const NESTED_CONTROLS_TRIED = 3
/** A ceiling on the nested lookups one count may spend (the AI plugin's budget). */
const MAX_NESTED_LOOKUPS = 100000
/** A sheet of 원고지 holds this many characters. */
const SHEET_CHARS = 200

/** Han characters: CJK unified ideographs, their extension A and the compatibility block. */
const HANJA = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/gu
/** What a blank counts as in 글자(공백 포함) but not in 글자(공백 제외). */
const BLANK = /[ \t\u00A0\u3000]/g
/** Line breaks end a line; they are not characters of the text. */
const LINE_BREAK = /[\r\n]/g
/** Blanks between words (낱말 = 어절). */
const WORD_GAP = /[ \t\u00A0\u3000]+/

/** The engine's bridge hands arrays and objects back already read; a raw document hands JSON. */
const asArray = (value) => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** A table's size, or null when the control there is not a table. */
const asTable = (value) => {
  let dims = value
  if (typeof dims === 'string') {
    try {
      dims = JSON.parse(dims)
    } catch {
      return null
    }
  }
  return dims && dims.cellCount > 0 ? dims : null
}

/** An engine call's answer, or `fallback` where the call has nothing to say. */
function reading(read, fallback) {
  try {
    const value = read()
    return value === undefined || value === null ? fallback : value
  } catch {
    return fallback
  }
}

/** The cell paragraph `k` of `cell` of the table at `path`, addressed the way the engine does. */
const cellAt = (path, cell, k) => [
  ...path.slice(0, -1),
  { controlIndex: path[path.length - 1].controlIndex, cellIndex: cell, cellParaIndex: k },
]

/** A fresh count. */
const emptyStats = () => ({
  chars: 0,
  charsNoSpace: 0,
  hanja: 0,
  words: 0,
  paragraphs: 0,
  lines: 0,
  tables: 0,
  pictures: 0,
  textBoxes: 0,
  pages: 0,
  sheets: 0,
})

/**
 * Counts one piece of document text. `body` collects what the manuscript sheets are counted
 * from: the text outside tables, pictures and text boxes, which a sheet cannot hold.
 */
function addText(stats, text, body) {
  const flat = String(text ?? '').replace(LINE_BREAK, '')
  if (!flat) return
  const count = [...flat].length
  const noSpace = [...flat.replace(BLANK, '')].length
  const hanja = flat.match(HANJA)?.length ?? 0
  let words = 0
  for (const word of flat.split(WORD_GAP)) if (word) words += 1
  stats.chars += count
  stats.charsNoSpace += noSpace
  stats.hanja += hanja
  stats.words += words
  if (!body) return
  body.chars += count
  body.charsNoSpace += noSpace
  body.hanja += hanja
  body.words += words
}

/** The lines one paragraph takes, as the engine's layout says; 1 when it cannot say. */
function linesOf(read) {
  const count = Number(reading(read, null)?.lineCount)
  return Number.isFinite(count) && count > 0 ? count : 1
}

/**
 * Every number the [문서 통계] panel shows, from the engine's document (`wasm` is the editor's
 * WasmBridge).
 */
export function documentStats(wasm) {
  const stats = emptyStats()
  const body = { chars: 0, charsNoSpace: 0, hanja: 0, words: 0 }
  let lookups = MAX_NESTED_LOOKUPS

  stats.pages = Number(reading(() => wasm.getDocumentInfo()?.pageCount, 0)) || 0

  /** A table's size at `path`, or null when the control there is not a table. */
  const dimensionsAt = (sec, para, path) =>
    asTable(reading(() => wasm.getTableDimensionsByPath(sec, para, JSON.stringify(path)), null))

  /** One cell's paragraphs; a cell is one paragraph, as in Hangul. */
  const walkCell = (sec, para, tablePath, cell, count, readLines) => {
    for (let k = 0; k < count; k++) {
      stats.paragraphs += 1
      const address = JSON.stringify(cellAt(tablePath, cell, k))
      const length = Number(reading(() => wasm.getCellParagraphLengthByPath(sec, para, address), 0))
      if (length > 0) {
        addText(
          stats,
          reading(() => wasm.getTextInCellByPath(sec, para, address, 0, length), ''),
          body,
        )
      }
      // the engine reads a line count for the cells of a body table only
      stats.lines += readLines
        ? linesOf(() => wasm.getLineInfoInCell(sec, para, tablePath[0].controlIndex, cell, k, 0))
        : 1
    }
  }

  /** A table at `path`, its cells, and the tables inside those cells. */
  const walkTable = (sec, para, path, depth) => {
    const dims = dimensionsAt(sec, para, path)
    if (!dims) return
    stats.tables += 1
    const readLines = path.length === 1
    for (let cell = 0; cell < dims.cellCount; cell++) {
      const count = Number(
        reading(
          () => wasm.getCellParagraphCountByPath(sec, para, JSON.stringify(cellAt(path, cell, 0))),
          0,
        ),
      )
      walkCell(sec, para, path, cell, count, readLines)
      if (depth >= MAX_TABLE_DEPTH) continue
      for (let k = 0; k < count; k++) {
        for (let inner = 0; inner < NESTED_CONTROLS_TRIED && lookups > 0; inner++) {
          lookups -= 1
          walkTable(
            sec,
            para,
            [...cellAt(path, cell, k), { controlIndex: inner, cellIndex: 0, cellParaIndex: 0 }],
            depth + 1,
          )
        }
      }
    }
  }

  /** The text box of a body paragraph, which the engine addresses like a table of one cell. */
  const walkTextBox = (sec, para, ctrl) => {
    stats.textBoxes += 1
    const count = Number(reading(() => wasm.getCellParagraphCount(sec, para, ctrl, 0), 0))
    for (let k = 0; k < count; k++) {
      stats.paragraphs += 1
      const length = Number(reading(() => wasm.getCellParagraphLength(sec, para, ctrl, 0, k), 0))
      if (length > 0) {
        // its text is not body text: a manuscript sheet cannot hold a text box
        addText(
          stats,
          reading(() => wasm.getTextInCell(sec, para, ctrl, 0, k, 0, length), ''),
          null,
        )
      }
      stats.lines += linesOf(() => wasm.getLineInfoInCell(sec, para, ctrl, 0, k, 0))
    }
  }

  const isPicture = (sec, para, ctrl) =>
    Boolean(reading(() => wasm.getControlImageMime(sec, para, ctrl), ''))

  const sections = Number(reading(() => wasm.getSectionCount(), 0))
  for (let sec = 0; sec < sections; sec++) {
    const paragraphs = Number(reading(() => wasm.getParagraphCount(sec), 0))
    for (let para = 0; para < paragraphs; para++) {
      stats.paragraphs += 1
      const length = Number(reading(() => wasm.getParagraphLength(sec, para), 0))
      if (length > 0) {
        addText(
          stats,
          reading(() => wasm.getTextRange(sec, para, 0, length), ''),
          body,
        )
      }
      stats.lines += linesOf(() => wasm.getLineInfo(sec, para, 0))

      const controls = asArray(reading(() => wasm.getControlTextPositions(sec, para), []))
      // a text box is a control too: a paragraph without one has nothing to look for
      const textBox =
        controls.length > 0 ? Number(reading(() => wasm.getTextBoxControlIndex(sec, para), -1)) : -1
      for (let ctrl = 0; ctrl < Math.max(controls.length, textBox + 1); ctrl++) {
        if (ctrl === textBox) {
          walkTextBox(sec, para, ctrl)
          continue
        }
        const path = [{ controlIndex: ctrl, cellIndex: 0, cellParaIndex: 0 }]
        if (dimensionsAt(sec, para, path)) {
          walkTable(sec, para, path, 1)
          continue
        }
        if (isPicture(sec, para, ctrl)) stats.pictures += 1
      }
    }
  }

  // Hangul: the body text fills sheets of 200 characters, and a table, a picture or a text box
  // takes one more sheet each, because a sheet cannot hold one.
  stats.sheets =
    Math.ceil(body.chars / SHEET_CHARS) + stats.tables + stats.pictures + stats.textBoxes
  return stats
}

/** A number as the dialog shows it. */
export function formatCount(value, ko) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Math.max(0, Math.round(number)).toLocaleString(ko ? 'ko-KR' : 'en-US')
}

/**
 * The [문서 정보] dialog with Hangul's document statistics. `studio` holds the editor parts the
 * commands are handed (ModalDialog); `services` is the command's, for the document it reads.
 * Returns false when the editor has no dialog to build on.
 */
export function openDocumentInfo(studio, services, ko) {
  const Dialog = studio?.ModalDialog
  const wasm = services?.wasm
  if (!Dialog || !wasm) return false

  const DOC = globalThis.document
  /** Strings of the dialog; the studio shows itself in Korean or English only. */
  const say = ko
    ? {
        title: '문서 정보',
        panel: '문서 통계',
        rows: [
          ['chars', '글자 (공백 포함)'],
          ['charsNoSpace', '글자 (공백 제외)'],
          ['hanja', '글자에 포함된 한자 수'],
          ['words', '낱말'],
          ['lines', '줄'],
          ['paragraphs', '문단'],
          ['pages', '쪽'],
          ['sheets', '원고지 (200자 기준)'],
          ['tables', '표'],
          ['pictures', '그림'],
          ['textBoxes', '글상자'],
        ],
        close: '닫기',
      }
    : {
        title: 'Document Information',
        panel: 'Statistics',
        rows: [
          ['chars', 'Characters (with spaces)'],
          ['charsNoSpace', 'Characters (without spaces)'],
          ['hanja', 'Han characters'],
          ['words', 'Words'],
          ['lines', 'Lines'],
          ['paragraphs', 'Paragraphs'],
          ['pages', 'Pages'],
          ['sheets', 'Manuscript sheets (200 chars)'],
          ['tables', 'Tables'],
          ['pictures', 'Pictures'],
          ['textBoxes', 'Text boxes'],
        ],
        close: 'Close',
      }

  class DocumentInfoDialog extends Dialog {
    constructor() {
      super(say.title, 380)
      this.values = new Map()
      this.filled = false
    }

    createBody() {
      const body = DOC.createElement('div')
      // The shared dialog skin owns the body padding (studio-plugin/dialog-theme.mjs).
      const heading = DOC.createElement('div')
      heading.className = 'dialog-section-title'
      heading.textContent = say.panel
      body.appendChild(heading)

      const table = DOC.createElement('div')
      table.style.cssText =
        'display:grid;grid-template-columns:1fr auto;gap:3px 18px;margin-top:8px;min-width:300px'
      for (const [key, label] of say.rows) {
        const name = DOC.createElement('div')
        name.className = 'dialog-label'
        name.textContent = label
        const value = DOC.createElement('div')
        value.dataset.key = key
        value.style.cssText =
          'text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums'
        value.textContent = '—'
        this.values.set(key, value)
        table.append(name, value)
      }
      body.appendChild(table)
      return body
    }

    show() {
      super.show()
      // one reading of a finished panel: Hangul's 닫기, and no cancel beside it
      const primary = this.dialog?.querySelector('.dialog-btn-primary')
      if (primary) primary.textContent = say.close
      const cancel = this.dialog?.querySelector('.dialog-btn:not(.dialog-btn-primary)')
      if (cancel?.parentElement) cancel.parentElement.removeChild(cancel)
      // the numbers are read once the dialog is on screen: a long document takes a moment
      setTimeout(() => this.fill(), 0)
    }

    fill() {
      if (this.filled) return
      this.filled = true
      const stats = reading(() => documentStats(wasm), null)
      if (!stats) return
      for (const [key, cell] of this.values) {
        cell.textContent = formatCount(stats[key], ko)
      }
    }
  }

  new DocumentInfoDialog().show()
  return true
}
