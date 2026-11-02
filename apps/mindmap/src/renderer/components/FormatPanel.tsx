/**
 * The text format panel beside the map: font, size, bold, italic, underline,
 * strike, colour, alignment and letter case of the selected topics.
 *
 * It shows what the topic in hand shows (the one whose title is typed, else
 * the first selected) and sends changes to the controller, which gives them to
 * every selected topic, or to the selected characters while a title is typed.
 * The buttons and swatches keep the focus where it is, so a title being typed
 * keeps its selection; the font and size fields take the focus, which ends the
 * typing first.
 *
 * The panel is chrome and takes the app's colours from tokens. The colour
 * swatches show text colours, which are document content.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ColorPicker, Dropdown, type DropdownOption } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import {
  FONT_SIZE_POINTS,
  type FormatToggle,
  type ShownFormat,
  type TextFormat,
} from '../map/text-format'
import type { TextAlign, TextTransform } from '../map/style-values'
import { fontChoices, useSystemFonts } from '../system-fonts'
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconClose,
  IconItalic,
  IconMinus,
  IconPlus,
  IconStrike,
  IconUnderline,
} from './icons'

export interface FormatPanelProps {
  /** what the topic in hand shows; null when no topic is selected */
  format: ShownFormat | null
  /** a title is being typed: the toggles and the colour go to the selected characters */
  editing: boolean
  onToggle(key: FormatToggle): void
  onFormat(format: TextFormat): void
  onClose(): void
}

/** The font list's value for "the map's own face". */
const DEFAULT_FONT = ''

export function FormatPanel(p: FormatPanelProps) {
  const { lang, t } = useI18n()
  const { families } = useSystemFonts()
  const format = p.format
  const off = format === null
  const fonts: DropdownOption<string>[] = [
    { value: DEFAULT_FONT, label: t('formatFontDefault') },
    ...fontChoices(lang, families).map((family) => ({ value: family, label: family })),
  ]
  // a font the topic has that the list does not: shown as it is, so the list says the truth
  if (format?.fontFamily && !fonts.some((option) => option.value === format.fontFamily)) {
    fonts.splice(1, 0, { value: format.fontFamily, label: format.fontFamily })
  }
  const cases: DropdownOption<TextTransform>[] = [
    { value: 'none', label: t('caseNone') },
    { value: 'uppercase', label: t('caseUpper') },
    { value: 'lowercase', label: t('caseLower') },
    { value: 'capitalize', label: t('caseCapitalize') },
  ]
  const toggles: { key: FormatToggle; label: string; icon: ReactNode }[] = [
    { key: 'bold', label: t('tbBold'), icon: <IconBold /> },
    { key: 'italic', label: t('tbItalic'), icon: <IconItalic /> },
    { key: 'underline', label: t('tbUnderline'), icon: <IconUnderline /> },
    { key: 'strike', label: t('tbStrike'), icon: <IconStrike /> },
  ]
  const aligns: { value: TextAlign; label: string; icon: ReactNode }[] = [
    { value: 'left', label: t('alignLeft'), icon: <IconAlignLeft /> },
    { value: 'center', label: t('alignCenter'), icon: <IconAlignCenter /> },
    { value: 'right', label: t('alignRight'), icon: <IconAlignRight /> },
  ]

  return (
    <aside className="mm-theme-panel mm-format-panel" aria-label={t('formatTitle')}>
      <header className="mm-theme-head">
        <h2 className="mm-theme-title">{t('formatTitle')}</h2>
        <button
          type="button"
          className="mm-theme-close"
          data-action="format-close"
          aria-label={t('btnClose')}
          data-tip={t('btnClose')}
          onClick={p.onClose}
        >
          <IconClose />
        </button>
      </header>
      <div className="mm-theme-body">
        {off && <p className="mm-theme-note">{t('formatNoTopic')}</p>}
        {p.editing && <p className="mm-theme-note">{t('formatEditingNote')}</p>}

        <Group label={t('formatFont')}>
          <Dropdown
            className="mm-format-font"
            value={format?.fontFamily ?? DEFAULT_FONT}
            options={fonts}
            ariaLabel={t('formatFont')}
            disabled={off}
            onPick={(family) => p.onFormat({ fontFamily: family === DEFAULT_FONT ? null : family })}
          />
        </Group>

        <Group label={t('formatSize')}>
          <SizeField
            value={format?.fontSize ?? null}
            disabled={off}
            labels={{ down: t('formatSizeDown'), up: t('formatSizeUp'), field: t('formatSize') }}
            onSize={(fontSize) => p.onFormat({ fontSize })}
          />
        </Group>

        <Group label={t('formatStyle')}>
          <div className="mm-format-row" role="group" aria-label={t('formatStyle')}>
            {toggles.map((toggle) => (
              <FormatButton
                key={toggle.key}
                action={`format-${toggle.key}`}
                label={toggle.label}
                on={format?.[toggle.key] ?? false}
                disabled={off}
                onClick={() => p.onToggle(toggle.key)}
              >
                {toggle.icon}
              </FormatButton>
            ))}
          </div>
        </Group>

        <Group label={t('formatColor')}>
          {/* the swatches keep the focus, so a title being typed keeps its selection */}
          <div className="mm-format-colors" onMouseDown={(event) => event.preventDefault()}>
            <ColorPicker
              value={format?.color ?? null}
              strings={{
                auto: t('formatColorAuto'),
                themeColors: t('formatThemeColors'),
                standardColors: t('formatStandardColors'),
                moreColors: t('formatMoreColors'),
              }}
              onPick={(hex) => {
                if (!off) p.onFormat({ color: hex ? (hex.toLowerCase() as `#${string}`) : null })
              }}
            />
          </div>
        </Group>

        <Group label={t('formatAlign')}>
          <div className="mm-format-row" role="group" aria-label={t('formatAlign')}>
            {aligns.map((align) => (
              <FormatButton
                key={align.value}
                action={`format-align-${align.value}`}
                label={align.label}
                on={format?.align === align.value}
                disabled={off}
                onClick={() => p.onFormat({ align: align.value })}
              >
                {align.icon}
              </FormatButton>
            ))}
          </div>
        </Group>

        <Group label={t('formatCase')}>
          <Dropdown
            className="mm-format-case"
            value={format?.textCase ?? 'none'}
            options={cases}
            ariaLabel={t('formatCase')}
            disabled={off}
            onPick={(textCase) => p.onFormat({ textCase })}
          />
        </Group>

        <button
          type="button"
          className="mm-format-clear"
          data-action="format-clear"
          disabled={off}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => p.onFormat({ clear: true })}
        >
          {t('formatClear')}
        </button>
      </div>
    </aside>
  )
}

