/**
 * The format panel beside the map. What it shows follows what is selected:
 *
 * - topics: the text format (font, size, bold, italic, underline, strike,
 *   colour, alignment, letter case) and the line into their branches (shape,
 *   thickness, colour, line style);
 * - a relationship: its shape, its two ends, colour, thickness, line style,
 *   and "automatic curve";
 * - a summary: the shape of its bracket;
 * - a boundary: its shape, line colour, thickness, line style and fill;
 * - nothing: a word on what to select, with the text format greyed out.
 *
 * For topics a switch at the top ("text" | "line") shows one of the two
 * groups at a time, so neither needs scrolling to; the painter and "clear
 * format" stay above it. The last choice is kept (`FORMAT_TAB_KEY`).
 *
 * It shows the values of the item in hand (the topic whose title is typed,
 * else the first selected) and sends changes to the controller, which gives
 * them to every selected item. A value the selected topics draw differently
 * reads "mixed"; a shape written in the file that cannot be picked here
 * reads "other shape" (the file keeps it). In the tree and timeline layouts
 * the shape of a branch line is the layout's, and the shape buttons are off.
 *
 * The buttons and swatches keep the focus where it is, so a title being typed
 * keeps its selection; the font and size fields take the focus, which ends the
 * typing first.
 *
 * The panel is chrome and takes the app's colours from tokens. The colour
 * swatches show map colours, which are document content.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  ColorPicker,
  colorSwatchName,
  Dropdown,
  type ColorPickerStrings,
  type DropdownOption,
} from '@genoffice/ui'
import {
  ARROW_SHAPES,
  BOUNDARY_SHAPES,
  BRANCH_LINE_SHAPES,
  LINE_PATTERNS,
  RELATIONSHIP_SHAPES,
  SUMMARY_SHAPES,
} from '@genoffice/xmind-engine'
import { type StringKey, type TFunc, useI18n } from '../i18n/locale'
import {
  FONT_SIZE_POINTS,
  type FormatToggle,
  type ShownFormat,
  type TextFormat,
} from '../map/text-format'
import type {
  ArrowShape,
  BoundaryShape,
  BranchLineShape,
  LinePattern,
  RelationshipShape,
  SummaryShape,
  TextAlign,
  TextTransform,
} from '../map/style-values'
import type {
  BoundaryStyleChange,
  BranchLineChange,
  RelationshipStyleChange,
  SummaryStyleChange,
} from '../map/line-format'
import type { PainterState } from '../map/format-painter'
import { linePatternDash } from '../map/branches'
import { fontChoices, useSystemFonts } from '../system-fonts'
import type { FormatModel, Shown, ShownColor } from './format-model'
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowEnd,
  IconBold,
  IconBoundaryShape,
  IconClose,
  IconFormatPainter,
  IconItalic,
  IconLineArrowedCurve,
  IconLineCurve,
  IconLineElbow,
  IconLineNone,
  IconLineRoundedElbow,
  IconLineStraight,
  IconLineZigzag,
  IconMinus,
  IconPlus,
  IconStrike,
  IconSummaryShape,
  IconUnderline,
} from './icons'

export interface FormatPanelProps {
  /** what is selected, and the values of its format */
  model: FormatModel
  /** the text format of the topic in hand; null when no topic is selected */
  format: ShownFormat | null
  /** a title is being typed: the toggles and the colour go to the selected characters */
  editing: boolean
  painter: PainterState
  onToggle(key: FormatToggle): void
  onFormat(format: TextFormat): void
  onBranchLine(change: BranchLineChange): void
  onRelationship(change: RelationshipStyleChange): void
  /** "automatic curve": the relationship loses the curve it was given */
  onCurveAuto(): void
  onSummary(change: SummaryStyleChange): void
  onBoundary(change: BoundaryStyleChange): void
  /** "clear format" for what is selected */
  onClear(): void
  /** the format painter's button: off → once → until let go → off */
  onPainter(): void
  onClose(): void
}

/** Which group of a topic's format the panel shows. */
export type FormatTab = 'text' | 'line'

/** Where the last choice of `FormatTab` is kept, like the app's other mindmap preferences. */
export const FORMAT_TAB_KEY = 'mindmapapp.formatTab'

function savedFormatTab(): FormatTab {
  try {
    return localStorage.getItem(FORMAT_TAB_KEY) === 'line' ? 'line' : 'text'
  } catch {
    return 'text'
  }
}

