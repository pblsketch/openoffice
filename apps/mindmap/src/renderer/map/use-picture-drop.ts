/**
 * The drop zone of the map card: a picture dragged from the desktop lands on
 * the topic under the pointer (`picture-drop.ts`). While the drag is over a
 * topic that topic is marked; the mark is editing chrome, coloured in
 * `styles.css`, and is gone before the drop changes the map.
 */
import { useCallback, useEffect, useRef, type DragEvent } from 'react'
import type { StringKey } from '../i18n/locale'
import type { MapAiHost } from '../ai/map-tools'
import type { MapController } from './controller'
import {
  dragCarriesPicture,
  dropPicture,
  isPictureFile,
  topicAt,
  type PictureDropOutcome,
} from './picture-drop'

/** The class a topic carries while a picture is dragged over it. */
export const PICTURE_DROP_TARGET = 'mm-picture-drop-target'

/** The status line text of a drop that did not simply work; null for a drop that did. */
const OUTCOME_TEXT: Record<PictureDropOutcome, StringKey | null> = {
  done: null,
  'done-first-only': 'pictureDropFirstOnly',
  'no-topic': 'pictureDropNoTopic',
  'too-large': 'pictureDropTooLarge',
  unsupported: 'pictureDropUnsupported',
  failed: 'pictureDropFailed',
}

export interface PictureDropZone {
  onDragOver(event: DragEvent<HTMLElement>): void
  onDragLeave(event: DragEvent<HTMLElement>): void
  onDrop(event: DragEvent<HTMLElement>): void
}

export function usePictureDrop(options: {
  host: MapAiHost
  /** the controller of the sheet on screen */
  controller(): MapController | null
  say(key: StringKey): void
}): PictureDropZone {
  const { host, controller, say } = options
  const marked = useRef<Element | null>(null)

  const mark = useCallback((topic: Element | null) => {
    if (marked.current === topic) return
    marked.current?.classList.remove(PICTURE_DROP_TARGET)
    topic?.classList.add(PICTURE_DROP_TARGET)
    marked.current = topic
  }, [])
  useEffect(() => () => mark(null), [mark])

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!dragCarriesPicture(event.dataTransfer)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      mark(topicAt(event.target))
    },
    [mark],
  )

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      // moving between elements of the card is not leaving it
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      mark(null)
    },
    [mark],
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      mark(null)
      const pictures = Array.from(event.dataTransfer.files).filter(isPictureFile)
      // a drop without a picture (a document) is the drop-open bridge's: it opens in a tab
      if (pictures.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const under = topicAt(event.target)?.nodeObj.id ?? null
      const selected = controller()?.selectedTopicIds() ?? []
      const topicId = under ?? (selected.length === 1 ? selected[0]! : null)
      void dropPicture(host, topicId, pictures).then(
        (outcome) => {
          const text = OUTCOME_TEXT[outcome]
          if (text) say(text)
        },
        () => say('pictureDropFailed'),
      )
    },
    [host, controller, say, mark],
  )

  return { onDragOver, onDragLeave, onDrop }
}
