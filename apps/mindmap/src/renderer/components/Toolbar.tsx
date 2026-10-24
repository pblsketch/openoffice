/**
 * The top of the editor: the quick-access row (save, undo, redo, auto save)
 * and one thin row of icon buttons for the map.
 *
 * Buttons are grouped as the editor's layout says, left to right:
 * topics | relationship, summary, note, label, link | layout, theme, fold |
 * zoom, export | "make another document from this one" | AI at the far end.
 * A group or button whose function is not built yet is not drawn; its place is
 * marked below so it lands where it belongs. The theme button opens and closes
 * the theme panel beside the map.
 */
import { AiMark, aiSubscriptionText, Dropdown, type DropdownOption } from '@genoffice/ui'
import type { ViewLayout } from '@genoffice/xmind-engine'
import { useI18n } from '../i18n/locale'
import type { ExportFormat } from '../../shared/ipc'
import { ExportMenu } from './ExportMenu'
import {
  IconChild,
  IconFit,
  IconFoldAll,
  IconLabel,
  IconLayout,
  IconLink,
  IconMakeFrom,
  IconNote,
  IconRedo,
  IconRelationship,
  IconSave,
  IconSibling,
  IconSummary,
  IconTheme,
  IconUndo,
  IconUnfoldAll,
  IconZoomIn,
  IconZoomOut,
} from './icons'

export interface ToolbarProps {
  disabled: boolean
  dirty: boolean
  /** what the status line says about saving */
  statusText: string
  canUndo: boolean
  canRedo: boolean
  autoSave: boolean
  /** a topic is selected: the topic tools apply */
  hasTopic: boolean
  layout: ViewLayout
  /** false while the layout shown stands in for one the editor cannot draw */
  layoutExact: boolean
  pickingRelationship: boolean
  /** the theme panel is open */
  themeOpen: boolean
  /** the note panel is open */
  noteOpen: boolean
  /** the AI panel is open */
  aiOpen: boolean
  onSave(): void
  onSaveAs(): void
  onUndo(): void
  onRedo(): void
  onToggleAutoSave(on: boolean): void
  onAddChild(): void
  onAddSibling(): void
  onRelationship(): void
  onSummary(): void
  onNote(): void
  onLabel(): void
  onLink(): void
  onLayout(layout: ViewLayout): void
  onToggleTheme(): void
  onFoldAll(): void
  onUnfoldAll(): void
  onZoomIn(): void
  onZoomOut(): void
  onZoomFit(): void
  onToggleAi(): void
  onExport(format: ExportFormat): void
  /** "make another document from this one": the shell's make window with this map */
  onMakeFromDocument(): void
}

