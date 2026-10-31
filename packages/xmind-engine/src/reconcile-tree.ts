/**
 * Reconciling one sheet: making the source tree match the state the editor
 * shows, and changing only what really differs.
 *
 * Reconciling does not know what the user did. It sees the result and pairs it
 * with the tree by id:
 *
 * - a topic in both: the values the editor edits are compared one by one and
 *   written where they differ. Every other key stays as it is.
 * - a topic only in the state: created, with a new id.
 * - a branch only in the tree: deleted, with everything below it. Only what the
 *   view could have shown can be missing from a state; floating topics,
 *   callouts and the branches under a summary topic are never in one and stay.
 *   Nothing else is removed. A summary or boundary goes only when every branch
 *   it covered was deleted, or when it is a summary the state took off a topic
 *   that is still there; while one covered branch exists it follows that
 *   branch (see `reconcile-ranges.ts`).
 * - a topic of the tree under another parent, or at another place: the object
 *   in the tree is moved whole, with every key the view does not know.
 *
 * The work is done on a copy of the sheet. A state that cannot be applied ends
 * in a refusal and the copy is dropped, so the tree is never left half changed.
 * Whether anything changed is read off the copy: it changed when it no longer
 * serialises the way the sheet did.
 */

import { newXmindId } from './ids'
import { layoutFromStructureClass, structureClassForLayout } from './layout'
import { noteText } from './notes'
import {
  addSummary,
  dropEmptyChildren,
  followRanges,
  removeSummary,
  snapshotRanges,
} from './reconcile-ranges'
import { readState, Refusal, refuse, type StateSheet, type StateTopic } from './reconcile-state'
import { isResourceEntry } from './resource-entry'
import { checkContentStructure } from './structure-check'
import {
  everyTopic,
  isShownRelationship,
  type JsonRecord,
  recordsOf,
  type ShownParts,
  shownParts,
} from './tree-walk'
import { isRecord, type XmindSheet, type XmindTopic } from './types'
import { formatRange, isShownLink } from './view'

/**
 * The ids reconciling wrote in place of ids the state gave, by the id given.
 * `topics` covers topics and summary topics, which share one space of ids.
 */
export interface ReconcileIds {
  topics: Map<string, string>
  relationships: Map<string, string>
}

export interface TreeContext {
  /** every id of the file, asked for only when a new id is needed */
  idsInUse: () => Set<string>
  /** ids of relationships whose curve the user moved */
  reshaped?: readonly string[]
  /** ids of topics whose picture the user removed */
  removedPictures?: readonly string[]
  /** whether the archive holds this entry (a picture added since the last save included) */
  entryExists?: (name: string) => boolean
}

export type TreeOutcome =
  | { ok: true; sheet: XmindSheet; changed: boolean; ids: ReconcileIds }
  | { ok: false; problem: string }

/**
 * The sheet a state leads to. `source` is not touched: the result is a copy,
 * changed or not.
 */
export function reconcileTree(
  source: XmindSheet,
  state: unknown,
  context: TreeContext,
): TreeOutcome {
  try {
    const want = readState(state)
    const before = JSON.stringify(source)
    const sheet = JSON.parse(before) as XmindSheet
    const ids = apply(sheet, want, context)
    // What a moved topic carries along can push the tree past what a file may hold.
    const check = checkContentStructure([sheet])
    if (!check.ok) refuse(check.problem)
    return { ok: true, sheet, changed: JSON.stringify(sheet) !== before, ids }
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, problem: error.message }
    throw error
  }
}

interface Run {
  sheet: XmindSheet
  want: StateSheet
  /** what the view showed of the sheet before anything changed */
  shown: ShownParts
  /** every topic id of the sheet before anything changed */
  idsBefore: Set<string>
  ids: ReconcileIds
  /** whether the archive holds an entry; absent means "do not check" */
  entryExists?: (name: string) => boolean
  /** topics whose picture the user removed; only these lose one to a state without it */
  removedPictures: ReadonlySet<string>
  newId: (given: string) => string
  /** every topic of the state with the topic of the tree that now stands for it */
  pairs: { topic: XmindTopic; want: StateTopic }[]
  /** the ids, as written, that a relationship of the state may end on */
  ends: Set<string>
}

