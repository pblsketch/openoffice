/**
 * Hancom Hangul's default keys in the rhwp-studio editor (decision 0060).
 *
 * rhwp moved some of Hangul's keys away from ones a web browser keeps for itself (the Ctrl+N
 * sequences to Ctrl+M, the Ctrl+Shift+C/R/T alignments to Alt+Shift+C/H/D) and left others
 * out. The app is not a browser tab, so a Hangul tab takes Hangul's keys as Hancom Hangul 2024
 * has them: the sequences under Ctrl+N, K, Q, M and G, the alignments, Ctrl+Y for deleting a
 * line, Ctrl+1..0 for the document's first ten styles, Ctrl+F10 and Ctrl+H, the Alt+Shift character
 * keys, and in a table the easy formulas. The commands rhwp has no counterpart for (deleting a
 * line, the text colours, the styles, the normal shape, today's date, finding backwards, the easy
 * formulas and page numbering) are here too.
 *
 * Bundled into the studio build like the agent plugin (build-studio.mjs aliases it), and called
 * from the studio's own key handling by the studio-hancom-* patches in scripts/rhwp-patches.mjs.
 * It imports nothing from the studio; what it uses of the studio's insides is listed there
 * (hancomHooks), and a release that renames one fails the build.
 */

import { openDocumentInfo } from './document-info.mjs'
import { convertToHanja } from './hanja.mjs'
import { autoFillBlock } from './table-auto-fill.mjs'
import {
  HWPUNIT_PER_PX,
  cellExtents,
  coveringRange,
  equalExtents,
  moveBoundary,
  moveCellEdge,
  resizeAll,
  resizeLines,
  textLeast,
} from './table-sizes.mjs'

export { installHanjaKey } from './hanja.mjs'

export const HANCOM_KEYS_MODULE = '@ieum/hancom-keys'

/**
 * Sequential shortcuts: hold Ctrl, press the first letter, then press the second letter (with or
 * without Ctrl). A list tries its commands in order and runs the first one that can run, the way
 * Hangul's "고치기" (Ctrl+N,K) opens what the caret is on.
 */
export const CHORDS = {
  n: {
    t: 'table:create',
    n: 'insert:footnote',
    e: 'insert:endnote',
    h: 'page:header-create',
    i: 'insert:image',
    b: 'insert:textbox',
    m: 'insert:equation',
    c: ['insert:caption-toggle', 'table:caption-toggle'],
    s: 'page:hide',
    g: 'page:section-settings',
    a: 'table:split',
    z: 'table:attach',
    f: 'table:formula',
    k: ['field:edit', 'format:object-properties', 'table:cell-props'],
    p: 'ieum:page-number',
  },
  k: {
    h: 'insert:hyperlink',
    b: 'insert:bookmark',
    n: 'format:para-num-shape',
    e: 'insert:field',
    d: 'ieum:insert-date',
  },
  q: {
    f: 'edit:find',
    a: 'edit:find-replace',
    l: 'ieum:find-backward',
    // Hangul's 문서 정보, under both keys its help names
    i: 'ieum:document-info',
    d: 'ieum:document-info',
  },
  // Hangul's Ctrl+M sequences colour the text
  m: {
    k: 'ieum:text-color-k',
    r: 'ieum:text-color-r',
    b: 'ieum:text-color-b',
    d: 'ieum:text-color-d',
    g: 'ieum:text-color-g',
    y: 'ieum:text-color-y',
    c: 'ieum:text-color-c',
    w: 'ieum:text-color-w',
  },
  g: {
    c: 'view:ctrl-mark',
    t: 'view:para-mark',
    p: 'view:zoom-fit-page',
    w: 'view:zoom-fit-width',
    q: 'view:zoom-100',
  },
}

/**
 * Chords Cmd starts on a Mac as well, as rhwp's own did. Ctrl+Q stays Ctrl alone: Cmd+Q quits.
 */
const META_CHORDS = new Set(['n', 'k', 'm', 'g'])

/** The colours of Hangul's Ctrl+M sequences, read from Hancom Hangul 2024. */
export const TEXT_COLORS = {
  k: { color: '#000000', ko: '검정 글자색', en: 'Black Text' },
  r: { color: '#FF0000', ko: '빨강 글자색', en: 'Red Text' },
  b: { color: '#0000FF', ko: '파랑 글자색', en: 'Blue Text' },
  d: { color: '#993366', ko: '자주 글자색', en: 'Plum Text' },
  g: { color: '#008000', ko: '초록 글자색', en: 'Green Text' },
  y: { color: '#FFFF00', ko: '노랑 글자색', en: 'Yellow Text' },
  c: { color: '#008080', ko: '청록 글자색', en: 'Teal Text' },
  w: { color: '#FFFFFF', ko: '흰색 글자색', en: 'White Text' },
}

/** Number of styles Ctrl+1..0 reach: the document's first ten, in their order. */
export const STYLE_KEYS = 10

/**
 * Where the table size commands say why they left a table alone. The studio hands its
 * toast in when it registers the commands (studio-hancom-commands); without one the
 * message goes nowhere, as in a test.
 */
let toastSink = null

/** The studio's locale, so a message from a key handler speaks the same language. */
let koreanUi = false

/** The studio's tab command, for Ctrl+Tab in a cell (the main process takes that key first). */
let insertTabCommand = null

function tellUser(message) {
  try {
    toastSink?.({ message })
  } catch {
    // the editor is closing; nothing to tell
  }
}

const digitOf = (n) => String(n % 10)

/**
 * The studio's entries Hangul gives another meaning, or that only stood in for a key a browser
 * keeps. Each is found by its key and command; adaptToHancom drops them.
 */
export const REMOVED_SHORTCUTS = [
  // Hangul's Ctrl+Y deletes the line; redo stays on Ctrl+Shift+Z, as in Hangul
  [{ key: 'y', ctrl: true }, 'edit:redo'],
  // stand-ins for Ctrl+Shift+R/C/T; Hangul's Alt+Shift+C is "normal shape", Alt+Shift+H a macro
  [{ key: 'h', alt: true, shift: true }, 'format:align-right'],
  [{ key: 'ㅗ', alt: true, shift: true }, 'format:align-right'],
  [{ key: 'c', alt: true, shift: true }, 'format:align-center'],
  [{ key: 'ㅊ', alt: true, shift: true }, 'format:align-center'],
  [{ key: 'd', alt: true, shift: true }, 'format:align-distribute'],
  [{ key: 'ㅇ', alt: true, shift: true }, 'format:align-distribute'],
  // Hangul's Ctrl+0 is the tenth style; 100% stays on Ctrl+G,Q, as in Hangul
  [{ key: '0', ctrl: true }, 'view:zoom-100'],
]

/** Hangul's keys the studio lacks, ahead of its own so they win a tie. */
export const ADDED_SHORTCUTS = [
  [{ key: 'y', code: 'KeyY', ctrl: true }, 'ieum:delete-line'],
  [{ key: 'c', code: 'KeyC', ctrl: true, shift: true }, 'format:align-center'],
  [{ key: 'r', code: 'KeyR', ctrl: true, shift: true }, 'format:align-right'],
  [{ key: 't', code: 'KeyT', ctrl: true, shift: true }, 'format:align-distribute'],
  [{ key: 'f10', ctrl: true }, 'insert:symbols'],
  [{ key: 'insert', code: 'Insert', alt: true }, 'table:insert-row-col'],
  // Hangul's 한자로 바꾸기; the Hanja key itself comes up alone (installHanjaKey)
  [{ key: 'f9', code: 'F9' }, 'ieum:hanja'],
  // the character keys of a selection (Hangul: 보통 모양, 위 첨자, 아래 첨자, 진하게, 기울임, 밑줄)
  [{ key: 'c', code: 'KeyC', alt: true, shift: true }, 'ieum:normal-shape'],
  [{ key: 'p', code: 'KeyP', alt: true, shift: true }, 'format:superscript'],
  [{ key: 's', code: 'KeyS', alt: true, shift: true }, 'format:subscript'],
  [{ key: 'b', code: 'KeyB', alt: true, shift: true }, 'format:bold'],
  [{ key: 'i', code: 'KeyI', alt: true, shift: true }, 'format:italic'],
  [{ key: 'u', code: 'KeyU', alt: true, shift: true }, 'format:underline'],
  // as in the app's other editors; on a Mac, Cmd+H (hide) never reaches the page
  [{ key: 'h', code: 'KeyH', ctrl: true }, 'edit:find-replace'],
  ...Array.from({ length: STYLE_KEYS }, (_, i) => [
    { key: digitOf(i + 1), code: `Digit${digitOf(i + 1)}`, ctrl: true },
    `ieum:style-${i + 1}`,
  ]),
  ...Array.from({ length: STYLE_KEYS }, (_, i) => [
    { key: digitOf(i + 1), code: `Digit${digitOf(i + 1)}`, ctrl: true, alt: true },
    `ieum:style-${i + 1}`,
  ]),
]

const sameDef = (a, b) =>
  a.key === b.key &&
  (a.code ?? null) === (b.code ?? null) &&
  !!a.ctrl === !!b.ctrl &&
  !!a.shift === !!b.shift &&
  !!a.alt === !!b.alt &&
  (a.platform ?? null) === (b.platform ?? null)

/** Turns the studio's shortcut table (in place: the studio holds the one array) into Hangul's. */
export function adaptToHancom(shortcuts) {
  for (const [def, id] of REMOVED_SHORTCUTS) {
    const at = shortcuts.findIndex(([d, c]) => c === id && sameDef(d, def))
    if (at !== -1) shortcuts.splice(at, 1)
  }
  shortcuts.unshift(...ADDED_SHORTCUTS)
  return shortcuts
}

/** The menu labels that follow the keys; the studio shows these next to its menu items. */
export const LABELS = {
  'format:align-center': 'Ctrl+Shift+C',
  'format:align-right': 'Ctrl+Shift+R',
  'format:align-distribute': 'Ctrl+Shift+T',
  'insert:symbols': 'Ctrl+F10',
  'table:create': 'Ctrl+N,T',
  'insert:footnote': 'Ctrl+N,N',
  'insert:endnote': 'Ctrl+N,E',
  'page:header-create': 'Ctrl+N,H',
  'insert:image': 'Ctrl+N,I',
  'insert:textbox': 'Ctrl+N,B',
  'insert:equation': 'Ctrl+N,M',
  'insert:caption-toggle': 'Ctrl+N,C',
  'table:caption-toggle': 'Ctrl+N,C',
  'page:hide': 'Ctrl+N,S',
  'page:section-settings': 'Ctrl+N,G',
  'table:split': 'Ctrl+N,A',
  'table:attach': 'Ctrl+N,Z',
  'table:formula': 'Ctrl+N,F',
  'field:edit': 'Ctrl+N,K',
  'insert:hyperlink': 'Ctrl+K,H',
  'insert:field': 'Ctrl+K,E',
  // the cell block's letters (CELL_BLOCK_KEYS)
  'table:cell-props': 'P',
  'table:border-each': 'L',
  'table:border-one': 'B',
}

/**
 * Labels for keys the app takes before the editor outside a Mac: Alt+V is Hangul's "save as"
 * there (the main process takes it), so rhwp's Alt+V,T for transparent lines no longer starts.
 */
export const LABELS_GONE_OFF_MAC = ['view:border-transparent']

const onMac = () => /Mac/.test(globalThis.navigator?.platform ?? '')

/** The command definition with Hangul's key next to it, when its key changed. */
export function withHancomLabel(def, mac = onMac()) {
  if (!mac && LABELS_GONE_OFF_MAC.includes(def.id) && def.shortcutLabel) {
    return { ...def, shortcutLabel: undefined }
  }
  const label = LABELS[def.id]
  return label && def.shortcutLabel !== label ? { ...def, shortcutLabel: label } : def
}

/**
 * The keys the main process takes before the editor and hands back when the caret says they are
 * Hangul's table keys (decision 0060): Ctrl+Shift+S in a cell block is the block sum (elsewhere
 * "save as"), Ctrl+Shift+H in a table cell is the horizontal sum (elsewhere "home"). The main
 * process calls `window.__ieumHancomKey(name)` in the editor frame; true means it was done here.
 */
export const MAIN_PROCESS_KEYS = {
  'ctrl-shift-s': (ih, dispatcher) =>
    !!ih?.cursor?.isInCellSelectionMode?.() && dispatcher.isEnabled('table:block-sum')
      ? dispatcher.dispatch('table:block-sum')
      : false,
  'ctrl-shift-h': (ih, dispatcher) =>
    dispatcher.isEnabled(EASY_FORMULAS.h.id) ? dispatcher.dispatch(EASY_FORMULAS.h.id) : false,
  // Ctrl+Tab in a table cell is Hangul's tab character; the shell asks before switching tabs
  'ctrl-tab': (ih) => {
    const cursor = ih?.cursor
    if (!cursor?.isInCell?.() || cursor.isInTextBox?.() || cursor.isInCellSelectionMode?.()) {
      return false
    }
    if (ih.isFormMode?.() || !insertTabCommand) return false
    ih.executeOperation({
      kind: 'command',
      command: new insertTabCommand(ih.getCursorPosition()),
    })
    return true
  },
  // Ctrl+Shift+Tab in a table cell is Hangul's 빠른 내어쓰기: the paragraph's lines after the
  // first line up at the caret, as Shift+Tab does in the body; elsewhere the previous tab
  'ctrl-shift-tab': (ih) => {
    const cursor = ih?.cursor
    if (!cursor?.isInCell?.() || cursor.isInTextBox?.() || cursor.isInCellSelectionMode?.()) {
      return false
    }
    if (ih.isFormMode?.() || typeof ih.applyHangingIndentAtCursor !== 'function') return false
    ih.applyHangingIndentAtCursor()
    return true
  },
  // Ctrl+E is taken by the main process before the page sees it. In a cell block it
  // empties the cells, on a selected table it deletes the table, elsewhere it deletes
  // the selection, as the studio's own command does.
  'ctrl-e': (ih, dispatcher) => {
    const cursor = ih?.cursor
    if (cursor?.isInCellSelectionMode?.()) {
      clearCellBlock(ih)
      return true
    }
    if (cursor?.isInTableObjectSelection?.()) {
      const done = dispatcher.isEnabled('table:delete')
        ? dispatcher.dispatch('table:delete')
        : false
      if (done) {
        cursor.exitTableObjectSelection?.()
        ih.eventBus?.emit?.('table-object-selection-changed', false)
      }
      return done
    }
    // not ours: the main process sends the key on so the page keeps its own meaning
    return false
  },
  'ctrl-c': (ih) => {
    if (ih?.cursor?.isInCellSelectionMode?.() !== true) return false
    copyCellBlock(ih, false)
    return true
  },
  'ctrl-x': (ih) => {
    if (ih?.cursor?.isInCellSelectionMode?.() !== true) return false
    copyCellBlock(ih, true)
    return true
  },
}

