/**
 * The text format a person sets on topics: what the format panel, the
 * shortcuts and the AI ask for, and how that becomes the style values of a
 * topic and of the parts of its title (see `text-style.ts` in the engine).
 *
 * Two places hold a format:
 *
 * - the whole topic (`style`): bold, italic, underline, strike, colour, size,
 *   font, alignment and letter case;
 * - a part of the title (`titleRuns`): bold, italic, underline, strike and
 *   colour, set on a part of the text while the title is typed. A part may
 *   also carry a size or a font from the file; those are kept and drawn.
 *
 * A value is only written where it differs from what the topic would show
 * without it: bold on a topic its theme already draws bold is no value, and
 * neither is bold on a part of a topic that is bold as a whole. So taking a
 * format off leaves nothing behind, and a map that was formatted and then
 * unformatted saves as it was.
 *
 * Everything here is pure: values in, values out.
 */
import type { ViewRunStyle, ViewTitleRun, ViewTopicStyle } from '@genoffice/xmind-engine'
import {
  decorationValue,
  ownTextStyle,
  ownTopicStyle,
  type OwnTextStyle,
  type SafeColor,
  safeColor,
  safeFontFamily,
  type TextAlign,
  type TextTransform,
} from './style-values'

/** A change of format. Each key that is there is set; `null` takes the topic's own value off. */
export interface TextFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: SafeColor | null
  /** points */
  fontSize?: number | null
  fontFamily?: string | null
  align?: TextAlign | null
  textCase?: TextTransform | null
  /** takes every text format off the topic and its title first; the fill stays */
  clear?: true
}

/** The keys a part of a title may be given. */
export type RunFormat = Pick<TextFormat, 'bold' | 'italic' | 'underline' | 'strike' | 'color'>

export const RUN_FORMAT_KEYS = ['bold', 'italic', 'underline', 'strike', 'color'] as const

/** What a topic shows without a format of its own: its theme's weight and size for its level. */
export interface TextBase {
  fontWeight: number
  /** CSS pixels */
  fontSize: number
}

/** What a topic shows, as the format panel reads it. */
export interface ShownFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** null: the theme's colour */
  color: SafeColor | null
  /** points, rounded to a half */
  fontSize: number
  /** null: the map's own face */
  fontFamily: string | null
  align: TextAlign
  textCase: TextTransform
  /** some part of the title carries a format of its own */
  partly: boolean
}

/** Weights from this one up are drawn bold. */
const BOLD_FROM = 600
const BOLD = '700'
const REGULAR = '400'
/** Sizes a person may set, in points. */
export const FONT_SIZE_POINTS = { min: 6, max: 96 } as const
const PX_PER_PT = 96 / 72

export function isBoldWeight(weight: number): boolean {
  return weight >= BOLD_FROM
}

/** Points for CSS pixels, to the nearest half point. */
export function pointsOf(pixels: number): number {
  return Math.round((pixels / PX_PER_PT) * 2) / 2
}

/** What the topic shows. */
export function shownFormat(
  style: ViewTopicStyle | null | undefined,
  runs: readonly ViewTitleRun[] | null | undefined,
  base: TextBase,
): ShownFormat {
  const own = ownTopicStyle(style)
  return {
    bold: isBoldWeight(own.fontWeight ?? base.fontWeight),
    italic: own.italic ?? false,
    underline: own.decoration?.underline ?? false,
    strike: own.decoration?.strike ?? false,
    color: own.color,
    fontSize: pointsOf(own.fontSize ?? base.fontSize),
    fontFamily: own.fontFamily,
    align: own.textAlign ?? 'center',
    textCase: own.textTransform ?? 'none',
    partly: (runs ?? []).some((run) => Object.keys(run.style ?? {}).length > 0),
  }
}

/**
 * A topic's style and parts after a change of format for the whole topic. The
 * keys the change sets are taken off every part, so the whole title shows the
 * change; parts left without a format of their own are no parts.
 */