function apply(sheet: XmindSheet, want: StateSheet, context: TreeContext): ReconcileIds {
  if (want.root.id !== sheet.rootTopic.id) {
    refuse(`the central topic of the state is ${want.root.id}, not ${sheet.rootTopic.id}`)
  }
  const run: Run = {
    sheet,
    want,
    shown: shownParts(sheet),
    idsBefore: topicIds(sheet),
    ids: { topics: new Map(), relationships: new Map() },
    ...(context.entryExists ? { entryExists: context.entryExists } : {}),
    removedPictures: new Set(context.removedPictures),
    newId: idAllocator(context.idsInUse),
    pairs: [],
    ends: new Set(),
  }
  const ranges = [...run.shown.topics.values()].map(snapshotRanges)

  settleTopics(run)
  const settled = settleSummaries(run)
  // Every range the sheet had is placed again, also one on a topic that is now
  // deleted: a covered branch may live on under another topic.
  const parentOf = new Map<string, XmindTopic>()
  for (const { topic } of run.pairs) {
    for (const branch of topic.children?.attached ?? []) parentOf.set(branch.id, topic)
  }
  for (const snapshot of ranges) {
    if (snapshot) followRanges(snapshot, settled, parentOf)
  }
  settleRelationships(run, new Set(context.reshaped))
  settleLayout(run)
  dropDanglingRelationships(run)
  return run.ids
}

/**
 * Walks the state from the central topic down and rebuilds the branches of the
 * tree to match: topics the tree has are reused as they are, the rest are
 * made. A branch of the tree that no topic of the state claims is left out of
 * every list, and that is its deletion.
 */
function settleTopics(run: Run): void {
  const settle = (want: StateTopic): XmindTopic => {
    const topic = run.shown.topics.get(want.id) ?? createTopic(run, want)
    run.pairs.push({ topic, want })
    run.ends.add(topic.id)
    writeValues(topic, want, run)
    writeBranches(topic, want.children.map(settle))
    return topic
  }
  settle(run.want.root)
}

function createTopic(run: Run, want: StateTopic): XmindTopic {
  // A floating topic, a callout, a summary topic or a branch under one: the
  // view shows none of them as a branch, so the state cannot have moved one.
  if (run.idsBefore.has(want.id)) {
    refuse(`id ${want.id} belongs to a part of the map that is not a branch`)
  }
  const id = run.newId(want.id)
  if (id !== want.id) run.ids.topics.set(want.id, id)
  return { id, title: want.title }
}

/** The values the editor edits, each written only when the state differs from what the view shows. */
function writeValues(topic: XmindTopic, want: StateTopic, run: Run): void {
  if (text(topic.title) !== want.title) topic.title = want.title
  if ((topic.branch === 'folded') !== want.folded) {
    if (want.folded) topic.branch = 'folded'
    else delete topic.branch
  }
  if (!sameTexts(texts(topic.labels), want.labels)) {
    if (want.labels.length > 0) topic.labels = want.labels
    else delete topic.labels
  }
  // An edited note goes back as plain text only. The rich form is dropped with
  // it: the program the format comes from shows the rich one when both are
  // there, which would be the text from before the edit. An empty note and no
  // note are the same thing here.
  if ((noteText(topic.notes) || null) !== (want.note || null)) {
    if (want.note) topic.notes = { plain: { content: want.note } }
    else delete topic.notes
  }
  // A link to another topic or to an attachment shows as no link, so it stays
  // until the user puts a link in its place.
  const link = isShownLink(topic.href) ? topic.href : null
  if (link !== want.link) {
    if (want.link === null) delete topic.href
    else topic.href = want.link
  }
  writeImage(topic, want, run)
}

/**
 * The one picture a state may set: an entry under `resources/` that the archive
 * holds. A state that still shows a web address or a path is left alone — the
 * editor never loaded it, so it is not a change of the picture — and a
 * reference to an entry the file does not have is refused rather than written
 * as a picture nothing can show. An empty state value deletes a picture only
 * for a topic the editor names as one whose picture the user removed: a state
 * that merely lacks the picture (a topic the editor never drew it on) leaves
 * it. The archive entry stays; another topic may show the same one.
 */
function writeImage(topic: XmindTopic, want: StateTopic, run: Run): void {
  const image = want.image
  if (!image) {
    if (run.removedPictures.has(want.id) && topic.image !== undefined) delete topic.image
    return
  }
  const entry = image.entryName
  if (!entry) return
  const current = isRecord(topic.image) ? topic.image : null
  const currentEntry =
    current && typeof current.src === 'string' && current.src.startsWith('xap:')
      ? current.src.slice('xap:'.length)
      : null
  if (
    currentEntry === entry &&
    (current?.width ?? null) === image.width &&
    (current?.height ?? null) === image.height
  ) {
    // the reference is the one the file already had: nothing to write, even if
    // the archive lacks the entry (a file another program left incomplete is
    // not made worse by a state that shows it as it is)
    return
  }
  if (!isResourceEntry(entry)) refuse(`the picture ${entry} is not an entry of the map file`)
  // A file that lost the entry (or never had it) is not made worse by a state
  // that names it: the picture is simply not applied, and the redraw from the
  // view shows the topic without it.
  if (run.entryExists && !run.entryExists(entry)) return
  const next: JsonRecord = { src: `xap:${entry}` }
  if (image.width !== null) next.width = image.width
  if (image.height !== null) next.height = image.height
  topic.image = next
}

