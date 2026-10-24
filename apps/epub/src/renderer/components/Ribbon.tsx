/**
 * The ribbon: File (save, save as), Home (the editing tools, then find) and
 * View (text size, line spacing, dark view, table of contents).
 *
 * The editing tools of Home are not part of reading; the editing screen puts
 * them in through `homeEditTools`, in front of find. Book translation puts its
 * button in through `translateTools`, after find.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Dropdown, type DropdownOption } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { EpubViewPrefs } from '../../shared/ipc'
import { FONT_SCALES, LINE_HEIGHTS } from '../reader/view-prefs'
import {
  IconLineSpacing,
  IconMoon,
  IconSave,
  IconSearch,
  IconTextLarger,
  IconTextSmaller,
  IconToc,
} from './icons'

export type RibbonTab = 'home' | 'view'

export interface RibbonProps {
  /** a book is open: the book's buttons apply */
  hasBook: boolean
  prefs: EpubViewPrefs
  searchOpen: boolean
  tocOpen: boolean
  /** the editing tools of the Home tab (the editing screen's) */
  homeEditTools?: ReactNode
  /** the book translation button of the Home tab, after find */
  translateTools?: ReactNode
  /** quick access buttons after save (the editing screen's undo, redo, auto save) */
  quickTools?: ReactNode
  /** bumped when the file menu must close (a press elsewhere, the shell chrome) */
  closeMenusSignal: number
  onSave(): void
  onSaveAs(): void
  onFind(): void
  onFontScale(scale: number): void
  onFontStep(dir: 1 | -1): void
  onLineHeight(lineHeight: number | null): void
  onToggleDark(): void
  onToggleToc(): void
}

function ToolButton(p: {
  action: string
  label: string
  kbd?: string
  active?: boolean
  disabled?: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`rb-btn epub-tool${p.active ? ' active' : ''}`}
      data-action={p.action}
      data-tip={p.label}
      data-tip-kbd={p.kbd}
      aria-label={p.label}
      aria-pressed={p.active === undefined ? undefined : p.active}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  )
}

const lineHeightValue = (value: number | null): string => (value === null ? 'book' : String(value))

export function Ribbon(p: RibbonProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<RibbonTab>('home')
  const [fileOpen, setFileOpen] = useState(false)
  const fileRef = useRef<HTMLDivElement>(null)

  useEffect(() => setFileOpen(false), [p.closeMenusSignal])
  useEffect(() => {
    if (!fileOpen) return
    const onDown = (e: MouseEvent) => {
      if (!fileRef.current?.contains(e.target as Node)) setFileOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [fileOpen])

  const lineOptions: DropdownOption[] = LINE_HEIGHTS.map((value) => ({
    value: lineHeightValue(value),
    label: value === null ? t('lineSpacingBook') : String(value),
  }))
  const scaleOptions: DropdownOption[] = FONT_SCALES.map((scale) => ({
    value: String(scale),
    label: `${Math.round(scale * 100)}%`,
  }))
  const off = !p.hasBook

  return (
    <header className="ribbon">
      <div className="ribbon-tabs">
        <div className="file-tab-wrap" ref={fileRef}>
          <button
            type="button"
            className={`ribbon-tab ribbon-tab-file${fileOpen ? ' open' : ''}`}
            data-action="file"
            aria-expanded={fileOpen}
            onClick={() => setFileOpen((v) => !v)}
          >
            {t('tabFile')}
          </button>
          {fileOpen && (
            <div className="file-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                data-action="save"
                disabled={off}
                onClick={() => {
                  setFileOpen(false)
                  p.onSave()
                }}
              >
                {t('save')} <span className="file-menu-key">Ctrl+S</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-action="save-as"
                disabled={off}
                onClick={() => {
                  setFileOpen(false)
                  p.onSaveAs()
                }}
              >
                {t('saveAs')} <span className="file-menu-key">Ctrl+Shift+S</span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="qa-btn"
          data-action="quick-save"
          data-tip={t('save')}
          aria-label={t('save')}
          disabled={off}
          onClick={p.onSave}
        >
          <IconSave />
        </button>
        {p.quickTools}
        <span className="qa-sep" />
        {(['home', 'view'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={`ribbon-tab${tab === name ? ' active' : ''}`}
            data-tab={name}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {t(name === 'home' ? 'tabHome' : 'tabView')}
          </button>
        ))}
      </div>

      <div
        className="ribbon-body"
        role="toolbar"
        aria-label={t(tab === 'home' ? 'tabHome' : 'tabView')}
      >
        {tab === 'home' ? (
          <>
            {p.homeEditTools && (
              <>
                {p.homeEditTools}
                <span className="rb-sep" />
              </>
            )}
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <ToolButton
                  action="find"
                  label={t('find')}
                  kbd="Ctrl+F"
                  active={p.searchOpen}
                  disabled={off}
                  onClick={p.onFind}
                >
                  <IconSearch />
                  <span className="epub-tool-text">{t('find')}</span>
                </ToolButton>
              </div>
            </div>
            {p.translateTools && (
              <>
                <span className="rb-sep" />
                {p.translateTools}
              </>
            )}
          </>
        ) : (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <ToolButton
                  action="font-smaller"
                  label={t('fontSmaller')}
                  disabled={off || p.prefs.fontScale <= FONT_SCALES[0]}
                  onClick={() => p.onFontStep(-1)}
                >
                  <IconTextSmaller />
                </ToolButton>
                <Dropdown
                  className="epub-scale-pick"
                  value={String(p.prefs.fontScale)}
                  options={
                    scaleOptions.some((o) => o.value === String(p.prefs.fontScale))
                      ? scaleOptions
                      : [
                          ...scaleOptions,
                          {
                            value: String(p.prefs.fontScale),
                            label: `${Math.round(p.prefs.fontScale * 100)}%`,
                            disabled: true,
                          },
                        ]
                  }
                  onPick={(value) => p.onFontScale(Number(value))}
                  ariaLabel={t('fontSize')}
                  disabled={off}
                />
                <ToolButton
                  action="font-larger"
                  label={t('fontLarger')}
                  disabled={off || p.prefs.fontScale >= FONT_SCALES.at(-1)!}
                  onClick={() => p.onFontStep(1)}
                >
                  <IconTextLarger />
                </ToolButton>
              </div>
            </div>
            <span className="rb-sep" />
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <span className="epub-line-spacing" data-tip={t('lineSpacing')}>
                  <IconLineSpacing />
                  <Dropdown
                    className="epub-line-pick"
                    value={lineHeightValue(p.prefs.lineHeight)}
                    options={lineOptions}
                    onPick={(value) => p.onLineHeight(value === 'book' ? null : Number(value))}
                    ariaLabel={t('lineSpacing')}
                    disabled={off}
                  />
                </span>
              </div>
            </div>
            <span className="rb-sep" />
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <ToolButton
                  action="dark-view"
                  label={t('darkView')}
                  active={p.prefs.dark}
                  disabled={off}
                  onClick={p.onToggleDark}
                >
                  <IconMoon />
                  <span className="epub-tool-text">{t('darkView')}</span>
                </ToolButton>
                <ToolButton
                  action="toc"
                  label={t('toc')}
                  active={p.tocOpen}
                  disabled={off}
                  onClick={p.onToggleToc}
                >
                  <IconToc />
                  <span className="epub-tool-text">{t('toc')}</span>
                </ToolButton>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