function Group(p: { label: string; children: ReactNode }) {
  return (
    <section className="mm-format-group">
      <h3 className="mm-theme-label">{p.label}</h3>
      {p.children}
    </section>
  )
}

function FormatButton(p: {
  action: string
  label: string
  on: boolean
  disabled: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`mm-format-button${p.on ? ' on' : ''}`}
      data-action={p.action}
      data-tip={p.label}
      aria-label={p.label}
      aria-pressed={p.on}
      disabled={p.disabled}
      // the focus stays in the map or in the title being typed
      onMouseDown={(event) => event.preventDefault()}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  )
}

/** The size in points: typed, or a point down and up with the buttons. */
function SizeField(p: {
  value: number | null
  disabled: boolean
  labels: { down: string; up: string; field: string }
  onSize(points: number): void
}) {
  const [draft, setDraft] = useState(p.value === null ? '' : String(p.value))
  useEffect(() => setDraft(p.value === null ? '' : String(p.value)), [p.value])
  const commit = (): void => {
    const points = Number.parseFloat(draft.replace(',', '.'))
    if (Number.isFinite(points) && points !== p.value) p.onSize(points)
    else setDraft(p.value === null ? '' : String(p.value))
  }
  const step = (by: number): void => {
    if (p.value === null) return
    p.onSize(
      Math.min(FONT_SIZE_POINTS.max, Math.max(FONT_SIZE_POINTS.min, Math.round(p.value) + by)),
    )
  }
  return (
    <div className="mm-format-row mm-format-size">
      <FormatButton
        action="format-size-down"
        label={p.labels.down}
        on={false}
        disabled={p.disabled || (p.value !== null && p.value <= FONT_SIZE_POINTS.min)}
        onClick={() => step(-1)}
      >
        <IconMinus />
      </FormatButton>
      <input
        className="mm-format-size-input"
        data-action="format-size"
        inputMode="decimal"
        aria-label={p.labels.field}
        disabled={p.disabled}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setDraft(p.value === null ? '' : String(p.value))
          }
        }}
      />
      <FormatButton
        action="format-size-up"
        label={p.labels.up}
        on={false}
        disabled={p.disabled || (p.value !== null && p.value >= FONT_SIZE_POINTS.max)}
        onClick={() => step(1)}
      >
        <IconPlus />
      </FormatButton>
    </div>
  )
}
