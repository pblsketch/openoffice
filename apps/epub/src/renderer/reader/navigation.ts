/**
 * Moving through a book (spec §4 "flow"): chapter by chapter in spine order,
 * skipping `linear="no"` items, which only the table of contents and links
 * reach; scrolling past the end of a chapter turns to the next one, past its
 * start to the previous one.
 */
import type { EpubTocEntry } from '@genoffice/epub-engine'

export interface FlowItem {
  linear: boolean
}

/** The chapter a book opens at when nothing was remembered: the first linear item, else the first item. */
export function firstReadingIndex(spine: readonly FlowItem[]): number {
  const first = spine.findIndex((item) => item.linear)
  return first >= 0 ? first : 0
}

/**
 * The chapter after (`dir` 1) or before (-1) `from` in the reading flow, or
 * null at either end. Starting from a non-linear item (reached by a link)
 * goes on to the nearest linear item on that side.
 */
export function nextReadingIndex(
  spine: readonly FlowItem[],
  from: number,
  dir: 1 | -1,
): number | null {
  for (let i = from + dir; i >= 0 && i < spine.length; i += dir) {
    if (spine[i]!.linear) return i
  }
  return null
}

/** Wheel travel past a chapter edge that turns the page. */
export const OVERSCROLL_TURN = 360
/** A pause longer than this starts the count again. */
export const OVERSCROLL_GAP_MS = 400

export interface OverscrollState {
  /** the direction being pushed past an edge; 0 when none */
  dir: 0 | 1 | -1
  sum: number
  at: number
}

export const OVERSCROLL_IDLE: OverscrollState = { dir: 0, sum: 0, at: 0 }

export interface WheelSample {
  deltaY: number
  /** the chapter was at its top when the wheel turned */
  atStart: boolean
  /** the chapter was at its end when the wheel turned */
  atEnd: boolean
  time: number
}

/**
 * Counts wheel travel pushed against an edge the chapter had already reached.
 * The scroll that reaches the end does not count; pushing on afterwards does,
 * and `turn` says when it is enough to go on to the next (1) or previous (-1)
 * chapter.
 */
export function overscroll(
  state: OverscrollState,
  sample: WheelSample,
): { state: OverscrollState; turn: 1 | -1 | null } {
  const dir: 0 | 1 | -1 =
    sample.deltaY > 0 && sample.atEnd ? 1 : sample.deltaY < 0 && sample.atStart ? -1 : 0
  if (dir === 0) return { state: OVERSCROLL_IDLE, turn: null }
  const fresh = state.dir !== dir || sample.time - state.at > OVERSCROLL_GAP_MS
  const sum = (fresh ? 0 : state.sum) + Math.abs(sample.deltaY)
  if (sum >= OVERSCROLL_TURN) return { state: OVERSCROLL_IDLE, turn: dir }
  return { state: { dir, sum, at: sample.time }, turn: null }
}

/**
 * The table-of-contents entry of the chapter being read: the first entry
 * pointing into it, else the last entry before it in spine order; -1 when no
 * entry comes before.
 */
export function currentTocEntry(entries: readonly EpubTocEntry[], spineIndex: number): number {
  const exact = entries.findIndex((entry) => entry.spineIndex === spineIndex)
  if (exact >= 0) return exact
  let best = -1
  let bestSpine = -1
  entries.forEach((entry, i) => {
    const at = entry.spineIndex
    if (at !== null && at < spineIndex && at > bestSpine) {
      best = i
      bestSpine = at
    }
  })
  return best
}
