/**
 * The filter between a style value a map file holds and a style on screen.
 *
 * A map file may come from anyone, and its style values are strings the file
 * chose. None of them is ever put into a style as written. A value is read
 * here into one of two shapes, and a style gets only what this module then
 * writes out itself:
 *
 * - a colour: `#` and 3, 4, 6 or 8 hex digits, written back as `#rrggbb` or
 *   `#rrggbbaa` in lower case;
 * - a number: digits, at most one decimal point, and at most one of the units
 *   `pt` and `px`, written back as a number of CSS pixels.
 *
 * Words are taken only when they are in the short lists below, and each stands
 * for a value this app chose (`bold` is 700, `none` is "no fill", `italic`,
 * `line-through`, `center`, `uppercase`). A font name is taken only when it is
 * one plain name (no quote, comma, bracket, colon or other sign that could end
 * it), and is drawn quoted, followed by the sans-serif face. Everything
 * else (another word, a function, a list, a sentence, a sign, an exponent) is
 * no value: the answer is null and the property is drawn the way the theme
 * draws it. The file's own value is never touched by any of this.
 *
 * The same filter is for the screen, exported pictures, print and the preview
 * picture: all of them draw from `ownTopicStyle`.
 *
 * The values of a branch line go through the same shapes: a colour, a width
 * (`safeBranchLineWidth`), a pattern from the format's list, and a shape: the
 * words a user can pick as themselves, the words other programs write that
 * this app only reads as the nearest picked shape (`safeBranchShape`).
 */
import {
  ARROW_SHAPE_PREFIX,
  ARROW_SHAPES,
  BOUNDARY_SHAPE_PREFIX,
  BOUNDARY_SHAPES,
  BRANCH_LINE_CLASS_PREFIX,
  BRANCH_LINE_SHAPES,
  classWord,
  LINE_PATTERNS,
  RELATIONSHIP_SHAPE_PREFIX,
  RELATIONSHIP_SHAPES,
  SUMMARY_SHAPE_PREFIX,
  SUMMARY_SHAPES,
  type ViewRunStyle,
  type ViewTopicStyle,
} from '@genoffice/xmind-engine'

/** A colour as this app writes it: `#rrggbb` or `#rrggbbaa`, lower case. */
export type SafeColor = `#${string}`

/** The word for "this topic has no fill". */
export const NO_FILL = 'none'

/** What a topic's own style values come to. Null: draw that property as the theme does. */
export interface OwnTopicStyle extends OwnTextStyle {
  fill: SafeColor | typeof NO_FILL | null
  textAlign: TextAlign | null
  textTransform: TextTransform | null
}

/** The text format of a topic or of a part of its title. Null: as the topic around it. */
export interface OwnTextStyle {
  color: SafeColor | null
  /** 100 to 900 */
  fontWeight: number | null
  /** CSS pixels */
  fontSize: number | null
  /** a font name this app checked; drawn as that name, then the sans-serif face */
  fontFamily: string | null
  italic: boolean | null
  /** the lines through the text: under it, through it; null: as the topic around it */
  decoration: { underline: boolean; strike: boolean } | null
}

export type TextAlign = 'left' | 'center' | 'right'
/** `none`: the case as typed (the format's `manual`) */
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
/** up to four digits, up to three decimals, one known unit or none */
const NUMBER = /^(\d{1,4}(?:\.\d{1,3})?)(pt|px)?$/

const PX_PER_PT = 96 / 72

/** Font sizes a file may mean, in the unit it gives; outside them the value is no size. */
const FONT_SIZE_MEANT = { min: 1, max: 400 } as const
/** What a topic is drawn with at the least and at the most, in CSS pixels. */
export const FONT_SIZE_DRAWN = { min: 8, max: 96 } as const
/** Line widths a file may mean. */
const LINE_WIDTH_MEANT = { min: 0, max: 64 } as const