function writeBranches(topic: XmindTopic, branches: XmindTopic[]): void {
  const current = topic.children?.attached ?? []
  if (
    current.length === branches.length &&
    current.every((branch, at) => branch === branches[at])
  ) {
    return
  }
  if (branches.length > 0) {
    const children = (topic.children ??= {})
    children.attached = branches
  } else {
    delete topic.children?.attached
    dropEmptyChildren(topic)
  }
}

/**
 * Summaries are paired by the id of their summary topic. One the tree has is
 * retitled, moved to the topic the state shows it on, or removed when the
 * state no longer has it on a topic that is still there; one only the state
 * has is created. A summary that is missing from the state only because the
 * topic that carried it was deleted is not removed here: it is left to follow
 * the branches it covers, and goes when none of them is left.
 *
 * Returns the records whose place and positions the state decided. A summary
 * the state lists where it was, with the positions it already had, was not
 * placed by the user: where it ends up follows from the branches it covers
 * (see `reconcile-ranges.ts`), and its old positions may by now lie past the
 * last branch.
 */
function settleSummaries(run: Run): Set<JsonRecord> {
  const settled = new Set<JsonRecord>()
  // More than one under an id only in a file where two records name one summary topic.
  const waiting = new Map<string, ShownParts['summaries']>()
  for (const summary of run.shown.summaries) {
    const sameTopic = waiting.get(summary.topic.id)
    if (sameTopic) sameTopic.push(summary)
    else waiting.set(summary.topic.id, [summary])
  }
  const given = new Set(run.pairs.map((pair) => pair.want.id))
  const created = new Set<string>()

  for (const { topic, want } of run.pairs) {
    for (const wanted of want.summaries) {
      const pastBranches = (): never =>
        refuse(`the range of summary ${wanted.topicId} reaches past the branches of its topic`)
      const inside = wanted.end < want.children.length
      const known = waiting.get(wanted.topicId)?.shift()
      if (known) {
        const moved = known.owner !== topic
        const renumbered = wanted.start !== known.start || wanted.end !== known.end
        if (moved || renumbered) {
          if (!inside) pastBranches()
          settled.add(known.record)
        }
        if (moved) {
          removeSummary(known.owner, known.record)
          addSummary(topic, known.record, known.topic)
        }
        if (renumbered) known.record.range = formatRange(wanted.start, wanted.end)
        if (text(known.topic.title) !== wanted.title) known.topic.title = wanted.title
        run.ends.add(known.topic.id)
        continue
      }
      const taken =
        run.idsBefore.has(wanted.topicId) ||
        given.has(wanted.topicId) ||
        created.has(wanted.topicId)
      if (taken) refuse(`summary topic id ${wanted.topicId} is already used in the map`)
      if (!inside) pastBranches()
      created.add(wanted.topicId)
      const topicId = run.newId(wanted.topicId)
      if (topicId !== wanted.topicId) run.ids.topics.set(wanted.topicId, topicId)
      const record = {
        id: run.newId(wanted.id),
        range: formatRange(wanted.start, wanted.end),
        topicId,
      }
      addSummary(topic, record, { id: topicId, title: wanted.title })
      run.ends.add(topicId)
    }
  }
  const kept = new Set(run.pairs.map((pair) => pair.topic))
  for (const unclaimed of waiting.values()) {
    for (const summary of unclaimed) {
      if (kept.has(summary.owner)) removeSummary(summary.owner, summary.record)
    }
  }
  return settled
}

/** The keys that hold the shape of a relationship's curve. */
const CURVE_KEYS = ['controlPoints', 'lineEndPoints'] as const

/**
 * Relationships are paired by id. One the tree has is retitled or given other
 * ends, and removed when the state has it no more; one only the state has is
 * created. A relationship the view does not show is not in any state and is
 * not touched here.
 *
 * The curve is kept as long as it still fits: it goes when an end changed and
 * when the caller says the user moved the curve, because the editor's own
 * curve is not translated into the file's.
 *
 * An end has to be a topic or a summary of the state. The one exception is a
 * relationship of the tree that the state lists unchanged though one of its
 * ends is gone: that is a leftover of the deletion, not a request, and the
 * relationship goes with its topic.
 */
