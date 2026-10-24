/**
 * The note of each PDF (reading-assist spec 4.9), the editor's buttons:
 * "Open note" in the ribbon and the annotation panel, "Add to note" on
 * passage cards, panel items and overview sections.
 *
 * A PDF without a saved path (a new blank the person has not saved yet)
 * disables them with "Save the PDF first"; the main process refuses it as
 * well. The buttons ask again after every successful save, so a blank saved
 * with Ctrl+S gets them at once. The calls carry no path: the main process
 * uses the view's own PDF and its linked note.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PdfNoteInsertRequest, PdfNoteResult } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { noteResultNotice } from './note-requests'

/** the preload calls these buttons make (window.pdfApi) */
export interface NoteApi {
  noteOpen(request?: { title?: string }): Promise<PdfNoteResult>
  noteInsert(request: PdfNoteInsertRequest): Promise<PdfNoteResult>
  /** the view's PDF has not been saved by the person yet (a new blank) */
  noteUnsaved(): Promise<boolean>
}

export interface NoteActions {
  /** why the buttons are off ('ntSaveFirst'), null when they work */
  blocked: 'ntSaveFirst' | null
  open(): Promise<void>
  insert(request: PdfNoteInsertRequest | null): Promise<void>
}

const defaultApi = (): NoteApi | null => {
  const api = typeof window !== 'undefined' ? window.pdfApi : undefined
  return api && typeof api.noteOpen === 'function' && typeof api.noteUnsaved === 'function'
    ? api
    : null
}

export function useNoteActions(o: {
  filePath: string
  /** bumped by every successful save of the PDF: the unsaved state is asked again */
  savedRev?: number
  /** the PDF's title ('' when none): heads a note made now */
  title: string
  t: TFunc
  onNotice: (message: string) => void
  api?: NoteApi | null
}): NoteActions {
  const live = useRef(o)
  live.current = o
  const [untitled, setUntitled] = useState(false)
  const api = o.api === undefined ? defaultApi() : o.api

  useEffect(() => {
    let cancelled = false
    setUntitled(false)
    if (!o.filePath || !api) return
    void api
      .noteUnsaved()
      .then((value) => {
        if (!cancelled) setUntitled(value === true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api, o.filePath, o.savedRev])

  const blocked = !o.filePath || untitled ? 'ntSaveFirst' : null

  const report = useCallback((result: PdfNoteResult, action: 'open' | 'insert') => {
    const message = noteResultNotice(result, live.current.t, action)
    if (message) live.current.onNotice(message)
  }, [])

  const open = useCallback(async () => {
    const { t, onNotice, title } = live.current
    if (!api) {
      onNotice(t('ntUnavailable'))
      return
    }
    report(await api.noteOpen({ title }), 'open')
  }, [api, report])

  const insert = useCallback(
    async (request: PdfNoteInsertRequest | null) => {
      const { t, onNotice, title } = live.current
      if (!request) return
      if (!api) {
        onNotice(t('ntUnavailable'))
        return
      }
      report(await api.noteInsert({ ...request, ...(title ? { title } : {}) }), 'insert')
    },
    [api, report],
  )

  return { blocked, open, insert }
}

function NoteIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 11h7M9 14.5h7M9 18h4" />
    </svg>
  )
}

/** "Open note" as a ribbon button */
export function NoteOpenRibbonButton({ actions, t }: { actions: NoteActions; t: TFunc }) {
  const reason = actions.blocked ? t(actions.blocked) : null
  return (
    <button
      type="button"
      className="rb-big"
      data-action="note-open"
      data-tip={reason ?? t('ntOpenTip')}
      disabled={reason !== null}
      onClick={() => void actions.open()}
    >
      <span className="rb-big-icon">
        <NoteIcon />
      </span>
      <span>{t('ntOpen')}</span>
    </button>
  )
}

/** "Open note" as a bar in the annotation panel */
export function NoteOpenBar({ actions, t }: { actions: NoteActions; t: TFunc }) {
  const reason = actions.blocked ? t(actions.blocked) : null
  return (
    <div className="pdf-note-bar">
      <button
        type="button"
        className="pdf-modal-btn"
        data-action="note-open"
        title={reason ?? t('ntOpenTip')}
        disabled={reason !== null}
        onClick={() => void actions.open()}
      >
        {t('ntOpen')}
      </button>
      {reason && <span className="pdf-note-reason">{reason}</span>}
    </div>
  )
}

/** "Add to note" for one item; renders nothing for an item that cannot go to the note */
export function NoteInsertButton({
  actions,
  request,
  t,
  className,
}: {
  actions: NoteActions
  request: PdfNoteInsertRequest | null
  t: TFunc
  className?: string
}) {
  if (!request) return null
  const reason = actions.blocked ? t(actions.blocked) : null
  return (
    <button
      type="button"
      className={className}
      data-action="note-insert"
      title={reason ?? t('ntInsertTip')}
      disabled={reason !== null}
      onClick={() => void actions.insert(request)}
    >
      {t('ntInsert')}
    </button>
  )
}

/** several features' buttons under one item; null when none of them has any */
export function joinActions(...parts: ReactNode[]): ReactNode {
  const present = parts.filter((part) => part !== null && part !== undefined && part !== false)
  if (present.length === 0) return null
  if (present.length === 1) return present[0]
  return (
    <>
      {present.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  )
}

/** "Add to note" for an item, or null when the item cannot go to the note */
export function noteInsertAction(
  actions: NoteActions,
  request: PdfNoteInsertRequest | null,
  t: TFunc,
  className?: string,
): ReactNode {
  return request ? (
    <NoteInsertButton actions={actions} request={request} t={t} className={className} />
  ) : null
}