const FOCUSED_FRAME_KEYS = new Set(['ctrl-c', 'ctrl-x', 'ctrl-e', 'ctrl-tab', 'ctrl-shift-tab'])

/** Opens the window function the main process asks; see MAIN_PROCESS_KEYS. */
export function installHancomMainKeys(win, getInputHandler, dispatcher) {
  win.__ieumHancomKey = (name) => {
    const take = MAIN_PROCESS_KEYS[name]
    if (!take) return false
    // clipboard keys and Ctrl+(Shift+)Tab belong to the page when focus is outside the editor
    // (the AI panel, a dialog); only the focused editor frame may take them
    if (
      FOCUSED_FRAME_KEYS.has(name) &&
      typeof win.document?.hasFocus === 'function' &&
      !win.document.hasFocus()
    ) {
      return false
    }
    try {
      return take(getInputHandler(), dispatcher) === true
    } catch {
      return false
    }
  }
}

const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'HangulMode',
  'HanjaMode',
])

// Dubeolsik jamo to the latin key they sit on, for a key reported by its letter alone
const JAMO = {
  ㅂ: 'q',
  ㅈ: 'w',
  ㄷ: 'e',
  ㄱ: 'r',
  ㅅ: 't',
  ㅛ: 'y',
  ㅕ: 'u',
  ㅑ: 'i',
  ㅐ: 'o',
  ㅔ: 'p',
  ㅁ: 'a',
  ㄴ: 's',
  ㅇ: 'd',
  ㄹ: 'f',
  ㅎ: 'g',
  ㅗ: 'h',
  ㅓ: 'j',
  ㅏ: 'k',
  ㅣ: 'l',
  ㅋ: 'z',
  ㅌ: 'x',
  ㅊ: 'c',
  ㅍ: 'v',
  ㅠ: 'b',
  ㅜ: 'n',
  ㅡ: 'm',
}

/**
 * The letter or digit a key sits on, whatever the input language. A Korean IME reports the key as
 * "Process" (keyCode 229) while it composes, so the physical key comes first.
 */
export function letterOf(e) {
  const code = e.code ?? ''
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  const key = (e.key ?? '').toLowerCase()
  if (/^[a-z0-9]$/.test(key)) return key
  return JAMO[e.key] ?? null
}

/** A blank that Hangul counts as an opening quote's neighbour: space, tab, no-break space. */
const QUOTE_OPENS_AFTER = /^\s$/

/**
 * Hangul's 빠른 교정 for quotes (도구 → 빠른 교정 → 빠른 교정 내용 → 입력 자동 서식): a straight
 * quote typed into the document becomes a curly one — opening after a blank or at the start of a
 * paragraph, closing after any other character. What is pasted or dropped keeps what it carries,
 * and so does what an input method is still composing.
 *
 * Called from the studio's own input handling (build patch studio-quick-correct) with the text its
 * hidden input holds and the input event's type; the answer is the text to put in the document.
 */
export function quickCorrectTyped(ih, value, inputType) {
  if (value !== '"' && value !== "'") return value
  if (inputType && inputType !== 'insertText') return value
  if (ih?.isComposing) return value
  const cursor = ih?.cursor
  if (!cursor) return value
  // a header, a footer and a note keep the character they were given: the caret's offset there is
  // not the one the paragraph's text is read from
  if (cursor.isInHeaderFooter?.() || cursor.isInFootnote?.()) return value
  const before = characterBefore(ih)
  const opening = before === '' || QUOTE_OPENS_AFTER.test(before)
  if (value === '"') return opening ? '\u201C' : '\u201D'
  return opening ? '\u2018' : '\u2019'
}

/** The character just before the caret; '' at a paragraph's start, and when it cannot be read. */
function characterBefore(ih) {
  try {
    const pos = ih.getCursorPosition?.()
    if (!pos || !(pos.charOffset > 0)) return ''
    return ih.getTextAt?.({ ...pos, charOffset: pos.charOffset - 1 }, 1) ?? ''
  } catch {
    return ''
  }
}

/**
 * The first key of a sequence: Ctrl (or Cmd, see META_CHORDS) with a chord letter, no Shift or
 * Alt. Takes the key and waits for the second one. Works while the IME composes.
 */
export function hancomChordStart(ih, e) {
  if (e.shiftKey || e.altKey) return false
  const first = letterOf(e)
  if (!first || !CHORDS[first]) return false
  if (!(e.ctrlKey || (e.metaKey && META_CHORDS.has(first)))) return false
  e.preventDefault()
  ih._hancomChord = first
  // a Korean IME that was composing hands the same press over twice: as "Process" (229) while
  // it composes, and again as the plain key once it has committed (Windows, 2026-10-22)
  ih._hancomChordIme = imeReported(e) ? { code: e.code, at: e.timeStamp ?? 0 } : null
  return true
}

/** How long after the IME's first report its repeat of the same press may come. */
const IME_REPEAT_MS = 500

const imeReported = (e) => e.key === 'Process' || e.keyCode === 229

// a modifier the IME reports as "Process" while it composes still names itself in the code
const isModifier = (e) =>
  MODIFIER_KEYS.has(e.key) || /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(e.code ?? '')

/**
 * The second key of a sequence, when one is waiting. A key the sequence has no command for drops
 * it and goes on as a key of its own, as the studio's sequences did. A letter the IME was about
 * to compose is kept out of the document.
 */
export function hancomChordKey(ih, e) {
  const first = ih._hancomChord
  if (!first || isModifier(e)) return false
  const ime = ih._hancomChordIme
  ih._hancomChordIme = null
  if (
    ime &&
    e.code === ime.code &&
    (e.ctrlKey || e.metaKey) &&
    !imeReported(e) &&
    (e.timeStamp ?? 0) - ime.at < IME_REPEAT_MS
  ) {
    // the IME's second report of the first key: still waiting for the second key
    e.preventDefault()
    return true
  }
  ih._hancomChord = null
  const second = letterOf(e)
  const target = second ? CHORDS[first][second] : undefined
  const dispatcher = ih.dispatcher
  if (!target || !dispatcher) return false
  e.preventDefault()
  ih._cellBlockLetterImeGuard?.arm(e)
  const ids = Array.isArray(target) ? target : [target]
  dispatcher.dispatch(ids.find((id) => dispatcher.isEnabled(id)) ?? ids[0])
  return true
}

/**
 * Hangul's easy formulas (쉬운 계산식): Ctrl+Shift+letter with the caret in a table cell puts the
 * sum, average or product of the cells to its left or above it in that cell.
 */
export const EASY_FORMULAS = {
  h: { id: 'ieum:easy-sum-left', func: 'SUM', range: 'LEFT', ko: '가로 합계', en: 'Sum Left' },
  v: { id: 'ieum:easy-sum-above', func: 'SUM', range: 'ABOVE', ko: '세로 합계', en: 'Sum Above' },
  j: { id: 'ieum:easy-avg-left', func: 'AVG', range: 'LEFT', ko: '가로 평균', en: 'Average Left' },
  b: {
    id: 'ieum:easy-avg-above',
    func: 'AVG',
    range: 'ABOVE',
    ko: '세로 평균',
    en: 'Average Above',
  },
  k: {
    id: 'ieum:easy-product-left',
    func: 'PRODUCT',
    range: 'LEFT',
    ko: '가로 곱',
    en: 'Product Left',
  },
  n: {
    id: 'ieum:easy-product-above',
    func: 'PRODUCT',
    range: 'ABOVE',
    ko: '세로 곱',
    en: 'Product Above',
  },
}

/**
 * Hancom's table-object keys (표를 선택한 상태에서): P opens the table/cell properties,
 * T flips the table, L/C open the cell border/background dialogs, and Ctrl+E deletes the
 * table. Called before the studio's object-selection branch, which would otherwise close
 * the selection and type the letter into the document.
 */
const TABLE_OBJECT_KEYS = {
  p: 'table:cell-props',
  t: 'ieum:table-transpose',
  l: 'ieum:table-border-each',
  c: 'ieum:table-border-background',
}

/** Arrow keys as the directions the table commands take. */
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export function hancomTableObjectKey(ih, e) {
  const cursor = ih?.cursor
  if (!cursor?.isInTableObjectSelection?.()) return false
  const dispatcher = ih.dispatcher
  if (!dispatcher) return false
  // Hangul's first cell of the selected table: F5 opens a cell block there
  if (e.key === 'F5' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    firstCellOfSelectedTable(ih)
    return true
  }
  // Shift+arrow resizes the table, Shift+PageUp/Down changes its order, Shift+Home/End
  // its text wrapping (Hancom's table-object shortcuts)
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const direction = ARROWS[e.key]
    if (direction) {
      e.preventDefault()
      if (dispatcher.isEnabled('ieum:table-resize')) {
        dispatcher.dispatch('ieum:table-resize', { direction })
      }
      return true
    }
    const order = e.key === 'PageUp' ? 'front' : e.key === 'PageDown' ? 'back' : null
    if (order) {
      e.preventDefault()
      if (dispatcher.isEnabled('ieum:table-order')) {
        dispatcher.dispatch('ieum:table-order', { mode: order })
      }
      return true
    }
    const wrap = e.key === 'Home' ? 'front' : e.key === 'End' ? 'back' : null
    if (wrap) {
      e.preventDefault()
      if (dispatcher.isEnabled('ieum:table-wrap')) {
        dispatcher.dispatch('ieum:table-wrap', { mode: wrap })
      }
      return true
    }
    return false
  }
  if (e.altKey) return false
  const letter = letterOf(e)
  if (!letter) return false
  const withCtrl = e.ctrlKey || e.metaKey
  if (withCtrl) {
    if (letter !== 'e') return false
    // Hangul deletes the selected object with Ctrl+E; the table's Delete path does it
    e.preventDefault()
    if (dispatcher.isEnabled('table:delete') && dispatcher.dispatch('table:delete')) {
      // the table is gone: leave the object selection so the next key is not read against it
      ih.cursor.exitTableObjectSelection?.()
      ih.eventBus?.emit?.('table-object-selection-changed', false)
    }
    return true
  }
  const id = TABLE_OBJECT_KEYS[letter]
  if (!id) return false
  // one of our keys: keep the letter out even when the command cannot run
  e.preventDefault()
  ih._cellBlockLetterImeGuard?.arm(e)
  if (dispatcher.isEnabled(id)) dispatcher.dispatch(id)
  return true
}

/**
 * Hangul's F5 on a selected table: put the caret in the first cell and open a cell block
 * there. Works for a table in a cell too, through the cursor's path-aware cell move.
 */
function firstCellOfSelectedTable(ih) {
  const ref = ih?.getSelectedTableRef?.()
  if (!ref) return false
  const cursor = ih.cursor
  cursor.exitTableObjectSelection?.()
  try {
    cursor.moveToCellByIndex?.(ref.sec, ref.ppi, ref.ci, ref.cellPath, 0, 'start')
    if (!cursor.enterCellSelectionMode?.()) return false
  } catch {
    return false
  }
  ih.caret?.hide?.()
  ih.updateCellSelection?.()
  ih.eventBus?.emit?.('table-object-selection-changed', false)
  return true
}

/** F7/F8: the whole column/row of the current cell (or of the block's focus cell). */
function selectCellBand(ih, axis) {
  const cursor = ih?.cursor
  if (!cursor?.isInCell?.() || cursor.isInTextBox?.()) return false
  if (!cursor.isInCellSelectionMode?.()) {
    if (!cursor.enterCellSelectionMode?.()) return false
  }
  if (cursor.getCellSelectionPhase?.() === 1) cursor.advanceCellSelectionPhase?.()
  const focus = cursor.getCellSelectionFocus?.()
  const context = cursor.getCellTableContext?.()
  if (!focus || !context) return false
  // the caret stays in the cell the block started from; F7/F8 follow that cell
  let origin = focus
  const pos = ih.getCursorPosition?.()
  if (pos?.cellIndex !== undefined && (pos.cellPath?.length ?? 0) <= 1) {
    try {
      const info = ih.wasm.getCellInfo(
        pos.sectionIndex,
        pos.parentParaIndex,
        pos.controlIndex,
        pos.cellIndex,
      )
      origin = { row: info.row, col: info.col }
    } catch {
      // a cell the flat engine call cannot name: the block focus is the best answer
    }
  }
  if (axis === 'column') {
    cursor.setCellSelectionAnchor?.(0, origin.col)
    cursor.setCellSelectionFocus?.(context.rowCount - 1, origin.col)
  } else {
    cursor.setCellSelectionAnchor?.(origin.row, 0)
    cursor.setCellSelectionFocus?.(origin.row, context.colCount - 1)
  }
  cursor.clearSelection?.()
  ih.caret?.hide?.()
  ih.updateCellSelection?.()
  return true
}

/** Shift+F5: the current cell, with the block ready to grow by the arrow keys. */
function expandCellSelection(ih) {
  const cursor = ih?.cursor
  if (!cursor?.isInCell?.() || cursor.isInTextBox?.()) return false
  if (!cursor.isInCellSelectionMode?.()) {
    if (!cursor.enterCellSelectionMode?.()) return false
    cursor.advanceCellSelectionPhase?.()
  } else if (cursor.getCellSelectionPhase?.() === 1) {
    cursor.advanceCellSelectionPhase?.()
  }
  ih.caret?.hide?.()
  ih.updateCellSelection?.()
  return true
}

/**
 * Alt+arrow in a cell: the cell one row/column over. Merged cells resolve to the cell
 * that covers the target place. A table in a cell is left to Phase 2.
 */
function moveCellByArrow(ih, direction) {
  const cursor = ih?.cursor
  const pos = ih?.getCursorPosition?.()
  if (!cursor || !pos) return false
  if ((pos.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 셀 단위로 옮길 수 없습니다.'
        : 'A table inside a cell cannot be moved by cell yet.',
    )
    return true
  }
  const { parentParaIndex: ppi, controlIndex: ci, cellIndex } = pos
  if (ppi === undefined || ci === undefined || cellIndex === undefined) return false
  let dims
  try {
    dims = ih.wasm.getTableDimensions(pos.sectionIndex, ppi, ci)
  } catch {
    return false
  }
  let current = null
  const info = []
  for (let i = 0; i < dims.cellCount; i += 1) {
    const cell = ih.wasm.getCellInfo(pos.sectionIndex, ppi, ci, i)
    info.push({ ...cell, cellIdx: i })
    if (i === cellIndex) current = cell
  }
  if (!current) return false
  const row = Math.max(
    0,
    Math.min(
      dims.rowCount - 1,
      current.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0),
    ),
  )
  const col = Math.max(
    0,
    Math.min(
      dims.colCount - 1,
      current.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0),
    ),
  )
  if (row === current.row && col === current.col) return false
  const target = info.find(
    (cell) =>
      row >= cell.row &&
      row < cell.row + cell.rowSpan &&
      col >= cell.col &&
      col < cell.col + cell.colSpan,
  )
  if (!target || target.cellIdx === cellIndex) return false
  try {
    cursor.moveToCellByIndex?.(pos.sectionIndex, ppi, ci, pos.cellPath, target.cellIdx, 'start')
    ih.updateCaret?.()
  } catch {
    return false
  }
  return true
}

