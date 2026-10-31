/**
 * Hancom Hangul's 한자로 바꾸기 (convert to Hanja) for the rhwp-studio editor.
 *
 * Pressing the Hanja key while a syllable is still being composed is the operating system's
 * input method: it shows its own candidates and commits the choice, and the editor does not
 * see more than the composition. Once the word is in the document the input method has nothing
 * to convert, because the editor's input box is emptied after each commit. Hangul then converts
 * the word before the caret (or the block) itself, from its own dictionary. This module does
 * that: the Hanja key or F9 looks up the Hangul word that ends at the caret, shows the
 * candidates, and replaces the word through the editor's own overwrite command, so one
 * conversion is one undo step.
 *
 * The dictionary is libhangul's hanja.txt (BSD-3-Clause, see NOTICE), cut down at build time to
 * `hanja/hanja-dict.txt` beside the studio (scripts/build-studio.mjs) and read on first use.
 * Nothing here imports the studio; the caller passes the dialog, the toast, the insert command
 * and the locale (hancom-keys.mjs, from the studio-hancom-commands patch).
 */

/** Where the build puts the dictionary, relative to the studio page. */
export const HANJA_DICT_PATH = 'hanja/hanja-dict.txt'

/** The longest word looked up before the caret; Hangul's dictionary words are shorter. */
const MAX_WORD = 12
/** Candidates the number keys pick directly. */
const QUICK_KEYS = 9
const TOAST_MS = 3200
const FORMAT_KEY = 'ieum.hanja.format'
const FORMATS = ['hanja', 'hanjaHangul', 'hangulHanja']

const MESSAGES = {
  noEditor: { ko: '편집기를 찾지 못했습니다.', en: 'The editor is not ready.' },
  formMode: {
    ko: '양식 모드에서는 한자로 바꿀 수 없습니다.',
    en: 'Hanja conversion is off in form mode.',
  },
  note: {
    ko: '머리말·꼬리말·각주·미주에서는 아직 한자로 바꿀 수 없습니다.',
    en: 'Hanja conversion is not available in headers, footers or notes yet.',
  },
  object: {
    ko: '한자로 바꿀 낱말 뒤에 커서를 두세요.',
    en: 'Put the caret after the word to convert.',
  },
  noWord: {
    ko: '커서 앞에 한자로 바꿀 한글이 없습니다.',
    en: 'There is no Hangul before the caret to convert.',
  },
  blockSpan: {
    ko: '한 문단 안의 낱말만 한자로 바꿀 수 있습니다.',
    en: 'Select a word within one paragraph.',
  },
  notFound: {
    ko: '사전에 없는 낱말입니다. 한 글자씩 블록으로 잡아 바꿔 보세요.',
    en: 'The word is not in the dictionary. Try one syllable at a time.',
  },
  noDictionary: {
    ko: '한자 사전을 읽지 못했습니다.',
    en: 'The Hanja dictionary could not be read.',
  },
  failed: { ko: '한자로 바꾸지 못했습니다.', en: 'The word could not be converted.' },
}

const isSyllable = (ch) => ch >= '가' && ch <= '힣'
const isSyllables = (text) => text.length > 0 && [...text].every(isSyllable)

/**
 * Parses the cut-down dictionary: one line per Hangul reading, then tab-separated candidates in
 * the order the dictionary gives them; a single syllable's candidate carries its meaning after
 * a slash (a hanja, "/", then its Hangul gloss and reading).
 */
export function parseDictionary(text) {
  const map = new Map()
  for (const line of String(text).split('\n')) {
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const key = line.slice(0, tab)
    const items = line
      .slice(tab + 1)
      .split('\t')
      .map((item) => {
        const slash = item.indexOf('/')
        return slash === -1
          ? { hanja: item, meaning: '' }
          : { hanja: item.slice(0, slash), meaning: item.slice(slash + 1) }
      })
      .filter((item) => item.hanja.length > 0)
    if (items.length > 0) map.set(key, items)
  }
  return map
}

let dictionary = null

/** Reads the dictionary once; a failed read is tried again on the next press. */
export function loadDictionary(fetchText = defaultFetch) {
  if (!dictionary) {
    dictionary = Promise.resolve()
      .then(() => fetchText(HANJA_DICT_PATH))
      .then(parseDictionary)
      .catch((error) => {
        dictionary = null
        throw error
      })
  }
  return dictionary
}

async function defaultFetch(path) {
  const response = await fetch(new URL(path, globalThis.document?.baseURI ?? globalThis.location))
  if (!response.ok) throw new Error(`hanja dictionary: ${response.status}`)
  return response.text()
}

