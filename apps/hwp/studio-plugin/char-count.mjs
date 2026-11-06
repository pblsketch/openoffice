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
 * counted again once typing pauses, and the block once the selection rests, and then only when
 * the page is idle. How long the pause is follows how long the last count took, so a long
 * document is counted less often but still whole, and nothing is cut short.
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
 * counted whole. The engine's offsets count characters (code points), so an emoji or a Han
 * character outside the basic plane is one there and two in a JavaScript string; the run is cut
 * by characters.
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
      const counts = textCounts([...box.text(k, length)].slice(start, end).join(''))
      chars += counts.chars
      charsNoSpace += counts.charsNoSpace
      runs += 1
    },
    tooLong: () => false,
    counts: () => ({ chars, charsNoSpace, runs }),
  }
}

/**
 * The labels the app hands over, checked: templates with {total} and {selected} (with spaces)
 * and {totalNoSpace} and {selectedNoSpace}; `hint` is the tooltip without a block,
 * `hintSelected` with one.
 */
export function checkCharCountLabels(given) {
  const ok = (value) => typeof value === 'string' && value.trim().length > 0
  if (!given || !['total', 'selected', 'hint', 'hintSelected'].every((key) => ok(given[key]))) {
    return null
  }
  return {
    total: given.total,
    selected: given.selected,
    hint: given.hint,
    hintSelected: given.hintSelected,
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
    totalNoSpace: number(total.charsNoSpace),
    selected: selected ? number(selected.chars) : '',
    selectedNoSpace: selected ? number(selected.charsNoSpace) : '',
  }
  return {
    text: fill(selected ? labels.selected : labels.total, values),
    title: fill(selected ? labels.hintSelected : labels.hint, values),
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

/** How long a count waits for an idle moment before it runs anyway (a page never idle). */
export const IDLE_DEADLINE_MS = 2000

const idleOf = () => {
  const request = globalThis.requestIdleCallback
  const cancel = globalThis.cancelIdleCallback
  if (typeof request !== 'function' || typeof cancel !== 'function') return null
  return {
    request: (fn) => request.call(globalThis, fn, { timeout: IDLE_DEADLINE_MS }),
    cancel: (id) => cancel.call(globalThis, id),
  }
}

/**
 * The counting schedule. `readTotal()` and `readSelection()` count (the second answers null
 * when nothing is selected), `render(total, selected)` shows them. `documentChanged` and
 * `selectionChanged` are cheap, so they can be called for every edit and every caret move:
 * each only puts its count off until things rest. Once the pause is over the count waits for
 * the page to be idle (requestIdleCallback, where the page has it), so it does not hold up a
 * key pressed just then; it is the same whole count, only run when nothing else is.
 *
 * A count that itself raises the events (the command it runs) does not start another: events
 * that come while a count runs are not taken for an edit. `documentSwapped` (another document
 * opened in the same editor) counts both again.
 */
export function charCounter({
  readTotal,
  readSelection,
  render,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  idle = idleOf(),
}) {
  let total = null
  let selected = null
  let stopped = false
  let counting = false

  const show = () => {
    if (!stopped && total) render(total, selected)
  }
  /** One count: its pause timer, its idle request, and what the last run cost. */
  const job = (read, take) => {
    const state = { timer: null, idle: null, cost: 0 }
    const run = () => {
      state.idle = null
      if (stopped) return
      const started = now()
      let value
      counting = true
      try {
        value = read()
      } catch {
        value = undefined
      } finally {
        counting = false
      }
      state.cost = Math.max(0, now() - started)
      take(value)
      show()
    }
    const cancel = () => {
      if (state.timer !== null) clearTimer(state.timer)
      if (state.idle !== null) idle?.cancel(state.idle)
      state.timer = null
      state.idle = null
    }
    const schedule = (pause) => {
      cancel()
      state.timer = setTimer(
        () => {
          state.timer = null
          if (idle) state.idle = idle.request(run)
          else run()
        },
        Math.max(pause, state.cost * PAUSE_PER_COUNT),
      )
    }
    return { schedule, cancel }
  }
  // a failed count of the document keeps the numbers it had
  const totalJob = job(readTotal, (value) => {
    if (value) total = value
  })
  const selectionJob = job(readSelection, (value) => {
    selected = value ?? null
  })

  return {
    /** Count both as soon as the page is free (the item was just put up). */
    start() {
      stopped = false
      totalJob.schedule(0)
      selectionJob.schedule(0)
    },
    documentChanged() {
      if (stopped || counting) return
      totalJob.schedule(TOTAL_PAUSE_MS)
      // an edit moves or empties the block too
      selectionJob.schedule(SELECTION_PAUSE_MS)
    },
    selectionChanged() {
      if (stopped || counting) return
      selectionJob.schedule(SELECTION_PAUSE_MS)
    },
    documentSwapped() {
      if (stopped) return
      totalJob.schedule(0)
      selectionJob.schedule(0)
    },
    /** Shows the last counts again (the labels changed). */
    refresh: show,
    stop() {
      stopped = true
      totalJob.cancel()
      selectionJob.cancel()
    },
  }
}