/**
 * Shift+Esc: leave the table. A table in a cell returns to the outer cell; a body table
 * goes to the paragraph after it (or the end of its own paragraph when it is the last).
 */
function leaveTable(ih) {
  const cursor = ih?.cursor
  const pos = ih?.getCursorPosition?.()
  if (!cursor || !pos) return false
  if (cursor.isInCellSelectionMode?.()) {
    cursor.exitCellSelectionMode?.()
    ih.updateCaret?.()
  }
  const path = pos.cellPath ?? []
  if (path.length > 1) {
    const outer = path.slice(0, -1)
    const last = outer[outer.length - 1]
    cursor.clearSelection?.()
    cursor.moveTo?.({
      sectionIndex: pos.sectionIndex,
      paragraphIndex: last.cellParaIndex,
      charOffset: 0,
      parentParaIndex: pos.parentParaIndex,
      controlIndex: outer[0].controlIndex,
      cellIndex: last.cellIndex,
      cellParaIndex: last.cellParaIndex,
      cellPath: outer,
      ...(pos.isTextBox && outer.length === 1 ? { isTextBox: true } : {}),
    })
    ih.updateCaret?.()
    return true
  }
  const ppi = pos.parentParaIndex
  if (ppi === undefined) return false
  try {
    const count = ih.wasm.getParagraphCount(pos.sectionIndex)
    const target = ppi + 1 < count ? ppi + 1 : ppi
    const offset = target === ppi ? ih.wasm.getParagraphLength(pos.sectionIndex, ppi) : 0
    cursor.clearSelection?.()
    cursor.moveTo?.({ sectionIndex: pos.sectionIndex, paragraphIndex: target, charOffset: offset })
    ih.updateCaret?.()
  } catch {
    return false
  }
  return true
}

/** F7/F8, Shift+F5, Alt+arrow and Shift+Esc while the caret is in a table cell. */
export function hancomCellKey(ih, e) {
  const cursor = ih?.cursor
  if (!cursor?.isInCell?.() || cursor.isInTextBox?.()) return false
  if (cursor.isInTableObjectSelection?.() || ih.isFormMode?.()) return false
  if (e.key === 'F7' || e.key === 'F8') {
    e.preventDefault()
    selectCellBand(ih, e.key === 'F7' ? 'column' : 'row')
    return true
  }
  if (e.key === 'F5' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    expandCellSelection(ih)
    return true
  }
  if (e.key === 'Escape' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    leaveTable(ih)
    return true
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && ARROWS[e.key]) {
    e.preventDefault()
    moveCellByArrow(ih, ARROWS[e.key])
    return true
  }
  return false
}

/**
 * Hangul's letters in a cell block (F5): H/W make the rows/columns equally sized, P opens
 * 표/셀 속성, L/C the cells' border/background each cell on its own, B/F the same for the
 * cells as one, A fills the block (표 자동 채우기). M and S are the studio's own.
 */
const CELL_BLOCK_KEYS = {
  h: 'table:cell-height-equal',
  w: 'table:cell-width-equal',
  p: 'table:cell-props',
  l: 'ieum:cell-border-each',
  c: 'ieum:cell-background-each',
  b: 'ieum:cell-border-one',
  f: 'ieum:cell-background-one',
  a: 'ieum:table-auto-fill',
}

/**
 * Whether a shortcut acts on every cell of a block when the block stays selected: the
 * character and paragraph formats, styles and their dialogs, and the block calculations.
 * The studio closes the block on any other key first, so these would reach one cell only.
 */
export function keepsCellBlock(id) {
  if (!id) return false
  if (id.startsWith('format:')) return id !== 'format:object-properties'
  return (
    id.startsWith('ieum:style-') ||
    id === 'ieum:normal-shape' ||
    id === 'table:block-sum' ||
    id === 'table:block-avg' ||
    id === 'table:block-product'
  )
}

const noModifier = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey

/**
 * A key in a cell block (F5), before the studio closes the block on a key it does not handle.
 * `shortcutOf` names the command the studio's shortcut table gives the key.
 */
export function hancomCellBlockKey(ih, e, shortcutOf = () => null) {
  const cursor = ih?.cursor
  if (!cursor?.isInCellSelectionMode?.()) return false
  // Shift+arrow moves one cell's boundary and its next cell's opposite boundary,
  // as Hangul does; the table keeps its size.
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ARROWS[e.key]) {
    e.preventDefault()
    if (ih.dispatcher?.isEnabled?.('ieum:table-cell-resize')) {
      ih.dispatcher.dispatch('ieum:table-cell-resize', { direction: ARROWS[e.key] })
    }
    return true
  }
  // Ctrl+arrow changes the selected rows/columns and lets the table grow or shrink
  // with them (Hangul's Ctrl+arrow). Alt+arrow keeps the table size instead.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ARROWS[e.key]) {
    e.preventDefault()
    if (ih.dispatcher?.isEnabled?.('ieum:table-row-column-resize')) {
      ih.dispatcher.dispatch('ieum:table-row-column-resize', { direction: ARROWS[e.key] })
    }
    return true
  }
  // Alt+arrow resizes the selected rows/columns while the table keeps its size
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && ARROWS[e.key]) {
    e.preventDefault()
    if (ih.dispatcher?.isEnabled?.('ieum:table-block-resize')) {
      ih.dispatcher.dispatch('ieum:table-block-resize', { direction: ARROWS[e.key] })
    }
    return true
  }
  // Paste keeps the block: the browser's paste event reaches hancomPasteCells with the
  // cells still selected, where the studio would close the block and paste into one cell.
  // A protected form block stays the studio's: it takes no key at all.
  if (isPasteKey(e)) return !cursor.isProtectedCellSelectionMode?.()
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const letter = letterOf(e)
    if (letter === 'e' || letter === 'c' || letter === 'x') {
      e.preventDefault()
      if (letter === 'e') clearCellBlock(ih)
      else copyCellBlock(ih, letter === 'x')
      return true
    }
    // Ctrl+N,K and the other sequences act on the block, so it stays for the second key
    if (hancomChordStart(ih, e)) return true
  }
  // a protected form block takes no other key (the studio's rule)
  if (cursor.isProtectedCellSelectionMode?.()) return false
  if (noModifier(e)) {
    // Enter goes back to editing the cell, as Escape does (Hangul: 편집 모드로 전환)
    if (e.key === 'Enter') {
      e.preventDefault()
      cursor.exitCellSelectionMode?.()
      ih.cellSelectionRenderer?.clear?.()
      ih.updateCaret?.()
      return true
    }
    // F3 is Hangul's other key for growing the block with the arrows (F5 pressed again)
    if (e.key === 'F3') {
      e.preventDefault()
      expandCellSelection(ih)
      return true
    }
    const id = CELL_BLOCK_KEYS[letterOf(e)]
    if (id) {
      e.preventDefault()
      ih._cellBlockLetterImeGuard?.arm(e)
      if (ih.dispatcher?.isEnabled?.(id)) ih.dispatcher.dispatch(id)
      return true
    }
  }
  const id = shortcutOf(e)
  if (!keepsCellBlock(id) || !ih.dispatcher) return false
  e.preventDefault()
  if (ih.dispatcher.isEnabled?.(id)) ih.dispatcher.dispatch(id)
  return true
}

/** A cell's text, its paragraphs joined by line breaks. */
function cellText(wasm, at, cellIdx) {
  const { sec, ppi, ci } = at
  const count = wasm.getCellParagraphCount(sec, ppi, ci, cellIdx)
  const paragraphs = []
  for (let p = 0; p < count; p += 1) {
    const length = wasm.getCellParagraphLength(sec, ppi, ci, cellIdx, p)
    paragraphs.push(wasm.getTextInCell(sec, ppi, ci, cellIdx, p, 0, length))
  }
  return paragraphs.join('\n')
}

/**
 * A: fill the block from the cells typed first (table-auto-fill.mjs), contents only, each cell
 * keeping its look. One undo step, which brings the old contents and the block back. A block
 * with merged cells, or in a table inside a cell, is left alone with the reason.
 */
export function fillCellBlock(ih) {
  const cursor = ih?.cursor
  if (!cursor?.isInCellSelectionMode?.() || cursor.isProtectedCellSelectionMode?.()) return false
  const context = cursor.getCellTableContext?.()
  const range = cursor.getSelectedCellRange?.()
  if (!context || !range || !ih.wasm || !ih.executeOperation) return false
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 자동으로 채울 수 없습니다.'
        : 'A table inside a cell cannot be filled automatically yet.',
    )
    return false
  }
  const at = { sec: context.sec, ppi: context.ppi, ci: context.ci }
  const rows = range.endRow - range.startRow + 1
  const cols = range.endCol - range.startCol + 1
  const places = Array.from({ length: rows }, () => Array(cols).fill(undefined))
  let grid
  try {
    const dims = ih.wasm.getTableDimensions(at.sec, at.ppi, at.ci)
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = ih.wasm.getCellInfo(at.sec, at.ppi, at.ci, i)
      const inside =
        info.row + info.rowSpan - 1 >= range.startRow &&
        info.row <= range.endRow &&
        info.col + info.colSpan - 1 >= range.startCol &&
        info.col <= range.endCol
      if (!inside) continue
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          koreanUi
            ? '병합된 칸이 있어 자동 채우기를 하지 않았습니다.'
            : 'Not filled: the block has merged cells.',
        )
        return false
      }
      places[info.row - range.startRow][info.col - range.startCol] = i
    }
    if (places.some((row) => row.some((cellIdx) => cellIdx === undefined))) return false
    grid = places.map((row) => row.map((cellIdx) => cellText(ih.wasm, at, cellIdx)))
  } catch {
    return false
  }
  // cells taken out of the block with Ctrl+click (the studio keys them "row,col") keep theirs
  const excluded = cursor.getExcludedCells?.() ?? new Set()
  const writes = []
  autoFillBlock(grid).forEach((row, r) =>
    row.forEach((value, c) => {
      if (value === null) return
      if (excluded.has(`${range.startRow + r},${range.startCol + c}`)) return
      writes.push({ cellIdx: places[r][c], value })
    }),
  )
  if (writes.length === 0) return true
  const selection = cursor.captureCellSelection?.() ?? null
  const caret = cursor.getPosition?.()
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'ieumAutoFillCells',
    operation: (bridge) => {
      for (const { cellIdx, value } of writes) writeCell(bridge, at, cellIdx, value)
      // the caret's cell may now be shorter than its old offset
      const caretWritten =
        caret?.cellIndex !== undefined && writes.some((w) => w.cellIdx === caret.cellIndex)
      return caretWritten ? { ...caret, cellParaIndex: 0, charOffset: 0 } : caret
    },
    selectionBefore: selection ? { mode: 'cellBlock', state: selection } : null,
  })
  ih.updateCellSelection?.()
  return true
}

/**
 * L/C/B/F in a cell block: the studio's 셀 테두리/배경 dialog on its border or background tab,
 * for each cell on its own (each) or for the selected cells as one (asOne). A single cell has
 * no "as one", so it opens for that cell.
 */
function openCellBlockBorder(services, studio, applyMode, tab, ko) {
  const ih = services.getInputHandler()
  if (!ih?.cursor?.isInCellSelectionMode?.() || !studio.CellBorderBgDialog) return false
  const pos = ih.getCursorPosition()
  if (pos.parentParaIndex === undefined || pos.controlIndex === undefined) return false
  if (pos.cellIndex === undefined) return false
  if ((pos.cellPath?.length ?? 0) > 1) {
    tellUser(
      ko
        ? '표 안의 표는 아직 테두리와 배경을 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be changed yet.',
    )
    return false
  }
  const mode = applyMode === 'asOne' && ih.hasMultiCellSelection?.() ? 'asOne' : 'each'
  const dialog = new studio.CellBorderBgDialog(
    services.wasm,
    services.eventBus,
    { sec: pos.sectionIndex, ppi: pos.parentParaIndex, ci: pos.controlIndex },
    pos.cellIndex,
    mode,
    ih.getSelectedCellRange?.() ?? null,
    services,
  )
  dialog.show()
  if (tab === 'background') dialog.switchTab?.(1)
  return true
}

/** The cell size the dialog writes only when the user ticked its box (unticked when it opens). */
const CELL_PROPS_ALWAYS = ['width', 'height']

/** The margins, whose box opens ticked when the cell has its own: shown in mm to one place. */
const CELL_PADDINGS = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']
const HWPUNIT_PER_MM = 7200 / 25.4
const throughMm = (hu) => Math.round((Math.round((hu / HWPUNIT_PER_MM) * 10) / 10) * HWPUNIT_PER_MM)

const sameProp = (key, value, shown) =>
  JSON.stringify(value) === JSON.stringify(shown) ||
  (CELL_PADDINGS.includes(key) && typeof shown === 'number' && value === throughMm(shown))

/**
 * 표/셀 속성 opened on a cell block writes its cell tab into every selected cell, as Hangul
 * does; the studio wrote only the cell the caret is in. The other cells take what the user
 * changed from what the dialog showed (and the size when its box is ticked), so
 * what differs from cell to cell and was left alone stays. Called from the dialog's apply, in
 * the same undo step (studio-hancom-cell-props-block).
 */
export function hancomBlockCellProps(dialog, props) {
  if (dialog?.mode !== 'cell' || !props) return
  const ih = dialog.services?.getInputHandler?.()
  const block = ih?.getSelectedCellBlock?.()
  const at = dialog.tableCtx
  if (!block || block.cellPath || !at) return
  if (block.sec !== at.sec || block.ppi !== at.ppi || block.ci !== at.ci) return
  const shown = dialog.cellProps ?? {}
  const changed = {}
  for (const [key, value] of Object.entries(props)) {
    if (CELL_PROPS_ALWAYS.includes(key) || !sameProp(key, value, shown[key])) changed[key] = value
  }
  if (Object.keys(changed).length === 0) return
  for (const cellIdx of block.cellIndices) {
    if (cellIdx !== dialog.cellIdx)
      dialog.wasm.setCellProperties(at.sec, at.ppi, at.ci, cellIdx, changed)
  }
}

/** Delete the selected cells' contents, one undo step, keeping the block. */
function clearCellBlock(ih) {
  const done = ih.clearSelectedCellBlock?.()
  if (done) ih.updateCellSelection?.()
  return done === true
}

/** An engine answer the bridge hands back either parsed or as JSON. */
const answerOf = (value) => (typeof value === 'string' ? JSON.parse(value) : value)

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch])

