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
/** Per editor, tables whose irregular grid came from this session's Shift+arrow (sec:ppi:ci). */
const locallyResizedTables = new WeakMap()

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

/** Opens the window function the main process asks; see MAIN_PROCESS_KEYS. */
export function installHancomMainKeys(win, getInputHandler, dispatcher) {
  win.__ieumHancomKey = (name) => {
    const take = MAIN_PROCESS_KEYS[name]
    if (!take) return false
    // clipboard keys and Ctrl+Tab belong to the page when focus is outside the editor
    // (the AI panel, a dialog); only the focused editor frame may take them
    if (
      (name === 'ctrl-c' || name === 'ctrl-x' || name === 'ctrl-e' || name === 'ctrl-tab') &&
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

/** H/W in a cell block: the rows/columns of the selected cells become equally sized. */
const CELL_BLOCK_KEYS = {
  h: 'table:cell-height-equal',
  w: 'table:cell-width-equal',
}

export function hancomCellBlockKey(ih, e) {
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
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const letter = letterOf(e)
    if (letter === 'e' || letter === 'c' || letter === 'x') {
      e.preventDefault()
      if (letter === 'e') clearCellBlock(ih)
      else copyCellBlock(ih, letter === 'x')
      return true
    }
    return false
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false
  const id = CELL_BLOCK_KEYS[letterOf(e)]
  if (!id) return false
  e.preventDefault()
  ih._cellBlockLetterImeGuard?.arm(e)
  if (ih.dispatcher?.isEnabled?.(id)) ih.dispatcher.dispatch(id)
  return true
}

/** Delete the selected cells' contents, one undo step, keeping the block. */
function clearCellBlock(ih) {
  const done = ih.clearSelectedCellBlock?.()
  if (done) ih.updateCellSelection?.()
  return done === true
}

/** The selected cells as rows of tabs and lines, as Hancom puts them on the clipboard. */
function cellBlockTsv(ih) {
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
  let dims
  const cells = []
  try {
    dims = ih.wasm.getTableDimensions(context.sec, context.ppi, context.ci)
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = ih.wasm.getCellInfo(context.sec, context.ppi, context.ci, i)
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          koreanUi
            ? '병합된 칸이 있어 복사하지 않았습니다.'
            : 'Not copied: the table has merged cells.',
        )
        return null
      }
      cells.push({ ...info, cellIdx: i })
    }
  } catch {
    return null
  }
  const rows = []
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const line = []
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cell = cells.find((c) => c.row === row && c.col === col)
      if (!cell) return null
      const paragraphs = []
      try {
        const count = ih.wasm.getCellParagraphCount(
          context.sec,
          context.ppi,
          context.ci,
          cell.cellIdx,
        )
        for (let p = 0; p < count; p += 1) {
          const length = ih.wasm.getCellParagraphLength(
            context.sec,
            context.ppi,
            context.ci,
            cell.cellIdx,
            p,
          )
          paragraphs.push(
            ih.wasm.getTextInCell(context.sec, context.ppi, context.ci, cell.cellIdx, p, 0, length),
          )
        }
      } catch {
        return null
      }
      line.push(paragraphs.join('\n'))
    }
    rows.push(line.join('\t'))
  }
  return rows.join('\n')
}

/** Copy without waiting: a key press is a user gesture, so the DOM copy runs. */
function writeClipboardText(text) {
  try {
    const doc = globalThis.document
    if (doc) {
      const area = doc.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
      doc.body.appendChild(area)
      area.select()
      const done = doc.execCommand('copy')
      area.remove()
      if (done) return true
    }
  } catch {
    // fall through to the async clipboard
  }
  try {
    void globalThis.navigator?.clipboard?.writeText?.(text)
  } catch {
    // the key is still consumed
  }
  return false
}

