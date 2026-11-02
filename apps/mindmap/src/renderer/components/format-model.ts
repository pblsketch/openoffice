/**
 * What the format panel shows for what is selected on the map: one section
 * per kind of item, with the values of the item in hand.
 *
 * A value the panel shows is one of three things: the value itself (the
 * first selected item's, the way it is drawn now, inherited and default
 * values included), "mixed" when the selected topics draw it differently,
 * or "other" for a shape written in the file that a user cannot pick here
 * (drawn as a nearby shape; the file keeps the value).
 *
 * Pure apart from the reads it is handed, so it is tested without a screen.
 */
import {
  type BranchLineShape,
  isPickableArrowShape,
  isPickableBoundaryShape,
  isPickableRelationshipShape,
  isPickableSummaryShape,
  type LinePattern,
  safeBranchLineWidth,
  safeColor,
  safeLinePattern,
} from '../map/style-values'
import {
  ARROW_SHAPE_PREFIX,
  BOUNDARY_SHAPE_PREFIX,
  classWord,
  RELATIONSHIP_SHAPE_PREFIX,
  SUMMARY_SHAPE_PREFIX,
  type ViewLayout,
} from '@genoffice/xmind-engine'
import type { MapController } from '../map/controller'
import type {
  ArrowShape,
  BoundaryShape,
  RelationshipShape,
  SummaryShape,
} from '../map/style-values'
import { BOUNDARY_WIDTH } from '../map/boundary-shapes'
import { RELATIONSHIP_WIDTH } from '../map/relationship-shapes'

/** One value as the panel shows it. */
export type Shown<T> = { state: 'value'; value: T } | { state: 'mixed' } | { state: 'other' }

/** A colour: `#rrggbb`, or null for "automatic" (the branch above, the rainbow or the theme). */
export type ShownColor = Shown<string | null>

export interface TopicLineModel {
  shape: Shown<BranchLineShape>
  /** the layout draws its own structure lines (tree, timeline): the shape cannot be picked */
  shapeLocked: boolean
  /** points */
  width: Shown<number>
  color: ShownColor
  pattern: Shown<LinePattern>
}

export interface RelationshipModel {
  shape: Shown<RelationshipShape>
  begin: Shown<ArrowShape>
  end: Shown<ArrowShape>
  color: ShownColor
  width: Shown<number>
  pattern: Shown<LinePattern>
  /** the relationship has a curve of its own, which "automatic curve" takes off */
  hasCurve: boolean
}

export interface BoundaryModel {
  shape: Shown<BoundaryShape>
  color: ShownColor
  width: Shown<number>
  pattern: Shown<LinePattern>
  /** `#rrggbb`, `none`, or null for the faint fill of the line's colour */
  fill: Shown<string | null>
}

export type FormatModel =
  | { kind: 'none' }
  | { kind: 'topics'; line: TopicLineModel | null }
  | { kind: 'relationship'; id: string; format: RelationshipModel }
  | { kind: 'summary'; id: string; shape: Shown<SummaryShape> }
  | { kind: 'boundary'; id: string; format: BoundaryModel }

/** What the model reads from the map. */
export type FormatReader = Pick<
  MapController,
  'selection' | 'topicLine' | 'relationshipFormat' | 'summaryFormat' | 'boundary'
> & { readonly layout: ViewLayout }

/** The layouts that draw their own structure lines, whose shape the line format does not change. */
const LOCKED_LAYOUTS: ReadonlySet<ViewLayout> = new Set<ViewLayout>(['tree', 'timeline'])

const value = <T>(shown: T): Shown<T> => ({ state: 'value', value: shown })

/** The values of several items: one value when they all agree, else mixed. */
function agreed<T>(values: readonly Shown<T>[]): Shown<T> {
  const first = values[0]
  if (!first) return { state: 'mixed' }
  const key = (shown: Shown<T>): string =>
    shown.state === 'value' ? `v:${String(shown.value)}` : shown.state
  return values.every((shown) => key(shown) === key(first)) ? first : { state: 'mixed' }
}

/** A shape value as the file holds it: its word when a user can pick it, the default when there is none, else "other". */
function shapeOf<T extends string>(
  written: string | undefined,
  prefix: string,
  pickable: (value: unknown) => boolean,
  fallback: T,
): Shown<T> {
  if (written === undefined) return value(fallback)
  if (pickable(written)) return value(classWord(written, prefix) as T)
  return { state: 'other' }
}

