import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useModalKeys } from '@genoffice/ui'
import iconDocx from './assets/file-docx.svg'
import iconXlsx from './assets/file-xlsx.svg'
import iconPptx from './assets/file-pptx.svg'
import iconPdf from './assets/file-pdf.svg'
import iconMd from './assets/file-md.svg'
import iconHtml from './assets/file-html.svg'
import iconMindmap from './assets/file-mindmap.svg'
import iconHwp from './assets/file-hwp.svg'
import { defaultRecoveryChoice } from '../../shared/recovery-list-api'
import type {
  RecoveryChoice,
  RecoveryListApi,
  RecoveryListEditorKind,
  RecoveryListItem,
  RecoveryListResult,
} from '../../shared/recovery-list-api'
import { recoveryListText } from './i18n/strings-recovery'
import type { RecoveryListStringKey } from './i18n/strings-recovery'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import './recovery-list.css'

// ── Launch recovery list ─────────────────────────────────
// Shown on the Home screen at launch when documents still have unsaved content
// in recovery copies. It shows the rows the main process hands it and returns
// one choice per row (or "decide later" when closed); it never reads, opens or
// deletes a copy itself. While it is up Home stays in front and no tab loads,
// so the overlay covers the tab bar too.

declare global {
  interface Window {
    /** the launch recovery list (src/preload/index.ts); absent until wired */
    aiOfficeRecovery?: RecoveryListApi
  }
}

/** the editor kind's tile, the same generic file icons as the home list */
const KIND_ICONS: Record<RecoveryListEditorKind, string> = {
  docs: iconDocx,
  sheets: iconXlsx,
  slides: iconPptx,
  pdf: iconPdf,
  markdown: iconMd,
  html: iconHtml,
  mindmap: iconMindmap,
  hwp: iconHwp,
}

/** the editor kind's name, shared with the home list's type filter */
const KIND_LABELS: Record<RecoveryListEditorKind, StringKey> = {
  docs: 'filterDocs',
  sheets: 'filterSheets',
  slides: 'filterSlides',
  pdf: 'filterPdf',
  markdown: 'filterMd',
  html: 'filterHtml',
  mindmap: 'filterMindmap',
  hwp: 'filterHwp',
}

/** every row at its starting choice: restore, except a file that changed afterwards */
export function initialRecoveryChoices(
  items: readonly RecoveryListItem[],
): Record<string, RecoveryChoice> {
  const choices: Record<string, RecoveryChoice> = {}
  for (const item of items) choices[item.id] = defaultRecoveryChoice(item)
  return choices
}

export interface RecoveryListProps {
  items: readonly RecoveryListItem[]
  /** called once with the choices, or with `dismissed` when closed without choosing */
  onSubmit: (result: RecoveryListResult) => void
  /** a result is being applied: the buttons wait */
  busy?: boolean
}