/** A tab-separated field, quoted when it holds a tab, a line break or a quote (as spreadsheets do). */
const tsvField = (text) => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/** Look of a copied cell when the engine cannot export the table's own: a thin black line. */
const PLAIN_CELL_STYLE = 'border:0.4pt solid #000000;padding:1.41pt 5.1pt'

/** The text of one cell, its paragraphs as lines. */
function cellTextOf(ih, context, cellIdx) {
  const { sec, ppi, ci } = context
  const count = ih.wasm.getCellParagraphCount(sec, ppi, ci, cellIdx)
  const lines = []
  for (let p = 0; p < count; p += 1) {
    const length = ih.wasm.getCellParagraphLength(sec, ppi, ci, cellIdx, p)
    lines.push(ih.wasm.getTextInCell(sec, ppi, ci, cellIdx, p, 0, length))
  }
  return lines.join('\n')
}

/**
 * The look (style attribute) and formatted content of every cell of a table, in cell order,
 * from the engine's HTML export. That export leaves out spans and widths, which the copy
 * puts back from the cells themselves. Null when it cannot be read cell for cell.
 */
function exportedCellLooks(ih, context, cellCount) {
  const Parser = globalThis.DOMParser
  if (!Parser || !ih.wasm.exportControlHtml) return null
  try {
    const html = ih.wasm.exportControlHtml(context.sec, context.ppi, context.ci, '')
    const doc = new Parser().parseFromString(html, 'text/html')
    const cells = [...doc.querySelectorAll('td, th')]
    if (cells.length !== cellCount) return null
    // the export breaks lines between its tags; a paste would read each break as a paragraph
    return cells.map((td) => ({
      style: td.getAttribute('style') ?? '',
      content: td.innerHTML.replace(/>\s*\n\s*</g, '><').trim(),
    }))
  } catch {
    return null
  }
}

/**
 * The selected cells as they go on the clipboard. `text` is tab-separated rows (a merged
 * cell's text in its first slot, the slots it covers empty), as spreadsheets read it.
 * `html` is a table of the same cells with their spans, widths, lines and fills: pasted in
 * the body (here, in Hancom Hangul, in a word processor) it makes that table again, as
 * Hangul's own cell copy does. Null, with the reason told, when the cells cannot be copied.
 */
export function cellBlockCopy(ih) {
  const cursor = ih?.cursor
  const context = cursor?.getCellTableContext?.()
  const range = cursor?.getSelectedCellRange?.()
  if (!context || !range) return null
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 복사할 수 없습니다.'
        : 'A table inside a cell cannot be copied yet.',
    )
    return null
  }
  const { startRow, startCol, endRow, endCol } = range
  const rows = endRow - startRow + 1
  const cols = endCol - startCol + 1
  const picked = []
  try {
    const dims = ih.wasm.getTableDimensions(context.sec, context.ppi, context.ci)
    const looks = exportedCellLooks(ih, context, dims.cellCount)
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = ih.wasm.getCellInfo(context.sec, context.ppi, context.ci, i)
      if (info.row < startRow || info.row > endRow || info.col < startCol || info.col > endCol) {
        continue
      }
      const props = answerOf(ih.wasm.getCellProperties?.(context.sec, context.ppi, context.ci, i))
      picked.push({
        row: info.row - startRow,
        col: info.col - startCol,
        // a merged cell reaching past the block is cut at the block's edge
        rowSpan: Math.min(info.row + Math.max(1, info.rowSpan) - 1, endRow) - info.row + 1,
        colSpan: Math.min(info.col + Math.max(1, info.colSpan) - 1, endCol) - info.col + 1,
        text: cellTextOf(ih, context, i),
        look: looks?.[i] ?? null,
        // HWPUNIT: 100 to the point
        width: Number(props?.width) > 0 ? Number(props.width) / 100 : 0,
        height: Number(props?.height) > 0 ? Number(props.height) / 100 : 0,
      })
    }
  } catch {
    return null
  }
  if (picked.length === 0) return null
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  for (const cell of picked) grid[cell.row][cell.col] = cell.text
  const text = grid.map((line) => line.map(tsvField).join('\t')).join('\n')
  const htmlRows = []
  for (let r = 0; r < rows; r += 1) {
    const cells = picked
      .filter((cell) => cell.row === r)
      .sort((x, y) => x.col - y.col)
      .map((cell) => {
        const style = [
          (cell.look ? cell.look.style : PLAIN_CELL_STYLE).replace(/;\s*$/, ''),
          cell.width ? `width:${cell.width}pt` : '',
          cell.height ? `height:${cell.height}pt` : '',
        ]
          .filter(Boolean)
          .join(';')
        const content = cell.look
          ? cell.look.content
          : cell.text
              .split('\n')
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join('')
        const spans =
          (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '') +
          (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '')
        return `<td${spans} style="${escapeHtml(style)}">${content}</td>`
      })
    htmlRows.push(`<tr>${cells.join('')}</tr>`)
  }
  const html = `<table style="border-collapse:collapse;">${htmlRows.join('')}</table>`
  return { text, html }
}

/**
 * Copy without waiting: a key press is a user gesture, so the DOM copy runs, and its copy
 * event takes both the text and the HTML. The async clipboard is the fallback.
 */
function writeClipboard({ text, html }) {
  try {
    const doc = globalThis.document
    if (doc) {
      const fill = (event) => {
        if (!event.clipboardData) return
        event.clipboardData.setData('text/plain', text)
        if (html) event.clipboardData.setData('text/html', html)
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      const area = doc.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
      doc.body.appendChild(area)
      area.select()
      doc.addEventListener('copy', fill, true)
      let done = false
      try {
        done = doc.execCommand('copy')
      } finally {
        doc.removeEventListener('copy', fill, true)
        area.remove()
      }
      if (done) return true
    }
  } catch {
    // fall through to the async clipboard
  }
  try {
    const Item = globalThis.ClipboardItem
    const clipboard = globalThis.navigator?.clipboard
    if (Item && clipboard?.write && html) {
      void clipboard.write([
        new Item({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
    } else {
      void clipboard?.writeText?.(text)
    }
  } catch {
    // the key is still consumed
  }
  return false
}

/** Ctrl+C / Ctrl+X in a cell block: the cells as text and as a table; cut also empties them. */
function copyCellBlock(ih, cut) {
  const copied = cellBlockCopy(ih)
  if (copied === null) return false
  writeClipboard(copied)
  // the async clipboard may still be writing; the cells are on their way, so a cut empties now
  if (cut) clearCellBlock(ih)
  return true
}

/** Ctrl+V or Shift+Insert, whatever the input language. */
function isPasteKey(e) {
  if (e.altKey) return false
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) return letterOf(e) === 'v'
  return e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'Insert'
}

/** The text of one table cell of pasted HTML: <br> and paragraphs become lines. */
function htmlCellText(cell) {
  const doc = cell.ownerDocument
  for (const br of [...cell.querySelectorAll('br')]) br.replaceWith(doc.createTextNode('\n'))
  for (const block of [...cell.querySelectorAll('p, div, li')]) {
    if (block.nextSibling) block.after(doc.createTextNode('\n'))
  }
  return (cell.textContent ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim()
}

/**
 * The cells of a pasted HTML table, row by row, when the clipboard holds just a table (cells
 * from a spreadsheet or another table). A merged source cell keeps its text in its first slot
 * and leaves the slots it spans alone (null). Null when the HTML is not a lone table.
 */
export function cellGridFromHtml(html) {
  if (!html || !/<table[\s>]/i.test(html)) return null
  const Parser = globalThis.DOMParser
  if (!Parser) return null
  let doc
  try {
    doc = new Parser().parseFromString(html, 'text/html')
  } catch {
    return null
  }
  const tables = [...doc.querySelectorAll('table')].filter(
    (t) => !t.parentElement?.closest('table'),
  )
  if (tables.length !== 1) return null
  const table = tables[0]
  // text beside the table (a copied paragraph around it) is not a cell paste
  for (const style of [...doc.querySelectorAll('style, script, title')]) style.remove()
  const outside = (doc.body?.textContent ?? '').replace(table.textContent ?? '', '')
  if (outside.trim() !== '') return null
  const grid = []
  const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table)
  rows.forEach((tr, r) => {
    grid[r] ??= []
    let c = 0
    for (const td of [...tr.children].filter((el) => /^(TD|TH)$/.test(el.tagName))) {
      while (grid[r][c] !== undefined) c += 1
      const rowSpan = Math.max(1, Number(td.getAttribute('rowspan')) || 1)
      const colSpan = Math.max(1, Number(td.getAttribute('colspan')) || 1)
      for (let dr = 0; dr < rowSpan; dr += 1) {
        grid[r + dr] ??= []
        for (let dc = 0; dc < colSpan; dc += 1) grid[r + dr][c + dc] = null
      }
      grid[r][c] = htmlCellText(td)
      c += colSpan
    }
  })
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (grid.length === 0 || width === 0) return null
  return grid.map((row) => Array.from({ length: width }, (_, c) => row[c] ?? null))
}

/**
 * Tab-separated rows of plain text, as spreadsheets and this editor's cell copy put them on
 * the clipboard. A field in double quotes may hold tabs, line breaks and doubled quotes.
 */
export function cellGridFromText(text) {
  const source = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  if (source === '') return null
  const rows = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === '\t') {
      rows[rows.length - 1].push(field)
      field = ''
    } else if (ch === '\n') {
      rows[rows.length - 1].push(field)
      rows.push([])
      field = ''
    } else {
      field += ch
    }
  }
  rows[rows.length - 1].push(field)
  const width = Math.max(...rows.map((row) => row.length))
  return rows.map((row) => Array.from({ length: width }, (_, c) => row[c] ?? ''))
}

/** Write a value into one cell: its old content goes, its lines become paragraphs. */
function writeCell(bridge, at, cellIdx, value) {
  const { sec, ppi, ci } = at
  const count = bridge.getCellParagraphCount(sec, ppi, ci, cellIdx)
  const last = Math.max(0, count - 1)
  const lastLength = bridge.getCellParagraphLength(sec, ppi, ci, cellIdx, last)
  if (count > 1 || lastLength > 0)
    bridge.deleteRangeInCell(sec, ppi, ci, cellIdx, 0, 0, last, lastLength)
  const lines = value.split('\n')
  lines.forEach((line, i) => {
    if (i > 0) bridge.splitParagraphInCell(sec, ppi, ci, cellIdx, i - 1, lines[i - 1].length)
    if (line) bridge.insertTextInCell(sec, ppi, ci, cellIdx, i, 0, line)
  })
}

/** The studio's dialog base (handed in with the commands), for the 셀 붙이기 dialog. */
let modalDialog = null

/** Where pasted cells can go, as Hangul's 셀 붙이기 dialog offers them. */
export const CELL_PASTE_MODES = ['overwrite', 'up', 'down', 'left', 'right']

/**
 * Paste copied cells with the caret in one cell of a table (no block), as Hangul does: the
 * 셀 붙이기 dialog asks where they go, and they overwrite the table from the caret's cell or
 * come in as new rows or columns beside it. Only a clipboard that holds a table of more than
 * one cell (cells copied here or in Hangul, a spreadsheet range) is taken; anything else, a
 * selection, and places other than a cell of a body table keep the studio's paste.
 */
/**
 * Whether the caret holds a selection that covers something. rhwp devel can leave the drag
 * anchor on the caret after a click in a cell (a double click in an empty cell), which
 * `hasSelection()` reports though nothing is selected; Hangul has no selection there.
 */
function selectsSomething(cursor) {
  if (typeof cursor.hasSelection !== 'function' || !cursor.hasSelection()) return false
  const range = cursor.getSelectionOrdered?.()
  if (!range) return true
  const { start, end } = range
  const path = (pos) => JSON.stringify(pos.cellPath ?? [])
  return !(
    start.sectionIndex === end.sectionIndex &&
    start.paragraphIndex === end.paragraphIndex &&
    start.parentParaIndex === end.parentParaIndex &&
    start.controlIndex === end.controlIndex &&
    start.cellIndex === end.cellIndex &&
    start.cellParaIndex === end.cellParaIndex &&
    start.charOffset === end.charOffset &&
    path(start) === path(end)
  )
}

function cellPasteAtCaret(ih, e) {
  const cursor = ih?.cursor
  if (!cursor?.getPosition || !ih.wasm || !ih.executeOperation) return false
  const elsewhere = [
    'isInHeaderFooter',
    'isInFootnote',
    'isInTextBox',
    'isInPictureObjectSelection',
    'isInTableObjectSelection',
  ].some((mode) => typeof cursor[mode] === 'function' && cursor[mode]())
  if (elsewhere || selectsSomething(cursor)) return false
  const caret = cursor.getPosition()
  if (caret?.parentParaIndex === undefined || caret.cellIndex === undefined) return false
  if ((caret.cellPath?.length ?? 0) > 1) return false
  const grid = cellGridFromHtml(e?.clipboardData?.getData?.('text/html') ?? '')
  if (!grid || grid.length * grid[0].length < 2) return false
  const at = { sec: caret.sectionIndex, ppi: caret.parentParaIndex, ci: caret.controlIndex }
  let cell
  try {
    cell = ih.wasm.getCellInfo(at.sec, at.ppi, at.ci, caret.cellIndex)
    const props = answerOf(ih.wasm.getCellProperties?.(at.sec, at.ppi, at.ci, caret.cellIndex))
    if (props?.cellProtect) return false
  } catch {
    return false
  }
  const paste = (mode) => pasteCellsAt(ih, at, cell, grid, mode, caret)
  if (!modalDialog) {
    // a host without the dialog base (a test): Hangul's default, overwrite
    paste('overwrite')
    return true
  }
  cellPasteDialog(modalDialog, koreanUi, paste).show()
  return true
}

/**
 * Put copied cells into a table, one undo step. `cell` is the caret's cell (row, col and
 * spans). `overwrite` writes them from that cell over the table's own and drops what falls
 * outside it. `up`/`down` insert as many rows above/below the caret's row and fill them from
 * the first column; `left`/`right` insert columns beside the caret's column and fill them
 * from the first row. As Hangul does, when the pasted cells are narrower (shorter) than the
 * table, the last pasted column (row) is merged across the rest of each new row (column).
 * Only the cells' text changes; new cells take the look the engine gives a new row/column.
 */
export function pasteCellsAt(ih, at, cell, grid, mode, caret) {
  const { sec, ppi, ci } = at
  const rows = grid.length
  const cols = grid[0].length
  let outside = 0
  let first = null
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'ieumPasteCellsAt',
    operation: (bridge) => {
      let r0 = cell.row
      let c0 = cell.col
      const lastRow = cell.row + Math.max(1, cell.rowSpan) - 1
      const lastCol = cell.col + Math.max(1, cell.colSpan) - 1
      if (mode === 'up' || mode === 'down') {
        for (let i = 0; i < rows; i += 1) {
          bridge.insertTableRow(sec, ppi, ci, mode === 'up' ? cell.row : lastRow, mode === 'down')
        }
        r0 = mode === 'up' ? cell.row : lastRow + 1
        c0 = 0
      } else if (mode === 'left' || mode === 'right') {
        for (let i = 0; i < cols; i += 1) {
          bridge.insertTableColumn(
            sec,
            ppi,
            ci,
            mode === 'left' ? cell.col : lastCol,
            mode === 'right',
          )
        }
        r0 = 0
        c0 = mode === 'left' ? cell.col : lastCol + 1
      }
      const places = () => {
        const dims = bridge.getTableDimensions(sec, ppi, ci)
        const byPlace = new Map()
        for (let i = 0; i < dims.cellCount; i += 1) {
          const info = bridge.getCellInfo(sec, ppi, ci, i)
          byPlace.set(`${info.row}:${info.col}`, i)
        }
        return { dims, byPlace }
      }
      let { dims, byPlace } = places()
      const stretch = (r1, c1, r2, c2) => {
        if (!byPlace.has(`${r1}:${c1}`) || !byPlace.has(`${r2}:${c2}`)) return
        try {
          bridge.mergeTableCells(sec, ppi, ci, r1, c1, r2, c2)
        } catch {
          // a merge the engine refuses leaves the new cells as they are
        }
      }
      if ((mode === 'up' || mode === 'down') && cols < dims.colCount) {
        for (let dr = 0; dr < rows; dr += 1) stretch(r0 + dr, cols - 1, r0 + dr, dims.colCount - 1)
        ;({ dims, byPlace } = places())
      }
      if ((mode === 'left' || mode === 'right') && rows < dims.rowCount) {
        for (let dc = 0; dc < cols; dc += 1) stretch(rows - 1, c0 + dc, dims.rowCount - 1, c0 + dc)
        ;({ dims, byPlace } = places())
      }
      for (let dr = 0; dr < rows; dr += 1) {
        for (let dc = 0; dc < cols; dc += 1) {
          const value = grid[dr][dc]
          if (value === null) continue
          const row = r0 + dr
          const col = c0 + dc
          if (row >= dims.rowCount || col >= dims.colCount) {
            outside += 1
            continue
          }
          // a merged cell takes the value of its first slot; the slots it covers are skipped
          const cellIdx = byPlace.get(`${row}:${col}`)
          if (cellIdx === undefined) continue
          writeCell(bridge, at, cellIdx, value)
          if (first === null) first = cellIdx
        }
      }
      const cellIndex = first ?? byPlace.get(`${r0}:${c0}`) ?? caret.cellIndex
      const cellPath = Array.isArray(caret.cellPath)
        ? caret.cellPath.map((entry, i, path) =>
            i === path.length - 1 ? { ...entry, cellIndex, cellParaIndex: 0 } : entry,
          )
        : caret.cellPath
      return { ...caret, cellIndex, cellParaIndex: 0, charOffset: 0, cellPath }
    },
  })
  ih.updateCaret?.()
  if (outside > 0) tellUser(outsideMessage(outside))
  return true
}