/**
 * The word to convert at the end of `before` (the text up to the caret): the longest run of
 * Hangul syllables ending there that the dictionary has, down to the last syllable alone.
 */
export function wordAtEnd(dict, before) {
  const chars = [...String(before)]
  let start = chars.length
  while (start > 0 && isSyllable(chars[start - 1]) && chars.length - start < MAX_WORD) start -= 1
  for (let from = start; from < chars.length; from += 1) {
    const word = chars.slice(from).join('')
    const candidates = dict.get(word)
    if (candidates) return { word, candidates }
  }
  return null
}

/** The text that goes in: the Hanja alone, or with the Hangul in brackets either way round. */
export function convertedText(hangul, hanja, format) {
  if (format === 'hanjaHangul') return `${hanja}(${hangul})`
  if (format === 'hangulHanja') return `${hangul}(${hanja})`
  return hanja
}

function storedFormat() {
  try {
    const value = globalThis.localStorage?.getItem(FORMAT_KEY)
    return FORMATS.includes(value) ? value : 'hanja'
  } catch {
    return 'hanja'
  }
}

function storeFormat(value) {
  try {
    globalThis.localStorage?.setItem(FORMAT_KEY, value)
  } catch {
    // the choice is a convenience
  }
}

const isCell = (pos) => pos.parentParaIndex !== undefined
const isNestedCell = (pos) => (pos.cellPath?.length ?? 0) > 1

/** The document text at a position, as the studio reads it for its own delete command. */
function textAt(wasm, pos, count) {
  if (count <= 0) return ''
  if (isNestedCell(pos)) {
    return wasm.getTextInCellByPath(
      pos.sectionIndex,
      pos.parentParaIndex,
      JSON.stringify(pos.cellPath ?? []),
      pos.charOffset,
      count,
    )
  }
  if (isCell(pos)) {
    return wasm.getTextInCell(
      pos.sectionIndex,
      pos.parentParaIndex,
      pos.controlIndex,
      pos.cellIndex,
      pos.cellParaIndex,
      pos.charOffset,
      count,
    )
  }
  return wasm.getTextRange(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, count)
}

/** Whether two positions are in the same paragraph of the same body, cell or text box. */
function sameParagraph(a, b) {
  return (
    a.sectionIndex === b.sectionIndex &&
    a.paragraphIndex === b.paragraphIndex &&
    a.parentParaIndex === b.parentParaIndex &&
    a.controlIndex === b.controlIndex &&
    a.cellIndex === b.cellIndex &&
    a.cellParaIndex === b.cellParaIndex &&
    !!a.isTextBox === !!b.isTextBox &&
    JSON.stringify(a.cellPath ?? null) === JSON.stringify(b.cellPath ?? null)
  )
}

function placeRefusal(ih) {
  try {
    if (!ih) return 'noEditor'
    if (ih.isFormMode?.() === true) return 'formMode'
    const cursor = ih.cursor
    if (cursor?.isInHeaderFooter?.() === true || cursor?.isInFootnote?.() === true) return 'note'
    if (
      cursor?.isInPictureObjectSelection?.() === true ||
      cursor?.isInTableObjectSelection?.() === true ||
      ih.isInCellSelectionMode?.() === true
    ) {
      return 'object'
    }
  } catch {
    return 'noEditor'
  }
  return null
}

/**
 * What the press converts: the selected text when there is a block, otherwise the word that
 * ends at the caret. `{ start, word, candidates }` or `{ refusal }`.
 */
export function conversionTarget(ih, wasm, dict) {
  const refusal = placeRefusal(ih)
  if (refusal) return { refusal }
  if (ih.hasSelection?.() === true) {
    const selection = ih.getSelection?.()
    if (!selection?.start || !selection?.end) return { refusal: 'noWord' }
    const { start, end } = selection
    if (!sameParagraph(start, end)) return { refusal: 'blockSpan' }
    const count = end.charOffset - start.charOffset
    if (count <= 0) return { refusal: 'noWord' }
    if (count > MAX_WORD) return { refusal: 'notFound' }
    const word = textAt(wasm, start, count)
    if (!isSyllables(word)) return { refusal: 'noWord' }
    const candidates = dict.get(word)
    return candidates ? { start, word, candidates } : { refusal: 'notFound' }
  }
  const caret = ih.getCursorPosition?.()
  if (!caret || !Number.isInteger(caret.charOffset)) return { refusal: 'noEditor' }
  const count = Math.min(caret.charOffset, MAX_WORD)
  const before = textAt(wasm, { ...caret, charOffset: caret.charOffset - count }, count)
  const chars = [...before]
  if (chars.length === 0 || !isSyllable(chars[chars.length - 1])) return { refusal: 'noWord' }
  const found = wordAtEnd(dict, before)
  if (!found) return { refusal: 'notFound' }
  return {
    start: { ...caret, charOffset: caret.charOffset - found.word.length },
    word: found.word,
    candidates: found.candidates,
  }
}