/** The words this app knows for a weight, and the weight each stands for here. */
const WEIGHT_WORDS: Readonly<Record<string, number>> = { normal: 400, bold: 700 }

/** A colour value of the file as a colour this app writes; null for anything that is not a `#` hex colour. */
export function safeColor(value: unknown): SafeColor | null {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return null
  const digits = value.slice(1).toLowerCase()
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits
  return `#${full}`
}

/** A number value of the file with its unit; null for anything that is not number-shaped. */
function readNumber(value: unknown): { amount: number; unit: 'pt' | 'px' | null } | null {
  if (typeof value !== 'string') return null
  const match = NUMBER.exec(value)
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount)
    ? { amount, unit: (match[2] as 'pt' | 'px' | undefined) ?? null }
    : null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * A font size in CSS pixels. A bare number is points, the unit the format
 * writes sizes in. A size no file means is no value; one that is meant is
 * drawn inside `FONT_SIZE_DRAWN`.
 */
export function safeFontSize(value: unknown): number | null {
  const read = readNumber(value)
  if (!read) return null
  if (read.amount < FONT_SIZE_MEANT.min || read.amount > FONT_SIZE_MEANT.max) return null
  const pixels = read.unit === 'px' ? read.amount : read.amount * PX_PER_PT
  return round(Math.min(FONT_SIZE_DRAWN.max, Math.max(FONT_SIZE_DRAWN.min, pixels)))
}

/** A font weight from 100 to 900: a bare whole number, or one of the two known words. */
export function safeFontWeight(value: unknown): number | null {
  if (typeof value === 'string' && Object.hasOwn(WEIGHT_WORDS, value)) return WEIGHT_WORDS[value]!
  const read = readNumber(value)
  if (!read || read.unit !== null || !Number.isInteger(read.amount)) return null
  if (read.amount < 1 || read.amount > 1000) return null
  return Math.min(900, Math.max(100, read.amount))
}

/** A fill: a colour, or the known word for "no fill". */
export function safeFill(value: unknown): SafeColor | typeof NO_FILL | null {
  return value === NO_FILL ? NO_FILL : safeColor(value)
}

/** The widest branch line drawn, in CSS pixels: the widest the engine writes, in points. */
export const BRANCH_LINE_WIDTH_DRAWN_MAX = 20

/**
 * The width of a branch line in CSS pixels, at most
 * `BRANCH_LINE_WIDTH_DRAWN_MAX`; null for anything else and for no width at
 * all. One point is one pixel, as the theme tables are written
 * (`theme-table.ts` writes a look's line widths as that many points), so a
 * line drawn from a theme and one drawn from a topic's own value of the same
 * number have the same width. A bare number and pixels are read the same way.
 */
export function safeBranchLineWidth(value: unknown): number | null {
  const read = readNumber(value)
  if (!read) return null
  if (read.amount <= LINE_WIDTH_MEANT.min || read.amount > LINE_WIDTH_MEANT.max) return null
  return round(Math.min(BRANCH_LINE_WIDTH_DRAWN_MAX, read.amount))
}

/** A shape of a branch line this app draws. */
export type BranchLineShape = (typeof BRANCH_LINE_SHAPES)[number]
/** A pattern of a line, as the format names it. */
export type LinePattern = (typeof LINE_PATTERNS)[number]

/** Shapes other programs write that this app reads only, each drawn as the nearest one it draws. */
const READ_ONLY_BRANCH_SHAPES: Readonly<Record<string, BranchLineShape>> = {
  fold: 'elbow',
  fold2: 'elbow',
  roundedfold: 'roundedElbow',
  bight: 'curve',
  'timeline.horizontal': 'straight',
}

function isListed<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/** Whether a `line-class` value is a shape a user can pick, as the file writes it. */
export function isPickableBranchShape(value: unknown): boolean {
  const word = classWord(value, BRANCH_LINE_CLASS_PREFIX)
  return word !== null && isListed(BRANCH_LINE_SHAPES, word)
}