function saveFormatTab(tab: FormatTab): void {
  try {
    localStorage.setItem(FORMAT_TAB_KEY, tab)
  } catch {
    // storage off: the choice holds until the panel closes
  }
}

/** The font list's value for "the map's own face". */
const DEFAULT_FONT = ''

/** The thicknesses offered, in points; another thickness of the file is shown as it is. */
export const LINE_WIDTH_CHOICES = [1, 2, 3, 4, 6] as const

export const BRANCH_SHAPE_NAME: Readonly<Record<BranchLineShape, StringKey>> = {
  curve: 'shapeCurve',
  straight: 'shapeStraight',
  elbow: 'shapeElbow',
  roundedElbow: 'shapeRoundedElbow',
  arrowedCurve: 'shapeArrowedCurve',
  none: 'shapeNoLine',
}

export const RELATIONSHIP_SHAPE_NAME: Readonly<Record<RelationshipShape, StringKey>> = {
  curved: 'shapeCurve',
  straight: 'shapeStraight',
  angled: 'shapeElbow',
  zigzag: 'shapeZigzag',
}

export const ARROW_NAME: Readonly<Record<ArrowShape, StringKey>> = {
  none: 'arrowNone',
  normal: 'arrowNormal',
  spearhead: 'arrowSpearhead',
  triangle: 'arrowTriangle',
  dot: 'arrowDot',
  square: 'arrowSquare',
  diamond: 'arrowDiamond',
  herringbone: 'arrowHerringbone',
}

export const SUMMARY_SHAPE_NAME: Readonly<Record<SummaryShape, StringKey>> = {
  curly: 'summaryCurly',
  angle: 'summaryAngle',
  square: 'summarySquare',
  round: 'summaryRound',
  bracket: 'summaryBracket',
  sharp: 'summarySharp',
  fold: 'summaryFold',
  straight: 'summaryStraight',
}

export const BOUNDARY_SHAPE_NAME: Readonly<Record<BoundaryShape, StringKey>> = {
  rect: 'boundaryRect',
  roundedRect: 'boundaryRoundedRect',
  scallops: 'boundaryScallops',
  waves: 'boundaryWaves',
  tension: 'boundaryTension',
  polygon: 'boundaryPolygon',
  roundedPolygon: 'boundaryRoundedPolygon',
}

export const PATTERN_NAME: Readonly<Record<LinePattern, StringKey>> = {
  solid: 'patternSolid',
  dash: 'patternDash',
  dot: 'patternDot',
  'dash-dot': 'patternDashDot',
  'dash-dot-dot': 'patternDashDotDot',
  'round-dot': 'patternRoundDot',
}

const BRANCH_SHAPE_ICON: Readonly<Record<BranchLineShape, () => ReactNode>> = {
  curve: IconLineCurve,
  straight: IconLineStraight,
  elbow: IconLineElbow,
  roundedElbow: IconLineRoundedElbow,
  arrowedCurve: IconLineArrowedCurve,
  none: IconLineNone,
}

const RELATIONSHIP_SHAPE_ICON: Readonly<Record<RelationshipShape, () => ReactNode>> = {
  curved: IconLineCurve,
  straight: IconLineStraight,
  angled: IconLineElbow,
  zigzag: IconLineZigzag,
}

