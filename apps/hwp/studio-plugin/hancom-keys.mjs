/**
 * Hancom Hangul's default keys in the rhwp-studio editor (decision 0053).
 *
 * rhwp moved some of Hangul's keys away from ones a web browser keeps for itself (the Ctrl+N
 * sequences to Ctrl+M, the Ctrl+Shift+C/R/T alignments to Alt+Shift+C/H/D) and left others
 * out. The app is not a browser tab, so a Hangul tab takes Hangul's keys as Hancom Hangul 2024
 * has them: the sequences under Ctrl+N, K, Q, M and G, the alignments, Ctrl+Y for deleting a
 * line, Ctrl+1..0 for the document's first ten styles, Ctrl+F10 and Ctrl+H.
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
  },
  k: {
    h: 'insert:hyperlink',
    b: 'insert:bookmark',
    n: 'format:para-num-shape',
    e: 'insert:field',
  },
  q: {
    f: 'edit:find',
    a: 'edit:find-replace',
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

/** The command definition with Hangul's key next to it, when its key changed. */
export function withHancomLabel(def) {
  const label = LABELS[def.id]
  return label && def.shortcutLabel !== label ? { ...def, shortcutLabel: label } : def
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

/**
 * The commands behind the keys the studio has no command for. `locale` is the studio's, which
 * shows itself in Korean or English only; the labels show in its command palette.
 */
export function hancomCommands(locale) {
  const ko = locale === 'ko'
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
