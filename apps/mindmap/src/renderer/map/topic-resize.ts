/**
 * Giving a topic's box a width with the mouse.
 *
 * A selected topic has a grip on its outer edge: the right edge, or the left
 * one for a topic on the left side of the map, whose box grows to the left.
 * Dragging the grip changes the width while the mouse moves (the text wraps
 * inside, the lines follow), and letting go puts the width into the map as one
 * step of the history (`MapController.setWidth`), which the file keeps as the
 * topic's `customWidth`. A double click on the grip gives the box back the
 * width of its text. Esc or a lost pointer while dragging leaves the box as it
 * was.
 *
 * The grip is drawn by `styles.css` on the selected topic: it is editing
 * chrome, and an export never has it.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'

/** How far into the box from its edge the grip reaches, in screen pixels. */
export const GRIP_PX = 8
/** The narrowest a box is made, in map pixels: about two characters and the padding. */
export const MIN_BOX_WIDTH = 40
/** Movement below this many screen pixels is a click on the grip, not a drag. */
const DRAG_START_PX = 2

export interface TopicResizeOptions {
  mind: MindElixirInstance
  /** puts a topic's width into the map (null: the width of its text); false when nothing changed */
  setWidth(topicId: string, width: number | null): boolean
}

interface Drag {
  topic: Topic
  pointerId: number
  startX: number
  startWidth: number
  /** +1 when the grip is on the right edge, -1 on the left */
  sign: 1 | -1
  width: number
  moved: boolean
  /** the inline style the box had, to put back when the drag is called off */
  before: { width: string; maxWidth: string; overflowWrap: string }
}

/** Puts the grip on the map. Returns what takes it off again. */
export function installTopicResize({ mind, setWidth }: TopicResizeOptions): () => void {
  const container = mind.container
  let drag: Drag | null = null
  let frame = 0

  const relink = (): void => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      mind.linkDiv()
    })
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) {
      const dx = (event.clientX - drag.startX) * drag.sign
      if (!drag.moved && Math.abs(dx) < DRAG_START_PX) return
      drag.moved = true
      drag.width = Math.max(MIN_BOX_WIDTH, Math.round(drag.startWidth + dx / scaleOf(mind)))
      showWidth(drag.topic, drag.width)
      relink()
      event.stopPropagation()
      return
    }
    // the cursor tells that the edge can be dragged
    const over = event.buttons === 0 && gripAt(mind, event) !== null
    if (over) container.dataset.mmResize = 'grip'
    else if (container.dataset.mmResize !== undefined) delete container.dataset.mmResize
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !mind.editable) return
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const grip = gripAt(mind, event)
    if (!grip) return
    // the library would start moving the topic instead
    event.preventDefault()
    event.stopPropagation()
    const { style } = grip.topic
    drag = {
      topic: grip.topic,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: grip.topic.getBoundingClientRect().width / scaleOf(mind),
      sign: grip.sign,
      width: 0,
      moved: false,
      before: { width: style.width, maxWidth: style.maxWidth, overflowWrap: style.overflowWrap },
    }
    try {
      container.setPointerCapture(event.pointerId)
    } catch {
      // a pointer that cannot be held still moves over the map
    }
  }

  const end = (event: PointerEvent, keep: boolean): void => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const done = drag
    drag = null
    event.stopPropagation()
    try {
      container.releasePointerCapture(event.pointerId)
    } catch {
      // already let go
    }
    if (!done.moved) return
    if (keep && done.topic.isConnected && setWidth(done.topic.nodeObj.id, done.width)) return
    putBack(done)
    mind.linkDiv()
  }

  const onPointerUp = (event: PointerEvent): void => end(event, true)
  const onPointerCancel = (event: PointerEvent): void => end(event, false)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !drag) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const done = drag
    drag = null
    if (done.moved) {
      putBack(done)
      mind.linkDiv()
    }
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const grip = gripAt(mind, event)
    if (!grip) return
    event.preventDefault()
    event.stopPropagation()
    setWidth(grip.topic.nodeObj.id, null)
  }

  container.addEventListener('pointermove', onPointerMove, true)
  container.addEventListener('pointerdown', onPointerDown, true)
  container.addEventListener('pointerup', onPointerUp, true)
  container.addEventListener('pointercancel', onPointerCancel, true)
  container.addEventListener('keydown', onKeyDown, true)
  container.addEventListener('dblclick', onDoubleClick, true)
  return () => {
    if (frame) cancelAnimationFrame(frame)
    container.removeEventListener('pointermove', onPointerMove, true)
    container.removeEventListener('pointerdown', onPointerDown, true)
    container.removeEventListener('pointerup', onPointerUp, true)
    container.removeEventListener('pointercancel', onPointerCancel, true)
    container.removeEventListener('keydown', onKeyDown, true)
    container.removeEventListener('dblclick', onDoubleClick, true)
  }
}

/** The selected topic whose grip is under the pointer, and which way its box grows. */
export function gripAt(
  mind: MindElixirInstance,
  event: Pick<MouseEvent, 'target' | 'clientX'>,
): { topic: Topic; sign: 1 | -1 } | null {
  const target = event.target instanceof Element ? event.target : null
  const topic = target?.closest('me-tpc') as Topic | null
  if (!topic?.nodeObj || !topic.classList.contains('selected')) return null
  if (target?.closest('#input-box')) return null
  const box = topic.getBoundingClientRect()
  if (!(box.width > 0)) return null
  const sign = topic.closest('.lhs') ? -1 : 1
  const fromEdge = sign === 1 ? box.right - event.clientX : event.clientX - box.left
  // a narrow box keeps most of itself for clicks and drags
  const reach = Math.min(GRIP_PX, box.width / 4)
  return fromEdge >= 0 && fromEdge <= reach ? { topic, sign } : null
}

function showWidth(topic: Topic, width: number): void {
  topic.style.width = `${width}px`
  topic.style.maxWidth = 'none'
  topic.style.overflowWrap = 'anywhere'
}

function putBack(drag: Drag): void {
  const { style } = drag.topic
  style.width = drag.before.width
  style.maxWidth = drag.before.maxWidth
  style.overflowWrap = drag.before.overflowWrap
}

function scaleOf(mind: MindElixirInstance): number {
  const scale = mind.scaleVal
  return typeof scale === 'number' && scale > 0 ? scale : 1
}