/**
 * Hangul's 셀 붙이기 dialog: where the copied cells go. Overwrite is the default. Putting the
 * cells into the caret's cell as a table of their own is shown but cannot be chosen: the
 * engine cannot make a table inside a cell.
 */
function cellPasteDialog(ModalDialog, ko, onPaste) {
  const choices = [
    { mode: 'up', ko: '위쪽에 끼워 넣기', en: 'Insert above' },
    { mode: 'down', ko: '아래쪽에 끼워 넣기', en: 'Insert below' },
    { mode: 'left', ko: '왼쪽에 끼워 넣기', en: 'Insert to the left' },
    { mode: 'right', ko: '오른쪽에 끼워 넣기', en: 'Insert to the right' },
  ]
  class CellPasteDialog extends ModalDialog {
    constructor() {
      super(ko ? '셀 붙이기' : 'Paste Cells', 340)
      this.mode = 'overwrite'
      this.enterKey = null
    }

    createBody() {
      const doc = globalThis.document
      const body = doc.createElement('div')
      // The shared dialog skin owns the body padding (studio-plugin/dialog-theme.mjs).
      const heading = (text) => {
        const h = doc.createElement('div')
        h.className = 'dialog-section-title'
        h.textContent = text
        return h
      }
      const option = (mode, text, disabled = false) => {
        const label = doc.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap'
        const input = doc.createElement('input')
        input.type = 'radio'
        input.name = 'ieum-cell-paste'
        input.value = mode
        input.checked = mode === this.mode
        input.disabled = disabled
        input.addEventListener('change', () => {
          if (input.checked) this.mode = mode
        })
        label.append(input, text)
        if (disabled) {
          label.style.opacity = '0.5'
          label.title = ko
            ? '셀 안에 표를 만드는 기능은 아직 없습니다.'
            : 'A table cannot be made inside a cell yet.'
        } else {
          // a double click on a choice pastes at once
          label.addEventListener('dblclick', () => {
            this.mode = mode
            this.confirm()
          })
        }
        return label
      }
      body.appendChild(heading(ko ? '끼워 넣기' : 'Insert'))
      const grid = doc.createElement('div')
      grid.style.cssText =
        'display:grid;grid-template-columns:repeat(2,auto);gap:6px 18px;margin:6px 0 12px'
      for (const choice of choices)
        grid.appendChild(option(choice.mode, ko ? choice.ko : choice.en))
      body.appendChild(grid)
      body.appendChild(heading(ko ? '칸에 넣기' : 'Into the cells'))
      const over = doc.createElement('div')
      over.style.cssText = 'display:grid;gap:6px;margin-top:6px'
      over.append(
        option('overwrite', ko ? '덮어쓰기' : 'Overwrite'),
        option('nested', ko ? '셀 안에 표로 넣기' : 'Insert as a table in the cell', true),
      )
      body.appendChild(over)
      return body
    }

    confirm() {
      const primary = this.dialog?.querySelector('.dialog-btn-primary')
      primary?.click()
    }

    show() {
      const doc = globalThis.document
      // Enter on a choice pastes too: the base takes keys at the document before they reach
      // a radio button and leaves Enter alone on one, so this listener goes first
      this.enterKey = (event) => {
        if (event.key !== 'Enter') return
        const target = event.target
        if (!target?.closest?.('.dialog-wrap') || target.type !== 'radio') return
        event.preventDefault()
        event.stopPropagation()
        this.confirm()
      }
      doc.addEventListener('keydown', this.enterKey, true)
      super.show()
      const primary = this.dialog?.querySelector('.dialog-btn-primary')
      if (primary) primary.textContent = ko ? '붙이기' : 'Paste'
    }

    hide() {
      if (this.enterKey) globalThis.document.removeEventListener('keydown', this.enterKey, true)
      this.enterKey = null
      super.hide()
    }

    onConfirm() {
      if (CELL_PASTE_MODES.includes(this.mode)) onPaste(this.mode)
      return true
    }
  }
  return new CellPasteDialog()
}

/**
 * Paste onto a cell block, as Hangul does when cells are selected first: the copied cells
 * (a spreadsheet range, a table, tab-separated text) overwrite the table's cells from the
 * block's top-left cell, contents only, each cell keeping its own look. A single value fills
 * every selected cell. One undo step, which brings the old contents and the block back.
 * Without a block, copied cells pasted at a caret in a cell go through the 셀 붙이기 dialog
 * (cellPasteAtCaret); anything else the studio pastes as before. True when this took the paste.
 */
export function hancomPasteCells(ih, e) {
  const cursor = ih?.cursor
  if (!cursor?.isInCellSelectionMode?.()) return cellPasteAtCaret(ih, e)
  if (cursor.isProtectedCellSelectionMode?.()) return false
  const context = cursor.getCellTableContext?.()
  const range = cursor.getSelectedCellRange?.()
  if (!context || !range || !ih.wasm || !ih.executeOperation) return false
  const data = e?.clipboardData
  const html = data?.getData?.('text/html') ?? ''
  const text = data?.getData?.('text/plain') ?? ''
  const grid = cellGridFromHtml(html) ?? cellGridFromText(text)
  if (!grid) {
    // not cells (a picture): close the block as the studio does for a key it leaves alone,
    // and its paste goes to the caret as before
    cursor.exitCellSelectionMode?.()
    ih.cellSelectionRenderer?.clear?.()
    ih.updateCaret?.()
    return false
  }
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표에는 아직 칸으로 붙일 수 없습니다.'
        : 'Cells cannot be pasted into a table inside a cell yet.',
    )
    return true
  }
  const at = { sec: context.sec, ppi: context.ppi, ci: context.ci }
  let byPlace
  let rowCount
  let colCount
  try {
    const dims = ih.wasm.getTableDimensions(at.sec, at.ppi, at.ci)
    rowCount = dims.rowCount
    colCount = dims.colCount
    byPlace = new Map()
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = ih.wasm.getCellInfo(at.sec, at.ppi, at.ci, i)
      byPlace.set(`${info.row}:${info.col}`, i)
    }
  } catch {
    return false
  }
  // cells taken out of the block with Ctrl+click (the studio keys them "row,col")
  const excluded = cursor.getExcludedCells?.() ?? new Set()
  const single = grid.length === 1 && grid[0].length === 1
  const spanRows = single ? range.endRow - range.startRow + 1 : grid.length
  const spanCols = single ? range.endCol - range.startCol + 1 : grid[0].length
  const writes = []
  let outside = 0
  for (let dr = 0; dr < spanRows; dr += 1) {
    for (let dc = 0; dc < spanCols; dc += 1) {
      const value = single ? grid[0][0] : grid[dr][dc]
      if (value === null) continue
      const row = range.startRow + dr
      const col = range.startCol + dc
      if (row >= rowCount || col >= colCount) {
        outside += 1
        continue
      }
      // a merged cell takes the value of its first slot; the slots it covers are skipped
      const cellIdx = byPlace.get(`${row}:${col}`)
      if (cellIdx === undefined || excluded.has(`${row},${col}`)) continue
      writes.push({ cellIdx, value })
    }
  }
  if (writes.length === 0) {
    if (outside > 0) tellUser(outsideMessage(outside))
    return true
  }
  const selection = cursor.captureCellSelection?.() ?? null
  const caret = cursor.getPosition?.()
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'ieumPasteCells',
    operation: (bridge) => {
      for (const { cellIdx, value } of writes) writeCell(bridge, at, cellIdx, value)
      // the caret's cell may now be shorter than its old offset
      const caretWritten =
        caret?.cellIndex !== undefined && writes.some((w) => w.cellIdx === caret.cellIndex)
      return caretWritten ? { ...caret, cellParaIndex: 0, charOffset: 0 } : caret
    },
    selectionBefore: selection ? { mode: 'cellBlock', state: selection } : null,
  })
  // the block now covers what was pasted, as after a paste in Hangul
  if (!single) {
    const lastRow = Math.min(rowCount, range.startRow + spanRows) - 1
    const lastCol = Math.min(colCount, range.startCol + spanCols) - 1
    cursor.setCellSelectionAnchor?.(range.startRow, range.startCol)
    cursor.setCellSelectionFocus?.(lastRow, lastCol)
  }
  ih.updateCellSelection?.()
  if (outside > 0) tellUser(outsideMessage(outside))
  return true
}

function outsideMessage(count) {
  return koreanUi
    ? `표 밖으로 넘친 ${count}칸은 붙이지 않았습니다.`
    : `${count} cell(s) beyond the table were not pasted.`
}

/**
 * Ctrl+Enter's row insert, with the current cell read live. A merged cell puts the new
 * row after its last row, as Hangul does; the studio command's first read after a merge
 * can still see the pre-merge span, so the key uses this path instead of dispatching it.
 */
