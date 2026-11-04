/**
 * The line format of a map: the line into a branch, relationships, summary
 * brackets and boundaries.
 *
 * The format keeps each in the `style.properties` of the thing it belongs to:
 *
 * - a topic: `line-class`, `line-width`, `line-color`, `line-pattern`;
 * - a relationship: `shape-class`, `arrow-begin-class`, `arrow-end-class` and
 *   the same three line values, with its curve beside the style in
 *   `controlPoints` (`{ "0": { x, y }, "1": { x, y } }`, the end1 side first);
 * - a summary record (an entry of the topic's `summaries`, not its summary
 *   topic, whose `shape-class` is the shape of its box): `shape-class`;
 * - a boundary record (an entry of the topic's `boundaries`): `shape-class`,
 *   the three line values and `svg:fill`.
 *
 * Reading takes whatever strings the file holds (they reach the screen only
 * through the editor's own filter). Writing (`reconcile-tree.ts`) only ever
 * writes the words a user can pick from, `#rrggbb` colours and whole points
 * from 1 to 20, and only for what the editor names as changed.
 */

import { isRecord } from './types'

/** The line into a branch, by the property name the file uses for each value. */
export const BRANCH_LINE_PROPERTIES = {
  shape: 'line-class',
  width: 'line-width',
  color: 'line-color',
  pattern: 'line-pattern',
} as const

export type BranchLineKey = keyof typeof BRANCH_LINE_PROPERTIES

/** The line values set on a topic itself, as the strings the file holds. */
export type ViewBranchLine = Partial<Record<BranchLineKey, string>>

export const RELATIONSHIP_STYLE_PROPERTIES = {
  shape: 'shape-class',
  begin: 'arrow-begin-class',
  end: 'arrow-end-class',
  color: 'line-color',
  width: 'line-width',
  pattern: 'line-pattern',
} as const

export type RelationshipStyleKey = keyof typeof RELATIONSHIP_STYLE_PROPERTIES

export type ViewRelationshipStyle = Partial<Record<RelationshipStyleKey, string>>

export const SUMMARY_STYLE_PROPERTIES = { shape: 'shape-class' } as const

export type SummaryStyleKey = keyof typeof SUMMARY_STYLE_PROPERTIES

export type ViewSummaryStyle = Partial<Record<SummaryStyleKey, string>>

export const BOUNDARY_STYLE_PROPERTIES = {
  shape: 'shape-class',
  color: 'line-color',
  width: 'line-width',
  pattern: 'line-pattern',
  fill: 'svg:fill',
} as const

export type BoundaryStyleKey = keyof typeof BOUNDARY_STYLE_PROPERTIES

export type ViewBoundaryStyle = Partial<Record<BoundaryStyleKey, string>>

/** The fill of a topic's box. */
export const FILL_PROPERTY = 'svg:fill'

/** What comes before the word of a shape in the file. */
export const BRANCH_LINE_CLASS_PREFIX = 'org.xmind.branchConnection.'
export const RELATIONSHIP_SHAPE_PREFIX = 'org.xmind.relationshipShape.'
export const ARROW_SHAPE_PREFIX = 'org.xmind.arrowShape.'
export const SUMMARY_SHAPE_PREFIX = 'org.xmind.summaryShape.'
export const BOUNDARY_SHAPE_PREFIX = 'org.xmind.boundaryShape.'

/** The shapes a user can pick, as the word after the prefix. Others are read and drawn, never written. */
export const BRANCH_LINE_SHAPES = [
  'curve',
  'straight',
  'elbow',
  'roundedElbow',
  'arrowedCurve',
  'none',
] as const
export const RELATIONSHIP_SHAPES = ['curved', 'straight', 'angled', 'zigzag'] as const
export const ARROW_SHAPES = [
  'none',
  'normal',
  'spearhead',
  'triangle',
  'dot',
  'square',
  'diamond',
  'herringbone',
] as const
export const SUMMARY_SHAPES = [
  'curly',
  'angle',
  'square',
  'round',
  'bracket',
  'sharp',
  'fold',
  'straight',
] as const
export const BOUNDARY_SHAPES = [
  'rect',
  'roundedRect',
  'scallops',
  'waves',
  'tension',
  'polygon',
  'roundedPolygon',
] as const
export const LINE_PATTERNS = [
  'solid',
  'dash',
  'dot',
  'dash-dot',
  'dash-dot-dot',
  'round-dot',
] as const

