/**
 * Summaries and boundaries across a change of branches.
 *
 * Both name the branches they cover by position: `"(first,last)"` in the list
 * of branches of the topic that carries the record. A position means nothing
 * once branches were added, deleted or moved, so before reconciling each range
 * is turned into the topics it covers, and afterwards the record is placed
 * again by where those topics now are. It follows the first covered topic that
 * still exists, its anchor:
 *
 * - the record sits on the topic the anchor is a branch of now. When the
 *   anchor was moved under another topic the record goes there with it, with
 *   every key it has; a summary takes its summary topic along, and with that
 *   everything under it. Relationships that end on the summary topic are not
 *   touched: the summary topic keeps its id.
 * - its range is the unbroken run of covered topics around the anchor among
 *   that topic's branches. Covered topics that are no longer side by side with
 *   the anchor, or sit under another topic, fall out of the range.
 * - only when every covered topic was deleted is the record removed, and for a
 *   summary its summary topic with it.
 *
 * So moving branches about never removes a summary or a boundary; deleting all
 * the branches one covers does. A record that cannot be placed on the anchor's
 * new topic is not dropped: the state is refused as a whole (see `moveRecord`).
 *
 * A range that cannot be read, or that reaches past the branches, is never
 * rewritten or moved, and a record is written only when its place or its
 * positions come out different.
 */

import { refuse } from './reconcile-state'
import { type JsonRecord, recordsOf } from './tree-walk'
import type { XmindTopic } from './types'
import { formatRange, parseRange } from './view'

type RangeKey = 'summaries' | 'boundaries'

interface CoveringRecord {
  key: RangeKey
  record: JsonRecord
  start: number
  end: number
  /** ids of the branches inside the range, in branch order */
  covered: string[]
}

/** The ranges on one topic, as the topics they cover, taken before anything changes. */
export interface RangeSnapshot {
  owner: XmindTopic
  records: CoveringRecord[]
}

/** Null for a topic that carries no range to keep track of. */
export function snapshotRanges(owner: XmindTopic): RangeSnapshot | null {
  const branches = branchIds(owner)
  const records: CoveringRecord[] = []
  for (const key of ['summaries', 'boundaries'] as const) {
    for (const record of recordsOf(owner[key])) {
      const range = parseRange(record.range)
      if (!range || range.end >= branches.length) continue
      const covered = branches.slice(range.start, range.end + 1)
      records.push({ key, record, start: range.start, end: range.end, covered })
    }
  }
  return records.length > 0 ? { owner, records } : null
}

/**
 * Places the records of a snapshot again, now that the branches are where the
 * state has them. `parentOf` gives, for the id of every branch the tree now
 * has, the topic it is a branch of; a covered id that is not in it was deleted.
 *
 * Records in `settled` already carry a place and positions the state gave them
 * and are left alone, and so is a record that is no longer on the owner.
 */
export function followRanges(
  snapshot: RangeSnapshot,
  settled: ReadonlySet<JsonRecord>,
  parentOf: ReadonlyMap<string, XmindTopic>,
): void {
  const { owner } = snapshot
  for (const { key, record, start, end, covered } of snapshot.records) {
    const list = owner[key]
    if (settled.has(record) || !Array.isArray(list) || !list.includes(record)) continue
    const anchor = covered.find((id) => parentOf.has(id))
    if (anchor === undefined) {
      if (key === 'summaries') removeSummary(owner, record)
      else removeRecord(owner, key, record)
      continue
    }
    const home = parentOf.get(anchor)!
    if (home !== owner) moveRecord(owner, home, key, record)
    const range = runAround(anchor, covered, branchIds(home))
    if (range.start !== start || range.end !== end) {
      record.range = formatRange(range.start, range.end)
    }
  }
}

/** The unbroken run of covered topics around the anchor, as positions among these branches. */
function runAround(anchor: string, covered: readonly string[], branches: readonly string[]) {
  const inRange = new Set(covered)
  let start = branches.indexOf(anchor)
  let end = start
  while (start > 0 && inRange.has(branches[start - 1]!)) start--
  while (end < branches.length - 1 && inRange.has(branches[end + 1]!)) end++
  return { start, end }
}

/**
 * Takes a record from the topic it was on to the topic its anchor is now a
 * branch of, and for a summary the summary topic with it.
 *
 * Two things can stand in the way, both only in a file no program writes: the
 * new topic holds something that is not a list under the record's key, which
 * placing the record would overwrite; or a second record on the old topic
 * names the same summary topic, which cannot be in two places. Either one is a
 * refusal of the whole state. A third, the summary topic's branches ending up
 * nested deeper than a file may hold, is caught by the structure check that
 * every reconciled tree goes through.
 */
function moveRecord(from: XmindTopic, to: XmindTopic, key: RangeKey, record: JsonRecord): void {
  const list = to[key]
  if (list !== undefined && !Array.isArray(list)) {
    refuse(`topic ${to.id} holds something that is not a list under ${key}`)
  }
  if (key === 'boundaries') {
    removeRecord(from, key, record)
  } else {
    const { topicId } = record
    const summaryTopic = from.children?.summary?.find((topic) => topic.id === topicId)
    const named = recordsOf(from.summaries).filter((other) => other.topicId === topicId)
    if (summaryTopic && named.length > 1) {
      refuse(`summary topic ${summaryTopic.id} is named by two records that would come apart`)
    }
    removeSummary(from, record)
    if (summaryTopic) {
      const children = (to.children ??= {})
      if (children.summary) children.summary.push(summaryTopic)
      else children.summary = [summaryTopic]
    }
  }
  if (Array.isArray(list)) list.push(record)
  else to[key] = [record]
}

/** Puts a summary on a topic: its record among `summaries`, its topic among the summary topics. */
export function addSummary(owner: XmindTopic, record: JsonRecord, summaryTopic: XmindTopic): void {
  if (Array.isArray(owner.summaries)) owner.summaries.push(record)
  else owner.summaries = [record]
  const children = (owner.children ??= {})
  if (children.summary) children.summary.push(summaryTopic)
  else children.summary = [summaryTopic]
}

/**
 * Takes a summary off a topic: its record, and its summary topic with all that
 * hangs under it, unless another record of the topic names the same one.
 */
export function removeSummary(owner: XmindTopic, record: JsonRecord): void {
  removeRecord(owner, 'summaries', record)
  const { topicId } = record
  if (recordsOf(owner.summaries).some((other) => other.topicId === topicId)) return
  const children = owner.children
  if (!children?.summary) return
  const rest = children.summary.filter((summaryTopic) => summaryTopic.id !== topicId)
  if (rest.length === children.summary.length) return
  if (rest.length > 0) children.summary = rest
  else delete children.summary
  dropEmptyChildren(owner)
}

/** Takes a boundary off a topic. A list left empty goes too. */
export function removeBoundary(owner: XmindTopic, record: JsonRecord): void {
  removeRecord(owner, 'boundaries', record)
}

/** Removes one record from a list on a topic. A list left empty goes too: the format writes none. */
function removeRecord(owner: XmindTopic, key: RangeKey, record: JsonRecord): void {
  const list = owner[key]
  if (!Array.isArray(list) || !list.includes(record)) return
  const rest = list.filter((entry) => entry !== record)
  if (rest.length > 0) owner[key] = rest
  else delete owner[key]
}

/** Drops `children` once the last list in it is gone. */
export function dropEmptyChildren(topic: XmindTopic): void {
  if (topic.children && Object.keys(topic.children).length === 0) delete topic.children
}

function branchIds(topic: XmindTopic): string[] {
  return (topic.children?.attached ?? []).map((branch) => branch.id)
}