/** The list itself: shows the rows and hands back the choices */
export function RecoveryList({ items, onSubmit, busy = false }: RecoveryListProps) {
  const { lang, t, dateLocale } = useI18n()
  const text = (key: RecoveryListStringKey, params?: Record<string, string>) =>
    recoveryListText(lang, key, params)
  const [choices, setChoices] = useState(() => initialRecoveryChoices(items))
  const groupId = useId()

  const dismiss = useCallback(() => {
    if (!busy) onSubmit({ dismissed: true })
  }, [busy, onSubmit])
  const keys = useModalKeys(dismiss)

  const setAll = (choice: RecoveryChoice) => {
    const next: Record<string, RecoveryChoice> = {}
    for (const item of items) next[item.id] = choice
    setChoices(next)
  }

  const confirm = () => {
    if (busy) return
    const decisions: Record<string, RecoveryChoice> = {}
    for (const item of items) decisions[item.id] = choices[item.id] ?? defaultRecoveryChoice(item)
    onSubmit({ decisions })
  }

  const formatTime = (ms: number): string => {
    try {
      return new Date(ms).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return new Date(ms).toLocaleString()
    }
  }

  return (
    <div
      className="modal-overlay recovery-list-overlay"
      ref={keys.ref}
      onKeyDown={keys.onKeyDown}
      tabIndex={-1}
    >
      <div
        className="modal recovery-list"
        role="dialog"
        aria-modal="true"
        aria-label={text('title')}
      >
        <div className="recovery-list-head">
          <h3>{text('title')}</h3>
          <button
            type="button"
            className="recovery-list-close"
            aria-label={text('later')}
            title={text('later')}
            disabled={busy}
            onClick={dismiss}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <p className="recovery-list-intro">{text('intro')}</p>
        <ul className="recovery-list-rows">
          {items.map((item, index) => {
            const choice = choices[item.id] ?? defaultRecoveryChoice(item)
            const folder = item.untitled ? text('untitledFolder') : (item.folder ?? '')
            const name = `${groupId}-row-${index}`
            return (
              <li
                key={item.id}
                className="recovery-row"
                data-recovery-id={item.id}
                data-choice={choice}
              >
                <img
                  className="recovery-row-icon"
                  src={KIND_ICONS[item.editorKind]}
                  width={28}
                  height={28}
                  alt=""
                  aria-hidden="true"
                />
                <div className="recovery-row-main">
                  <div className="recovery-row-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="recovery-row-meta">
                    <span className="recovery-row-kind">{t(KIND_LABELS[item.editorKind])}</span>
                    {folder && (
                      <span className="recovery-row-folder" title={folder}>
                        {folder}
                      </span>
                    )}
                    <span className="recovery-row-time">
                      {text('lastCopy', { time: formatTime(item.lastCopyTime) })}
                    </span>
                  </div>
                  {item.fileChangedAfterCopy && (
                    <div className="recovery-marker recovery-marker-changed">
                      <strong>{text('changedAfter')}</strong>
                      <span>{text('changedAfterNote')}</span>
                    </div>
                  )}
                  {item.originalMissing && (
                    <div className="recovery-marker recovery-marker-missing">
                      <strong>{text('missing')}</strong>
                      <span>{text('missingNote')}</span>
                    </div>
                  )}
                </div>
                <div
                  className="recovery-choice"
                  role="radiogroup"
                  aria-label={text('choiceLabel', { name: item.name })}
                >
                  {(['restore', 'discard'] as const).map((option) => (
                    <label
                      key={option}
                      className={`recovery-choice-option recovery-choice-${option}${
                        choice === option ? ' is-selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name={name}
                        value={option}
                        checked={choice === option}
                        disabled={busy}
                        onChange={() => setChoices((prev) => ({ ...prev, [item.id]: option }))}
                      />
                      <span>{text(option)}</span>
                    </label>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="recovery-list-hint">{text('laterHint')}</p>
        <div className="modal-buttons recovery-list-buttons">
          <button
            type="button"
            className="btn btn-secondary recovery-restore-all"
            disabled={busy}
            onClick={() => setAll('restore')}
          >
            {text('restoreAll')}
          </button>
          <button
            type="button"
            className="btn btn-secondary recovery-discard-all"
            disabled={busy}
            onClick={() => setAll('discard')}
          >
            {text('discardAll')}
          </button>
          <span className="recovery-list-spacer" />
          <button
            type="button"
            className="btn btn-primary recovery-confirm"
            autoFocus
            disabled={busy}
            onClick={confirm}
          >
            {text('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Asks the main process for the launch list once and shows it when there are
 * rows. Without the bridge (older preload, tests) it shows nothing. A result
 * that fails to apply leaves the list up so it can be tried again.
 */
export function LaunchRecoveryList() {
  const [items, setItems] = useState<RecoveryListItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    const api = window.aiOfficeRecovery
    if (!api) return
    let alive = true
    api.getLaunchRecoveryList().then(
      (list) => {
        if (alive && list && list.length > 0) setItems(list)
      },
      (err: unknown) => console.warn('launch recovery list unavailable', err),
    )
    return () => {
      alive = false
    }
  }, [])

  const submit = useCallback((result: RecoveryListResult) => {
    const api = window.aiOfficeRecovery
    if (!api || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    api.submitLaunchRecovery(result).then(
      () => {
        busyRef.current = false
        setBusy(false)
        setItems(null)
      },
      (err: unknown) => {
        console.warn('launch recovery result not applied', err)
        busyRef.current = false
        setBusy(false)
      },
    )
  }, [])

  if (!items) return null
  return <RecoveryList items={items} busy={busy} onSubmit={submit} />
}