const colorOf = (written: string | undefined): ShownColor =>
  value(safeColor(written)?.slice(0, 7).toLowerCase() ?? null)

export function formatModel(map: FormatReader): FormatModel {
  const selection = map.selection()
  switch (selection.kind) {
    case 'topics':
      return { kind: 'topics', line: topicLineModel(map, selection.ids) }
    case 'relationship': {
      const format = map.relationshipFormat(selection.id)
      return format
        ? { kind: 'relationship', id: selection.id, format: relationshipModel(format) }
        : { kind: 'none' }
    }
    case 'summary': {
      const style = map.summaryFormat(selection.id)
      if (!style) return { kind: 'none' }
      // a bracket without a shape of its own is drawn as `bracket` (`summary-shapes.ts`)
      const shape = shapeOf<SummaryShape>(
        style.shape,
        SUMMARY_SHAPE_PREFIX,
        isPickableSummaryShape,
        'bracket',
      )
      return { kind: 'summary', id: selection.id, shape }
    }
    case 'boundary': {
      const boundary = map.boundary(selection.id)
      return boundary
        ? { kind: 'boundary', id: selection.id, format: boundaryModel(boundary.style) }
        : { kind: 'none' }
    }
    default:
      return { kind: 'none' }
  }
}

function topicLineModel(map: FormatReader, ids: readonly string[]): TopicLineModel | null {
  const lines = ids.map((id) => map.topicLine(id)).filter((line) => line !== null)
  if (lines.length === 0) return null
  const each = lines.map(({ drawn }) => ({
    shape: drawn.shapeOther ? ({ state: 'other' } as const) : value(drawn.shape),
    width: value(drawn.width),
    // a colour of the topic or a branch above it; the rainbow and the theme are "automatic"
    color: value(
      drawn.colorFrom === 'own' || drawn.colorFrom === 'inherited'
        ? drawn.color.slice(0, 7).toLowerCase()
        : null,
    ),
    pattern: value(drawn.pattern),
  }))
  return {
    shape: agreed<BranchLineShape>(each.map((line) => line.shape)),
    shapeLocked: LOCKED_LAYOUTS.has(map.layout),
    width: agreed(each.map((line) => line.width)),
    color: agreed(each.map((line) => line.color)),
    pattern: agreed(each.map((line) => line.pattern)),
  }
}

function relationshipModel(format: {
  style: Partial<Record<'shape' | 'begin' | 'end' | 'color' | 'width' | 'pattern', string>>
  curve: unknown
}): RelationshipModel {
  const { style } = format
  return {
    shape: shapeOf<RelationshipShape>(
      style.shape,
      RELATIONSHIP_SHAPE_PREFIX,
      isPickableRelationshipShape,
      'curved',
    ),
    begin: shapeOf<ArrowShape>(style.begin, ARROW_SHAPE_PREFIX, isPickableArrowShape, 'none'),
    end: shapeOf<ArrowShape>(style.end, ARROW_SHAPE_PREFIX, isPickableArrowShape, 'normal'),
    color: colorOf(style.color),
    width: value(safeBranchLineWidth(style.width) ?? RELATIONSHIP_WIDTH),
    // a relationship without a pattern is drawn dashed
    pattern: value(safeLinePattern(style.pattern) ?? 'dash'),
    hasCurve: format.curve !== null,
  }
}

function boundaryModel(
  style: Partial<Record<'shape' | 'color' | 'width' | 'pattern' | 'fill', string>>,
): BoundaryModel {
  const fill = style.fill === 'none' ? 'none' : (safeColor(style.fill)?.slice(0, 7) ?? null)
  return {
    shape: shapeOf<BoundaryShape>(
      style.shape,
      BOUNDARY_SHAPE_PREFIX,
      isPickableBoundaryShape,
      'roundedRect',
    ),
    color: colorOf(style.color),
    width: value(safeBranchLineWidth(style.width) ?? BOUNDARY_WIDTH),
    pattern: value(safeLinePattern(style.pattern) ?? 'solid'),
    fill: value(fill === null ? null : fill.toLowerCase()),
  }
}
