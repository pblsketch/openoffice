/**
 * Edge auto-scroll for the thumbnail list while a page is being dragged to a
 * new place (issue #312). HTML drag-and-drop does not scroll the list on its
 * own, so a page could only travel as far as the visible thumbnails. Near the
 * top or bottom edge the list now scrolls, faster the closer the pointer is to
 * the edge. The top edge is the bottom of the sticky header, which otherwise
 * hides the band where scrolling would start.
 *
 * The speed is a pure function; the hook owns the animation frame loop and
 * writes only `scrollTop`.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** depth (px) of the band at each edge where dragging scrolls the list */
export const DRAG_SCROLL_BAND = 48

/** scroll speed (px per ms) with the pointer at or past the edge */
export const DRAG_SCROLL_MAX_SPEED = 1.5

/**
 * Scroll speed (px per ms, negative = up) for a drag pointer at `y` in a list
 * whose visible rows run from `top` to `bottom` (client coordinates). Zero in
 * the middle; grows linearly through the edge band and is full at or past the
 * edge. The band never takes more than a third of a short list, so the two
 * bands leave a still middle.
 */
export function dragEdgeScrollSpeed(
  y: number,
  top: number,
  bottom: number,
  band = DRAG_SCROLL_BAND,
  max = DRAG_SCROLL_MAX_SPEED,
): number {
  const depth = Math.min(band, (bottom - top) / 3)
  if (depth <= 0) return 0
  if (y < top + depth) return -max * Math.min(1, (top + depth - y) / depth)
  if (y > bottom - depth) return max * Math.min(1, (y - (bottom - depth)) / depth)
  return 0
}

/**
 * Whether the list is already as far as it goes in the direction of `speed`
 * (1px slack: scroll positions can be fractional at some zoom levels).
 */
export function atScrollEnd(
  list: { scrollTop: number; scrollHeight: number; clientHeight: number },
  speed: number,
): boolean {
  if (speed < 0) return list.scrollTop <= 0
  return list.scrollTop >= list.scrollHeight - list.clientHeight - 1
}

/** Visible rows of the list: below a sticky header child, if it has one */
export function listRowsBand(
  list: HTMLElement,
  headerSelector: string,
): { top: number; bottom: number } {
  const r = list.getBoundingClientRect()
  const header = list.querySelector<HTMLElement>(`:scope > ${headerSelector}`)
  const top = header ? Math.max(r.top, header.getBoundingClientRect().bottom) : r.top
  return { top, bottom: r.top + list.clientHeight }
}

export type DragEdgeScroll = {
  /** a dragenter or dragover at client y inside the list (call only while a page drag runs) */
  track: (y: number) => void
  /** a dragleave of the list: stops once the pointer is outside it */
  leave: (x: number, y: number) => void
  /** drop, drag end or cancel */
  stop: () => void
}

/**
 * Scrolls `listRef`'s element while a drag hovers near its top or bottom edge.
 * dragover keeps arriving while the pointer rests, so the loop reads the last
 * pointer position each frame and runs until the pointer leaves the bands, the
 * list reaches that end, the pointer leaves the list, or the drag ends.
 */
export function useDragEdgeScroll(
  listRef: RefObject<HTMLElement | null>,
  headerSelector: string,
): DragEdgeScroll {
  const pointerY = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const last = useRef(0)

  const stop = useCallback(() => {
    pointerY.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const tick = useCallback(
    (now: number) => {
      frame.current = null
      const list = listRef.current
      const y = pointerY.current
      if (!list || y === null) return
      const { top, bottom } = listRowsBand(list, headerSelector)
      const speed = dragEdgeScrollSpeed(y, top, bottom)
      // nothing to move (or already at that end): the next dragenter/dragover starts it again
      if (speed === 0 || atScrollEnd(list, speed)) return
      // first frame of a run has no elapsed time; assume one 60 Hz frame
      const dt = last.current ? Math.min(now - last.current, 50) : 16
      last.current = now
      const step = speed * dt
      // at least a pixel per frame so the slowest band edge still moves
      list.scrollTop += step < 0 ? Math.min(step, -1) : Math.max(step, 1)
      frame.current = requestAnimationFrame(tick)
    },
    [listRef, headerSelector],
  )

  const track = useCallback(
    (y: number) => {
      pointerY.current = y
      if (frame.current !== null) return
      last.current = 0
      frame.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  const leave = useCallback(
    (x: number, y: number) => {
      const list = listRef.current
      if (!list) return stop()
      // dragleave also fires moving between thumbnails; only leaving the list counts
      const r = list.getBoundingClientRect()
      if (x <= r.left || x >= r.right || y <= r.top || y >= r.bottom) stop()
    },
    [listRef, stop],
  )

  useEffect(() => stop, [stop])

  return { track, leave, stop }
}