/** Ctrl+C / Ctrl+X in a cell block: the cells as tab-separated text; cut also empties them. */
function copyCellBlock(ih, cut) {
  const text = cellBlockTsv(ih)
  if (text === null) return false
  writeClipboardText(text)
  // the async clipboard may still be writing; the text is on its way, so a cut empties now
  if (cut) clearCellBlock(ih)
  return true
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

/**
 * Hangul's H/W: the rows or columns covered by the cell block become equally sized.
 * The engine moves whole rows/columns with widthDelta/heightDelta, so every cell of the
 * affected rows/columns gets its delta in a single snapshot (one undo step). Tables with
 * merged cells and tables inside a cell are left alone and the reason is shown.
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
  const wasm = services.wasm
  let dims
  try {
    dims = wasm.getTableDimensions(sec, ppi, ci)
  } catch {
    return false
  }
  const cells = []
  try {
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = wasm.getCellInfo(sec, ppi, ci, i)
      const props = wasm.getCellProperties(sec, ppi, ci, i)
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          ko
            ? '병합된 칸이 있어 크기를 같게 하지 않았습니다.'
            : 'Not changed: the table has merged cells.',
        )
        return false
      }
      cells.push({ cellIdx: i, row: info.row, col: info.col, ...props })
    }
  } catch {
    return false
  }
  if (cells.length !== dims.rowCount * dims.colCount) return false
  // how big the rows/columns really draw: a cell whose text wraps is taller than its
  // stored minimum, and equalizing from the stored values alone would leave it taller
  const rendered = new Map()
  try {
    for (const box of wasm.getTableCellBboxes(sec, ppi, ci)) {
      if (!rendered.has(box.cellIdx)) rendered.set(box.cellIdx, box)
    }
  } catch {
    // an engine without the query: the stored sizes still answer
  }
  const HWPUNIT_PER_PX = 7200 / 96
  const range = inBlock ? cursor.getSelectedCellRange?.() : null
  const firstRow = Math.max(0, Math.min(range?.startRow ?? 0, dims.rowCount - 1))
  const lastRow = Math.max(0, Math.min(range?.endRow ?? dims.rowCount - 1, dims.rowCount - 1))
  const firstCol = Math.max(0, Math.min(range?.startCol ?? 0, dims.colCount - 1))
  const lastCol = Math.max(0, Math.min(range?.endCol ?? dims.colCount - 1, dims.colCount - 1))
  // the engine spreads a partial row block over the whole table, so only the whole table
  // answers with equal rows; say so instead of leaving a half-changed table
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
  // already equal? then nothing to write
  if (axis === 'height') {
    const rowHeights = new Map()
    for (const cell of cells) {
      if (cell.row < firstRow || cell.row > lastRow) continue
      const box = rendered.get(cell.cellIdx)
      const height = box ? box.h : cell.height / HWPUNIT_PER_PX
      rowHeights.set(cell.row, Math.max(rowHeights.get(cell.row) ?? 0, height))
    }
    const values = [...rowHeights.values()]
    if (values.length === 0 || Math.max(...values) - Math.min(...values) < 0.5) return false
    const target = Math.round(Math.max(...values) * HWPUNIT_PER_PX)
    if (target <= 0) return false
    const updates = []
    for (const cell of cells) {
      if (cell.row < firstRow || cell.row > lastRow || cell.height === target) continue
      updates.push({ cellIdx: cell.cellIdx, heightDelta: target - cell.height })
    }
    if (updates.length === 0) return false
    try {
      ih.executeOperation({
        kind: 'snapshot',
        operationType: 'equalizeRowHeights',
        operation: (bridge) => {
          if (!bridge.resizeTableCells(sec, ppi, ci, updates)?.ok) return null
          // a table the editor made keeps one line height per row extra in its table
          // height, and the engine gives that to the last row; take it off there
          if (lastRow === dims.rowCount - 1) {
            const boxes = bridge.getTableCellBboxes(sec, ppi, ci)
            let drawn = 0
            for (const box of boxes) {
              if (box.row === lastRow) drawn = Math.max(drawn, box.h)
            }
            const excess = Math.round(drawn * HWPUNIT_PER_PX) - target
            if (drawn > 0 && Math.abs(excess) >= HWPUNIT_PER_PX / 2) {
              const fix = cells
                .filter((cell) => cell.row === lastRow)
                .map((cell) => ({ cellIdx: cell.cellIdx, heightDelta: -excess }))
              if (!bridge.resizeTableCells(sec, ppi, ci, fix)?.ok) return null
            }
          }
          return ih.getCursorPosition()
        },
      })
    } catch {
      return false
    }
    ih.updateCellSelection?.()
    return true
  }

  // width: one column at a time, because the engine moves the next boundary as it resizes
  const colWidths = new Map()
  for (const cell of cells) {
    if (cell.col < firstCol || cell.col > lastCol) continue
    const box = rendered.get(cell.cellIdx)
    const width = box ? box.w : cell.width / HWPUNIT_PER_PX
    colWidths.set(cell.col, Math.max(colWidths.get(cell.col) ?? 0, width))
  }
  const values = [...colWidths.values()]
  if (values.length === 0 || Math.max(...values) - Math.min(...values) < 0.5) return false
  const target = Math.floor(
    (values.reduce((sum, width) => sum + width, 0) / values.length) * HWPUNIT_PER_PX,
  )
  if (target <= 0) return false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'equalizeColumnWidths',
      operation: (bridge) => {
        for (let col = firstCol; col <= lastCol; col += 1) {
          let current = 0
          for (let i = 0; i < dims.cellCount; i += 1) {
            const info = bridge.getCellInfo(sec, ppi, ci, i)
            if (info.col !== col) continue
            current = Math.max(current, bridge.getCellProperties(sec, ppi, ci, i).width)
          }
          if (!current || current === target) continue
          const ups = cells
            .filter((cell) => cell.col === col)
            .map((cell) => ({ cellIdx: cell.cellIdx, widthDelta: target - current }))
          if (!bridge.resizeTableCells(sec, ppi, ci, ups)?.ok) return null
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  ih.updateCellSelection?.()
  return true
}

/**
 * Alt+arrow in a cell block: the selected rows/columns change size by one step and the
 * row/column just outside them takes the opposite change, so the table keeps its size.
 */
function resizeCellBlock(services, direction) {
  const ih = services?.getInputHandler?.()
  const cursor = ih?.cursor
  const context = cursor?.getCellTableContext?.()
  const range = cursor?.getSelectedCellRange?.()
  if (!ih || !context || !range) return false
  if ((context.cellPath?.length ?? 0) > 1) {
    tellUser(
      koreanUi
        ? '표 안의 표는 아직 크기를 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be resized yet.',
    )
    return false
  }
  const wasm = services.wasm
  let dims
  const cells = []
  try {
    dims = wasm.getTableDimensions(context.sec, context.ppi, context.ci)
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = wasm.getCellInfo(context.sec, context.ppi, context.ci, i)
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          koreanUi
            ? '병합된 칸이 있어 크기를 바꾸지 않았습니다.'
            : 'Not changed: the table has merged cells.',
        )
        return false
      }
      cells.push({ ...info, cellIdx: i })
    }
  } catch {
    return false
  }
  const horizontal = direction === 'left' || direction === 'right'
  const edge = horizontal ? range.endCol + 1 : range.endRow + 1
  const count = horizontal ? dims.colCount : dims.rowCount
  if (edge >= count) return false
  const delta = direction === 'right' || direction === 'down' ? 300 : -300
  const updates = []
  for (const cell of cells) {
    const selected = horizontal
      ? cell.col >= range.startCol && cell.col <= range.endCol
      : cell.row >= range.startRow && cell.row <= range.endRow
    const neighbor = horizontal ? cell.col === edge : cell.row === edge
    if (!selected && !neighbor) continue
    const change = selected ? delta : -delta
    updates.push(
      horizontal
        ? { cellIdx: cell.cellIdx, widthDelta: change }
        : { cellIdx: cell.cellIdx, heightDelta: change },
    )
  }
  if (updates.length === 0) return false
  let failed = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'resizeCellBlock',
      operation: (bridge) => {
        const done = bridge.resizeTableCells(context.sec, context.ppi, context.ci, updates)
        if (!done?.ok) {
          failed = true
          return null
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (failed) return false
  ih.updateCellSelection?.()
  return true
}

/**
 * Ctrl+arrow in a cell block: the selected rows or columns change size and the table
 * grows or shrinks with them, as Hangul does. One snapshot, so one undo step. The engine
 * moves whole rows/columns for widthDelta/heightDelta, which is exactly what this key
 * wants; keeping the table size fixed is the Alt+arrow path above.
 */
export function resizeRowColumnBlock(services, direction) {
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
  const wasm = services.wasm
  let dims
  const cells = []
  try {
    dims = wasm.getTableDimensions(context.sec, context.ppi, context.ci)
    for (let i = 0; i < dims.cellCount; i += 1) {
      const info = wasm.getCellInfo(context.sec, context.ppi, context.ci, i)
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          koreanUi
            ? '병합된 칸이 있어 크기를 바꾸지 않았습니다.'
            : 'Not changed: the table has merged cells.',
        )
        return false
      }
      cells.push({ ...info, cellIdx: i })
    }
  } catch {
    return false
  }
  const horizontal = direction === 'left' || direction === 'right'
  const first = horizontal ? range.startCol : range.startRow
  const last = horizontal ? range.endCol : range.endRow
  const delta = direction === 'right' || direction === 'down' ? 300 : -300
  const updates = []
  for (const cell of cells) {
    const inside = horizontal
      ? cell.col >= first && cell.col <= last
      : cell.row >= first && cell.row <= last
    if (!inside) continue
    updates.push(
      horizontal
        ? { cellIdx: cell.cellIdx, widthDelta: delta }
        : { cellIdx: cell.cellIdx, heightDelta: delta },
    )
  }
  if (updates.length === 0) return false
  let failed = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'resizeRowColumnBlock',
      operation: (bridge) => {
        const done = bridge.resizeTableCells(context.sec, context.ppi, context.ci, updates)
        if (!done?.ok) {
          failed = true
          return null
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (failed) return false
  ih.updateCellSelection?.()
  return true
}

/**
 * Shift+arrow in a cell block: the current cell's right/bottom boundary moves and the
 * next cell's opposite boundary moves back, as Hangul does. The engine keeps the
 * resulting irregular grid as spans, so a later Shift+arrow can move the same cell
 * again. One snapshot, so one undo step. Tables inside a cell are left to Phase 2.
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
  const wasm = services.wasm
  let dims
  const cells = []
  try {
    dims = wasm.getTableDimensions(context.sec, context.ppi, context.ci)
    for (let i = 0; i < dims.cellCount; i += 1) {
      cells.push({ ...wasm.getCellInfo(context.sec, context.ppi, context.ci, i), cellIdx: i })
    }
  } catch {
    return false
  }
  const tableKey = `${context.sec}:${context.ppi}:${context.ci}`
  const marks = locallyResizedTables.get(ih)
  const hasSpans = cells.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1)
  if (hasSpans && !marks?.has(tableKey)) {
    tellUser(
      koreanUi
        ? '병합된 칸이 있는 표는 Shift+화살표로 크기를 바꿀 수 없습니다.'
        : 'Not changed: Shift+arrow cannot resize a table with merged cells.',
    )
    return false
  }
  const pos = ih.getCursorPosition?.()
  const active =
    cells.find((cell) => cell.cellIdx === pos?.cellIndex) ??
    cells.find((cell) => cell.row === range.startRow && cell.col === range.startCol)
  if (!active) return false
  const vertical = direction === 'up' || direction === 'down'
  const forward = direction === 'right' || direction === 'down'
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
          vertical,
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
  const localMarks = locallyResizedTables.get(ih) ?? new Set()
  localMarks.add(tableKey)
  locallyResizedTables.set(ih, localMarks)
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
  if (!ih || !table || !studio.CellBorderBgDialog) return false
  if ((table.ref.cellPath?.length ?? 0) > 1) {
    tellUser(
      ko
        ? '표 안의 표는 아직 테두리와 배경을 바꿀 수 없습니다.'
        : 'A table inside a cell cannot be changed yet.',
    )
    return false
  }
  const { ref, dims } = table
  const dialog = new studio.CellBorderBgDialog(
    services.wasm,
    services.eventBus,
    { sec: ref.sec, ppi: ref.ppi, ci: ref.ci },
    0,
    'asOne',
    { startRow: 0, startCol: 0, endRow: dims.rowCount - 1, endCol: dims.colCount - 1 },
    services,
  )
  dialog.show()
  if (tab === 'background') dialog.switchTab?.(1)
  return true
}

/** Shift+arrow on a selected table: every cell grows/shrinks by one step, one undo step. */
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
  try {
    for (let i = 0; i < table.dims.cellCount; i += 1) {
      const info = services.wasm.getCellInfo(table.ref.sec, table.ref.ppi, table.ref.ci, i)
      if (info.rowSpan > 1 || info.colSpan > 1) {
        tellUser(
          koreanUi
            ? '병합된 칸이 있어 크기를 바꾸지 않았습니다.'
            : 'Not changed: the table has merged cells.',
        )
        return false
      }
    }
  } catch {
    return false
  }
  const horizontal = direction === 'left' || direction === 'right'
  const delta = direction === 'right' || direction === 'down' ? 300 : -300
  const updates = []
  for (let i = 0; i < table.dims.cellCount; i += 1) {
    updates.push(
      horizontal ? { cellIdx: i, widthDelta: delta } : { cellIdx: i, heightDelta: delta },
    )
  }
  let failed = false
  try {
    ih.executeOperation({
      kind: 'snapshot',
      operationType: 'resizeTableObject',
      operation: (bridge) => {
        const done = bridge.resizeTableCells(table.ref.sec, table.ref.ppi, table.ref.ci, updates)
        if (!done?.ok) {
          failed = true
          return null
        }
        return ih.getCursorPosition()
      },
    })
  } catch {
    return false
  }
  if (failed) return false
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
      body.style.padding = '12px 16px'
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
      id: 'ieum:find-backward',
      label: ko ? '거꾸로 찾기' : 'Find Backward',
      shortcutLabel: 'Ctrl+Q,L',
      canExecute: (ctx) => ctx.hasDocument,
      execute(services) {
        findBackward(services, studio)
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
      label: ko ? '셀 테두리' : 'Cell Border',
      shortcutLabel: 'L',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services) {
        openSelectedTableBorder(services, studio, 'border', ko)
      },
    },
    {
      id: 'ieum:table-border-background',
      opensDialog: true,
      label: ko ? '셀 배경' : 'Cell Background',
      shortcutLabel: 'C',
      canExecute: (ctx) => ctx.inTableObjectSelection && !ctx.isFormMode,
      execute(services) {
        openSelectedTableBorder(services, studio, 'background', ko)
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
  ['ieum:table-transpose', 'table:transpose-copy', '표 뒤집기', 'Flip Table'],
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