function settleRelationships(run: Run, reshaped: ReadonlySet<string>): void {
  const { sheet } = run
  const waiting = new Map<string, JsonRecord[]>()
  for (const record of recordsOf(sheet.relationships)) {
    if (!isShownRelationship(record, run.shown.ends)) continue
    const sameId = waiting.get(record.id as string)
    if (sameId) sameId.push(record)
    else waiting.set(record.id as string, [record])
  }
  const created: JsonRecord[] = []
  const given = new Set<string>()

  for (const wanted of run.want.relationships) {
    const from = run.ids.topics.get(wanted.fromId) ?? wanted.fromId
    const to = run.ids.topics.get(wanted.toId) ?? wanted.toId
    const requireEnds = (): void => {
      for (const end of [from, to]) {
        if (!run.ends.has(end)) {
          refuse(`relationship ${wanted.id} ends on ${end}, which the state does not show`)
        }
      }
    }
    const record = waiting.get(wanted.id)?.shift()
    if (record) {
      const moved = record.end1Id !== from || record.end2Id !== to
      if (moved) {
        requireEnds()
        record.end1Id = from
        record.end2Id = to
      }
      if (moved || reshaped.has(wanted.id)) {
        for (const key of CURVE_KEYS) delete record[key]
      }
      if (text(record.title) !== wanted.title) record.title = wanted.title
      continue
    }
    requireEnds()
    if (given.has(wanted.id))
      refuse(`relationship id ${wanted.id} is used more than once in the state`)
    given.add(wanted.id)
    const id = run.newId(wanted.id)
    if (id !== wanted.id) run.ids.relationships.set(wanted.id, id)
    const made: JsonRecord = { id, end1Id: from, end2Id: to }
    if (wanted.title !== '') made.title = wanted.title
    created.push(made)
  }

  const unclaimed = new Set<unknown>([...waiting.values()].flat())
  if (unclaimed.size === 0 && created.length === 0) return
  const rest = Array.isArray(sheet.relationships) ? sheet.relationships : []
  setRelationships(sheet, [...rest.filter((entry) => !unclaimed.has(entry)), ...created])
}

/**
 * A relationship must not outlive a topic it ends on. Any relationship, shown
 * or not, that ends on a topic this run removed is removed with it; one that
 * pointed nowhere before is none of this run's business and stays.
 */
function dropDanglingRelationships(run: Run): void {
  const { sheet } = run
  if (!Array.isArray(sheet.relationships)) return
  const now = topicIds(sheet)
  const gone = new Set<unknown>([...run.idsBefore].filter((id) => !now.has(id)))
  if (gone.size === 0) return
  const rest = sheet.relationships.filter(
    (entry) => !(isRecord(entry) && (gone.has(entry.end1Id) || gone.has(entry.end2Id))),
  )
  if (rest.length !== sheet.relationships.length) setRelationships(sheet, rest)
}

/** An emptied list of relationships goes: the format writes the key only when there is one. */
function setRelationships(sheet: XmindSheet, relationships: unknown[]): void {
  if (relationships.length > 0) sheet.relationships = relationships
  else delete sheet.relationships
}

/**
 * The layout is written only when the user picked one: the state names another
 * layout than the file's is drawn as, or it calls exact a layout that so far
 * only stood in for an arrangement the editor cannot draw.
 */
function settleLayout(run: Run): void {
  const root = run.sheet.rootTopic
  const drawn = layoutFromStructureClass(root.structureClass)
  if (run.want.layout !== drawn.layout || (run.want.layoutExact && !drawn.exact)) {
    root.structureClass = structureClassForLayout(run.want.layout)
  }
}

const XMIND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * Ids for what a state adds. The id the state gives is kept when it has the
 * shape the format uses and nothing in the file has it: a topic the user
 * deleted and brought back then returns under its own id. Any other id is
 * replaced by a new one.
 */
function idAllocator(idsInUse: () => Set<string>): (given: string) => string {
  let taken: Set<string> | undefined
  return (given) => {
    taken ??= idsInUse()
    let id = XMIND_ID.test(given) && !taken.has(given) ? given : newXmindId()
    while (taken.has(id)) id = newXmindId()
    taken.add(id)
    return id
  }
}

function topicIds(sheet: XmindSheet): Set<string> {
  return new Set(everyTopic(sheet).map((topic) => topic.id))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function sameTexts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, at) => item === b[at])
}