export function insertRowBelow(services) {
  const ih = services?.getInputHandler?.()
  const pos = ih?.getCursorPosition?.()
  if (!ih || !pos || pos.cellIndex === undefined) return false
  if ((pos.cellPath?.length ?? 0) > 1) return false
  let info
  try {
    info = services.wasm.getCellInfo(
      pos.sectionIndex,
      pos.parentParaIndex,
      pos.controlIndex,
      pos.cellIndex,
    )
  } catch {
    return false
  }
  const row = info.row + Math.max(1, info.rowSpan || 1) - 1
  const lastMergedColumn = info.col + Math.max(1, info.colSpan || 1) - 1
  let result = null
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'insertTableRowBelow',
      operation: (bridge) => {
        result = bridge.insertTableRow(
          pos.sectionIndex,
          pos.parentParaIndex,
          pos.controlIndex,
          row,
          true,
        )
        if (!result?.ok) return null
        // Hangul keeps the new row's matching columns as one cell under a wide merge.
        if (lastMergedColumn > info.col) {
          try {
            bridge.mergeTableCells(
              pos.sectionIndex,
              pos.parentParaIndex,
              pos.controlIndex,
              row + 1,
              info.col,
              row + 1,
              lastMergedColumn,
            )
          } catch {
            // the row is still useful if the decorative merge cannot be made
          }
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  return result?.ok === true
}

/**
 * Ctrl+Enter adds a row below and Ctrl+Backspace deletes the row the caret is in, as
 * Hangul does in a table cell. Both run the studio's table commands, one undo step each.
 * Outside a cell the keys keep their meanings (page break, delete the word before). A
 * table inside a cell is left to Phase 2: the keys are consumed there, so a page break
 * cannot land in a cell.
 */
function hancomTableRowKey(ih, e) {
  const cursor = ih?.cursor
  if (!cursor?.isInCell?.() || cursor.isInTextBox?.()) return false
  if (cursor.isInHeaderFooter?.() || cursor.isInFootnote?.()) return false
  if (cursor.isInCellSelectionMode?.() || cursor.isInTableObjectSelection?.()) return false
  if (ih.isFormMode?.()) return false
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  const pos = ih.getCursorPosition?.()
  if (!pos) return false
  const nested = (pos.cellPath?.length ?? 0) > 1
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (nested) return true
    if (ih.dispatcher?.isEnabled?.('ieum:table-insert-row-below')) {
      ih.dispatcher.dispatch('ieum:table-insert-row-below')
    }
    return true
  }
  if (e.key === 'Backspace' && e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (nested) return true
    // the last row stays: the engine refuses to empty a table, and this keeps it quiet
    try {
      const dims = ih.wasm?.getTableDimensions?.(
        pos.sectionIndex,
        pos.parentParaIndex,
        pos.controlIndex,
      )
      if (dims?.rowCount <= 1) return true
    } catch {
      // let the command answer; it refuses the last row too
    }
    if (ih.dispatcher?.isEnabled?.('table:delete-row')) {
      ih.dispatcher.dispatch('table:delete-row')
    }
    return true
  }
  return false
}

/** How tall each cell draws (HWPUNIT, cellIdx → height); a cell split over pages has a box on each. */
function drawnHeights(wasm, at) {
  const drawn = new Map()
  for (const box of wasm.getTableCellBboxes(at.sec, at.ppi, at.ci)) {
    drawn.set(box.cellIdx, (drawn.get(box.cellIdx) ?? 0) + box.h * HWPUNIT_PER_PX)
  }
  return drawn
}

/** The table's cells with their stored sizes and how tall each draws (HWPUNIT). */
function tableCells(wasm, at) {
  const dims = wasm.getTableDimensions(at.sec, at.ppi, at.ci)
  let drawn = new Map()
  try {
    drawn = drawnHeights(wasm, at)
  } catch {
    // an engine without the query: the stored heights still answer
  }
  const cells = []
  for (let i = 0; i < dims.cellCount; i += 1) {
    const info = wasm.getCellInfo(at.sec, at.ppi, at.ci, i)
    const props = wasm.getCellProperties(at.sec, at.ppi, at.ci, i)
    cells.push({
      cellIdx: i,
      row: info.row,
      col: info.col,
      rowSpan: info.rowSpan,
      colSpan: info.colSpan,
      width: props.width,
      height: props.height,
      drawnHeight: drawn.has(i) ? Math.round(drawn.get(i)) : undefined,
    })
  }
  return { dims, cells }
}

/**
 * After a row plan, the rows put where they were meant to draw. The engine grows the table's
 * height by what the stored heights grew (282 → 3533 for a row drawn at 1283 adds 3251, not
 * 2250) and spreads the difference over every row, and it shares a merged cell's text over the
 * rows it spans by its own rule, so a row asked to grow can come out short (2026-10-31). So every
 * cell is placed once more from the rows' heights (setTableCellExtents): a growing row at its
 * target (`targets`, row → HWPUNIT), a row the plan did not touch at the height it drew at before,
 * a shrunk row as the engine drew it. The rows' lines stay, so the cells keep their numbers.
 * `cells` is the table before the plan, with the heights it drew at. False when the engine
 * refused. Exported for the engine tests.
 */
export function settleRows(bridge, at, cells, targets, updates) {
  const rowHeights = (list) => {
    const heights = []
    for (const cell of list) {
      if (cell.rowSpan !== 1 || cell.drawnHeight === undefined) continue
      heights[cell.row] = Math.max(heights[cell.row] ?? 0, cell.drawnHeight)
    }
    return heights
  }
  const after = tableCells(bridge, at).cells
  const before = rowHeights(cells)
  const now = rowHeights(after)
  const touched = new Set(
    updates
      .map((update) => cells.find((cell) => cell.cellIdx === update.cellIdx))
      .filter((cell) => cell?.rowSpan === 1)
      .map((cell) => cell.row),
  )
  const rowCount = Math.max(0, ...after.map((cell) => cell.row + cell.rowSpan))
  const lines = [0]
  let off = false
  for (let row = 0; row < rowCount; row += 1) {
    // a row only merged cells cover cannot be told; leave the table as the engine drew it
    if (before[row] === undefined || now[row] === undefined) return true
    const height = targets.has(row) ? targets.get(row) : touched.has(row) ? now[row] : before[row]
    if (Math.abs(height - now[row]) >= HWPUNIT_PER_PX / 2) off = true
    lines.push(lines[row] + Math.round(height))
  }
  if (!off) return true
  const extents = after.map((cell) => ({
    cellIdx: cell.cellIdx,
    start: lines[cell.row],
    end: lines[cell.row + cell.rowSpan],
  }))
  return bridge.setTableCellExtents(at.sec, at.ppi, at.ci, true, extents)?.ok === true
}

/** Thrown inside a snapshot operation so the studio puts the document back as it was. */
class Undone extends Error {}

/**
 * Write planned cell sizes in one snapshot (one undo step); true when the engine took them. A row
 * plan that grows rows is put right once drawn (settleRows, given the table's cells).
 */
function applyCellSizes(ih, at, updates, operationType, cells) {
  if (updates.length === 0) return false
  let failed = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType,
      operation: (bridge) => {
        if (!bridge.resizeTableCells(at.sec, at.ppi, at.ci, updates)?.ok) {
          failed = true
          return null
        }
        if (
          updates.rowTargets &&
          cells &&
          !settleRows(bridge, at, cells, updates.rowTargets, updates)
        ) {
          throw new Undone()
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  return !failed
}

/**
 * The caret's cell after the engine placed the cells: the engine lists them again row by row, so
 * a cell's number can change. It is found by its place: its index across the axis stays, and it
 * starts where its extent says. Undefined when it cannot be told.
 */
function placedCell(after, vertical, caret, extent) {
  const places = cellExtents(after, vertical ? 'row' : 'col')
  const cross = vertical ? 'col' : 'row'
  if (!places || !caret || !extent) return undefined
  return after.find(
    (cell, i) =>
      cell[cross] === caret[cross] && Math.abs(places[i][0] - extent.start) < HWPUNIT_PER_PX / 2,
  )
}

/** How many times H may place the cells again to make room for text (applyCellExtents). */
const REFIT_PASSES = 8

/**
 * Place cells at new starts and ends along one axis (table-sizes.mjs) in one snapshot, the caret
 * staying in its cell. `refit`, given the cells as drawn, may place them again until it has
 * nothing more to do (H growing the table where a cell's text needs more than its share). With `mustFit` every cell has to draw at
 * the size it now stores, or the document is put back: its text did not fit, which Hangul also
 * refuses. 'done', 'no room' or 'failed'.
 */
function applyCellExtents(
  ih,
  at,
  cells,
  extents,
  vertical,
  operationType,
  { mustFit, refit } = {},
) {
  const pos = ih.getCursorPosition?.()
  let caret = cells.find((cell) => cell.cellIdx === pos?.cellIndex)
  let status = 'failed'
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType,
      operation: (bridge) => {
        const place = (plan) => {
          if (!bridge.setTableCellExtents(at.sec, at.ppi, at.ci, vertical, plan)?.ok) return null
          const placed = tableCells(bridge, at).cells
          caret = placedCell(
            placed,
            vertical,
            caret,
            plan.find((e) => e.cellIdx === caret?.cellIdx),
          )
          return placed
        }
        let after = place(extents)
        if (!after) return null
        // where merged cells span split rows the engine shares their text over the rows by its
        // own rule, so a pass can still leave a cell short; it settles in a few (five for a 2×2
        // merge of four lines). The bound only stops a layout that would never settle.
        for (let pass = 0; refit && pass < REFIT_PASSES; pass += 1) {
          const again = refit(after)
          if (!again?.length) break
          after = place(again)
          if (!after) throw new Undone()
        }
        const overflows = (cell) =>
          cell.drawnHeight !== undefined && cell.drawnHeight - cell.height >= HWPUNIT_PER_PX / 2
        if (mustFit && after.some(overflows)) {
          status = 'no room'
          throw new Undone()
        }
        status = 'done'
        const now = ih.getCursorPosition()
        return caret && now ? { ...now, cellIndex: caret.cellIdx } : now
      },
    })
  } catch {
    return status === 'no room' ? status : 'failed'
  }
  return status
}

/**
 * Hangul's H/W (셀 높이를 같게, 셀 너비를 같게) over the whole table, as Hancom Hangul 2024 does
 * them: the cells in each column (H, from the heights they draw at, so every row takes the
 * average) or each row (W) come out equally sized, and where rows hold different numbers of cells
 * the grid splits (table-sizes.mjs equalExtents). One snapshot, one undo step. A block on part of
 * the table is told to take the whole table; a table inside a cell is left alone with the reason.
 */
export function equalizeTableCells(services, axis, ko) {
  const ih = services?.getInputHandler?.()
  const cursor = ih?.cursor
  if (!ih || !cursor) return false
  const inBlock = cursor.isInCellSelectionMode?.() === true
  const context = inBlock ? cursor.getCellTableContext?.() : null
  const pos = ih.getCursorPosition?.()
  const sec = context?.sec ?? pos?.sectionIndex
  const ppi = context?.ppi ?? pos?.parentParaIndex
  const ci = context?.ci ?? pos?.controlIndex
  if (ppi === undefined || ci === undefined) return false
  const nested = (context?.cellPath?.length ?? pos?.cellPath?.length ?? 0) > 1
  if (nested) {
    tellUser(
      ko
        ? '표 안의 표는 아직 크기를 같게 할 수 없습니다.'
        : 'A table inside a cell cannot be sized equally yet.',
    )
    return false
  }
  // a text box is a one-cell table to the engine, but it is not a table to Hangul
  if (pos?.isTextBox && (pos.cellPath?.length ?? 0) < 2) return false
  const at = { sec, ppi, ci }
  let table
  try {
    table = tableCells(services.wasm, at)
  } catch {
    return false
  }
  const { dims, cells } = table
  const selected = inBlock ? cursor.getSelectedCellRange?.() : null
  const range = selected ? coveringRange(cells, selected) : null
  const firstRow = range?.startRow ?? 0
  const lastRow = range?.endRow ?? dims.rowCount - 1
  const firstCol = range?.startCol ?? 0
  const lastCol = range?.endCol ?? dims.colCount - 1
  if (axis === 'height' && (firstRow !== 0 || lastRow !== dims.rowCount - 1)) {
    tellUser(
      ko
        ? '표 전체를 골라야 줄 높이를 같게 할 수 있습니다.'
        : 'Select the whole table to equalize row heights.',
    )
    return false
  }
  if (axis === 'width' && (firstCol !== 0 || lastCol !== dims.colCount - 1)) {
    tellUser(
      ko
        ? '표 전체를 골라야 칸 너비를 같게 할 수 있습니다.'
        : 'Select the whole table to equalize column widths.',
    )
    return false
  }
  const extents = equalExtents(cells, axis === 'height' ? 'row' : 'col')
  if (extents === null) {
    tellUser(
      ko
        ? '칸들의 자리를 알 수 없어 크기를 같게 하지 않았습니다.'
        : 'Not changed: the places of the cells could not be told.',
    )
    return false
  }
  if (extents.length === 0) return false
  const operationType = axis === 'height' ? 'equalizeRowHeights' : 'equalizeColumnWidths'
  if (
    applyCellExtents(ih, at, cells, extents, axis === 'height', operationType, {
      // Hangul never leaves a cell shorter than its text: where one draws taller than its share,
      // the table grows until every share holds it (2026-10-31, four lines in A1: every row
      // takes their height)
      refit:
        axis === 'height' ? (after) => equalExtents(after, 'row', textLeast(after)) : undefined,
    }) !== 'done'
  ) {
    return false
  }
  ih.updateCellSelection?.()
  return true
}

/**
 * A horizontal border dragged with the mouse, as Hangul's help has it (표 크기 조절: "아래쪽으로
 * 끌면 표의 크기가 늘어납니다"): the row above the border grows or shrinks from the height it draws
 * at, and the table with it; cells merged over that row take the change too. With Alt held the
 * row below gives way instead (Hangul's Alt+끌기), as Alt+arrow moves a boundary (moveBoundary);
 * at the table's bottom edge there is no row below, so the table grows. The studio worked both
 * from the stored heights (282 against about 1,280 drawn): the plain drag stopped after about
 * 1 mm, and the Alt drag grew every row a little instead of moving the boundary. The drag is
 * written here, in one snapshot, and [] tells the studio it is done; null leaves it to the
 * studio (studio-hancom-row-drag), as for column borders and tables inside a cell.
 */
export function hancomRowDragUpdates(ih, state, delta, alt) {
  if (state?.edge?.type !== 'row' || !ih?.wasm) return null
  const ref = state.tableRef
  if (!ref || (ref.path?.length ?? 0) > 1) return null
  let cells
  try {
    cells = tableCells(ih.wasm, ref).cells
  } catch {
    return null
  }
  const affected = cells.find((cell) => state.affectedCellIndices?.includes(cell.cellIdx))
  if (!affected) return null
  const row = affected.row + affected.rowSpan - 1
  const last = Math.max(...cells.map((cell) => cell.row + cell.rowSpan)) - 1
  const updates =
    alt && row < last
      ? moveBoundary(cells, 'row', row, delta)
      : resizeLines(cells, 'row', row, row, delta)
  if (applyCellSizes(ih, ref, updates, 'resizeTableCells', cells)) {
    if (ih.cursor?.isInCellSelectionMode?.()) ih.updateCellSelection?.()
  }
  return []
}

/**
 * The block's table, with its range grown over the merged cells it cuts through, or null (a table
 * inside a cell, with the reason told).
 */
function blockTable(services) {
  const ih = services?.getInputHandler?.()
  const cursor = ih?.cursor
  const context = cursor?.getCellTableContext?.()
  const range = cursor?.getSelectedCellRange?.()
  if (!ih || !context || !range) return null
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 크기를 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be resized yet.',
    )
    return null
  }
  let table
  try {
    table = tableCells(services.wasm, context)
  } catch {
    return null
  }
  return { ih, at: context, cells: table.cells, range: coveringRange(table.cells, range) }
}

/** One key press of the table size keys (HWPUNIT, about 1 mm). */
const SIZE_STEP = 300

/**
 * Alt+arrow in a cell block: the boundary after the block's last column/row moves by one step
 * and the column/row beyond it takes the opposite change, so the table keeps its size, as Hangul
 * does. A merged cell across that boundary stays as it is.
 */
function resizeCellBlock(services, direction) {
  const block = blockTable(services)
  if (!block) return false
  const horizontal = direction === 'left' || direction === 'right'
  const step = direction === 'right' || direction === 'down' ? SIZE_STEP : -SIZE_STEP
  const updates = moveBoundary(
    block.cells,
    horizontal ? 'col' : 'row',
    horizontal ? block.range.endCol : block.range.endRow,
    step,
  )
  if (!applyCellSizes(block.ih, block.at, updates, 'resizeCellBlock', block.cells)) return false
  block.ih.updateCellSelection?.()
  return true
}

/**
 * Ctrl+arrow in a cell block: the selected rows or columns change size and the table grows or
 * shrinks with them, as Hangul does; a row from the height it draws at. Merged cells take the
 * step times the selected columns/rows they span. One snapshot, so one undo step.
 */
export function resizeRowColumnBlock(services, direction) {
  if (direction !== 'left' && direction !== 'right' && direction !== 'up' && direction !== 'down') {
    return false
  }
  const block = blockTable(services)
  if (!block) return false
  const horizontal = direction === 'left' || direction === 'right'
  const step = direction === 'right' || direction === 'down' ? SIZE_STEP : -SIZE_STEP
  const updates = resizeLines(
    block.cells,
    horizontal ? 'col' : 'row',
    horizontal ? block.range.startCol : block.range.startRow,
    horizontal ? block.range.endCol : block.range.endRow,
    step,
  )
  if (!applyCellSizes(block.ih, block.at, updates, 'resizeRowColumnBlock', block.cells))
    return false
  block.ih.updateCellSelection?.()
  return true
}

/** Hangul's Shift+arrow step on one cell (HWPUNIT, 1 mm), the engine's resizeTableCell step. */
const CELL_STEP = 283

