/**
 * Readers of the source tree that reconciling and counting share: which topics
 * hang below a topic, and which parts of a sheet the view shows.
 *
 * "Shown" must mean here what it means in `view.ts`. The two are held together
 * by tests that reconcile a sheet's own view and expect nothing to change.
 */

import { isRecord, type XmindSheet, type XmindTopic } from './types'
import { parseRange, type ShownBoundaryRecord, shownSheetBoundaries } from './view'

export type JsonRecord = Record<string, unknown>

/** The entries of a list that are JSON objects. Other entries are skipped here and stay in the file. */
export function recordsOf(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/**
 * Every topic directly below a topic, of every kind: branches, floating topics,
 * summary topics, callouts, and under a kind the engine has never seen the
 * entries the structure check holds to the id rule.
 */
export function topicsBelow(topic: XmindTopic): XmindTopic[] {
  const out: XmindTopic[] = []
  for (const list of Object.values(topic.children ?? {})) {
    if (!Array.isArray(list)) continue
    for (const child of list) {
      if (isRecord(child) && typeof child.id === 'string' && child.id !== '') {
        out.push(child as XmindTopic)
      }
    }
  }
  return out
}

/** Every topic of a sheet, shown or not. Walks with a stack of its own, as the structure check does. */
export function everyTopic(sheet: XmindSheet): XmindTopic[] {
  const out: XmindTopic[] = []
  const pending: XmindTopic[] = [sheet.rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    out.push(topic)
    for (const child of topicsBelow(topic)) pending.push(child)
  }
  return out
}

/** A summary the view shows: its record, its summary topic and the branches it covers. */
export interface ShownSummary {
  record: JsonRecord
  topic: XmindTopic
  start: number
  end: number
}

/** The summaries of a topic that the view shows, in file order. */
export function shownSummaries(topic: XmindTopic): ShownSummary[] {
  const summaryTopics = new Map<string, XmindTopic>()
  for (const summaryTopic of topic.children?.summary ?? []) {
    summaryTopics.set(summaryTopic.id, summaryTopic)
  }
  const branchCount = topic.children?.attached?.length ?? 0
  const out: ShownSummary[] = []
  for (const record of recordsOf(topic.summaries)) {
    const range = parseRange(record.range)
    if (typeof record.id !== 'string' || typeof record.topicId !== 'string' || !range) continue
    const summaryTopic = summaryTopics.get(record.topicId)
    if (!summaryTopic || range.end >= branchCount) continue
    out.push({ record, topic: summaryTopic, start: range.start, end: range.end })
  }
  return out
}

/** What the view shows of a sheet. */
export interface ShownParts {
  /** the central topic and every branch below it, by id */
  topics: Map<string, XmindTopic>
  /** the shown summaries, each with the topic that carries it */
  summaries: (ShownSummary & { owner: XmindTopic })[]
  /** the ids a shown relationship ends on: the topics above and the summary topics */
  ends: Set<string>
  /** the boundaries the view shows, each with the topic that carries it (`shownSheetBoundaries`) */
  boundaries: (ShownBoundaryRecord & { owner: XmindTopic })[]
}

export function shownParts(sheet: XmindSheet): ShownParts {
  const topics = new Map<string, XmindTopic>()
  const summaries: ShownParts['summaries'] = []
  const ends = new Set<string>()
  const pending: XmindTopic[] = [sheet.rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    topics.set(topic.id, topic)
    ends.add(topic.id)
    for (const summary of shownSummaries(topic)) {
      summaries.push({ ...summary, owner: topic })
      ends.add(summary.topic.id)
    }
    for (const branch of topic.children?.attached ?? []) pending.push(branch)
  }
  return { topics, summaries, ends, boundaries: shownSheetBoundaries(sheet) }
}

/** Whether the view shows a relationship: it names both ends, and both are shown. */
export function isShownRelationship(relationship: JsonRecord, ends: ReadonlySet<string>): boolean {
  const { id, end1Id, end2Id } = relationship
  if (typeof id !== 'string' || typeof end1Id !== 'string' || typeof end2Id !== 'string') {
    return false
  }
  return ends.has(end1Id) && ends.has(end2Id)
}

/**
 * Every id a new id must stay clear of: sheets, topics, summary and boundary
 * records and relationships, across the whole file. The format wants an id to
 * appear once per file, not once per sheet.
 */
export function idsInUse(sheets: readonly XmindSheet[]): Set<string> {
  const ids = new Set<string>()
  const add = (id: unknown): void => {
    if (typeof id === 'string') ids.add(id)
  }
  for (const sheet of sheets) {
    add(sheet.id)
    for (const relationship of recordsOf(sheet.relationships)) add(relationship.id)
    for (const topic of everyTopic(sheet)) {
      ids.add(topic.id)
      for (const record of recordsOf(topic.summaries)) add(record.id)
      for (const record of recordsOf(topic.boundaries)) add(record.id)
    }
  }
  return ids
}
