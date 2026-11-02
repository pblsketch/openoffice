/**
 * Counting preserve-only elements: the parts of a map that the editor does not
 * show but that go back out on save as they came in.
 *
 * The rule, used for every count here. Each of these is one element:
 *
 * - a topic the view does not show. That is every topic of the sheet other
 *   than the central topic, the branches below it, and the summary topics of
 *   the summaries the view shows: floating topics, callouts, the branches
 *   under a summary topic, topics of a kind the engine does not know, and
 *   every topic below any of those;
 * - a boundary, on whichever topic it sits (a boundary the view draws only
 *   when `shownBoundaries` is not false, see `PreservedCountOptions`);
 * - a relationship the view does not show, because one of its ends is not
 *   shown or the record is incomplete.
 *
 * Values on a part that is shown are not elements and are not counted: a link
 * to another topic or to an attachment, the shape of a curve, styles, themes,
 * extensions and keys the engine does not know.
 */

import type { XmindDocument } from './document'
import { reconcileTree } from './reconcile-tree'
import { everyTopic, isShownRelationship, recordsOf, shownParts } from './tree-walk'
import type { XmindSheet } from './types'
import { sheetToView, type ViewTopic } from './view'

/** Which elements a count takes in. */
export interface PreservedCountOptions {
  /**
   * Whether a boundary the view draws (`shownSheetBoundaries`) counts. True by
   * default: the guard that keeps the AI from deleting a topic with a
   * boundary counts every boundary. False for what the user is told is not
   * shown (the open notice, the question before a deletion): a boundary on
   * screen is not hidden. A boundary the view cannot draw counts either way.
   */
  shownBoundaries?: boolean
}

/** How many preserve-only elements a sheet holds. */
export function countPreservedElements(
  sheet: XmindSheet,
  options: PreservedCountOptions = {},
): number {
  const shown = shownParts(sheet)
  const topics = everyTopic(sheet)
  const shownSummaryTopics = new Set(shown.summaries.map((summary) => summary.topic))
  let count = topics.length - shown.topics.size - shownSummaryTopics.size
  for (const topic of topics) count += recordsOf(topic.boundaries).length
  if (options.shownBoundaries === false) count -= shown.boundaries.length
  for (const relationship of recordsOf(sheet.relationships)) {
    if (!isShownRelationship(relationship, shown.ends)) count++
  }
  return count
}

/** The preserve-only elements of a whole file: per sheet, in file order, and in total. */
export function countPreservedInDocument(
  document: XmindDocument,
  options: PreservedCountOptions = {},
): {
  total: number
  sheets: number[]
} {
  const sheets = document.sheets.map((sheet) => countPreservedElements(sheet, options))
  return { total: sheets.reduce((sum, count) => sum + count, 0), sheets }
}

/**
 * How many preserve-only elements would be deleted along with these topics.
 * Zero means the deletion takes nothing the user cannot see.
 *
 * `topicIds` are ids from the view: branches, and the `topicId` of a summary
 * to ask about removing that summary. The central topic, ids the view does not
 * show and ids the sheet does not have count for nothing.
 *
 * The answer is found by reconciling the deletion on a copy and counting again,
 * so it always is what `reconcileSheet` then takes out: the elements below the
 * topics, a boundary or the branches under a summary whose last covered branch
 * is among them, and a relationship that would lose an end. The sheet itself
 * is not changed. With `shownBoundaries: false` a boundary the view draws
 * that goes with the topics is not counted.
 */
export function countPreservedWithTopics(
  sheet: XmindSheet,
  topicIds: readonly string[],
  options: PreservedCountOptions = {},
): number {
  const state = sheetToView(sheet, 0)
  const named = new Set(topicIds)
  let found = false
  const strip = (topic: ViewTopic): void => {
    const children = topic.children.filter((child) => !named.has(child.id))
    const summaries = topic.summaries.filter((summary) => !named.has(summary.topicId))
    found ||= children.length < topic.children.length || summaries.length < topic.summaries.length
    topic.children = children
    topic.summaries = summaries
    children.forEach(strip)
  }
  strip(state.root)
  if (!found) return 0
  const outcome = reconcileTree(sheet, state, { idsInUse: () => new Set() })
  if (!outcome.ok) throw new Error(`xmind: cannot count what a deletion takes, ${outcome.problem}`)
  return countPreservedElements(sheet, options) - countPreservedElements(outcome.sheet, options)
}
