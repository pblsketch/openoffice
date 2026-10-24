/**
 * The editing screen's controls: undo, redo and auto save in the quick
 * access row; bold, italic and replace in the Home tab; the replace row of
 * the find pane.
 */
import type { ReactNode } from 'react'
import { useI18n } from '../i18n/locale'
import { IconBold, IconItalic, IconRedo, IconReplace, IconUndo } from './icons'

function EditButton(p: {
  action: string
  label: string
  kbd?: string
  active?: boolean
  disabled?: boolean
  className?: string
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={p.className ?? `rb-btn epub-tool${p.active ? ' active' : ''}`}
      data-action={p.action}
      data-tip={p.label}
      data-tip-kbd={p.kbd}
      aria-label={p.label}
      aria-pressed={p.active === undefined ? undefined : p.active}
      disabled={p.disabled}
      // the chapter keeps its selection while a button is pressed
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  )
}

export function EditQuickTools(p: {
  canUndo: boolean
  canRedo: boolean
  autoSave: boolean
  /** a book is open that can be saved */
  enabled: boolean
  onUndo(): void
  onRedo(): void
  onToggleAutoSave(on: boolean): void
}) {
  const { t } = useI18n()
  return (
    <>
      <EditButton
        className="qa-btn"
        action="undo"
        label={t('editUndo')}
        kbd="Ctrl+Z"
        disabled={!p.canUndo}
        onClick={p.onUndo}
      >
        <IconUndo />
      </EditButton>
      <EditButton
        className="qa-btn"
        action="redo"
        label={t('editRedo')}
        kbd="Ctrl+Y"
        disabled={!p.canRedo}
        onClick={p.onRedo}
      >
        <IconRedo />
      </EditButton>
      <label
        className={`autosave-toggle${p.autoSave ? ' on' : ''}${p.enabled ? '' : ' disabled'}`}
        data-tip={t('editAutoSaveTip')}
      >
        <span className="autosave-knob" />
        <span className="autosave-text">{t('editAutoSave')}</span>
        <input
          type="checkbox"
          data-action="auto-save"
          checked={p.autoSave}
          disabled={!p.enabled}
          onChange={(e) => p.onToggleAutoSave(e.target.checked)}
        />
      </label>
    </>
  )
}

export function EditHomeTools(p: {
  /** the chapter on screen takes edits now */
  editable: boolean
  /** replacing is possible in this book now (not fixed layout, not translating) */
  canReplace: boolean
  replaceOpen: boolean
  onBold(): void
  onItalic(): void
  onReplace(): void
}) {
  const { t } = useI18n()
  return (
    <div className="ribbon-group">
      <div className="ribbon-group-items">
        <EditButton
          action="bold"
          label={t('editBold')}
          kbd="Ctrl+B"
          disabled={!p.editable}
          onClick={p.onBold}
        >
          <IconBold />
        </EditButton>
        <EditButton
          action="italic"
          label={t('editItalic')}
          kbd="Ctrl+I"
          disabled={!p.editable}
          onClick={p.onItalic}
        >
          <IconItalic />
        </EditButton>
        <EditButton
          action="replace"
          label={t('editReplace')}
          kbd="Ctrl+H"
          active={p.replaceOpen}
          disabled={!p.canReplace}
          onClick={p.onReplace}
        >
          <IconReplace />
          <span className="epub-tool-text">{t('editReplace')}</span>
        </EditButton>
      </div>
    </div>
  )
}

/** The replace row under the find field. */
export function ReplaceRow(p: {
  value: string
  disabled: boolean
  /** a search result is listed: "Replace" has a match to work on */
  hasHits: boolean
  busy: boolean
  onChange(value: string): void
  onReplace(): void
  onReplaceAll(): void
}) {
  const { t } = useI18n()
  return (
    <div className="epub-replace-row">
      <input
        className="epub-search-input epub-replace-input"
        type="text"
        value={p.value}
        placeholder={t('editReplaceWith')}
        aria-label={t('editReplaceWith')}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            p.onReplace()
          }
        }}
      />
      <div className="epub-replace-buttons">
        <button
          type="button"
          className="epub-replace-btn"
          data-action="replace-one"
          disabled={p.disabled || p.busy || !p.hasHits}
          onClick={p.onReplace}
        >
          {t('editReplaceOne')}
        </button>
        <button
          type="button"
          className="epub-replace-btn"
          data-action="replace-all"
          disabled={p.disabled || p.busy}
          onClick={p.onReplaceAll}
        >
          {t('editReplaceAll')}
        </button>
      </div>
    </div>
  )
}