export function formatTopic(
  style: ViewTopicStyle,
  runs: readonly ViewTitleRun[] | null,
  format: TextFormat,
  base: TextBase,
): { style: ViewTopicStyle; titleRuns: ViewTitleRun[] | null } {
  if (format.clear) {
    const bare: ViewTopicStyle = style.fill === undefined ? {} : { fill: style.fill }
    const { clear: _clear, ...rest } = format
    return formatTopic(bare, null, rest, base)
  }
  const next: ViewTopicStyle = { ...style }
  const set = (key: keyof ViewTopicStyle, value: string | null): void => {
    if (value === null) delete next[key]
    else next[key] = value
  }
  const own = ownTopicStyle(style)
  if (format.bold !== undefined) {
    set(
      'fontWeight',
      format.bold === isBoldWeight(base.fontWeight) ? null : format.bold ? BOLD : REGULAR,
    )
  }
  if (format.italic !== undefined) set('fontStyle', format.italic ? 'italic' : null)
  if (format.underline !== undefined || format.strike !== undefined) {
    const lines = {
      underline: format.underline ?? own.decoration?.underline ?? false,
      strike: format.strike ?? own.decoration?.strike ?? false,
    }
    set('textDecoration', lines.underline || lines.strike ? decorationValue(lines) : null)
  }
  if (format.color !== undefined)
    set('color', format.color === null ? null : safeColor(format.color))
  if (format.fontSize !== undefined) {
    const points = format.fontSize === null ? null : clampPoints(format.fontSize)
    set('fontSize', points === null ? null : `${points}pt`)
  }
  if (format.fontFamily !== undefined) {
    set('fontFamily', format.fontFamily === null ? null : safeFontFamily(format.fontFamily.trim()))
  }
  if (format.align !== undefined) set('textAlign', format.align === 'center' ? null : format.align)
  if (format.textCase !== undefined) {
    set(
      'textTransform',
      format.textCase === null || format.textCase === 'none' ? null : format.textCase,
    )
  }
  const cleared = RUN_KEYS_OF.filter((entry) => entry.set(format)).flatMap((entry) => entry.keys)
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

/** Which keys of a part a change of the whole topic takes off. */
const RUN_KEYS_OF: readonly { set(format: TextFormat): boolean; keys: (keyof ViewRunStyle)[] }[] = [
  { set: (format) => format.bold !== undefined, keys: ['fontWeight'] },
  { set: (format) => format.italic !== undefined, keys: ['fontStyle'] },
  {
    set: (format) => format.underline !== undefined || format.strike !== undefined,
    keys: ['textDecoration'],
  },
  { set: (format) => format.color !== undefined, keys: ['color'] },
  { set: (format) => format.fontSize !== undefined, keys: ['fontSize'] },
  { set: (format) => format.fontFamily !== undefined, keys: ['fontFamily'] },
]

function clampPoints(points: number): number | null {
  if (!Number.isFinite(points)) return null
  const half = Math.round(points * 2) / 2
  return Math.min(FONT_SIZE_POINTS.max, Math.max(FONT_SIZE_POINTS.min, half))
}

export type FormatToggle = 'bold' | 'italic' | 'underline' | 'strike'

/**
 * The format a key toggles: Ctrl (⌘) with B, I or U, and with Shift and X for
 * the strike. Read by the key's place on the keyboard, so it works whatever
 * the input language is (a Korean layout types ㅠ on the B key).
 */
export function formatShortcut(event: KeyboardEvent): FormatToggle | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const code = event.code || `Key${event.key.toUpperCase()}`
  if (event.shiftKey) return code === 'KeyX' ? 'strike' : null
  if (code === 'KeyB') return 'bold'
  if (code === 'KeyI') return 'italic'
  if (code === 'KeyU') return 'underline'
  return null
}

/** Whether a change of format can be given to a part of a title. */
export function isRunFormat(format: TextFormat): format is RunFormat {
  return Object.keys(format).every((key) => (RUN_FORMAT_KEYS as readonly string[]).includes(key))
}

// ---- parts of a title ----

/** Parts with text, neighbours of one format joined; null when none carries a format. */
export function normaliseRuns(runs: readonly ViewTitleRun[]): ViewTitleRun[] | null {
  const out: ViewTitleRun[] = []
  for (const run of runs) {
    if (run.text === '') continue
    const last = out.at(-1)
    if (last && sameStyle(last.style, run.style)) last.text += run.text
    else out.push({ text: run.text, style: { ...run.style } })
  }
  return out.some((run) => Object.keys(run.style).length > 0) ? out : null
}

function sameStyle(a: ViewRunStyle, b: ViewRunStyle): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ViewRunStyle>
  return [...keys].every((key) => a[key] === b[key])
}

/** The title as one plain part, when it has none. */
export function runsOrPlain(runs: readonly ViewTitleRun[] | null, title: string): ViewTitleRun[] {
  return runs && runs.length > 0
    ? runs.map((run) => ({ text: run.text, style: { ...run.style } }))
    : [{ text: title, style: {} }]
}