export function FormatPanel(p: FormatPanelProps) {
  const { t } = useI18n()
  const { model } = p
  const painter = p.painter
  const painterState = !painter.active ? 'off' : painter.sticky ? 'sticky' : 'once'
  const nothing = model.kind === 'none'
  const [tab, setTab] = useState<FormatTab>(savedFormatTab)
  // topics with a line to show get the switch; with nothing selected the text format stays greyed out
  const switched = model.kind === 'topics' && model.line !== null
  const showText =
    model.kind === 'none' || (model.kind === 'topics' && (!switched || tab === 'text'))
  const pickTab = (next: FormatTab): void => {
    setTab(next)
    saveFormatTab(next)
  }

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
      <div className="mm-theme-body" data-format-kind={model.kind}>
        {nothing && <p className="mm-theme-note">{t('formatNoTopic')}</p>}

        <div className="mm-format-actions">
          <button
            type="button"
            className={`mm-format-action${painter.active ? ' on' : ''}`}
            data-action="format-painter"
            data-painter={painterState}
            data-tip={t('formatPainterTip')}
            aria-pressed={painter.active}
            disabled={nothing && !painter.active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={p.onPainter}
          >
            <IconFormatPainter />
            <span>{t('formatPainter')}</span>
          </button>
          <button
            type="button"
            className="mm-format-action mm-format-clear"
            data-action="format-clear"
            disabled={nothing}
            onMouseDown={(event) => event.preventDefault()}
            onClick={p.onClear}
          >
            {t('formatClear')}
          </button>
        </div>
        {painter.active && (
          <p className="mm-theme-note" data-painter-note={painterState}>
            {t(painter.sticky ? 'painterSticky' : 'painterOnce')}
          </p>
        )}

        {switched && <TabSwitch tab={tab} onPick={pickTab} />}

        {showText && (
          <TextSection
            format={model.kind === 'topics' ? p.format : null}
            editing={p.editing}
            bare={switched}
            onToggle={p.onToggle}
            onFormat={p.onFormat}
          />
        )}

        {model.kind === 'topics' && model.line && tab === 'line' && (
          <Section title={t('formatLineSection')} kind="line" bare>
            <Group label={t('lineShape')}>
              {model.line.shapeLocked ? (
                <p className="mm-format-state" data-format-state="locked">
                  {t('lineShapeLocked')}
                </p>
              ) : (
                <StateNote shown={model.line.shape} />
              )}
              <ShapeGrid
                action="line-shape"
                shapes={BRANCH_LINE_SHAPES}
                current={model.line.shape}
                disabled={model.line.shapeLocked}
                name={(shape) => t(BRANCH_SHAPE_NAME[shape])}
                icon={(shape) => {
                  const Drawn = BRANCH_SHAPE_ICON[shape]
                  return <Drawn />
                }}
                onPick={(shape) => p.onBranchLine({ shape })}
              />
            </Group>
            <Group label={t('lineWidth')}>
              <WidthPick
                action="line-width"
                current={model.line.width}
                onPick={(width) => p.onBranchLine({ width })}
              />
            </Group>
            <Group label={t('lineColor')}>
              <ColorPick current={model.line.color} onPick={(color) => p.onBranchLine({ color })} />
            </Group>
            <Group label={t('linePattern')}>
              <PatternPick
                action="line-pattern"
                current={model.line.pattern}
                onPick={(pattern) => p.onBranchLine({ pattern })}
              />
            </Group>
          </Section>
        )}

        {model.kind === 'relationship' && (
          <Section title={t('formatRelationshipSection')} kind="relationship">
            <Group label={t('lineShape')}>
              <StateNote shown={model.format.shape} />
              <ShapeGrid
                action="rel-shape"
                shapes={RELATIONSHIP_SHAPES}
                current={model.format.shape}
                name={(shape) => t(RELATIONSHIP_SHAPE_NAME[shape])}
                icon={(shape) => {
                  const Drawn = RELATIONSHIP_SHAPE_ICON[shape]
                  return <Drawn />
                }}
                onPick={(shape) => p.onRelationship({ shape })}
              />
            </Group>
            <Group label={t('relBegin')}>
              <StateNote shown={model.format.begin} />
              <ShapeGrid
                action="rel-begin"
                shapes={ARROW_SHAPES}
                current={model.format.begin}
                name={(shape) => t(ARROW_NAME[shape])}
                icon={(shape) => <IconArrowEnd kind={shape} start />}
                onPick={(begin) => p.onRelationship({ begin })}
              />
            </Group>
            <Group label={t('relEnd')}>
              <StateNote shown={model.format.end} />
              <ShapeGrid
                action="rel-end"
                shapes={ARROW_SHAPES}
                current={model.format.end}
                name={(shape) => t(ARROW_NAME[shape])}
                icon={(shape) => <IconArrowEnd kind={shape} />}
                onPick={(end) => p.onRelationship({ end })}
              />
            </Group>
            <Group label={t('lineColor')}>
              <ColorPick
                current={model.format.color}
                onPick={(color) => p.onRelationship({ color })}
              />
            </Group>
            <Group label={t('lineWidth')}>
              <WidthPick
                action="rel-width"
                current={model.format.width}
                onPick={(width) => p.onRelationship({ width })}
              />
            </Group>
            <Group label={t('linePattern')}>
              <PatternPick
                action="rel-pattern"
                current={model.format.pattern}
                onPick={(pattern) => p.onRelationship({ pattern })}
              />
            </Group>
            <button
              type="button"
              className="mm-format-action"
              data-action="rel-curve-auto"
              disabled={!model.format.hasCurve}
              onMouseDown={(event) => event.preventDefault()}
              onClick={p.onCurveAuto}
            >
              {t('relCurveAuto')}
            </button>
          </Section>
        )}

        {model.kind === 'summary' && (
          <Section title={t('formatSummarySection')} kind="summary">
            <Group label={t('lineShape')}>
              <StateNote shown={model.shape} />
              <ShapeGrid
                action="summary-shape"
                shapes={SUMMARY_SHAPES}
                current={model.shape}
                name={(shape) => t(SUMMARY_SHAPE_NAME[shape])}
                icon={(shape) => <IconSummaryShape kind={shape} />}
                onPick={(shape) => p.onSummary({ shape })}
              />
            </Group>
          </Section>
        )}

        {model.kind === 'boundary' && (
          <Section title={t('formatBoundarySection')} kind="boundary">
            <Group label={t('lineShape')}>
              <StateNote shown={model.format.shape} />
              <ShapeGrid
                action="boundary-shape"
                shapes={BOUNDARY_SHAPES}
                current={model.format.shape}
                name={(shape) => t(BOUNDARY_SHAPE_NAME[shape])}
                icon={(shape) => <IconBoundaryShape kind={shape} />}
                onPick={(shape) => p.onBoundary({ shape })}
              />
            </Group>
            <Group label={t('boundaryLineColor')}>
              <ColorPick current={model.format.color} onPick={(color) => p.onBoundary({ color })} />
            </Group>
            <Group label={t('lineWidth')}>
              <WidthPick
                action="boundary-width"
                current={model.format.width}
                onPick={(width) => p.onBoundary({ width })}
              />
            </Group>
            <Group label={t('linePattern')}>
              <PatternPick
                action="boundary-pattern"
                current={model.format.pattern}
                onPick={(pattern) => p.onBoundary({ pattern })}
              />
            </Group>
            <Group label={t('boundaryFill')}>
              <button
                type="button"
                className={`mm-format-action${shownIs(model.format.fill, 'none') ? ' on' : ''}`}
                data-action="boundary-fill-none"
                aria-pressed={shownIs(model.format.fill, 'none')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => p.onBoundary({ fill: 'none' })}
              >
                {t('boundaryFillNone')}
              </button>
              <ColorPick current={model.format.fill} onPick={(fill) => p.onBoundary({ fill })} />
            </Group>
          </Section>
        )}
      </div>
    </aside>
  )
}

