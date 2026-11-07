/**
 * Edge auto-scroll of the thumbnail list during a page drag (issue #312): the
 * speed grows toward each edge, the top edge sits under the sticky header, and
 * the loop stops when the drag ends or leaves the list.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRAG_SCROLL_BAND,
  DRAG_SCROLL_MAX_SPEED,
  atScrollEnd,
  dragEdgeScrollSpeed,
  listRowsBand,
  useDragEdgeScroll,
  type DragEdgeScroll,
} from '../src/renderer/thumb-drag-scroll'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('dragEdgeScrollSpeed', () => {
  const top = 100
  const bottom = 700

  it('is still in the middle of the list', () => {
    expect(dragEdgeScrollSpeed(400, top, bottom)).toBe(0)
    expect(dragEdgeScrollSpeed(top + DRAG_SCROLL_BAND, top, bottom)).toBe(0)
    expect(dragEdgeScrollSpeed(bottom - DRAG_SCROLL_BAND, top, bottom)).toBe(0)
  })

  it('scrolls up near the top and down near the bottom, faster toward the edge', () => {
    const upFar = dragEdgeScrollSpeed(top + DRAG_SCROLL_BAND - 10, top, bottom)
    const upNear = dragEdgeScrollSpeed(top + 5, top, bottom)
    expect(upFar).toBeLessThan(0)
    expect(upNear).toBeLessThan(upFar)
    const downFar = dragEdgeScrollSpeed(bottom - DRAG_SCROLL_BAND + 10, top, bottom)
    const downNear = dragEdgeScrollSpeed(bottom - 5, top, bottom)
    expect(downFar).toBeGreaterThan(0)
    expect(downNear).toBeGreaterThan(downFar)
  })

  it('is full at and past the edge (over the sticky header)', () => {
    expect(dragEdgeScrollSpeed(top, top, bottom)).toBe(-DRAG_SCROLL_MAX_SPEED)
    expect(dragEdgeScrollSpeed(top - 30, top, bottom)).toBe(-DRAG_SCROLL_MAX_SPEED)
    expect(dragEdgeScrollSpeed(bottom, top, bottom)).toBe(DRAG_SCROLL_MAX_SPEED)
    expect(dragEdgeScrollSpeed(bottom + 30, top, bottom)).toBe(DRAG_SCROLL_MAX_SPEED)
  })

  it('keeps a still middle in a short list', () => {
    // 90px list: bands of 30px each, so the centre does not scroll
    expect(dragEdgeScrollSpeed(145, 100, 190)).toBe(0)
    expect(dragEdgeScrollSpeed(105, 100, 190)).toBeLessThan(0)
    expect(dragEdgeScrollSpeed(185, 100, 190)).toBeGreaterThan(0)
    expect(dragEdgeScrollSpeed(100, 100, 100)).toBe(0)
  })
})

describe('atScrollEnd', () => {
  const list = (scrollTop: number) => ({ scrollTop, scrollHeight: 2000, clientHeight: 600 })

  it('tells the end the list would scroll toward', () => {
    expect(atScrollEnd(list(0), -1)).toBe(true)
    expect(atScrollEnd(list(0), 1)).toBe(false)
    expect(atScrollEnd(list(1400), 1)).toBe(true)
    expect(atScrollEnd(list(1399.5), 1)).toBe(true)
    expect(atScrollEnd(list(1400), -1)).toBe(false)
    expect(atScrollEnd(list(700), 1)).toBe(false)
  })
})

const rect = (top: number, bottom: number, left = 0, right = 150): DOMRect =>
  ({
    top,
    bottom,
    left,
    right,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }) as DOMRect

/** a 600px list (5000px of rows) at y 100..700 whose sticky header ends at y 140 */
function makeList(): HTMLDivElement {
  const list = document.createElement('div')
  list.innerHTML = '<div class="hdr"></div><div class="row"></div>'
  list.getBoundingClientRect = () => rect(100, 700)
  Object.defineProperty(list, 'clientHeight', { value: 600 })
  Object.defineProperty(list, 'scrollHeight', { value: 5000, configurable: true })
  ;(list.firstElementChild as HTMLElement).getBoundingClientRect = () => rect(100, 140)
  document.body.appendChild(list)
  return list
}