function say(studio, key) {
  const message = MESSAGES[key]?.[studio.locale === 'ko' ? 'ko' : 'en']
  if (!message) return
  try {
    studio.showToast?.({ message, durationMs: TOAST_MS })
  } catch {
    // a toast is a help, not part of the change
  }
}

/** Replaces the word with the chosen text as one step of the editor's history. */
export function replaceWord(services, studio, target, text) {
  const ih = services.getInputHandler()
  if (!ih || !studio.InsertTextCommand) return false
  try {
    ih.cursor?.clearSelection?.()
    // the studio's overwrite typing: the text goes in where the word was, and undo puts the
    // word back with its own look
    ih.executeOperation({
      kind: 'command',
      command: new studio.InsertTextCommand(target.start, text, undefined, undefined, target.word),
    })
    services.eventBus?.emit?.('document-changed')
    ih.focus?.()
    return true
  } catch {
    say(studio, 'failed')
    return false
  }
}

let openDialog = null

function chooseDialog(studio, target, onChoose, onClose) {
  const ko = studio.locale === 'ko'
  const Dialog = studio.ModalDialog
  const doc = globalThis.document
  let format = storedFormat()
  let selected = 0

  class HanjaDialog extends Dialog {
    constructor() {
      super(ko ? '한자로 바꾸기' : 'Convert to Hanja', 380)
      this.rows = []
      this.keyHandler = null
    }

    createBody() {
      const body = doc.createElement('div')
      const heading = (text) => {
        const h = doc.createElement('div')
        h.className = 'dialog-section-title'
        h.textContent = text
        return h
      }
      body.appendChild(heading(ko ? `한자 목록: ${target.word}` : `Hanja for ${target.word}`))
      const list = doc.createElement('div')
      list.setAttribute('role', 'listbox')
      list.tabIndex = 0
      list.style.cssText =
        'max-height:260px;overflow-y:auto;border:1px solid var(--ieum-dialog-field-line);' +
        'border-radius:var(--ieum-dialog-radius-control);background:var(--ieum-dialog-field-surface);' +
        'outline:none;margin-bottom:10px'
      target.candidates.forEach((candidate, index) => {
        const row = doc.createElement('div')
        row.setAttribute('role', 'option')
        row.style.cssText =
          'display:flex;align-items:baseline;gap:10px;padding:4px 10px;cursor:default;' +
          'color:var(--ieum-dialog-ink)'
        const number = doc.createElement('span')
        number.textContent = index < QUICK_KEYS ? String(index + 1) : ''
        number.style.cssText = 'width:1em;color:var(--ieum-dialog-ink-hint);font-size:12px'
        const hanja = doc.createElement('span')
        hanja.textContent = candidate.hanja
        hanja.style.cssText = 'font-size:18px;min-width:3em'
        const meaning = doc.createElement('span')
        meaning.textContent = candidate.meaning
        meaning.style.cssText = 'color:var(--ieum-dialog-ink-muted);font-size:12px'
        row.append(number, hanja, meaning)
        row.addEventListener('click', () => this.select(index))
        row.addEventListener('dblclick', () => {
          this.select(index)
          this.confirm()
        })
        list.appendChild(row)
        this.rows.push(row)
      })
      body.appendChild(list)
      this.list = list

      body.appendChild(heading(ko ? '입력 형식' : 'Insert as'))
      const sample = target.candidates[0]?.hanja ?? ''
      for (const value of FORMATS) {
        const wrap = doc.createElement('label')
        wrap.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:2px 0;white-space:nowrap'
        const input = doc.createElement('input')
        input.type = 'radio'
        input.name = 'ieum-hanja-format'
        input.value = value
        input.checked = format === value
        input.addEventListener('change', () => {
          if (input.checked) format = value
        })
        wrap.append(input, convertedText(target.word, sample, value))
        body.appendChild(wrap)
      }
      this.select(0)
      return body
    }

    select(index) {
      if (index < 0 || index >= this.rows.length) return
      selected = index
      this.rows.forEach((row, i) => {
        const on = i === index
        row.setAttribute('aria-selected', on ? 'true' : 'false')
        row.style.background = on ? 'var(--ieum-dialog-accent-soft)' : ''
      })
      this.rows[index].scrollIntoView?.({ block: 'nearest' })
    }

    confirm() {
      const button = this.dialog?.querySelector('.dialog-btn-primary')
      button?.click()
    }

    onConfirm() {
      storeFormat(format)
      const candidate = target.candidates[selected]
      if (candidate) onChoose(convertedText(target.word, candidate.hanja, format))
      return true
    }

    show() {
      // ahead of the dialog's own capture listener, which stops every key at the document
      this.keyHandler = (e) => {
        const page = Math.max(1, Math.floor((this.list?.clientHeight ?? 260) / 28))
        let next = null
        if (e.key === 'ArrowDown') next = selected + 1
        else if (e.key === 'ArrowUp') next = selected - 1
        else if (e.key === 'PageDown') next = Math.min(this.rows.length - 1, selected + page)
        else if (e.key === 'PageUp') next = Math.max(0, selected - page)
        else if (e.key === 'Home') next = 0
        else if (e.key === 'End') next = this.rows.length - 1
        else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const index = Number(e.key) - 1
          if (index < this.rows.length) {
            e.preventDefault()
            e.stopPropagation()
            this.select(index)
            this.confirm()
          }
          return
        }
        if (next === null) return
        e.preventDefault()
        e.stopPropagation()
        this.select(Math.max(0, Math.min(this.rows.length - 1, next)))
      }
      doc.addEventListener('keydown', this.keyHandler, true)
      super.show()
      const button = this.dialog?.querySelector('.dialog-btn-primary')
      if (button) button.textContent = ko ? '바꾸기' : 'Convert'
      this.list?.focus()
    }

    hide() {
      if (this.keyHandler) doc.removeEventListener('keydown', this.keyHandler, true)
      this.keyHandler = null
      super.hide()
    }
  }

  const dialog = new HanjaDialog()
  openDialog = dialog
  dialog.afterClose = () => {
    if (openDialog === dialog) openDialog = null
    onClose()
  }
  dialog.show()
}