export function Toolbar(p: ToolbarProps) {
  const { lang, t } = useI18n()
  const layouts: DropdownOption<ViewLayout>[] = [
    { value: 'right', label: t('layoutRight') },
    { value: 'left', label: t('layoutLeft') },
    { value: 'both', label: t('layoutBoth') },
    { value: 'down', label: t('layoutDown') },
  ]
  const topicOff = p.disabled || !p.hasTopic
  return (
    <header className="ribbon">
      <div className="ribbon-tabs">
        <button
          type="button"
          className="qa-btn"
          data-action="save"
          data-tip={t('save')}
          aria-label={t('save')}
          disabled={p.disabled}
          onClick={p.onSave}
        >
          <IconSave />
        </button>
        <button
          type="button"
          className="qa-btn qa-save-as"
          data-action="save-as"
          disabled={p.disabled}
          onClick={p.onSaveAs}
        >
          {t('saveAs')}
        </button>
        <button
          type="button"
          className="qa-btn"
          data-action="undo"
          data-tip={t('undo')}
          aria-label={t('undo')}
          disabled={p.disabled || !p.canUndo}
          onClick={p.onUndo}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="qa-btn"
          data-action="redo"
          data-tip={t('redo')}
          aria-label={t('redo')}
          disabled={p.disabled || !p.canRedo}
          onClick={p.onRedo}
        >
          <IconRedo />
        </button>
        <label className={`autosave-toggle${p.autoSave ? ' on' : ''}`} data-tip={t('autoSaveTip')}>
          <span className="autosave-knob" />
          <span className="autosave-text">{t('autoSave')}</span>
          <input
            type="checkbox"
            checked={p.autoSave}
            onChange={(e) => p.onToggleAutoSave(e.target.checked)}
          />
        </label>
        <span className="mm-save-status" data-dirty={p.dirty ? 'true' : 'false'} aria-live="polite">
          {p.statusText}
        </span>
      </div>

      <div className="ribbon-body mm-tools" role="toolbar" aria-label={t('appName')}>
        <div className="ribbon-group">
          <div className="ribbon-group-items">
            <ToolButton
              action="add-child"
              label={t('tbAddChild')}
              kbd="Tab"
              disabled={topicOff}
              onClick={p.onAddChild}
            >
              <IconChild />
            </ToolButton>
            <ToolButton
              action="add-sibling"
              label={t('tbAddSibling')}
              kbd="Enter"
              disabled={topicOff}
              onClick={p.onAddSibling}
            >
              <IconSibling />
            </ToolButton>
          </div>
        </div>
        <span className="rb-sep" />
        <div className="ribbon-group">
          <div className="ribbon-group-items">
            <ToolButton
              action="relationship"
              label={t('tbRelationship')}
              active={p.pickingRelationship}
              disabled={topicOff}
              onClick={p.onRelationship}
            >
              <IconRelationship />
            </ToolButton>
            <ToolButton
              action="summary"
              label={t('tbSummary')}
              disabled={topicOff}
              onClick={p.onSummary}
            >
              <IconSummary />
            </ToolButton>
            <ToolButton
              action="note"
              label={t('tbNote')}
              active={p.noteOpen}
              disabled={topicOff}
              onClick={p.onNote}
            >
              <IconNote />
            </ToolButton>
            <ToolButton action="label" label={t('tbLabel')} disabled={topicOff} onClick={p.onLabel}>
              <IconLabel />
            </ToolButton>
            <ToolButton action="link" label={t('tbLink')} disabled={topicOff} onClick={p.onLink}>
              <IconLink />
            </ToolButton>
          </div>
        </div>
        <span className="rb-sep" />
        <div className="ribbon-group">
          <div className="ribbon-group-items">
            <span
              className="mm-layout"
              data-exact={p.layoutExact ? 'true' : 'false'}
              data-tip={p.layoutExact ? t('tbLayout') : t('layoutStandIn')}
            >
              <IconLayout />
              <Dropdown
                className="mm-layout-pick"
                value={p.layout}
                options={layouts}
                onPick={p.onLayout}
                ariaLabel={t('tbLayout')}
                disabled={p.disabled}
              />
            </span>
            <ToolButton
              action="theme"
              label={t('tbTheme')}
              active={p.themeOpen}
              disabled={p.disabled}
              onClick={p.onToggleTheme}
            >
              <IconTheme />
            </ToolButton>
            <ToolButton
              action="fold-all"
              label={t('tbFoldAll')}
              disabled={p.disabled}
              onClick={p.onFoldAll}
            >
              <IconFoldAll />
            </ToolButton>
            <ToolButton
              action="unfold-all"
              label={t('tbUnfoldAll')}
              disabled={p.disabled}
              onClick={p.onUnfoldAll}
            >
              <IconUnfoldAll />
            </ToolButton>
          </div>
        </div>
        <span className="rb-sep" />
        <div className="ribbon-group">
          <div className="ribbon-group-items">
            <ToolButton
              action="zoom-out"
              label={t('zoomOut')}
              disabled={p.disabled}
              onClick={p.onZoomOut}
            >
              <IconZoomOut />
            </ToolButton>
            <ToolButton
              action="zoom-in"
              label={t('zoomIn')}
              disabled={p.disabled}
              onClick={p.onZoomIn}
            >
              <IconZoomIn />
            </ToolButton>
            <ToolButton
              action="zoom-fit"
              label={t('zoomFit')}
              disabled={p.disabled}
              onClick={p.onZoomFit}
            >
              <IconFit />
            </ToolButton>
            <ExportMenu disabled={p.disabled} onExport={p.onExport} />
          </div>
        </div>
        {/* "make another document from this one", after its own separator */}
        <span className="rb-sep" />
        <div className="ribbon-group">
          <div className="ribbon-group-items">
            <ToolButton
              action="make-from-document"
              label={t('tbMakeFromDocument')}
              disabled={p.disabled}
              onClick={p.onMakeFromDocument}
            >
              <IconMakeFrom />
            </ToolButton>
          </div>
        </div>
        <span className="mm-tools-end">
          <button
            type="button"
            className={`mm-ai-entry ai-entry${p.aiOpen ? ' active' : ''}`}
            data-tip={t('aiOpenAssistant')}
            data-action="ai"
            aria-pressed={p.aiOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={p.onToggleAi}
          >
            <AiMark size={18} />
            <span>{aiSubscriptionText(lang, 'aiAssistant')}</span>
          </button>
        </span>
      </div>
    </header>
  )
}

function ToolButton(p: {
  action: string
  label: string
  kbd?: string
  active?: boolean
  disabled: boolean
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`rb-btn mm-tool${p.active ? ' active' : ''}`}
      data-action={p.action}
      data-tip={p.label}
      data-tip-kbd={p.kbd}
      aria-label={p.label}
      aria-pressed={p.active ? true : undefined}
      disabled={p.disabled}
      // the map keeps the keyboard: a button must not take the focus away from it
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  )
}