/**
 * The shape to draw for a `line-class` value: a shape a user can pick as
 * itself, a shape only read as the nearest one; null for any other value (it
 * is drawn as the theme draws that line).
 */
export function safeBranchShape(value: unknown): BranchLineShape | null {
  const word = classWord(value, BRANCH_LINE_CLASS_PREFIX)
  if (word === null) return null
  if (isListed(BRANCH_LINE_SHAPES, word)) return word
  return Object.hasOwn(READ_ONLY_BRANCH_SHAPES, word) ? READ_ONLY_BRANCH_SHAPES[word]! : null
}

/** A pattern of a line; null for any word not in the format's list. */
export function safeLinePattern(value: unknown): LinePattern | null {
  return typeof value === 'string' && isListed(LINE_PATTERNS, value) ? value : null
}

// A name and nothing that could end it, as the engine writes one (`isWritableTextStyle`).
// eslint-disable-next-line no-control-regex -- keeping control characters out is the point here
const FONT_NAME = /^[^\u0000-\u001f\u007f"'`;:{}()<>\\[\]=@/*!,]{1,100}$/u

/** A font name to draw: a plain name, trimmed; null for anything that could be more than a name. */
export function safeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value || !FONT_NAME.test(value)) return null
  return value
}

/** The CSS value for a checked font name: that face, then the plain sans-serif one. */
export function fontFamilyValue(name: string): string {
  return `"${name}", sans-serif`
}

/** Italic or upright; null for any other word. */
export function safeItalic(value: unknown): boolean | null {
  if (value === 'italic') return true
  if (value === 'normal') return false
  return null
}

const DECORATIONS: Readonly<Record<string, { underline: boolean; strike: boolean }>> = {
  none: { underline: false, strike: false },
  underline: { underline: true, strike: false },
  'line-through': { underline: false, strike: true },
  'underline line-through': { underline: true, strike: true },
  'line-through underline': { underline: true, strike: true },
}

/** The lines through the text; null for any other value. */
export function safeDecoration(value: unknown): { underline: boolean; strike: boolean } | null {
  return typeof value === 'string' && Object.hasOwn(DECORATIONS, value)
    ? { ...DECORATIONS[value]! }
    : null
}

/** The CSS value for the lines through the text. */
export function decorationValue(decoration: { underline: boolean; strike: boolean }): string {
  const lines = [decoration.underline ? 'underline' : '', decoration.strike ? 'line-through' : '']
  return lines.filter((line) => line !== '').join(' ') || 'none'
}

const ALIGNS: ReadonlySet<string> = new Set<TextAlign>(['left', 'center', 'right'])

export function safeTextAlign(value: unknown): TextAlign | null {
  return typeof value === 'string' && ALIGNS.has(value) ? (value as TextAlign) : null
}

const TRANSFORMS: Readonly<Record<string, TextTransform>> = {
  manual: 'none',
  none: 'none',
  uppercase: 'uppercase',
  lowercase: 'lowercase',
  capitalize: 'capitalize',
}

export function safeTextTransform(value: unknown): TextTransform | null {
  return typeof value === 'string' && Object.hasOwn(TRANSFORMS, value) ? TRANSFORMS[value]! : null
}

/** The text format values of a topic or of a part of its title, as far as they may reach a style. */
export function ownTextStyle(style: ViewRunStyle | null | undefined): OwnTextStyle {
  return {
    color: safeColor(style?.color),
    fontWeight: safeFontWeight(style?.fontWeight),
    fontSize: safeFontSize(style?.fontSize),
    fontFamily: safeFontFamily(style?.fontFamily),
    italic: safeItalic(style?.fontStyle),
    decoration: safeDecoration(style?.textDecoration),
  }
}