/**
 * Shift+arrow in a cell block: the current cell's right/bottom boundary moves and the
 * next cell's opposite boundary moves back, as Hangul does; the cells beside it stay, so
 * the grid splits into spans and a later Shift+arrow can move the same cell again. One
 * snapshot, so one undo step. Tables inside a cell are left to Phase 2.
 *
 * Shift+←/→ is the engine's resizeTableCell (vendor/rhwp-core patches 0016, 0027). Shift+↑/↓ is
 * worked out here from the heights the cells draw at (table-sizes.mjs moveCellEdge), as Hancom
 * Hangul 2024 does it (2026-10-31): the engine's own works from the stored heights and put a
 * cell next to one merged down over several rows on the wrong rows. Where a cell's text would no
 * longer fit, Hangul refuses, and so does this.
 */
export function resizeSelectedCell(services, direction) {
  const ih = services?.getInputHandler?.()
  const cursor = ih?.cursor
  const context = cursor?.getCellTableContext?.()
  const range = cursor?.getSelectedCellRange?.()
  if (!ih || !context || !range) return false
  if (direction !== 'left' && direction !== 'right' && direction !== 'up' && direction !== 'down') {
    return false
  }
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 크기를 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be resized yet.',
    )
    return false
  }
  let cells
  try {
    cells = tableCells(services.wasm, context).cells
  } catch {
    return false
  }
  const vertical = direction === 'up' || direction === 'down'
  const forward = direction === 'right' || direction === 'down'
  const pos = ih.getCursorPosition?.()
  // the block names its cell by row and column, which a split grid keeps for the moved cell;
  // the caret's cell number is the fallback
  const active =
    cells.find((cell) => cell.row === range.startRow && cell.col === range.startCol) ??
    cells.find((cell) => cell.cellIdx === pos?.cellIndex)
  if (!active) return false
  if (vertical) {
    const extents = moveCellEdge(cells, active.cellIdx, forward ? CELL_STEP : -CELL_STEP)
    if (!extents) return false
    if (
      applyCellExtents(ih, context, cells, extents, true, 'resizeTableCell', { mustFit: true }) !==
      'done'
    ) {
      return false
    }
    ih.updateCellSelection?.()
    return true
  }
  let result = null
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'resizeTableCell',
      operation: (bridge) => {
        result = bridge.resizeTableCell(
          context.sec,
          context.ppi,
          context.ci,
          active.row,
          active.col,
          false,
          forward,
        )
        if (!result?.ok || result.moved === false) return null
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (!result?.ok || result.moved === false) {
    if (result?.reason) tellUser(result.reason)
    return false
  }
  ih.updateCellSelection?.()
  return true
}

/**
 * Keys whose meaning depends on where the caret is: Hangul's row add/delete in a table
 * cell, and the easy formulas with Ctrl+Shift+H/V/J/B/K/N in a table cell only. Elsewhere
 * the key goes on to the studio (Ctrl+Shift+H, document history; Ctrl+Shift+V, the plain
 * paste). Called ahead of the studio's shortcut table.
 */
export function hancomContextKey(ih, e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  // where no tab strip takes Ctrl+(Shift+)Tab first (a window of its own), the page does
  if (e.key === 'Tab' && e.ctrlKey) {
    const take = MAIN_PROCESS_KEYS[e.shiftKey ? 'ctrl-shift-tab' : 'ctrl-tab']
    if (!take(ih)) return false
    e.preventDefault()
    return true
  }
  if (!e.shiftKey && hancomTableRowKey(ih, e)) return true
  if (!e.shiftKey) return false
  const letter = letterOf(e)
  const formula = letter ? EASY_FORMULAS[letter] : undefined
  const dispatcher = ih.dispatcher
  if (!formula || !dispatcher || !dispatcher.isEnabled(formula.id)) return false
  e.preventDefault()
  dispatcher.dispatch(formula.id)
  return true
}

/** A Ctrl key the module takes before the studio's table: a sequence's first key, or a context key. */
export function hancomCtrlKey(ih, e) {
  return hancomChordStart(ih, e) || hancomContextKey(ih, e)
}

const samePlace = (a, b) =>
  a.sectionIndex === b.sectionIndex &&
  a.parentParaIndex === b.parentParaIndex &&
  a.controlIndex === b.controlIndex &&
  a.cellIndex === b.cellIndex &&
  JSON.stringify(a.cellPath ?? null) === JSON.stringify(b.cellPath ?? null)

const paraOf = (pos) => (pos.parentParaIndex === undefined ? pos.paragraphIndex : pos.cellParaIndex)

/**
 * Hangul's Ctrl+Y: deletes the line the caret is on. A paragraph's last line takes the paragraph
 * break with it, so the line is gone and the next paragraph moves up; the last paragraph of the
 * body or a cell keeps its (now empty) line. Body text and table cells; elsewhere (header, note,
 * a selected object or cell block) it does nothing.
 */
export function deleteLine(ih) {
  const cursor = ih?.cursor
  if (!cursor || ih.isFormMode?.()) return false
  if (cursor.isInHeaderFooter() || cursor.isInFootnote()) return false
  if (cursor.isInPictureObjectSelection() || cursor.isInTableObjectSelection()) return false
  if (cursor.isInCellSelectionMode()) return false
  cursor.clearSelection()
  cursor.moveToLineStart()
  cursor.setAnchor()
  cursor.moveToLineEnd()
  const end = cursor.getPosition()
  cursor.moveHorizontal(1)
  const next = cursor.getPosition()
  // past the line end lies either the next paragraph's start (take the break) or the next line
  // of the same paragraph, or nothing at all (the last line): go back to the line end then
  const tookBreak =
    samePlace(end, next) && paraOf(next) === paraOf(end) + 1 && next.charOffset === 0
  // moveTo keeps the anchor
  if (!tookBreak) cursor.moveTo(end)
  const selection = cursor.getSelection()
  if (
    !selection ||
    (samePlace(selection.anchor, selection.focus) &&
      paraOf(selection.anchor) === paraOf(selection.focus) &&
      selection.anchor.charOffset === selection.focus.charOffset)
  ) {
    cursor.clearSelection()
    return false
  }
  ih.deleteSelection()
  ih.updateCaret?.()
  return true
}

/** What Hangul's 보통 모양 (Alt+Shift+C) takes off; size, font, ratio, spacing and shade stay. */
export const NORMAL_SHAPE = {
  bold: false,
  italic: false,
  underline: false,
  underlineType: 'None',
  strikethrough: false,
  superscript: false,
  subscript: false,
  outlineType: 0,
  shadowType: 0,
  emboss: false,
  engrave: false,
  textColor: '#000000',
}

/** Hangul's 날짜/시간 문자열 (Ctrl+K,D) as it writes it by default: 2026년 10월 23일. */
export function dateString(date = new Date()) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

/**
 * The easy formula for the cell the caret is in. The cell must be empty and sit in a table of the
 * body (not a table in a cell), and the formula must evaluate. Writes the result the way the
 * studio's block formulas do (the engine's number, as text), as one undo step.
 */
export function runEasyFormula(services, formula) {
  const ih = services.getInputHandler()
  if (!ih) return false
  const pos = ih.getCursorPosition()
  if (pos.parentParaIndex === undefined || pos.controlIndex === undefined) return false
  if (pos.cellIndex === undefined || (pos.cellPath?.length ?? 0) > 1) return false
  const sec = pos.sectionIndex
  const ppi = pos.parentParaIndex
  const ci = pos.controlIndex
  const wasm = services.wasm
  const paras = wasm.getCellParagraphCount(sec, ppi, ci, pos.cellIndex)
  for (let p = 0; p < paras; p += 1) {
    if (wasm.getCellParagraphLength(sec, ppi, ci, pos.cellIndex, p) > 0) return false
  }
  const { row, col } = wasm.getCellInfo(sec, ppi, ci, pos.cellIndex)
  const text = `=${formula.func}(${formula.range})`
  if (!JSON.parse(wasm.evaluateTableFormula(sec, ppi, ci, row, col, text, false)).ok) return false
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'tableEasyFormula',
    operation: (bridge) => {
      const done = JSON.parse(bridge.evaluateTableFormula(sec, ppi, ci, row, col, text, true))
      if (!done.ok) throw new Error(`easy formula ${text}`)
      return pos
    },
  })
  return true
}

/** Where a backward search starts: the start of the selection (the last match), or the caret. */
function searchStart(ih) {
  const selection = ih.cursor?.getSelection?.()
  if (!selection) return ih.getCursorPosition()
  const { anchor, focus } = selection
  const anchorFirst =
    anchor.paragraphIndex < focus.paragraphIndex ||
    (anchor.paragraphIndex === focus.paragraphIndex && anchor.charOffset <= focus.charOffset)
  return anchorFirst ? anchor : focus
}

/**
 * Hangul's 거꾸로 찾기 (Ctrl+Q,L): the last search again, towards the start of the document.
 * Without a last search it opens the find box.
 */
export function findBackward(services, studio) {
  const ih = services.getInputHandler()
  const query = studio.FindDialog?.lastQuery
  if (!ih || !query) {
    ih?.dispatcher?.dispatch('edit:find')
    return false
  }
  const at = searchStart(ih)
  const hit = services.wasm.searchText(
    query,
    at.sectionIndex,
    at.paragraphIndex,
    at.charOffset,
    false,
    studio.FindDialog.lastCaseSensitive,
    true,
  )
  studio.navigateToSearchHit(ih, hit)
  return !!hit?.found
}

/** Hangul's page number positions (HWP table 150), in the order the dialog lists them. */
export const PAGE_NUMBER_POSITIONS = [
  { code: 1, ko: '왼쪽 위', en: 'Top left' },
  { code: 2, ko: '가운데 위', en: 'Top center' },
  { code: 3, ko: '오른쪽 위', en: 'Top right' },
  { code: 4, ko: '왼쪽 아래', en: 'Bottom left' },
  { code: 5, ko: '가운데 아래', en: 'Bottom center' },
  { code: 6, ko: '오른쪽 아래', en: 'Bottom right' },
  { code: 7, ko: '바깥쪽 위', en: 'Outside top' },
  { code: 8, ko: '바깥쪽 아래', en: 'Outside bottom' },
  { code: 9, ko: '안쪽 위', en: 'Inside top' },
  { code: 10, ko: '안쪽 아래', en: 'Inside bottom' },
  { code: 0, ko: '없음', en: 'None' },
]

/** The number shapes a page number has in both HWP and HWPX (table 134, codes 0..7). */
export const PAGE_NUMBER_FORMATS = [
  { code: 0, sample: '1, 2, 3' },
  { code: 1, sample: '①, ②, ③' },
  { code: 2, sample: 'I, II, III' },
  { code: 3, sample: 'i, ii, iii' },
  { code: 4, sample: 'A, B, C' },
  { code: 5, sample: 'a, b, c' },
  { code: 6, sample: '가, 나, 다' },
  { code: 7, sample: '一, 二, 三' },
]

/** Hangul's default for a section without one: 1, 2, 3 at the bottom center, with dashes. */
export const PAGE_NUMBER_DEFAULT = { format: 0, position: 5, dash: true }

/**
 * Sets the section's page number (Hangul's 쪽 번호 매기기) through the engine call the
 * studio-hancom-page-number patch hands over: one per section, in its first paragraph, replacing
 * the one there was. One undo step.
 */
export function applyPageNumber(services, setting) {
  const ih = services.getInputHandler()
  if (!ih) return false
  const pos = ih.getCursorPosition()
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'setPageNumberPos',
    operation: (bridge) => {
      const done = JSON.parse(
        bridge.setPageNumberPos(pos.sectionIndex, setting.format, setting.position, setting.dash),
      )
      if (!done.ok) throw new Error('setPageNumberPos')
      return pos
    },
  })
  return true
}

/** The section's page number as the dialog starts with it: the one it has, or Hangul's default. */
export function currentPageNumber(services, section) {
  try {
    const found = JSON.parse(services.wasm.getPageNumberPos(section))
    if (found?.ok && found.pageNumber) {
      const { format, position, dash } = found.pageNumber
      return { format, position, dash }
    }
  } catch {
    // an engine without the call: the default
  }
  return { ...PAGE_NUMBER_DEFAULT }
}

/** The table a table-object selection points at, with its size; null otherwise. */
function selectedTableOf(ih, wasm) {
  const ref = ih?.getSelectedTableRef?.()
  if (!ref) return null
  try {
    return { ref, dims: wasm.getTableDimensions(ref.sec, ref.ppi, ref.ci) }
  } catch {
    return null
  }
}

/** Hangul's T in table-object selection: flips the table in place, one undo step. */
function transposeSelectedTable(services, ko) {
  const ih = services.getInputHandler()
  const table = selectedTableOf(ih, services.wasm)
  if (!ih || !table) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) {
    tellUser(
      ko ? '표 안의 표는 아직 뒤집을 수 없습니다.' : 'A table inside a cell cannot be flipped yet.',
    )
    return false
  }
  let flipped = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'transposeTable',
      operation: (wasm) => {
        const done = wasm.transposeTableCellsInPlace(table.ref.sec, table.ref.ppi, table.ref.ci)
        if (!done?.ok) return null
        flipped = true
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (flipped) services.eventBus.emit('table-object-selection-changed', true)
  return flipped
}

/** L/C in table-object selection: the border or background dialog for the whole table. */
function openSelectedTableBorder(services, studio, tab, ko) {
  const ih = services.getInputHandler()
  const table = selectedTableOf(ih, services.wasm)
  if (!ih || !table || !studio.TableCellPropsDialog) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) {
    tellUser(
      ko
        ? '표 안의 표는 아직 테두리와 배경을 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be changed yet.',
    )
    return false
  }
  // Hangul's L/C on a selected table: the table's own border and fill (개체 속성의 테두리·채우기)
  const { ref } = table
  const dialog = new studio.TableCellPropsDialog(
    services.wasm,
    services.eventBus,
    { sec: ref.sec, ppi: ref.ppi, ci: ref.ci },
    0,
    'table',
    services,
  )
  dialog.show()
  const at = (dialog.tabs ?? []).findIndex((button) => button.dataset?.tab === tab)
  if (at !== -1) dialog.switchTab?.(at)
  return true
}

/**
 * Shift+arrow on a selected table: every column (row) grows or shrinks by one step, a row from
 * the height it draws at, and merged cells by the columns (rows) they span. One undo step.
 */
function resizeSelectedTable(services, direction) {
  const ih = services.getInputHandler()
  const table = selectedTableOf(ih, services.wasm)
  if (!ih || !table) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 크기를 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be resized yet.',
    )
    return false
  }
  const at = { sec: table.ref.sec, ppi: table.ref.ppi, ci: table.ref.ci }
  let cells
  try {
    cells = tableCells(services.wasm, at).cells
  } catch {
    return false
  }
  const horizontal = direction === 'left' || direction === 'right'
  const step = direction === 'right' || direction === 'down' ? SIZE_STEP : -SIZE_STEP
  const updates = resizeAll(cells, horizontal ? 'col' : 'row', step)
  if (!applyCellSizes(ih, at, updates, 'resizeTableObject', cells)) return false
  services.eventBus.emit('table-object-selection-changed', true)
  return true
}

