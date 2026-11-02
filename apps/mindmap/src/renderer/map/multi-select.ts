/**
 * Picking more than one topic with the mouse.
 *
 * The library adds a topic to the selection on Ctrl+click (Cmd+click on a
 * Mac) and by dragging a box over empty space. This adds two more ways that
 * do the same: a click while Shift is held, and a click while Tab is held.
 *
 * Tab on its own adds a topic below the selected one, and the library does
 * that the moment the key goes down. So while the map has the focus, Tab is
 * held back here: when it comes up again and no topic was clicked in between,
 * the topic is added then, as before. When a topic was clicked while it was
 * held, the key only picked topics. Holding it does not add one topic per
 * repeat any more.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'

export interface MultiSelectOptions {
  mind: MindElixirInstance
  /** what Tab does when it was not used to pick topics: a new topic below the selected one */
  addChild(): void
}

/** Puts the two gestures on the map. Returns what takes them off again. */
export function installMultiSelect({ mind, addChild }: MultiSelectOptions): () => void {
  const container = mind.container
  /** Tab is down, and whether a topic was clicked since it went down */
  let tab: { picked: boolean } | null = null
  /** the pointer whose press this took: its release is not the library's either */
  let taken: number | null = null

  const typing = (event: Event): boolean =>
    event.target instanceof Element && event.target.closest('#input-box') !== null

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || typing(event)) return
    // with a modifier it is not this key's plain meaning; the library has nothing on those either
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    tab ??= { picked: false }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !tab) return
    const { picked } = tab
    tab = null
    if (!picked && !typing(event)) addChild()
  }

  // the key came up somewhere else: it neither picked nor adds anything
  const onBlur = (): void => {
    tab = null
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || !mind.editable) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (!tab && !event.shiftKey) return
    const target = event.target instanceof Element ? event.target : null
    const topic = target?.closest('me-tpc') as Topic | null
    if (!topic?.nodeObj || target?.closest('me-epd')) return
    event.preventDefault()
    event.stopPropagation()
    taken = event.pointerId
    if (tab) tab.picked = true
    toggle(mind, topic)
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (taken === null || event.pointerId !== taken) return
    taken = null
    // the library's release would read the two presses as a double click and start typing
    event.stopPropagation()
  }

  container.addEventListener('keydown', onKeyDown, true)
  container.addEventListener('keyup', onKeyUp, true)
  container.addEventListener('blur', onBlur)
  container.addEventListener('pointerdown', onPointerDown, true)
  container.addEventListener('pointerup', onPointerUp, true)
  return () => {
    container.removeEventListener('keydown', onKeyDown, true)
    container.removeEventListener('keyup', onKeyUp, true)
    container.removeEventListener('blur', onBlur)
    container.removeEventListener('pointerdown', onPointerDown, true)
    container.removeEventListener('pointerup', onPointerUp, true)
  }
}

/** Adds the topic to the selection, or takes it out when it is in. As Ctrl+click does. */
function toggle(mind: MindElixirInstance, topic: Topic): void {
  if ((mind.currentNodes ?? []).includes(topic)) {
    mind.unselectNodes([topic])
    return
  }
  // a selected summary or relationship is not something topics are added to
  if (mind.currentArrow || mind.currentSummary) mind.clearSelection()
  mind.selectNodes([topic])
}