/** What a part shows, inside a topic that shows `topic`. */
function shownPart(style: ViewRunStyle, topic: OwnTextStyle, base: TextBase) {
  const own = ownTextStyle(style)
  const lines = own.decoration ?? topic.decoration
  return {
    bold: isBoldWeight(own.fontWeight ?? topic.fontWeight ?? base.fontWeight),
    italic: own.italic ?? topic.italic ?? false,
    underline: lines?.underline ?? false,
    strike: lines?.strike ?? false,
    color: own.color ?? topic.color,
  }
}

/**
 * Whether every character from `start` to `end` shows `key` (bold, italic,
 * underline, strike). A toggle turns the format off when they all do, and on
 * otherwise. An empty range asks about the whole title.
 */
export function partsShow(
  runs: readonly ViewTitleRun[],
  start: number,
  end: number,
  key: 'bold' | 'italic' | 'underline' | 'strike',
  topicStyle: ViewTopicStyle,
  base: TextBase,
): boolean {
  const topic = ownTextStyle(topicStyle)
  const [from, to] = start === end ? [0, lengthOf(runs)] : [start, end]
  let at = 0
  let any = false
  for (const run of runs) {
    const next = at + run.text.length
    if (next > from && at < to) {
      any = true
      if (!shownPart(run.style, topic, base)[key]) return false
    }
    at = next
  }
  return any
}

/**
 * The parts after giving characters `start` to `end` a format. An empty range
 * formats the whole title. A value equal to what the topic shows there anyway
 * is not written.
 */
export function formatParts(
  runs: readonly ViewTitleRun[],
  start: number,
  end: number,
  format: RunFormat,
  topicStyle: ViewTopicStyle,
  base: TextBase,
): ViewTitleRun[] {
  const [from, to] =
    start === end ? [0, lengthOf(runs)] : [Math.min(start, end), Math.max(start, end)]
  const topic = ownTextStyle(topicStyle)
  const topicBold = isBoldWeight(topic.fontWeight ?? base.fontWeight)
  const topicLines = topic.decoration ?? { underline: false, strike: false }
  const out: ViewTitleRun[] = []
  let at = 0
  for (const run of runs) {
    const next = at + run.text.length
    const cuts = [at, Math.max(at, Math.min(next, from)), Math.max(at, Math.min(next, to)), next]
    for (let piece = 0; piece < 3; piece++) {
      const text = run.text.slice(cuts[piece]! - at, cuts[piece + 1]! - at)
      if (text === '') continue
      if (piece !== 1) {
        out.push({ text, style: { ...run.style } })
        continue
      }
      const style: ViewRunStyle = { ...run.style }
      const own = ownTextStyle(run.style)
      if (format.bold !== undefined) {
        if (format.bold === topicBold) delete style.fontWeight
        else style.fontWeight = format.bold ? BOLD : REGULAR
      }
      if (format.italic !== undefined) {
        if (format.italic === (topic.italic ?? false)) delete style.fontStyle
        else style.fontStyle = format.italic ? 'italic' : 'normal'
      }
      if (format.underline !== undefined || format.strike !== undefined) {
        const now = own.decoration ?? topicLines
        const lines = {
          underline: format.underline ?? now.underline,
          strike: format.strike ?? now.strike,
        }
        if (lines.underline === topicLines.underline && lines.strike === topicLines.strike) {
          delete style.textDecoration
        } else {
          style.textDecoration = decorationValue(lines)
        }
      }
      if (format.color !== undefined) {
        const color = format.color === null ? null : safeColor(format.color)
        if (color === null || color === topic.color) delete style.color
        else style.color = color
      }
      out.push({ text, style })
    }
    at = next
  }
  return out
}

function lengthOf(runs: readonly ViewTitleRun[]): number {
  return runs.reduce((sum, run) => sum + run.text.length, 0)
}

/**
 * The parts of a title after leading and trailing white space is cut, as the
 * edit box cuts the title it hands over. Null when the parts do not spell
 * `title` once cut.
 */
export function trimRuns(runs: readonly ViewTitleRun[], title: string): ViewTitleRun[] | null {
  const joined = runs.map((run) => run.text).join('')
  const lead = joined.length - joined.trimStart().length
  const kept = joined.trim()
  if (kept !== title) return null
  const end = lead + kept.length
  const out: ViewTitleRun[] = []
  let at = 0
  for (const run of runs) {
    const next = at + run.text.length
    const text = run.text.slice(Math.max(0, lead - at), Math.max(0, end - at))
    if (text !== '') out.push({ text, style: { ...run.style } })
    at = next
  }
  return out
}
