import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { NoteSuggestState } from '../editor/internalLinks'
import { useI18n } from '../i18n/locale'

export interface NoteLinkMenuHandle {
  handleKey(event: KeyboardEvent): boolean
}

interface Props {
  state: NoteSuggestState | null
  onDismiss: () => void
}

/** the `[[` completion list: notes of the vault, folder shown beside the name */
export const NoteLinkMenu = forwardRef<NoteLinkMenuHandle, Props>(function NoteLinkMenu(
  { state, onDismiss },
  ref,
) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)

  const count = state?.items.length ?? 0

  useEffect(() => {
    setIndex(0)
  }, [state?.items])

  useImperativeHandle(
    ref,
    () => ({
      handleKey(event: KeyboardEvent): boolean {
        if (!state) return false
        if (event.key === 'ArrowDown') {
          setIndex((i) => (count === 0 ? 0 : (i + 1) % count))
          return true
        }
        if (event.key === 'ArrowUp') {
          setIndex((i) => (count === 0 ? 0 : (i - 1 + count) % count))
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = state.items[index]
          if (!item) return false
          state.command(item)
          return true
        }
        if (event.key === 'Escape') {
          onDismiss()
          return true
        }
        return false
      },
    }),
    [state, index, count, onDismiss],
  )

  if (!state || !state.clientRect) return null
  const rect = state.clientRect

  return (
    <div
      className="slash-menu note-link-menu"
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {state.items.length === 0 ? (
        <div className="slash-empty">{t('noteLinkNoResults')}</div>
      ) : (
        state.items.map((item, i) => (
          <button
            key={item.insert}
            type="button"
            className={`slash-item${i === index ? ' active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => state.command(item)}
          >
            <span className="note-link-name">{item.name}</span>
            {item.folder ? <span className="note-link-folder">{item.folder}</span> : null}
          </button>
        ))
      )}
    </div>
  )
})
