import type { XmindDocument } from './document'
import {
  BOUNDARY_STYLE_PROPERTIES,
  BRANCH_LINE_PROPERTIES,
  RELATIONSHIP_STYLE_PROPERTIES,
  SUMMARY_STYLE_PROPERTIES,
} from './line-style'
import { readStateCurve } from './reconcile-state'
import { type ReconcileIds, reconcileTree } from './reconcile-tree'
import { idsInUse } from './tree-walk'
import { isRecord } from './types'
import type { ViewTitleRun } from './text-style'
import {
  sheetToView,
  type ViewBoundary,
  type ViewRelationship,
  type ViewSheet,
  type ViewSummary,
  type ViewTopic,
  type ViewTopicStyle,
} from './view'

export type { ReconcileIds } from './reconcile-tree'

export interface ReconcileOptions {
  /**
   * Ids of relationships whose curve the user moved in an editor that does
   * not send the curve. That curve cannot be written, so the shape the file
   * holds for these is dropped rather than left to contradict what the user
   * drew. An editor that sends the curve (`ViewRelationship.curve`) names the
   * relationship in `restyledRelationships` instead, and the curve is
   * written; a relationship in both lists follows that one.
   */
  reshapedRelationships?: readonly string[]
  /**
   * Ids of topics whose picture the user removed in the editor. A state that
   * shows no picture deletes one only for these; for any other topic a missing
   * picture is not taken as a change.
   */
  removedPictures?: readonly string[]
  /**
   * Ids of topics whose text format the user changed in the editor: the style
   * values for the whole topic or the format of a part of its title. Only for
   * these (and for topics the state adds) are text style values written from a
   * state; any other topic keeps the ones it has, whatever the state shows.
   */
  restyledTopics?: readonly string[]
  /**
   * Ids of topics whose line format (`ViewTopic.line`) the user changed. Only
   * for these and for topics the state adds are line values written from a
   * state. The same rule holds for the lists below.
   */
  restyledTopicLines?: readonly string[]
  /** Ids of topics whose fill (`ViewTopicStyle.fill`, `svg:fill`) the user changed. */
  refilledTopics?: readonly string[]
  /** Ids of relationships whose format (`style`) or curve (`curve`) the user changed. */
  restyledRelationships?: readonly string[]
  /**
   * Summary topic ids (`ViewSummary.topicId`) of summaries whose bracket the
   * user changed. The bracket is written on the summary record, never on the
   * summary topic.
   */
  restyledSummaries?: readonly string[]
  /** Ids of boundaries whose format the user changed. Titles are written whenever they differ. */
  restyledBoundaries?: readonly string[]
  /**
   * Ids of boundaries the user removed. Only these are taken out: a boundary
   * missing from a state stays, and one the view cannot show is never removed.
   */
  removedBoundaries?: readonly string[]
}

/**
 * How reconciling ended.
 *
 * `ok: true`: the source tree now matches the state. `changed` says whether
 * this call changed the tree; whether the file needs saving is the document's
 * `changed`. `view` is the view of the tree as it now is, and
 * `inSync` whether that is what the state showed, once the ids in `ids` are
 * put in place of the ones the state gave. When it is false the editor shows
 * something the file does not hold, and has to draw `view` again.
 *
 * `ok: false`: the state could not be applied and nothing was changed.
 * `problem` is a line for the log, in English. `view` is the view of the
 * untouched tree, to draw again from.
 */
export type ReconcileResult =
  | { ok: true; changed: boolean; inSync: boolean; view: ViewSheet; ids: ReconcileIds }
  | { ok: false; problem: string; view: ViewSheet }

