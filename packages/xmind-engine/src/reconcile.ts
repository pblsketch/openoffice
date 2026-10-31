import type { XmindDocument } from './document'
import { type ReconcileIds, reconcileTree } from './reconcile-tree'
import { idsInUse } from './tree-walk'
import { isRecord } from './types'
import { sheetToView, type ViewSheet, type ViewTopic, type ViewTopicStyle } from './view'

export type { ReconcileIds } from './reconcile-tree'

export interface ReconcileOptions {
  /**
   * Ids of relationships whose curve the user moved in the editor. The editor's
   * curve is not written to the file, so the shape the file holds for these is
   * dropped rather than left to contradict what the user drew.
   */
  reshapedRelationships?: readonly string[]
  /**
   * Ids of topics whose picture the user removed in the editor. A state that
   * shows no picture deletes one only for these; for any other topic a missing
   * picture is not taken as a change.
   */
  removedPictures?: readonly string[]
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
 * entry, or taken off (`removedPictures`); summaries; relationships; the
 * layout. What is never written from a state: markers and styles, which the
 * editor shows without editing, and the sheet's own title and place, which
 * `renameSheet` and its neighbours change.
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
  const inSync = shownBy(state, outcome.ids) === shownBy(view)
  return { ok: true, changed: outcome.changed, inSync, view, ids: outcome.ids }
}

/**
 * Everything a view shows of a map, in a form two views can be compared by.
 * The order of summaries and of relationships is left out, as are the ids of
 * summary records: a summary is known by its summary topic. A state that
 * passed reconciling has the shape read here for all it applies; the parts
 * reconciling never reads are taken as "nothing" when they are missing.
 */
function shownBy(sheet: ViewSheet, ids?: ReconcileIds): string {
  const topicId = (id: string): string => ids?.topics.get(id) ?? id
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
    Array.isArray(shown.markers) ? shown.markers : [],
    styleValues(isRecord(shown.style) ? shown.style : {}),
    sorted(
      shown.summaries.map((summary) => [
        topicId(summary.topicId),
        summary.title,
        summary.start,
        summary.end,
      ]),
    ),
    shown.children.map(topic),
  ]
  const relationships = sheet.relationships.map((relationship) => [
    ids?.relationships.get(relationship.id) ?? relationship.id,
    topicId(relationship.fromId),
    topicId(relationship.toId),
    relationship.title,
  ])
  return JSON.stringify([sheet.layout, topic(sheet.root), sorted(relationships)])
}

function styleValues(style: ViewTopicStyle): unknown[] {
  return [style.color, style.fill, style.fontWeight, style.fontSize].map((value) => value ?? null)
}

function sorted(items: unknown[]): string[] {
  return items.map((item) => JSON.stringify(item)).sort()
}