/** The widths written, in whole points. */
export const MIN_LINE_WIDTH = 1
export const MAX_LINE_WIDTH = 20

/** A width the way the engine writes it: whole points. */
export function lineWidthValue(points: number): string {
  return `${points}pt`
}

/** The word of a shape value with this prefix, or null when the value has another form. */
export function classWord(value: unknown, prefix: string): string | null {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null
  const word = value.slice(prefix.length)
  return word === '' ? null : word
}

const COLOR = /^#[0-9a-f]{6}$/i
const WIDTH = /^([1-9]\d?)pt$/

function isWritableWidth(value: string): boolean {
  const match = WIDTH.exec(value)
  if (!match) return false
  const points = Number(match[1])
  return points >= MIN_LINE_WIDTH && points <= MAX_LINE_WIDTH
}

function isShape(value: string, prefix: string, words: readonly string[]): boolean {
  const word = classWord(value, prefix)
  return word !== null && words.includes(word)
}

function isLineValue(key: 'color' | 'width' | 'pattern', value: string): boolean {
  if (key === 'color') return COLOR.test(value)
  if (key === 'width') return isWritableWidth(value)
  return (LINE_PATTERNS as readonly string[]).includes(value)
}

/** Whether the engine writes this value as a fill: `#rrggbb` or `none`. */
export function isWritableFill(value: string): boolean {
  return value === 'none' || COLOR.test(value)
}

export function isWritableBranchLine(key: BranchLineKey, value: string): boolean {
  if (key === 'shape') return isShape(value, BRANCH_LINE_CLASS_PREFIX, BRANCH_LINE_SHAPES)
  return isLineValue(key, value)
}

export function isWritableRelationshipStyle(key: RelationshipStyleKey, value: string): boolean {
  if (key === 'shape') return isShape(value, RELATIONSHIP_SHAPE_PREFIX, RELATIONSHIP_SHAPES)
  if (key === 'begin' || key === 'end') return isShape(value, ARROW_SHAPE_PREFIX, ARROW_SHAPES)
  return isLineValue(key, value)
}

export function isWritableSummaryStyle(key: SummaryStyleKey, value: string): boolean {
  return key === 'shape' && isShape(value, SUMMARY_SHAPE_PREFIX, SUMMARY_SHAPES)
}

export function isWritableBoundaryStyle(key: BoundaryStyleKey, value: string): boolean {
  if (key === 'shape') return isShape(value, BOUNDARY_SHAPE_PREFIX, BOUNDARY_SHAPES)
  if (key === 'fill') return isWritableFill(value)
  return isLineValue(key, value)
}

/** The string values of a style under these property names, by the view's names. */
export function styleValues<K extends string>(
  style: unknown,
  names: Readonly<Record<K, string>>,
): Partial<Record<K, string>> {
  const properties = isRecord(style) && isRecord(style.properties) ? style.properties : {}
  const out: Partial<Record<K, string>> = {}
  for (const key of Object.keys(names) as K[]) {
    const value = properties[names[key]]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export interface ViewPoint {
  x: number
  y: number
}

/**
 * The curve of a relationship: its two control points, each measured from the
 * reference point of the topic at that end (mostly the middle of its box).
 * `from` is point `"0"` on the end1 side, `to` point `"1"` on the end2 side.
 */
export interface ViewCurve {
  from: ViewPoint
  to: ViewPoint
}

/** The curve a relationship's `controlPoints` hold, when both points have a finite x and y. */
export function readCurve(controlPoints: unknown): ViewCurve | null {
  if (!isRecord(controlPoints)) return null
  const from = readPoint(controlPoints['0'])
  const to = readPoint(controlPoints['1'])
  return from && to ? { from, to } : null
}

/** The `controlPoints` the engine writes for a curve. */
export function curveToControlPoints(curve: ViewCurve): Record<string, unknown> {
  return {
    '0': { x: curve.from.x, y: curve.from.y },
    '1': { x: curve.to.x, y: curve.to.y },
  }
}

function readPoint(point: unknown): ViewPoint | null {
  if (!isRecord(point)) return null
  const { x, y } = point
  return isFiniteNumber(x) && isFiniteNumber(y) ? { x, y } : null
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
