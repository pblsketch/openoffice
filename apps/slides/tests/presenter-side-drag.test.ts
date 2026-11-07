import { describe, expect, it, vi } from 'vitest'
import { startSideDrag } from '../src/renderer/presenter-side-drag'

/** A window stand-in that counts its listeners, and a frame scheduler run by hand. */
function setup() {
  const win = new EventTarget()
  const added = vi.spyOn(win, 'addEventListener')
  const removed = vi.spyOn(win, 'removeEventListener')
  let queued: Array<() => void> = []
  const frame = {
    request: (cb: () => void) => queued.push(cb),
    cancel: vi.fn(() => {
      queued = []
    }),
  }
  const flush = () => {
    const run = queued
    queued = []
    run.forEach((cb) => cb())
  }
  const cursorHost = { style: { cursor: '' } }
  const preview = vi.fn()
  const commit = vi.fn()
  const end = startSideDrag({
    // the column sits at the right of a 1920px body
    widthAt: (clientX) => Math.max(240, 1920 - clientX),
    preview,
    commit,
    win: win as unknown as Window,
    frame,
    cursorHost,
  })
  const move = (clientX: number) =>
    win.dispatchEvent(Object.assign(new Event('pointermove'), { clientX }))
  const up = () => win.dispatchEvent(new Event('pointerup'))
  return { win, added, removed, frame, flush, cursorHost, preview, commit, end, move, up }
}

describe('presenter splitter drag', () => {
  it('a press without a move saves nothing', () => {
    const d = setup()
    expect(d.cursorHost.style.cursor).toBe('col-resize')
    d.up()
    expect(d.commit).not.toHaveBeenCalled()
    expect(d.preview).not.toHaveBeenCalled()
    expect(d.cursorHost.style.cursor).toBe('')
    expect(d.removed).toHaveBeenCalledTimes(d.added.mock.calls.length)
  })

  it('shows the width once a frame and saves the last one on release', () => {
    const d = setup()
    d.move(1500)
    d.move(1400)
    expect(d.preview).not.toHaveBeenCalled()
    d.flush()
    expect(d.preview).toHaveBeenCalledTimes(1)
    expect(d.preview).toHaveBeenLastCalledWith(520)
    d.move(1380)
    d.up()
    expect(d.commit).toHaveBeenCalledTimes(1)
    expect(d.commit).toHaveBeenCalledWith(540)
    // the pending frame is dropped with the drag
    expect(d.frame.cancel).toHaveBeenCalled()
    d.move(1000)
    d.flush()
    expect(d.commit).toHaveBeenCalledTimes(1)
  })

  it('ending early (the view went away mid-drag) removes everything and saves nothing', () => {
    const d = setup()
    d.move(1500)
    d.end()
    expect(d.cursorHost.style.cursor).toBe('')
    expect(d.removed).toHaveBeenCalledTimes(d.added.mock.calls.length)
    for (const [type, listener] of d.added.mock.calls) {
      expect(d.removed).toHaveBeenCalledWith(type, listener)
    }
    d.move(1200)
    d.up()
    d.flush()
    expect(d.commit).not.toHaveBeenCalled()
    expect(d.preview).not.toHaveBeenCalled()
    // ending twice is harmless
    d.end()
  })
})