/** The style values set on a topic itself, as far as they may reach a style. */
export function ownTopicStyle(style: ViewTopicStyle | null | undefined): OwnTopicStyle {
  return {
    ...ownTextStyle(style),
    fill: safeFill(style?.fill),
    textAlign: safeTextAlign(style?.textAlign),
    textTransform: safeTextTransform(style?.textTransform),
  }
}

/** Whether a topic sets nothing of its own that is drawn. */
export function isPlainStyle(own: OwnTopicStyle): boolean {
  return Object.values(own).every((value) => value === null)
}

/** Whether a part of a title carries nothing of its own that is drawn. */
export function isPlainText(own: OwnTextStyle): boolean {
  return Object.values(own).every((value) => value === null)
}

/** The `#rrggbb` part of a safe colour and its opacity from 0 to 1. */
export function splitAlpha(color: SafeColor): { solid: string; alpha: number } {
  if (color.length !== 9) return { solid: color, alpha: 1 }
  return { solid: color.slice(0, 7), alpha: Number.parseInt(color.slice(7), 16) / 255 }
}

/** A shape of a relationship this app draws. */
export type RelationshipShape = (typeof RELATIONSHIP_SHAPES)[number]
/** A shape of a relationship's end this app draws. */
export type ArrowShape = (typeof ARROW_SHAPES)[number]
/** A shape of a summary's bracket this app draws. */
export type SummaryShape = (typeof SUMMARY_SHAPES)[number]
/** A shape of a boundary this app draws. */
export type BoundaryShape = (typeof BOUNDARY_SHAPES)[number]

/** Whether a shape value is one a user can pick, as the file writes it (`org.xmind.…<word>`). */
function isPickableClass(value: unknown, prefix: string, words: readonly string[]): boolean {
  const word = classWord(value, prefix)
  return word !== null && words.includes(word)
}

export function isPickableRelationshipShape(value: unknown): boolean {
  return isPickableClass(value, RELATIONSHIP_SHAPE_PREFIX, RELATIONSHIP_SHAPES)
}

export function isPickableArrowShape(value: unknown): boolean {
  return isPickableClass(value, ARROW_SHAPE_PREFIX, ARROW_SHAPES)
}

export function isPickableSummaryShape(value: unknown): boolean {
  return isPickableClass(value, SUMMARY_SHAPE_PREFIX, SUMMARY_SHAPES)
}

export function isPickableBoundaryShape(value: unknown): boolean {
  return isPickableClass(value, BOUNDARY_SHAPE_PREFIX, BOUNDARY_SHAPES)
}

/** The shape to draw a relationship with; null (drawn curved) for any other value. */
export function safeRelationshipShape(value: unknown): RelationshipShape | null {
  const word = classWord(value, RELATIONSHIP_SHAPE_PREFIX)
  return word !== null && isListed(RELATIONSHIP_SHAPES, word) ? word : null
}

/**
 * The shape to draw an end of a relationship with. Another program's end
 * (`ring`, `eye`, `doublearrow` and every other word after the format's
 * prefix) is drawn as `normal`; a value of another form is null and the end
 * is drawn as that end is drawn by default.
 */
export function safeArrowShape(value: unknown): ArrowShape | null {
  const word = classWord(value, ARROW_SHAPE_PREFIX)
  if (word === null) return null
  return isListed(ARROW_SHAPES, word) ? word : 'normal'
}

/** The shape to draw a summary's bracket with; null (the bracket as before) for any other value. */
export function safeSummaryShape(value: unknown): SummaryShape | null {
  const word = classWord(value, SUMMARY_SHAPE_PREFIX)
  return word !== null && isListed(SUMMARY_SHAPES, word) ? word : null
}

/** The shape to draw a boundary with; null (drawn as `roundedRect`) for any other value. */
export function safeBoundaryShape(value: unknown): BoundaryShape | null {
  const word = classWord(value, BOUNDARY_SHAPE_PREFIX)
  return word !== null && isListed(BOUNDARY_SHAPES, word) ? word : null
}
