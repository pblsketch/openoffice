/**
 * The note panel beside the map: the note of the topic that is selected,
 * edited in place instead of in a modal.
 *
 * A note is part of the map like a title, so it goes into the map's own
 * history. Typing does not write on every keystroke: the draft is committed
 * as one step when the field loses focus, the selection moves, the panel
 * closes, or the map is saved. So each commit is one undo step and saving
 * never races the text still in the box.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { TopicInfo } from '../map/controller'
import { useI18n } from '../i18n/locale'
import { IconClose } from './icons'

export interface NotePanelHandle {
  /** put a pending draft into the map (a save, a sheet switch, closing) */
  commit(): void
  focus(): void
}

export interface NotePanelProps {
  /** the sheet the selection belongs to */
  sheetKey: string
  /** the last selected topic, or null when nothing is selected */
  topic: TopicInfo | null
  onCommit(topicId: string, note: string): void
  onClose(): void
}

interface Draft {
  sheetKey: string
  id: string
  /** the note the map held when the draft began, or the last value committed */
  saved: string
  value: string
  /** the commit of the render the draft belongs to (its sheet's controller) */
  commit: (topicId: string, note: string) => void
}

export const NotePanel = forwardRef<NotePanelHandle, NotePanelProps>(function NotePanel(
  { sheetKey, topic, onCommit, onClose },
  ref,
) {
  const { t } = useI18n()
  const field = useRef<HTMLTextAreaElement>(null)
  const draft = useRef<Draft | null>(null)
  const [value, setValue] = useState(topic?.note ?? '')

  const start = useCallback(
    (next: TopicInfo | null) => {
      draft.current = next
        ? {
            sheetKey,
            id: next.id,
            saved: next.note ?? '',
            value: next.note ?? '',
            commit: onCommit,
          }
        : null
      setValue(next?.note ?? '')
    },
    [onCommit, sheetKey],
  )

  const commit = useCallback(() => {
    const current = draft.current
    if (!current || current.value === current.saved) return
    current.commit(current.id, current.value)
    current.saved = current.value
  }, [])

  useImperativeHandle(ref, () => ({ commit, focus: () => field.current?.focus() }), [commit])

  useEffect(() => {
    field.current?.focus()
  }, [])

  // A draft belongs to one topic of one sheet. Moving the selection or the
  // sheet puts it into the map before the box starts showing the next note.
  useEffect(() => {
    const current = draft.current
    const moved = !current || current.sheetKey !== sheetKey || current.id !== (topic?.id ?? null)
    if (moved) {
      commit()
      start(topic)
      return
    }
    current.commit = onCommit
    if (!topic) return
    const incoming = topic.note ?? ''
    // A change made elsewhere (undo, the AI, the map's own dialog) wins while
    // nothing is being typed here.
    if (current.value === current.saved && incoming !== current.saved) {
      current.saved = incoming
      current.value = incoming
      setValue(incoming)
    }
  }, [sheetKey, topic, onCommit, commit, start])

  // Whatever closes the panel — the close button, a sheet switch, the tab —
  // leaves a pending draft in the map rather than dropping it.
  useEffect(
    () => () => {
      const current = draft.current
      if (current && current.value !== current.saved) current.commit(current.id, current.value)
    },
    [],
  )

  const take = (next: string): void => {
    setValue(next)
    if (draft.current) draft.current.value = next
  }

  return (
    <aside className="mm-note-panel" aria-label={t('tbNote')} data-note-panel>
      <header className="mm-note-head">
        <h2 className="mm-note-title">{t('tbNote')}</h2>
        <button
          type="button"
          className="mm-note-close"
          data-action="note-close"
          aria-label={t('btnClose')}
          data-tip={t('btnClose')}
          onClick={() => {
            commit()
            onClose()
          }}
        >
          <IconClose />
        </button>
      </header>
      {topic ? (
        <div className="mm-note-body">
          <div className="mm-note-topic" title={topic.title}>
            {topic.title}
          </div>
          <textarea
            ref={field}
            className="mm-note-field"
            data-action="note-field"
            value={value}
            aria-label={`${t('tbNote')}: ${topic.title}`}
            placeholder={t('notePlaceholder')}
            onChange={(e) => take(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // keys typed here are not shortcuts of the map behind
              e.stopPropagation()
              if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                commit()
                onClose()
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                commit()
              }
            }}
          />
          <p className="mm-note-hint">{t('notePanelHint')}</p>
        </div>
      ) : (
        <p className="mm-note-empty">{t('notePanelNoTopic')}</p>
      )}
    </aside>
  )
})
