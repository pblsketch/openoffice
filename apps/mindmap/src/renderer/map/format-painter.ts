/**
 * The format painter: what is taken from the item it was picked up on, and
 * how that goes onto another item of the same kind.
 *
 * A topic gives what it shows now, inherited values included: the text format
 * of the whole topic (the keys of the format panel; the format of parts of a
 * title is not taken), its fill, and its line. Those values are written onto
 * the target as its own, so it looks the same wherever it sits; this is the
 * one place where a value the theme already draws is written (decision 0101
 * otherwise leaves those out). A value the file cannot hold as it is drawn is
 * written the way the theme tables are (`wholeNumber` of the engine: whole
 * points, a half rounding down; a colour without its opacity). A property whose value on the
 * source does not pass the filter (the editor cannot draw it) is left as the
 * target has it. The text and the fill go onto the target alone, the line onto
 * the target and every topic below it (`line-format.ts`).
 *
 * A relationship, a summary or a boundary inherits nothing, so it gives the
 * values written on it: each key it has, and the taking off of each key it
 * lacks. Its curve and its title stay with it.
 *
 * Pure: values in, values out.
 */
import {
  BRANCH_LINE_CLASS_PREFIX,
  type BranchLineKey,
  lineWidthValue,
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  type TextStyleKey,
  type ThemeLook,
  type ViewBranchLine,
  type ViewTitleRun,
  type ViewTopicStyle,
  wholeNumber,
} from '@genoffice/xmind-engine'
import type { ResolvedBranchLine } from './line-resolve'
import type { StyleEdits, StyleValues } from './line-format'
import {
  decorationValue,
  ownTopicStyle,
  safeBranchLineWidth,
  safeColor,
  safeLinePattern,
} from './style-values'
import { normaliseRuns, pointsOf, type TextBase } from './text-format'

/** What the painter can be picked up on and put on. */
export type FormatKind = 'topic' | 'relationship' | 'summary' | 'boundary'

/** What the screen shows of the painter. */
export interface PainterState {
  /** a format is held and goes onto the next item pressed */
  active: boolean
  /** it stays held after it was put on, until Esc or the button again */
  sticky: boolean
  /** the kind of item it was picked up on; null when none is held */
  kind: FormatKind | null
}

export const PAINTER_OFF: PainterState = { active: false, sticky: false, kind: null }

/** What a topic gives. */
export interface TopicPaint {
  /** whole-topic text values: a string is written, null takes the key off, a key left out stays */
  text: Partial<Record<TextStyleKey, string | null>>
  /** the fill to write; left out, the target keeps its own */
  fill?: string
  /** line values for the target and every topic below it; a key left out stays */
  line: ViewBranchLine
}

/** What is known of a topic to take its format. */
export interface TopicSource {
  /** its own style values, as the file holds them */
  style: ViewTopicStyle
  /** its own line values, as the file holds them */
  line: ViewBranchLine
  /** what its theme gives its level without a format of its own */
  base: TextBase
  /** the theme's text colour and fill for it (`themeColorsAt`) */
  themeText: string
  themeFill: string | null
  /** the values its line is drawn with now (`resolveNodeLine`) */
  drawn: ResolvedBranchLine
}

/** A colour as the file's line and fill values take it: `#rrggbb`, without an opacity. */
function solidColor(value: string): string | null {
  const color = safeColor(value)
  return color === null ? null : color.slice(0, 7)
}

/** The theme's text colour and fill of a topic `depth` deep (1: the central topic) on main branch `branch`. */
export function themeColorsAt(
  look: ThemeLook,
  depth: number,
  branch: number,
): { text: string; fill: string | null } {
  if (depth <= 1) return { text: look.central.text, fill: look.central.fill }
  const colors = look.branches[branch % look.branches.length]!
  const level = depth === 2 ? colors.main : colors.sub
  return { text: level.text, fill: level.fill }
}