/**
 * The command behind the Hanja key and F9: find the word, show its Hanja, put the choice in.
 * Resolves to what happened, for the tests.
 */
export async function convertToHanja(services, studio = {}, fetchText) {
  const ih = services?.getInputHandler?.()
  const early = placeRefusal(ih)
  if (early) {
    say(studio, early)
    return { ok: false, reason: early }
  }
  if (openDialog) return { ok: false, reason: 'dialog_open' }
  let dict
  try {
    dict = await loadDictionary(fetchText)
  } catch {
    say(studio, 'noDictionary')
    return { ok: false, reason: 'noDictionary' }
  }
  let target
  try {
    target = conversionTarget(ih, services.wasm, dict)
  } catch {
    target = { refusal: 'failed' }
  }
  if (target.refusal) {
    say(studio, target.refusal)
    return { ok: false, reason: target.refusal }
  }
  if (!studio.ModalDialog) {
    // without a dialog (tests), the first candidate goes in
    const ok = replaceWord(services, studio, target, target.candidates[0].hanja)
    return ok ? { ok: true } : { ok: false, reason: 'failed' }
  }
  chooseDialog(
    studio,
    target,
    (text) => replaceWord(services, studio, target, text),
    () => ih.focus?.(),
  )
  return { ok: true, opened: true }
}

/**
 * Watches the editor's input box for the Hanja key. With nothing composing, Windows sends the
 * key up alone (HanjaMode), with no key down; while a syllable composes, the key down is the
 * input method's (Process, 229) and its candidates are already showing, so that press is left
 * alone. A system that does send a plain key down for it is handled there instead.
 */
export function installHanjaKey(win, getInputHandler, dispatcher, commandId = 'ieum:hanja') {
  const doc = win?.document
  if (!doc || !dispatcher) return
  let imeCode = null
  let handledCode = null
  const ours = (e) => {
    const ih = getInputHandler?.()
    return !!ih && (!ih.textarea || e.target === ih.textarea)
  }
  const run = () => {
    if (dispatcher.isEnabled?.(commandId) === false) return
    dispatcher.dispatch(commandId)
  }
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.keyCode === 229 || e.isComposing) {
        imeCode = e.code
        return
      }
      if (e.key !== 'HanjaMode' || !ours(e)) return
      handledCode = e.code
      e.preventDefault()
      run()
    },
    true,
  )
  doc.addEventListener(
    'keyup',
    (e) => {
      // the input method reports its own key up first; the HanjaMode one follows it
      if (e.key === 'Process') return
      if (e.key !== 'HanjaMode') {
        if (e.code === imeCode) imeCode = null
        return
      }
      const skip = (imeCode !== null && imeCode === e.code) || handledCode === e.code
      imeCode = null
      handledCode = null
      if (skip || e.isComposing || !ours(e)) return
      run()
    },
    true,
  )
}

/** Parts of the module that the tests exercise directly. */
export const __hanjaTest = {
  reset() {
    dictionary = null
    openDialog = null
  },
}
