/**
 * The character count in the editor's status bar (issue #295): how many characters the block
 * holds and how many the document holds, at the bottom left beside the insert/overwrite mode.
 * Hangul shows these numbers only in its 문서 정보 dialog; a writer who works to a length wants
 * them in sight while writing.
 *
 * The numbers are the dialog's (document-info.mjs): 글자(공백 포함) is the one shown, 공백 제외
 * is in the tooltip, and headers, footers, footnotes and endnotes are left out as there.
 *
 * Counting reads every paragraph of the document, which takes a while on a long one (a
 * 480,000-character document about 0.1 s), so it is never done for a key press: the document is
 * counted again once typing pauses, and the block once the selection rests. How long the pause
 * is follows how long the last count took, so a long document is counted less often but still
 * whole, and nothing is cut short.
 */
import { textCounts } from './document-info.mjs'

/** The pause after the last edit before the document is counted again. */
export const TOTAL_PAUSE_MS = 700
/** The pause after the selection last moved before the block is counted. */
export const SELECTION_PAUSE_MS = 150
/** A pause is at least this many times the last count's own time. */
export const PAUSE_PER_COUNT = 4

/** The id of the status bar item, and of the divider before it. */
export const CHAR_COUNT_ID = 'ieum-sb-char-count'
const DIVIDER_ID = 'ieum-sb-char-count-divider'

/**
 * A collector for agent-plugin.mjs's selection walk (gatherSelection) that adds up the
 * characters of the runs instead of keeping them. It has no limit: a whole novel selected is
 * counted whole.
 */
export function countCollector() {
  let chars = 0
  let charsNoSpace = 0
  let runs = 0
  return {
    add(box, k, from, to) {
      const length = box.length(k)
      const start = Math.min(Math.max(from, 0), length)
      const end = Math.min(to, length)
      if (end <= start) return
      const counts = textCounts(box.text(k, length).slice(start, end))
      chars += counts.chars
      charsNoSpace += counts.charsNoSpace
      runs += 1
    },
    tooLong: () => false,
    counts: () => ({ chars, charsNoSpace, runs }),
  }
}

/** The labels the app hands over, checked: templates with {total}, {selected} and {noSpace}. */
export function checkCharCountLabels(given) {
  const ok = (value) => typeof value === 'string' && value.trim().length > 0
  if (!given || !ok(given.total) || !ok(given.selected) || !ok(given.hint)) return null
  return {
    total: given.total,
    selected: given.selected,
    hint: given.hint,
    locale: typeof given.locale === 'string' && given.locale ? given.locale : undefined,
  }
}

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? values[name] : whole))

/**
 * What the status bar shows for the counts: { text, title }. `total` is the document's
 * { chars, charsNoSpace }; `selected` the block's, or null when nothing is selected.
 */
export function charCountText(labels, total, selected) {
  let format
  try {
    format = new Intl.NumberFormat(labels.locale).format
  } catch {
    format = (n) => String(n)
  }
  const number = (n) => format(Math.max(0, Math.round(Number(n) || 0)))
  const values = {
    total: number(total.chars),
    selected: selected ? number(selected.chars) : '',
    noSpace: selected
      ? `${number(selected.charsNoSpace)} / ${number(total.charsNoSpace)}`
      : number(total.charsNoSpace),
  }
  return {
    text: fill(selected ? labels.selected : labels.total, values),
    title: fill(labels.hint, values),
  }
}

/**
 * The status bar item, made once beside the insert/overwrite mode (#sb-mode) with a divider
 * as the studio puts between its items. Null when the page has no status bar.
 */
export function charCountItem(page) {
  const existing = page?.getElementById?.(CHAR_COUNT_ID)
  if (existing) return existing
  const bar = page?.getElementById?.('status-bar')
  if (!bar) return null
  const divider = page.createElement('span')
  divider.id = DIVIDER_ID
  divider.className = 'stb-divider'
  const item = page.createElement('span')
  item.id = CHAR_COUNT_ID
  item.className = 'stb-item'
  item.setAttribute('role', 'status')
  const mode = page.getElementById('sb-mode')
  if (mode && mode.parentNode === bar) {
    mode.after(divider, item)
  } else {
    bar.append(divider, item)
  }
  return item
}

/**
 * The counting schedule. `readTotal()` and `readSelection()` count (the second answers null
 * when nothing is selected), `render(total, selected)` shows them. `documentChanged` and
 * `selectionChanged` are cheap, so they can be called for every edit and every caret move:
 * each only puts its count off until things rest.
 */
export function charCounter({
  readTotal,
  readSelection,
  render,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let total = null
  let selected = null
  let totalTimer = null
  let selectionTimer = null
  let totalCost = 0
  let selectionCost = 0
  let stopped = false

  const timed = (read) => {
    const started = now()
    let value
    try {
      value = read()
    } catch {
      value = null
    }
    return { value, cost: Math.max(0, now() - started) }
  }
  const show = () => {
    if (!stopped && total) render(total, selected)
  }
  const countTotal = () => {
    totalTimer = null
    const { value, cost } = timed(readTotal)
    totalCost = cost
    if (value) total = value
    show()
  }
  const countSelection = () => {
    selectionTimer = null
    const { value, cost } = timed(readSelection)
    selectionCost = cost
    selected = value ?? null
    show()
  }
  const later = (timer, run, pause, cost) => {
    if (timer !== null) clearTimer(timer)
    return setTimer(run, Math.max(pause, cost * PAUSE_PER_COUNT))
  }

  return {
    /** Count both as soon as the page is free (the item was just put up). */
    start() {
      stopped = false
      totalTimer = later(totalTimer, countTotal, 0, 0)
      selectionTimer = later(selectionTimer, countSelection, 0, 0)
    },
    documentChanged() {
      if (stopped) return
      totalTimer = later(totalTimer, countTotal, TOTAL_PAUSE_MS, totalCost)
      // an edit moves or empties the block too
      selectionTimer = later(selectionTimer, countSelection, SELECTION_PAUSE_MS, selectionCost)
    },
    selectionChanged() {
      if (stopped) return
      selectionTimer = later(selectionTimer, countSelection, SELECTION_PAUSE_MS, selectionCost)
    },
    /** Shows the last counts again (the labels changed). */
    refresh: show,
    stop() {
      stopped = true
      if (totalTimer !== null) clearTimer(totalTimer)
      if (selectionTimer !== null) clearTimer(selectionTimer)
      totalTimer = null
      selectionTimer = null
    },
  }
}
