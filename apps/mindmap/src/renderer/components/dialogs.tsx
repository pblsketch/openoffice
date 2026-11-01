/**
 * The editor's small dialogs: a yes/no question, and the editors for a
 * topic's labels, note and link. Everything a file or the user wrote is drawn
 * as text.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { linkFromInput, type LinkInputKind } from '../document/link-input'
import { previewableLink } from '../map/link-preview'
import { type StringKey, useI18n } from '../i18n/locale'

function Modal(p: { title: string; onCancel(): void; children: ReactNode; kind: string }) {
  return (
    <div
      className="mm-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) p.onCancel()
      }}
    >
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        data-dialog={p.kind}
        onKeyDown={(e) => {
          // keys typed here are not shortcuts of the map behind
          e.stopPropagation()
          if (e.key === 'Escape') p.onCancel()
        }}
      >
        <h2 className="mm-modal-title">{p.title}</h2>
        {p.children}
      </div>
    </div>
  )
}

export interface ConfirmRequest {
  kind: 'delete-sheet' | 'delete-hidden'
  title: string
  body: string
  confirmLabel: string
}

/** A question with a destructive answer. Cancel is the default: Enter does not delete. */
export function ConfirmDialog(p: { request: ConfirmRequest; onAnswer(ok: boolean): void }) {
  const { t } = useI18n()
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  return (
    <Modal title={p.request.title} kind={p.request.kind} onCancel={() => p.onAnswer(false)}>
      <p className="mm-modal-body">{p.request.body}</p>
      <div className="mm-modal-actions">
        <button
          ref={cancel}
          type="button"
          className="mm-btn"
          data-action="confirm-cancel"
          onClick={() => p.onAnswer(false)}
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          className="mm-btn danger"
          data-action="confirm-ok"
          onClick={() => p.onAnswer(true)}
        >
          {p.request.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export type TopicField = 'label' | 'note' | 'link'

export interface TopicFieldRequest {
  field: TopicField
  topicId: string
  /** the value as it is now: labels joined by ", ", the note, or the link */
  value: string
}

/**
 * Edits one field of a topic. `onSubmit` answers whether the value was taken.
 * An empty value removes the field.
 *
 * A link is shown as it is in the file, whatever it is. While the address in
 * the field is one that will be kept but never opened, the dialog says so
 * before it is stored; an address in the form of a reference into the file is
 * turned down, and the dialog says why.
 *
 * For a web address the dialog offers to fetch the page's picture and title
 * (decision 0099). The box says that pressing OK reaches the site; nothing is
 * fetched unless it is ticked.
 */
export function TopicFieldDialog(p: {
  request: TopicFieldRequest
  onSubmit(value: string, options?: { preview: boolean }): boolean
  /** for a link: whether the address in the field would be opened, only kept, or not taken */
  linkKind?(value: string): LinkInputKind
  /** for a link: whether "fetch a preview" starts ticked */
  previewDefault?: boolean
  onClose(): void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(p.request.value)
  const [refused, setRefused] = useState(false)
  const [preview, setPreview] = useState(p.previewDefault ?? false)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  const { field: kind } = p.request
  const title = kind === 'label' ? t('tbLabel') : kind === 'note' ? t('tbNote') : t('tbLink')
  const linkKind = kind === 'link' ? (p.linkKind?.(value) ?? 'opens') : 'opens'
  const hintKey: StringKey =
    kind === 'label'
      ? 'labelHint'
      : refused || linkKind === 'internal'
        ? 'linkInternal'
        : linkKind === 'kept'
          ? 'linkWontOpen'
          : 'linkHint'
  const hintTone = refused ? ' error' : hintKey === 'linkWontOpen' ? ' warn' : ''
  // offered only for an address that would be opened as a web page
  const offersPreview =
    kind === 'link' && linkKind === 'opens' && previewableLink(linkFromInput(value) ?? '')
  const submit = (next: string): void => {
    const options = offersPreview && next !== '' ? { preview } : undefined
    if (p.onSubmit(next, options)) p.onClose()
    else setRefused(true)
  }
  const shared = {
    ref: field,
    className: 'mm-field',
    value,
    'aria-label': title,
    'aria-invalid': refused || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(e.target.value)
      setRefused(false)
    },
  }
  return (
    <Modal title={title} kind={`topic-${kind}`} onCancel={p.onClose}>
      {kind === 'note' ? (
        <textarea {...shared} rows={6} />
      ) : (
        <input
          {...shared}
          type="text"
          spellCheck={false}
          placeholder={kind === 'link' ? 'https://' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(value)
          }}
        />
      )}
      {kind !== 'note' && (
        <p
          className={`mm-modal-hint${hintTone}`}
          data-link-kind={kind === 'link' ? linkKind : undefined}
          role={hintTone === '' ? undefined : 'alert'}
        >
          {t(hintKey)}
        </p>
      )}
      {offersPreview && (
        <label className="mm-modal-check" data-option="link-preview">
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
          <span>
            {t('linkPreviewOption')}
            <span className="mm-modal-check-note">{t('linkPreviewNote')}</span>
          </span>
        </label>
      )}
      <div className="mm-modal-actions">
        {p.request.value !== '' && (
          <button
            type="button"
            className="mm-btn mm-btn-start"
            data-action="field-remove"
            onClick={() => submit('')}
          >
            {t('btnRemove')}
          </button>
        )}
        <button type="button" className="mm-btn" data-action="field-cancel" onClick={p.onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="mm-btn primary"
          data-action="field-ok"
          onClick={() => submit(value)}
        >
          {t('btnOk')}
        </button>
      </div>
    </Modal>
  )
}

/** One line told once after a file opened; the user closes it. */
export function Notice(p: { kind: string; text: string; onClose(): void }) {
  const { t } = useI18n()
  return (
    <div className="mm-notice" role="status" data-notice={p.kind}>
      <span className="mm-notice-text">{p.text}</span>
      <button
        type="button"
        className="mm-notice-close"
        data-action="notice-close"
        onClick={p.onClose}
      >
        {t('btnClose')}
      </button>
    </div>
  )
}