export function topicPaintOf(source: TopicSource): TopicPaint {
  const raw = source.style
  const own = ownTopicStyle(raw)
  /** written on the source but not drawn: the target's value stays */
  const unread = (key: keyof ViewTopicStyle, read: unknown): boolean =>
    typeof raw[key] === 'string' && read === null
  const text: TopicPaint['text'] = {}

  if (!unread('color', own.color)) {
    const color = own.color ?? safeColor(source.themeText)
    if (color !== null) text.color = color
  }
  if (!unread('fontWeight', own.fontWeight)) {
    const weight = own.fontWeight ?? source.base.fontWeight
    text.fontWeight = String(Math.min(900, Math.max(100, wholeNumber(weight / 100) * 100)))
  }
  if (!unread('fontSize', own.fontSize)) {
    text.fontSize = `${pointsOf(own.fontSize ?? source.base.fontSize)}pt`
  }
  if (!unread('fontFamily', own.fontFamily)) text.fontFamily = own.fontFamily
  if (!unread('fontStyle', own.italic)) text.fontStyle = own.italic ? 'italic' : null
  if (!unread('textDecoration', own.decoration)) {
    const lines = own.decoration
    text.textDecoration = lines && (lines.underline || lines.strike) ? decorationValue(lines) : null
  }
  if (!unread('textAlign', own.textAlign)) {
    text.textAlign = own.textAlign !== null && own.textAlign !== 'center' ? own.textAlign : null
  }
  if (!unread('textTransform', own.textTransform)) {
    text.textTransform =
      own.textTransform !== null && own.textTransform !== 'none' ? own.textTransform : null
  }

  const paint: TopicPaint = { text, line: lineOf(source) }
  if (!unread('fill', own.fill)) {
    const fill = own.fill ?? source.themeFill
    const written = fill === null || fill === 'none' ? 'none' : solidColor(fill)
    if (written !== null) paint.fill = written
  }
  return paint
}

/** The line values a topic gives: those it is drawn with, written the way the file takes them. */
function lineOf(source: TopicSource): ViewBranchLine {
  const { line, drawn } = source
  const unread = (key: BranchLineKey, read: (value: unknown) => unknown): boolean =>
    typeof line[key] === 'string' && read(line[key]) === null
  const out: ViewBranchLine = {}
  if (!unread('color', safeColor)) {
    const color = solidColor(drawn.color)
    if (color !== null) out.color = color
  }
  if (!unread('width', safeBranchLineWidth)) {
    out.width = lineWidthValue(
      Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, wholeNumber(drawn.width))),
    )
  }
  if (!unread('pattern', safeLinePattern)) out.pattern = drawn.pattern
  // a shape written on the source that is only drawn as a nearby one: the target keeps its own
  if (!drawn.shapeOther) out.shape = `${BRANCH_LINE_CLASS_PREFIX}${drawn.shape}`
  return out
}

/**
 * A topic's style and the parts of its title after the text and the fill of a
 * paint went on: the keys the paint sets or takes off go off every part too,
 * so the whole title shows them.
 */
export function paintedTopicStyle(
  style: ViewTopicStyle,
  runs: readonly ViewTitleRun[] | null,
  paint: TopicPaint,
): { style: ViewTopicStyle; titleRuns: ViewTitleRun[] | null } {
  const next: ViewTopicStyle = { ...style }
  const keys = TEXT_STYLE_KEYS.filter((key) => paint.text[key] !== undefined)
  for (const key of keys) {
    const value = paint.text[key]
    if (value === null) delete next[key]
    else if (value !== undefined) next[key] = value
  }
  if (paint.fill !== undefined) next.fill = paint.fill
  const cleared = RUN_STYLE_KEYS.filter((key) => keys.includes(key))
  const titleRuns = runs
    ? normaliseRuns(
        runs.map((run) => {
          const runStyle = { ...run.style }
          for (const key of cleared) delete runStyle[key]
          return { text: run.text, style: runStyle }
        }),
      )
    : null
  return { style: next, titleRuns }
}

/**
 * What a relationship, a summary or a boundary gives: each key it has, the
 * taking off of each one it lacks. A value of its own the engine would not
 * write is not given; the target keeps its own for that key.
 */
export function stylePaintOf<K extends string>(
  own: StyleValues<K> | null | undefined,
  names: Readonly<Record<K, string>>,
  writable: (key: K, value: string) => boolean,
): StyleEdits<K> {
  const out: StyleEdits<K> = {}
  for (const key of Object.keys(names) as K[]) {
    const value = own?.[key]
    if (value === undefined) out[key] = null
    else if (writable(key, value)) out[key] = value
  }
  return out
}