/**
 * Makes one sheet of the source tree match the state the editor shows for it.
 *
 * `state` is the sheet's view data as it stands after the user's edit. What
 * is applied: the topics with their order and nesting, and per topic the
 * title, folding, labels, note and link; a picture put in from an archive
 * entry, or taken off (`removedPictures`); the width given to a topic's box;
 * summaries; relationships; boundaries added, retitled or removed
 * (`removedBoundaries`); the layout; the text format, the line format and the
 * fill of the topics the editor names (`restyledTopics`, `restyledTopicLines`,
 * `refilledTopics`) and the format of the relationships, summaries and
 * boundaries it names, with the text and line format of what the state adds.
 * What is never written from a state: markers, which the editor shows without
 * editing, and the sheet's own title and place, which `renameSheet` and its
 * neighbours change.
 *
 * Sheets are reconciled one at a time: topics are paired by id inside the
 * sheet at `index`, and the same id on another sheet is another topic.
 *
 * The document is not marked changed. It decides for itself whether there is
 * anything to save, by comparing the tree with the file it holds: a state that
 * equals the view leaves it unchanged, and so does an edit that a later state
 * takes back. Either way it still saves byte for byte.
 * Throws when the document has no sheet at `index`; never for anything in the
 * state, which comes from a renderer and is checked as a whole before any of
 * it is applied.
 */
