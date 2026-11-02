/**
 * The text format of a topic: the style values set on the whole topic, and the
 * parts of its title that carry a format of their own.
 *
 * The format keeps both in the topic:
 *
 * - `style.properties`: the values for the whole topic, under the property
 *   names of the format (`fo:font-weight`, `fo:color`, …);
 * - `attributedTitle`: the title cut into parts, `[{ text, "fo:…": value }]`,
 *   beside a `title` that is the parts' text joined. The program the format
 *   comes from shows these parts when they are there, so parts that no longer
 *   spell the title would show a title from before an edit.
 *
 * Reading takes whatever strings the file holds (they reach the screen only
 * through the editor's own filter). Writing (`reconcile-tree.ts`) only ever
 * writes values of the shapes below, and only for topics the editor names.
 */

import { isRecord } from './types'

/** Text style values for the whole topic, by the property name the file uses for each. */
export const TEXT_STYLE_PROPERTIES = {
  color: 'fo:color',
  fontWeight: 'fo:font-weight',
  fontSize: 'fo:font-size',
  fontFamily: 'fo:font-family',
  fontStyle: 'fo:font-style',
  textDecoration: 'fo:text-decoration',
  textAlign: 'fo:text-align',
  textTransform: 'fo:text-transform',
} as const

export type TextStyleKey = keyof typeof TEXT_STYLE_PROPERTIES

export const TEXT_STYLE_KEYS = Object.keys(TEXT_STYLE_PROPERTIES) as TextStyleKey[]

/** What a part of a title may carry. Alignment and letter case belong to the whole topic. */
export const RUN_STYLE_KEYS = [
  'color',
  'fontWeight',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'textDecoration',
] as const satisfies readonly TextStyleKey[]

export type RunStyleKey = (typeof RUN_STYLE_KEYS)[number]

/** The format values of one part of a title, as the strings the file holds. */
export type ViewRunStyle = Partial<Record<RunStyleKey, string>>

/** One part of a title. */
export interface ViewTitleRun {
  text: string
  style: ViewRunStyle
}

/** The most parts a title is read in; a title cut finer than this is shown plain. */
export const MAX_TITLE_RUNS = 500

/**
 * The parts of a title, or null: when the topic has none, when none of them
 * carries a format, when they are not a list of parts with text, or when their
 * text does not spell `title` (the
 * parts are then from before an edit some program made, and showing them would
 * show another title).
 */
export function titleRunsToView(attributed: unknown, title: string): ViewTitleRun[] | null {
  if (!Array.isArray(attributed) || attributed.length === 0) return null
  if (attributed.length > MAX_TITLE_RUNS) return null
  const runs: ViewTitleRun[] = []
  for (const part of attributed) {
    if (!isRecord(part) || typeof part.text !== 'string') return null
    const style: ViewRunStyle = {}
    for (const key of RUN_STYLE_KEYS) {
      const value = part[TEXT_STYLE_PROPERTIES[key]]
      if (typeof value === 'string') style[key] = value
    }
    runs.push({ text: part.text, style })
  }
  if (!runs.some((run) => Object.keys(run.style).length > 0)) return null
  return runs.map((run) => run.text).join('') === title ? runs : null
}

const COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const WEIGHT = /^[1-9]00$/
const SIZE = /^(\d{1,3})(?:\.\d{1,2})?pt$/
// One name and nothing that could end it: no quotes, no list, no separators of a style, no control characters.
// eslint-disable-next-line no-control-regex -- keeping control characters out is the point here
const FAMILY = /^[^\u0000-\u001f\u007f"'`;:,{}()<>\\[\]=@/*!]{1,100}$/u

const WORDS: Readonly<Partial<Record<TextStyleKey, ReadonlySet<string>>>> = {
  fontStyle: new Set(['normal', 'italic']),
  textDecoration: new Set(['none', 'underline', 'line-through', 'underline line-through']),
  textAlign: new Set(['left', 'center', 'right']),
  textTransform: new Set(['manual', 'uppercase', 'lowercase', 'capitalize']),
}

/**
 * Whether the engine writes this value for this key. Colours are `#` and six
 * or eight hex digits, weights hundreds from 100 to 900, sizes points from 1
 * to 400, a family a plain name; the rest are the words the format uses.
 */
export function isWritableTextStyle(key: TextStyleKey, value: string): boolean {
  switch (key) {
    case 'color':
      return COLOR.test(value)
    case 'fontWeight':
      return WEIGHT.test(value)
    case 'fontSize': {
      const match = SIZE.exec(value)
      if (!match) return false
      const points = Number.parseFloat(value)
      return points >= 1 && points <= 400
    }
    case 'fontFamily':
      return FAMILY.test(value) && value.trim() === value
    default:
      return WORDS[key]?.has(value) ?? false
  }
}
