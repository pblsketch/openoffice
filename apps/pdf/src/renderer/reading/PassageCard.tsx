/**
 * A passage card on screen (reading-assist spec 4.2), floating beside the
 * passage it answers. Presentational: the state and the actions come from
 * PassageReading. The answer is model output and is shown as plain text only
 * (a text node, never markup).
 */
import type { ReactElement, ReactNode } from 'react'
import type { PassageCard } from '../../../../../packages/pdf-structure/src/store/reading'
import type { AskAnchorRect } from '../AiAskPopover'
import type { TFunc } from '../i18n/locale'

const WIDTH = 360
const GAP = 8
const EDGE = 8
/** below the passage when at least this much room is left, else above it */
const MIN_BELOW = 220

export type PassageNoteState = 'none' | 'pending' | 'saved'

export type PassageCardBody =
  | { kind: 'busy'; phase: 'waiting' | 'working'; notice?: ReactNode }
  /** refused for want of a connection; the prompt is absent once the gate moved on */
  | { kind: 'connect'; prompt: ReactNode }
  /** `notice`: the blocked-run notice that replaces the plain line (used-up limit, signed out, …) */
  | { kind: 'failed'; message: string; notice?: ReactNode }
  | { kind: 'card'; card: PassageCard; note: PassageNoteState }

/** fixed placement next to the passage: below it when there is room, else above */
export function cardPlacement(
  anchor: AskAnchorRect,
  viewport: { width: number; height: number },
): { left: number; top?: number; bottom?: number; maxHeight: number } {
  const left = Math.min(
    Math.max(EDGE, (anchor.left + anchor.right) / 2 - WIDTH / 2),
    Math.max(EDGE, viewport.width - WIDTH - EDGE),
  )
  const roomBelow = viewport.height - anchor.bottom - GAP - EDGE
  const roomAbove = anchor.top - GAP - EDGE
  if (roomBelow >= MIN_BELOW || roomBelow >= roomAbove) {
    return { left, top: anchor.bottom + GAP, maxHeight: Math.max(120, roomBelow) }
  }
  return {
    left,
    bottom: viewport.height - anchor.top + GAP,
    maxHeight: Math.max(120, roomAbove),
  }
}

export function PassageCardView({
  t,
  heading,
  excerpt,
  anchor,
  body,
  readOnly,
  readOnlyReason,
  extraActions,
  onCopy,
  onKeepAsNote,
  onAskInPanel,
  onRegenerate,
  onDelete,
  onClose,
}: {
  t: TFunc
  heading: string
  excerpt: string
  anchor: AskAnchorRect
  body: PassageCardBody
  readOnly: boolean
  readOnlyReason?: string
  /** the extension slot: more actions on a ready card */
  extraActions?: ReactNode
  onCopy: () => void
  onKeepAsNote: () => void
  onAskInPanel: () => void
  onRegenerate: () => void
  onDelete: () => void
  onClose: () => void
}): ReactElement {
  const place = cardPlacement(anchor, { width: window.innerWidth, height: window.innerHeight })
  const shortExcerpt = excerpt.replace(/\s+/g, ' ').trim()
  const ready = body.kind === 'card' ? body : null
  const noteTip = readOnly
    ? (readOnlyReason ?? t('roEncrypted'))
    : ready?.note === 'pending'
      ? t('rdNotePendingTip')
      : t('rdSaveAsNoteTip')
  return (
    <div
      className="pdf-passage-card"
      role="dialog"
      aria-label={t('rdCardLabel')}
      style={{
        left: place.left,
        width: WIDTH,
        maxHeight: place.maxHeight,
        ...(place.top !== undefined ? { top: place.top } : { bottom: place.bottom }),
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="pdf-passage-card-head">
        <span className="pdf-passage-card-title">{heading}</span>
        {ready?.note === 'pending' && (
          <span className="pdf-passage-card-badge" data-tip={t('rdNotePendingTip')}>
            {t('rdNotePending')}
          </span>
        )}
        {ready?.note === 'saved' && (
          <span className="pdf-passage-card-badge is-saved">{t('rdNoteSaved')}</span>
        )}
        <button
          type="button"
          className="pdf-passage-card-close"
          data-tip={t('rdClose')}
          aria-label={t('rdClose')}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {shortExcerpt && (
        <div className="pdf-passage-card-excerpt" dir="auto">
          {shortExcerpt.length > 120 ? `${shortExcerpt.slice(0, 120)}…` : shortExcerpt}
        </div>
      )}
      <div className="pdf-passage-card-body">
        {body.kind === 'busy' && (
          <>
            <div className="pdf-passage-card-status" role="status">
              {body.phase === 'waiting' ? t('rdWaiting') : t('rdWorking')}
            </div>
            {body.notice}
          </>
        )}
        {body.kind === 'connect' && (
          <>
            <div className="pdf-passage-card-status">{t('rdNeedsConnection')}</div>
            {body.prompt}
          </>
        )}
        {body.kind === 'failed' &&
          (body.notice ?? (
            <div className="pdf-passage-card-status is-error" role="alert">
              {t('rdFailed', { reason: body.message })}
            </div>
          ))}
        {ready && (
          <div className="pdf-passage-card-answer" data-passage-answer dir="auto">
            {ready.card.text}
          </div>
        )}
      </div>
      {ready && (
        <div className="pdf-passage-card-actions" data-note-state={ready.note}>
          <button type="button" data-action="copy" onClick={onCopy}>
            {t('rdCopy')}
          </button>
          <button
            type="button"
            data-action="note"
            disabled={readOnly || ready.note !== 'none'}
            data-tip={noteTip}
            onClick={onKeepAsNote}
          >
            {ready.note === 'saved' ? t('rdNoteSaved') : t('rdSaveAsNote')}
          </button>
          <button type="button" data-action="ask" onClick={onAskInPanel}>
            {t('rdAskInPanel')}
          </button>
          {extraActions}
          <button type="button" data-action="regenerate" onClick={onRegenerate}>
            {t('rdRegenerate')}
          </button>
          <button type="button" data-action="delete" data-tip={t('rdDeleteTip')} onClick={onDelete}>
            {t('rdDelete')}
          </button>
        </div>
      )}
      {(body.kind === 'failed' || (body.kind === 'connect' && !body.prompt)) && (
        <div className="pdf-passage-card-actions">
          <button type="button" data-action="regenerate" onClick={onRegenerate}>
            {t('rdRegenerate')}
          </button>
        </div>
      )}
    </div>
  )
}