export function reconcileSheet(
  document: XmindDocument,
  index: number,
  state: ViewSheet,
  options: ReconcileOptions = {},
): ReconcileResult {
  const sheet = Number.isInteger(index) ? document.sheets[index] : undefined
  if (!sheet) throw new Error(`xmind: there is no sheet ${index}`)
  const outcome = reconcileTree(sheet, state, {
    idsInUse: () => idsInUse(document.sheets),
    reshaped: options.reshapedRelationships,
    removedPictures: options.removedPictures,
    restyledTopics: options.restyledTopics,
    restyledTopicLines: options.restyledTopicLines,
    refilledTopics: options.refilledTopics,
    restyledRelationships: options.restyledRelationships,
    restyledSummaries: options.restyledSummaries,
    restyledBoundaries: options.restyledBoundaries,
    removedBoundaries: options.removedBoundaries,
    entryExists: (name) => document.hasEntry(name),
  })
  if (!outcome.ok) return { ok: false, problem: outcome.problem, view: sheetToView(sheet, index) }
  if (outcome.changed) {
    // The reconciled copy moves into the sheet object the document already
    // holds, keys in the copy's order, so a caller that kept the sheet still
    // reads the live tree. The topics below it are new objects.
    // Each key is defined rather than assigned: a key named `__proto__` would
    // otherwise set the object's prototype instead of staying a key of the file.
    for (const key of Object.keys(sheet)) delete sheet[key]
    for (const [key, value] of Object.entries(outcome.sheet)) {
      Object.defineProperty(sheet, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  }
  const view = sheetToView(sheet, index)
  const inSync = shownBy(state, outcome.ids, carriedBy(view)) === shownBy(view)
  return { ok: true, changed: outcome.changed, inSync, view, ids: outcome.ids }
}

/**
 * Everything a view shows of a map, in a form two views can be compared by.
 * The order of summaries and of relationships is left out, as are the ids of
 * summary records: a summary is known by its summary topic. A state that
 * passed reconciling has the shape read here for all it applies; the parts
 * reconciling never reads are taken as "nothing" when they are missing.
 *
 * The line format came later than the rest, so a state may not carry it: a
 * topic without `line`, a summary or relationship without `style`, a
 * relationship without `curve`, a sheet without `boundaries`. For these the
 * values of `carried` (the view after reconciling) stand in, so an editor that
 * does not send them is not asked to draw again for them. The ids of
 * boundaries are compared as given: one the engine gave a new id is drawn again.
 * Where a boundary sits is not compared: it follows the branches it covers and
 * is never the state's to decide, so the editor takes it from the view. A
 * boundary of the state on a topic the state no longer has is one the state
 * deleted along with that topic.
 */
function shownBy(sheet: ViewSheet, ids?: ReconcileIds, carried?: Carried): string {
  const topicId = (id: string): string => ids?.topics.get(id) ?? id
  const relationshipId = (id: string): string => ids?.relationships.get(id) ?? id
  const lineOf = (shown: ViewTopic): unknown =>
    valuesOf(
      BRANCH_LINE_PROPERTIES,
      'line' in shown ? shown.line : carried?.topics.get(topicId(shown.id))?.line,
    )
  const summaryStyleOf = (summary: ViewSummary): unknown =>
    valuesOf(
      SUMMARY_STYLE_PROPERTIES,
      'style' in summary ? summary.style : carried?.summaries.get(topicId(summary.topicId))?.style,
    )
  const topic = (shown: ViewTopic): unknown => [
    topicId(shown.id),
    shown.title,
    shown.folded,
    shown.labels,
    shown.note || null,
    shown.link,
    isRecord(shown.image)
      ? [shown.image.src, shown.image.entryName, shown.image.width, shown.image.height]
      : null,
    typeof shown.width === 'number' ? shown.width : null,
    Array.isArray(shown.markers) ? shown.markers : [],
    styleValues(isRecord(shown.style) ? shown.style : {}),
    runsShown(shown.titleRuns),
    lineOf(shown),
    sorted(
      shown.summaries.map((summary) => [
        topicId(summary.topicId),
        summary.title,
        summary.start,
        summary.end,
        summaryStyleOf(summary),
      ]),
    ),
    shown.children.map(topic),
  ]
  const relationships = sheet.relationships.map((relationship) => {
    const id = relationshipId(relationship.id)
    const known = carried?.relationships.get(id)
    const style = 'style' in relationship ? relationship.style : known?.style
    const curve = 'curve' in relationship ? relationship.curve : known?.curve
    return [
      id,
      topicId(relationship.fromId),
      topicId(relationship.toId),
      relationship.title,
      valuesOf(RELATIONSHIP_STYLE_PROPERTIES, style),
      curveShown(curve),
    ]
  })
  const present = new Set<string>()
  const pending: ViewTopic[] = [sheet.root]
  for (let shown = pending.pop(); shown; shown = pending.pop()) {
    present.add(shown.id)
    pending.push(...shown.children)
  }
  const boundaries = (
    Array.isArray(sheet.boundaries) ? sheet.boundaries : (carried?.boundaries ?? [])
  )
    .filter((boundary) => present.has(boundary.topicId))
    .map((boundary) => [
      boundary.id,
      boundary.title,
      valuesOf(BOUNDARY_STYLE_PROPERTIES, boundary.style),
    ])
  return JSON.stringify([
    sheet.layout,
    topic(sheet.root),
    sorted(relationships),
    sorted(boundaries),
  ])
}

/**
 * The curve a relationship shows, as compared: its four numbers, null for the
 * automatic one. A curve of a state that is not two points is not written
 * (`readStateCurve`), so it never equals what the view shows.
 */
function curveShown(curve: unknown): unknown {
  if (curve === null || curve === undefined) return null
  const read = readStateCurve(curve)
  return read ? [read.from.x, read.from.y, read.to.x, read.to.y] : 'not two points'
}

/** What a view shows, by id, for the parts a state may not carry. */
interface Carried {
  topics: Map<string, ViewTopic>
  summaries: Map<string, ViewSummary>
  relationships: Map<string, ViewRelationship>
  boundaries: ViewBoundary[]
}

function carriedBy(view: ViewSheet): Carried {
  const topics = new Map<string, ViewTopic>()
  const summaries = new Map<string, ViewSummary>()
  const pending: ViewTopic[] = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    topics.set(topic.id, topic)
    for (const summary of topic.summaries) summaries.set(summary.topicId, summary)
    pending.push(...topic.children)
  }
  return {
    topics,
    summaries,
    relationships: new Map(view.relationships.map((line) => [line.id, line])),
    boundaries: view.boundaries ?? [],
  }
}

/** The values under these names, in their order; anything that is not a set of values is none. */
function valuesOf(names: Readonly<Record<string, string>>, values: unknown): unknown[] {
  return Object.keys(names).map((key) => {
    const value = isRecord(values) ? values[key] : undefined
    return typeof value === 'string' ? value : null
  })
}

const STYLE_KEYS = [
  'color',
  'fill',
  'fontWeight',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'textDecoration',
  'textAlign',
  'textTransform',
] as const satisfies readonly (keyof ViewTopicStyle)[]

/** Parts that carry no format are the plain title: either way the title is drawn one plain run. */
function runsShown(runs: unknown): unknown {
  if (!Array.isArray(runs)) return null
  const parts = runs.map((part: ViewTitleRun) => [part.text, styleValues(part.style ?? {})])
  return runs.some((part: ViewTitleRun) => Object.keys(part.style ?? {}).length > 0) ? parts : null
}

function styleValues(style: ViewTopicStyle): unknown[] {
  return STYLE_KEYS.map((key) => style[key] ?? null)
}

function sorted(items: unknown[]): string[] {
  return items.map((item) => JSON.stringify(item)).sort()
}
