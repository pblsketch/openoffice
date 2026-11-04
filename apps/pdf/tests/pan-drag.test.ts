/**
 * Dragging the document pane (pan-drag.ts): the middle button always pans, the
 * left button only with the hand tool on; fields keep their press, the
 * scrollbars stay scrollbars, touch keeps native scrolling, and the click that
 * ends a real drag never reaches the page while a plain click still does.
 */
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  PAN_CLICK_SLOP,
  onPaneScrollbar,
  panScroll,
  pastSlop,
  startsPan,
  usePanDrag,
} from '../src/renderer/pan-drag'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('pan decisions', () => {
  const el = (html: string, pick: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.querySelector(pick)
  }

  it('starts on the middle button always and on the left button only with the hand tool', () => {
    const span = el('<span>t</span>', 'span')
    expect(startsPan(1, false, span)).toBe(true)
    expect(startsPan(0, false, span)).toBe(false)
    expect(startsPan(0, true, span)).toBe(true)
    expect(startsPan(2, true, span)).toBe(false)
  })

  it('leaves fields and controls their own press', () => {
    for (const html of [
      '<input>',
      '<textarea></textarea>',
      '<select></select>',
      '<button><b>x</b></button>',
      '<div contenteditable="true"><b>x</b></div>',
    ]) {
      const host = document.createElement('div')
      host.innerHTML = html
      const inner = host.querySelector('b') ?? host.firstElementChild
      expect(startsPan(0, true, inner)).toBe(false)
      expect(startsPan(1, false, inner)).toBe(false)
    }
  })

  it('tells a press on the scrollbars from one on the content', () => {
    const rect = { left: 10, top: 20 }
    expect(onPaneScrollbar(rect, 300, 200, 100, 100)).toBe(false)
    expect(onPaneScrollbar(rect, 300, 200, 312, 100)).toBe(true)
    expect(onPaneScrollbar(rect, 300, 200, 100, 225)).toBe(true)
  })

  it('keeps the grabbed point under the pointer', () => {
    const origin = { left: 100, top: 400, x: 50, y: 60 }
    expect(panScroll(origin, 80, 20)).toEqual({ left: 70, top: 440 })
    expect(pastSlop(origin, 50 + PAN_CLICK_SLOP, 60)).toBe(false)
    expect(pastSlop(origin, 50, 60 - PAN_CLICK_SLOP - 1)).toBe(true)
  })
})

describe('usePanDrag', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  function Pane({ hand }: { hand: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    usePanDrag(ref, hand)
    return createElement(
      'div',
      { ref, id: 'pane' },
      createElement('span', { id: 'text' }, 'text'),
      createElement('input', { id: 'field' }),
    )
  }

  async function mount(hand: boolean) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(createElement(Pane, { hand })))
    const pane = document.getElementById('pane') as HTMLDivElement
    let captured: number | null = null
    Object.assign(pane, {
      setPointerCapture: (id: number) => (captured = id),
      hasPointerCapture: (id: number) => captured === id,
      releasePointerCapture: () => (captured = null),
    })
    pane.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 }) as DOMRect
    Object.defineProperty(pane, 'clientWidth', { value: 385 })
    Object.defineProperty(pane, 'clientHeight', { value: 285 })
    Object.defineProperty(pane, 'scrollLeft', { value: 200, writable: true })
    Object.defineProperty(pane, 'scrollTop', { value: 500, writable: true })
    return pane
  }

  const pointer = (
    type: string,
    target: Element,
    o: { button?: number; x: number; y: number; pointerType?: string },
  ) => {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: o.button ?? 0,
      clientX: o.x,
      clientY: o.y,
    })
    Object.defineProperty(e, 'pointerId', { value: 7 })
    Object.defineProperty(e, 'pointerType', { value: o.pointerType ?? 'mouse' })
    target.dispatchEvent(e)
    return e
  }

  const click = (target: Element, type = 'click') => {
    let reached = false
    const seen = () => (reached = true)
    target.addEventListener(type, seen)
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
    target.removeEventListener(type, seen)
    return reached
  }

  it('pans with the middle button without the hand tool and swallows the closing click', async () => {
    const pane = await mount(false)
    const text = document.getElementById('text')!
    const down = pointer('pointerdown', text, { button: 1, x: 100, y: 100 })
    expect(down.defaultPrevented).toBe(true)
    expect(pane.dataset.panning).toBe('')
    pointer('pointermove', pane, { button: 1, x: 70, y: 40 })
    expect([pane.scrollLeft, pane.scrollTop]).toEqual([230, 560])
    pointer('pointerup', pane, { button: 1, x: 70, y: 40 })
    expect(pane.dataset.panning).toBeUndefined()
    expect(click(text, 'auxclick')).toBe(false)
    // only the one click after the drag is swallowed
    expect(click(text, 'auxclick')).toBe(true)
  })

  it('leaves the left button to text selection while the hand tool is off', async () => {
    const pane = await mount(false)
    const text = document.getElementById('text')!
    const down = pointer('pointerdown', text, { x: 100, y: 100 })
    expect(down.defaultPrevented).toBe(false)
    pointer('pointermove', pane, { x: 40, y: 40 })
    expect([pane.scrollLeft, pane.scrollTop]).toEqual([200, 500])
  })

  it('pans with the left button under the hand tool and keeps the press from the page', async () => {
    const pane = await mount(true)
    const text = document.getElementById('text')!
    let pageSawPress = false
    text.addEventListener('pointerdown', () => (pageSawPress = true))
    pointer('pointerdown', text, { x: 100, y: 100 })
    expect(pageSawPress).toBe(false)
    pointer('pointermove', pane, { x: 150, y: 180 })
    expect([pane.scrollLeft, pane.scrollTop]).toEqual([150, 420])
    pointer('pointerup', pane, { x: 150, y: 180 })
    expect(click(text)).toBe(false)
  })

  it('lets a press without travel click through, so links still follow', async () => {
    await mount(true)
    const text = document.getElementById('text')!
    pointer('pointerdown', text, { x: 100, y: 100 })
    pointer('pointermove', text, { x: 100 + PAN_CLICK_SLOP, y: 100 })
    pointer('pointerup', text, { x: 100 + PAN_CLICK_SLOP, y: 100 })
    expect(click(text)).toBe(true)
  })

  it('keeps fields, scrollbars and touch out of panning', async () => {
    const pane = await mount(true)
    const field = document.getElementById('field')!
    expect(pointer('pointerdown', field, { x: 100, y: 100 }).defaultPrevented).toBe(false)
    expect(pointer('pointerdown', pane, { x: 390, y: 100 }).defaultPrevented).toBe(false)
    const text = document.getElementById('text')!
    expect(
      pointer('pointerdown', text, { x: 100, y: 100, pointerType: 'touch' }).defaultPrevented,
    ).toBe(false)
    expect(pane.dataset.panning).toBeUndefined()
  })

  it('ignores presses outside the pane', async () => {
    await mount(true)
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    expect(pointer('pointerdown', outside, { button: 1, x: 5, y: 5 }).defaultPrevented).toBe(false)
    outside.remove()
  })

  it('ends a drag when the window loses focus', async () => {
    const pane = await mount(false)
    pointer('pointerdown', document.getElementById('text')!, { button: 1, x: 100, y: 100 })
    window.dispatchEvent(new Event('blur'))
    expect(pane.dataset.panning).toBeUndefined()
    pointer('pointermove', pane, { button: 1, x: 10, y: 10 })
    expect([pane.scrollLeft, pane.scrollTop]).toEqual([200, 500])
  })
})