/** Shift+PageUp/Down: the selected table goes to the front/back of the objects. */
function orderSelectedTable(services, mode) {
  const ih = services.getInputHandler()
  const table = selectedTableOf(ih, services.wasm)
  if (!ih || !table) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) return false
  let moved = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'tableOrder',
      operation: (bridge) => {
        const done = bridge.changeShapeZOrder(table.ref.sec, table.ref.ppi, table.ref.ci, mode)
        if (!done?.ok || !done.moves?.length) return null
        moved = true
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (moved) services.eventBus.emit('table-object-selection-changed', true)
  return moved
}

/** Shift+Home/End: the table goes in front of or behind the text around it. */
function wrapSelectedTable(services, mode) {
  const ih = services.getInputHandler()
  const table = selectedTableOf(ih, services.wasm)
  if (!ih || !table) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) return false
  const textWrap = mode === 'front' ? 'InFrontOfText' : 'BehindText'
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'tableWrap',
      operation: (bridge) => {
        const done = bridge.setTableProperties(table.ref.sec, table.ref.ppi, table.ref.ci, {
          textWrap,
        })
        return done?.ok ? ih.getCursorPosition() : null
      },
    })
  } catch {
    return false
  }
  services.eventBus.emit('table-object-selection-changed', true)
  return true
}

/** The 쪽 번호 매기기 dialog, built on the studio's own dialog base (handed in, not imported). */
function pageNumberDialog(ModalDialog, ko, start, onApply) {
  class PageNumberDialog extends ModalDialog {
    constructor() {
      super(ko ? '쪽 번호 매기기' : 'Page Numbering', 380)
      this.setting = { ...start }
    }

    createBody() {
      const doc = globalThis.document
      const body = doc.createElement('div')
      // The shared dialog skin owns the body padding (studio-plugin/dialog-theme.mjs).
      const heading = (text) => {
        const h = doc.createElement('div')
        h.className = 'dialog-section-title'
        h.textContent = text
        return h
      }
      body.appendChild(heading(ko ? '번호 위치' : 'Position'))
      const grid = doc.createElement('div')
      grid.style.cssText =
        'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin:6px 0 12px'
      for (const p of PAGE_NUMBER_POSITIONS) {
        const label = doc.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:4px;white-space:nowrap'
        const input = doc.createElement('input')
        input.type = 'radio'
        input.name = 'ieum-page-number-position'
        input.value = String(p.code)
        input.checked = p.code === this.setting.position
        input.addEventListener('change', () => {
          if (input.checked) this.setting.position = p.code
        })
        label.append(input, ko ? p.ko : p.en)
        grid.appendChild(label)
      }
      body.appendChild(grid)
      body.appendChild(heading(ko ? '번호 모양' : 'Number format'))
      const select = doc.createElement('select')
      select.className = 'dialog-select'
      select.style.margin = '6px 0 12px'
      for (const f of PAGE_NUMBER_FORMATS) {
        const option = doc.createElement('option')
        option.value = String(f.code)
        option.textContent = f.sample
        option.selected = f.code === this.setting.format
        select.appendChild(option)
      }
      select.addEventListener('change', () => {
        this.setting.format = Number(select.value)
      })
      body.appendChild(select)
      const dash = doc.createElement('label')
      dash.style.cssText = 'display:flex;align-items:center;gap:4px'
      const box = doc.createElement('input')
      box.type = 'checkbox'
      box.checked = this.setting.dash
      box.addEventListener('change', () => {
        this.setting.dash = box.checked
      })
      dash.append(box, ko ? '줄표 넣기 (- 1 -)' : 'Dashes (- 1 -)')
      body.appendChild(dash)
      return body
    }

    onConfirm() {
      onApply({ ...this.setting })
      return true
    }
  }
  return new PageNumberDialog()
}

/**
 * The commands behind the keys the studio has no command for. `locale` is the studio's, which
 * shows itself in Korean or English only; the labels show in its command palette. `studio` hands
 * over what of the studio a command builds on (the studio-hancom-commands patch passes it):
 * InsertTextCommand, ModalDialog, FindDialog and navigateToSearchHit.
 */
export function hancomCommands(locale, studio = {}) {
  const ko = locale === 'ko'
  koreanUi = ko
  toastSink = studio.showToast ?? toastSink
  insertTabCommand = studio.InsertTabCommand ?? insertTabCommand
  modalDialog = studio.ModalDialog ?? modalDialog
  const commands = [
    {
      id: 'ieum:delete-line',
      label: ko ? '한 줄 지우기' : 'Delete Line',
      shortcutLabel: 'Ctrl+Y',
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        deleteLine(services.getInputHandler())
      },
    },
  ]
  for (const [letter, { color, ko: nameKo, en }] of Object.entries(TEXT_COLORS)) {
    commands.push({
      id: `ieum:text-color-${letter}`,
      label: ko ? nameKo : en,
      shortcutLabel: `Ctrl+M,${letter.toUpperCase()}`,
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        services.eventBus.emit('format-char', { textColor: color })
      },
    })
  }
  commands.push(
    {
      id: 'ieum:normal-shape',
      label: ko ? '보통 모양' : 'Normal Shape',
      shortcutLabel: 'Alt+Shift+C',
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        services.eventBus.emit('format-char', { ...NORMAL_SHAPE })
      },
    },
    {
      id: 'ieum:insert-date',
      label: ko ? '날짜/시간 문자열' : 'Date String',
      shortcutLabel: 'Ctrl+K,D',
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        const ih = services.getInputHandler()
        if (!ih || !studio.InsertTextCommand) return
        if (ih.cursor?.hasSelection?.()) ih.deleteSelection()
        ih.executeOperation({
          kind: 'command',
          command: new studio.InsertTextCommand(ih.getCursorPosition(), dateString()),
        })
        services.eventBus.emit('document-changed')
        ih.focus?.()
      },
    },
    {
      id: 'ieum:hanja',
      label: ko ? '한자로 바꾸기' : 'Convert to Hanja',
      shortcutLabel: 'F9',
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        void convertToHanja(services, { ...studio, locale })
      },
    },
    {
      id: 'ieum:find-backward',
      label: ko ? '거꾸로 찾기' : 'Find Backward',
      shortcutLabel: 'Ctrl+Q,L',
      canExecute: (ctx) => ctx.hasDocument,
      execute(services) {
        findBackward(services, studio)
      },
    },
    {
      // Hangul: 파일 → 문서 정보 (Ctrl+Q,I). Reads the counts when it opens, not before.
      id: 'ieum:document-info',
      opensDialog: true,
      label: ko ? '문서 정보' : 'Document Information',
      shortcutLabel: 'Ctrl+Q,I',
      canExecute: (ctx) => ctx.hasDocument,
      execute(services) {
        openDocumentInfo(studio, services, ko)
      },
    },
    {
      id: 'ieum:page-number',
      opensDialog: true,
      label: ko ? '쪽 번호 매기기' : 'Page Numbering',
      shortcutLabel: 'Ctrl+N,P',
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        const ih = services.getInputHandler()
        if (!ih || !studio.ModalDialog) return
        const start = currentPageNumber(services, ih.getCursorPosition().sectionIndex)
        pageNumberDialog(studio.ModalDialog, ko, start, (setting) => {
          applyPageNumber(services, setting)
          ih.focus?.()
        }).show()
      },
    },
    {
      id: 'ieum:table-transpose',
      label: ko ? '표 뒤집기' : 'Flip Table',
      shortcutLabel: 'T',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services) {
        transposeSelectedTable(services, ko)
      },
    },
    {
      id: 'ieum:table-border-each',
      opensDialog: true,
      label: ko ? '표 테두리' : 'Table Border',
      shortcutLabel: 'L',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services) {
        openSelectedTableBorder(services, studio, 'border', ko)
      },
    },
    {
      id: 'ieum:table-border-background',
      opensDialog: true,
      label: ko ? '표 배경' : 'Table Background',
      shortcutLabel: 'C',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services) {
        openSelectedTableBorder(services, studio, 'background', ko)
      },
    },
    ...[
      ['ieum:cell-border-each', 'each', 'border', 'L', '각 셀 테두리', 'Cell Borders (Each Cell)'],
      [
        'ieum:cell-background-each',
        'each',
        'background',
        'C',
        '각 셀 배경',
        'Cell Shading (Each Cell)',
      ],
      ['ieum:cell-border-one', 'asOne', 'border', 'B', '여러 셀 테두리', 'Cell Borders (As One)'],
      [
        'ieum:cell-background-one',
        'asOne',
        'background',
        'F',
        '여러 셀 배경',
        'Cell Shading (As One)',
      ],
    ].map(([id, applyMode, tab, key, nameKo, nameEn]) => ({
      id,
      opensDialog: true,
      label: ko ? nameKo : nameEn,
      shortcutLabel: key,
      canExecute: (ctx) => ctx.inCellSelectionMode && !ctx.isFormMode,
      execute(services) {
        openCellBlockBorder(services, studio, applyMode, tab, ko)
      },
    })),
    {
      id: 'ieum:table-auto-fill',
      label: ko ? '표 자동 채우기' : 'Table Auto Fill',
      shortcutLabel: 'A',
      canExecute: (ctx) => ctx.inCellSelectionMode && !ctx.isFormMode,
      execute(services) {
        fillCellBlock(services.getInputHandler())
      },
    },
    {
      id: 'ieum:table-insert-row-below',
      label: ko ? '아래에 줄 추가' : 'Insert Row Below',
      canExecute: (ctx) => ctx.inTable && !ctx.isFormMode,
      execute(services) {
        insertRowBelow(services)
      },
    },
    {
      id: 'ieum:table-resize',
      label: ko ? '표 크기 조절' : 'Resize Table',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services, params) {
        resizeSelectedTable(services, params?.direction)
      },
    },
    {
      id: 'ieum:table-order',
      label: ko ? '표 순서' : 'Table Order',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services, params) {
        orderSelectedTable(services, params?.mode === 'back' ? 'back' : 'front')
      },
    },
    {
      id: 'ieum:table-wrap',
      label: ko ? '표 글자 배치' : 'Table Text Wrap',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services, params) {
        wrapSelectedTable(services, params?.mode === 'back' ? 'back' : 'front')
      },
    },
    {
      id: 'ieum:table-block-resize',
      label: ko ? '셀 블록 크기 조절' : 'Resize Cell Block',
      canExecute: (ctx) => ctx.inCellSelectionMode && !ctx.isFormMode,
      execute(services, params) {
        resizeCellBlock(services, params?.direction)
      },
    },
    {
      id: 'ieum:table-row-column-resize',
      label: ko ? '줄/칸 전체 크기 조절' : 'Resize Row/Column',
      canExecute: (ctx) => ctx.inCellSelectionMode && !ctx.isFormMode,
      execute(services, params) {
        resizeRowColumnBlock(services, params?.direction)
      },
    },
    {
      id: 'ieum:table-cell-resize',
      label: ko ? '셀 크기 조절' : 'Resize Cell',
      canExecute: (ctx) => ctx.inCellSelectionMode && !ctx.isFormMode,
      execute(services, params) {
        resizeSelectedCell(services, params?.direction)
      },
    },
  )
  for (const [letter, formula] of Object.entries(EASY_FORMULAS)) {
    commands.push({
      id: formula.id,
      label: ko ? formula.ko : formula.en,
      shortcutLabel: `Ctrl+Shift+${letter.toUpperCase()}`,
      canExecute: (ctx) => ctx.hasDocument && ctx.inTable && !ctx.isFormMode,
      execute(services) {
        runEasyFormula(services, formula)
      },
    })
  }
  for (let n = 1; n <= STYLE_KEYS; n += 1) {
    commands.push({
      id: `ieum:style-${n}`,
      label: ko ? `스타일 ${n} 적용` : `Apply Style ${n}`,
      shortcutLabel: `Ctrl+${digitOf(n)}`,
      canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,
      execute(services) {
        const style = services.wasm.getStyleList()[n - 1]
        if (style) services.getInputHandler()?.applyStyle(style.id)
      },
    })
  }
  return commands
}

/** Menu items for the new commands, each after a studio item: [command, after, Korean, English]. */
export const MENU_ITEMS = [
  ['ieum:page-number', 'page:new-page-num', '쪽 번호 매기기', 'Page Numbering'],
  ['ieum:find-backward', 'edit:find-again', '거꾸로 찾기', 'Find Backward'],
  ['ieum:insert-date', 'insert:symbols', '날짜/시간 문자열', 'Date String'],
  ['ieum:hanja', 'ieum:insert-date', '한자로 바꾸기', 'Convert to Hanja'],
  ['ieum:table-transpose', 'table:transpose-copy', '표 뒤집기', 'Flip Table'],
  ['ieum:table-auto-fill', 'table:cell-width-equal', '표 자동 채우기', 'Table Auto Fill'],
  // Hangul keeps 문서 정보 at the end of its File menu, after printing
  ['ieum:document-info', 'file:print', '문서 정보', 'Document Information'],
]

/**
 * Puts the new commands into the studio's menus next to their neighbours. Runs before the studio
 * builds its menu bar from the page, so the items work like its own; their keys come from the
 * commands' labels like every other item's.
 */
export function installHancomMenuItems(doc, locale, mac = onMac()) {
  const ko = locale === 'ko'
  // the page writes some keys into its menu itself; clear the ones that no longer start
  if (!mac) {
    for (const id of LABELS_GONE_OFF_MAC) {
      const shortcut = doc.querySelector(`.md-item[data-cmd="${id}"] .md-shortcut`)
      if (shortcut) shortcut.textContent = ''
    }
  }
  for (const [id, after, nameKo, nameEn] of MENU_ITEMS) {
    const anchor = doc.querySelector(`.md-item[data-cmd="${after}"]`)
    if (!anchor || doc.querySelector(`.md-item[data-cmd="${id}"]`)) continue
    const item = doc.createElement('div')
    item.className = 'md-item'
    item.dataset.cmd = id
    const icon = doc.createElement('span')
    icon.className = 'md-icon'
    const label = doc.createElement('span')
    label.className = 'md-label'
    label.textContent = ko ? nameKo : nameEn
    item.append(icon, label)
    anchor.after(item)
  }
}

/** Every studio command the keys above run; the build checks the studio still has each. */
export function studioCommandIds() {
  const ids = new Set()
  for (const table of Object.values(CHORDS)) {
    for (const target of Object.values(table)) {
      for (const id of Array.isArray(target) ? target : [target]) ids.add(id)
    }
  }
  for (const [, id] of ADDED_SHORTCUTS) ids.add(id)
  for (const id of Object.keys(LABELS)) ids.add(id)
  return [...ids].filter((id) => !id.startsWith('ieum:')).sort()
}
