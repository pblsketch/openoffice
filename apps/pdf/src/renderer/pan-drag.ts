/**
 * Drag-to-scroll for the document pane: the left button while the hand tool is
 * on, and the middle button at any time. The decisions are pure functions; the
 * hook owns the listeners and writes only scroll positions and a data attribute
 * (React never renders `data-panning`, so a re-render mid-drag keeps it).
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** pointer travel (px) after which a press is a drag and its click is swallowed */
export const PAN_CLICK_SLOP = 4

const MIDDLE_BUTTON = 1

/** fields and controls keep their own press: typing, buttons, form widgets */
const KEEP_PRESS = 'input, textarea, select, button, [contenteditable="true"]'

/** Whether a press of `button` on `target` starts a pan */
export function startsPan(button: number, handTool: boolean, target: Element | null): boolean {
  if (button !== MIDDLE_BUTTON && !(button === 0 && handTool)) return false
  return !target?.closest(KEEP_PRESS)
}

/** Whether a press at client (x, y) on the pane itself landed on its scrollbars */
export function onPaneScrollbar(
  rect: { left: number; top: number },
  clientWidth: number,
  clientHeight: number,
  x: number,
  y: number,
): boolean {
  return x - rect.left >= clientWidth || y - rect.top >= clientHeight
}

export type PanOrigin = { left: number; top: number; x: number; y: number }

/** Scroll position that keeps the grabbed point under the pointer */
export function panScroll(origin: PanOrigin, x: number, y: number): { left: number; top: number } {
  return { left: origin.left - (x - origin.x), top: origin.top - (y - origin.y) }
}

export function pastSlop(origin: PanOrigin, x: number, y: number): boolean {
  return Math.abs(x - origin.x) > PAN_CLICK_SLOP || Math.abs(y - origin.y) > PAN_CLICK_SLOP
}

/**
 * Pans `scrollRef`'s element by dragging. Listens on the document in the
 * capture phase so it works whenever the pane is mounted, and stops a pan press
 * there so page handlers (text selection, placement tools) never see it. A
 * click that ends a real drag is swallowed; a press without travel still clicks
 * (links follow under the hand tool).
 */
export function usePanDrag(scrollRef: RefObject<HTMLElement | null>, handTool: boolean): void {
  const handRef = useRef(handTool)
  handRef.current = handTool

  useEffect(() => {
    let drag: (PanOrigin & { id: number; moved: boolean }) | null = null
    let swallowClick = false

    const end = () => {
      if (!drag) return
      const el = scrollRef.current
      if (el) {
        delete el.dataset.panning
        if (el.hasPointerCapture(drag.id)) el.releasePointerCapture(drag.id)
      }
      if (drag.moved) {
        swallowClick = true
        // the click (if any) is dispatched right after pointerup
        setTimeout(() => (swallowClick = false), 0)
      }
      drag = null
    }

    const down = (e: PointerEvent) => {
      const el = scrollRef.current
      if (drag || !el || e.pointerType === 'touch') return
      const target = e.target as Element | null
      if (!target || !el.contains(target)) return
      if (
        target === el &&
        onPaneScrollbar(
          el.getBoundingClientRect(),
          el.clientWidth,
          el.clientHeight,
          e.clientX,
          e.clientY,
        )
      )
        return
      if (!startsPan(e.button, handRef.current, target)) return
      // no text selection, no middle-click autoscroll, no page handler
      e.preventDefault()
      e.stopPropagation()
      drag = {
        id: e.pointerId,
        left: el.scrollLeft,
        top: el.scrollTop,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      }
      el.dataset.panning = ''
      el.setPointerCapture(e.pointerId)
    }

    const move = (e: PointerEvent) => {
      const el = scrollRef.current
      if (!drag || e.pointerId !== drag.id || !el) return
      e.preventDefault()
      if (!drag.moved && pastSlop(drag, e.clientX, e.clientY)) drag.moved = true
      const next = panScroll(drag, e.clientX, e.clientY)
      el.scrollLeft = next.left
      el.scrollTop = next.top
    }

    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) end()
    }

    const swallow = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    // a cancelled pointerdown still sends mousedown's default on some
    // platforms (middle-button autoscroll, Linux primary paste)
    const mouseDown = (e: MouseEvent) => {
      if (drag) e.preventDefault()
    }

    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    document.addEventListener('lostpointercapture', up, true)
    document.addEventListener('mousedown', mouseDown, true)
    document.addEventListener('click', swallow, true)
    document.addEventListener('auxclick', swallow, true)
    window.addEventListener('blur', end)
    return () => {
      end()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
      document.removeEventListener('lostpointercapture', up, true)
      document.removeEventListener('mousedown', mouseDown, true)
      document.removeEventListener('click', swallow, true)
      document.removeEventListener('auxclick', swallow, true)
      window.removeEventListener('blur', end)
    }
  }, [scrollRef])
}