function shownIs<T>(shown: Shown<T>, wanted: T): boolean {
  return shown.state === 'value' && shown.value === wanted
}

/**
 * "Text" | "Line": the two groups of a topic's format, one shown at a time.
 * The buttons keep the focus where it is, like the others of the panel.
 */
function TabSwitch(p: { tab: FormatTab; onPick(tab: FormatTab): void }) {
  const { t } = useI18n()
  const tabs: { value: FormatTab; label: string }[] = [
    { value: 'text', label: t('formatTextSection') },
    { value: 'line', label: t('formatLineSection') },
  ]
  return (
    <div
      className="mm-format-tabs"
      role="group"
      aria-label={t('formatTitle')}
      data-format-tab={p.tab}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={`mm-format-tab${p.tab === tab.value ? ' on' : ''}`}
          data-action={`format-tab-${tab.value}`}
          aria-pressed={p.tab === tab.value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => p.onPick(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** The text format: today's controls, greyed out without a topic. */
function TextSection(p: {
  format: ShownFormat | null
  editing: boolean
  /** under the switch, which already names the group: no title of its own */
  bare: boolean
  onToggle(key: FormatToggle): void
  onFormat(format: TextFormat): void
}) {
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
    <Section title={t('formatTextSection')} kind="text" bare={p.bare}>
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
            strings={pickerStrings(lang, t, t('formatColorAuto'))}
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
    </Section>
  )
}

function pickerStrings(lang: Lang, t: TFunc, auto: string): ColorPickerStrings {
  return {
    auto,
    themeColors: t('formatThemeColors'),
    standardColors: t('formatStandardColors'),
    moreColors: t('formatMoreColors'),
    colorName: (swatch) => colorSwatchName(lang, swatch),
  }
}

/** A group of the panel; `bare` leaves the title to the switch above it (still read out by name). */
function Section(p: { title: string; kind: string; bare?: boolean; children: ReactNode }) {
  return (
    <section className="mm-format-section" data-format-section={p.kind} aria-label={p.title}>
      {!p.bare && <h3 className="mm-format-section-title">{p.title}</h3>}
      {p.children}
    </section>
  )
}

function Group(p: { label: string; children: ReactNode }) {
  return (
    <div className="mm-format-group">
      <h4 className="mm-theme-label">{p.label}</h4>
      {p.children}
    </div>
  )
}

/** "Mixed" or "other shape" above a choice, when the value is one of those. */
function StateNote({ shown }: { shown: Shown<unknown> }) {
  const { t } = useI18n()
  if (shown.state === 'value') return null
  return (
    <p className="mm-format-state" data-format-state={shown.state}>
      {t(shown.state === 'mixed' ? 'formatMixed' : 'formatOtherShape')}
    </p>
  )
}

/** A row of shape buttons, the one in force pressed; none is when the value is mixed or another shape. */
function ShapeGrid<T extends string>(p: {
  action: string
  shapes: readonly T[]
  current: Shown<T>
  disabled?: boolean
  name(shape: T): string
  icon(shape: T): ReactNode
  onPick(shape: T): void
}) {
  return (
    <div className="mm-format-row mm-format-shapes" role="group">
      {p.shapes.map((shape) => (
        <FormatButton
          key={shape}
          action={`${p.action}-${shape}`}
          label={p.name(shape)}
          on={shownIs(p.current, shape)}
          disabled={p.disabled ?? false}
          onClick={() => p.onPick(shape)}
        >
          {p.icon(shape)}
        </FormatButton>
      ))}
    </div>
  )
}

/** The value of a list that stands for "the selected topics differ". */
const MIXED = 'mixed'

function WidthPick(p: { action: string; current: Shown<number>; onPick(points: number): void }) {
  const { t } = useI18n()
  const points = (n: number): string => t('lineWidthPoints', { n })
  const options: DropdownOption<string>[] = LINE_WIDTH_CHOICES.map((n) => ({
    value: String(n),
    label: points(n),
  }))
  let current = MIXED
  if (p.current.state === 'value') {
    current = String(p.current.value)
    // a thickness of the file or the theme that is not offered: shown as it is
    if (!options.some((option) => option.value === current)) {
      options.unshift({ value: current, label: points(p.current.value), disabled: true })
    }
  } else {
    options.unshift({ value: MIXED, label: t('formatMixed'), disabled: true })
  }
  return (
    <Dropdown
      className={`mm-format-width ${p.action}`}
      value={current}
      options={options}
      ariaLabel={t('lineWidth')}
      onPick={(value) => p.onPick(Number(value))}
    />
  )
}

function PatternPick(p: {
  action: string
  current: Shown<LinePattern>
  onPick(pattern: LinePattern): void
}) {
  const { t } = useI18n()
  const options: DropdownOption<string>[] = LINE_PATTERNS.map((pattern) => ({
    value: pattern,
    label: t(PATTERN_NAME[pattern]),
    render: <PatternSample pattern={pattern} name={t(PATTERN_NAME[pattern])} />,
  }))
  const current = p.current.state === 'value' ? p.current.value : MIXED
  if (current === MIXED) options.unshift({ value: MIXED, label: t('formatMixed'), disabled: true })
  return (
    <Dropdown
      className={`mm-format-pattern ${p.action}`}
      value={current}
      options={options}
      ariaLabel={t('linePattern')}
      onPick={(value) => p.onPick(value as LinePattern)}
    />
  )
}

/** A short line drawn in a pattern, beside its name. */
function PatternSample({ pattern, name }: { pattern: LinePattern; name: string }) {
  const dash = linePatternDash(pattern, 1.5)
  return (
    <span className="mm-pattern-sample">
      <svg width="36" height="8" viewBox="0 0 36 8" aria-hidden="true" focusable="false">
        <path
          d="M2 4h32"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={dash?.dasharray}
          strokeLinecap={dash?.linecap ?? 'butt'}
        />
      </svg>
      <span>{name}</span>
    </span>
  )
}

/**
 * A colour from the shared palette; "automatic" takes the value off. While the
 * selected topics differ, the palette is given a value no swatch has, so
 * nothing, not even "automatic", looks chosen.
 */
function ColorPick(p: { current: ShownColor; onPick(color: string | null): void }) {
  const { lang, t } = useI18n()
  const value = p.current.state === 'value' ? p.current.value : MIXED
  return (
    <>
      <StateNote shown={p.current} />
      <div className="mm-format-colors" onMouseDown={(event) => event.preventDefault()}>
        <ColorPicker
          value={value}
          strings={pickerStrings(lang, t, t('colorAuto'))}
          onPick={(hex) => p.onPick(hex ? hex.toLowerCase() : null)}
        />
      </div>
    </>
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