describe('listRowsBand', () => {
  it('starts the rows under the sticky header', () => {
    const list = makeList()
    expect(listRowsBand(list, '.hdr')).toEqual({ top: 140, bottom: 700 })
    expect(listRowsBand(list, '.none')).toEqual({ top: 100, bottom: 700 })
    list.remove()
  })
})

describe('useDragEdgeScroll', () => {
  let frames: Map<number, FrameRequestCallback>
  let nextId: number
  let clock: number
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  let list: HTMLDivElement
  let api: DragEdgeScroll

  beforeEach(() => {
    frames = new Map()
    nextId = 1
    clock = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(nextId, cb)
      return nextId++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    list = makeList()
    function Probe() {
      const ref = useRef<HTMLElement | null>(list)
      api = useDragEdgeScroll(ref, '.hdr')
      return null
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(createElement(Probe)))
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    list.remove()
    root = null
    host = null
    vi.unstubAllGlobals()
  })

  /** run the pending animation frames, 16ms apart */
  const runFrames = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock += 16
      const pending = [...frames]
      frames.clear()
      for (const [, cb] of pending) cb(clock)
    }
  }

  it('scrolls down while the pointer rests near the bottom', () => {
    api.track(695)
    runFrames(5)
    expect(list.scrollTop).toBeGreaterThan(0)
    const after5 = list.scrollTop
    runFrames(5)
    expect(list.scrollTop).toBeGreaterThan(after5)
  })

  it('scrolls up over the sticky header, where the rows start', () => {
    list.scrollTop = 500
    // y 120 is on the header, above the rows' top edge (140)
    api.track(120)
    runFrames(3)
    expect(list.scrollTop).toBeLessThan(500)
  })

  it('does nothing in the middle and stops once the pointer moves there', () => {
    api.track(400)
    runFrames(3)
    expect(list.scrollTop).toBe(0)
    expect(frames.size).toBe(0)
    api.track(695)
    runFrames(2)
    const moved = list.scrollTop
    expect(moved).toBeGreaterThan(0)
    api.track(400)
    runFrames(3)
    expect(list.scrollTop).toBe(moved)
    expect(frames.size).toBe(0)
  })

  it('stops on drop or drag end', () => {
    api.track(695)
    runFrames(2)
    const moved = list.scrollTop
    api.stop()
    expect(frames.size).toBe(0)
    runFrames(3)
    expect(list.scrollTop).toBe(moved)
  })

  it('stops only when the drag leaves the list itself', () => {
    api.track(695)
    // moving between thumbnails fires dragleave inside the list
    api.leave(75, 690)
    expect(frames.size).toBe(1)
    // leaving the window reports (0, 0)
    api.leave(0, 0)
    expect(frames.size).toBe(0)
  })

  it('stops writing once the list reaches the end it scrolls toward', () => {
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true })
    const writes: number[] = []
    let pos = 380
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => pos,
      set: (v: number) => {
        // the browser clamps to the end
        pos = Math.min(Math.max(v, 0), 400)
        writes.push(v)
      },
    })
    api.track(695)
    runFrames(10)
    expect(pos).toBe(400)
    const atEnd = writes.length
    runFrames(10)
    expect(writes).toHaveLength(atEnd)
    expect(frames.size).toBe(0)
    // the next dragover over the other band scrolls back
    api.track(120)
    runFrames(2)
    expect(pos).toBeLessThan(400)
  })

  it('cancels the loop when the list unmounts', () => {
    api.track(695)
    expect(frames.size).toBe(1)
    act(() => root!.unmount())
    root = null
    expect(frames.size).toBe(0)
  })
})

describe('thumbnail list wiring', () => {
  it('feeds page drags to the edge scroll and stops it when the drag ends', () => {
    const app = readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
    expect(app).toContain("useDragEdgeScroll(thumbsRef, '.pdf-thumbs-header')")
    // dragenter too: entering a new element reports the pointer without a dragover
    const track = /if \(dragFrom !== null\) thumbDragScroll\.track\(e\.clientY\)/
    expect(app).toMatch(new RegExp(`onDragEnter=\\{\\(e\\) => \\{\\s*${track.source}`))
    expect(app).toMatch(new RegExp(`onDragOver=\\{\\(e\\) => \\{\\s*${track.source}`))
    expect(app).toContain('onDragLeave={(e) => thumbDragScroll.leave(e.clientX, e.clientY)}')
    expect(app).toContain('onDrop={thumbDragScroll.stop}')
    expect(app).toContain('onDragEnd={thumbDragScroll.stop}')
  })
})
