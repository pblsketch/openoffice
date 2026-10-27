/**
 * What travels between the copies of a shared map (decision 0073): one op per
 * change, keyed by the ids the file holds, so changes to different topics
 * land the same way in whatever order they arrive.
 *
 * An edit of a sheet is the difference between two views of its source tree
 * (`diffSheet`): topics added and removed, values changed, the new order of
 * branches under each topic that changed, summaries, relationships and the
 * layout. A receiver lays it over its own view (`mergeEdit`) and reconciles
 * the result like an edit of its own, so the engine still decides what the
 * file says. Branches the sender did not know of stay where they are.
 *
 * Sheets are named by their id (their place when the file gives none); the
 * keys of `DocumentSession` exist on one copy only. A new sheet travels whole,
 * because the engine draws its ids at random.
 *
 * Ops come over the network: `readOp` checks one before anything reads it.
 * Lists stand in for maps keyed by ids, which a file could name `__proto__`.
 */
import {
  checkContentStructure,
  isRecord,
  isThemeId,
  type ThemeId,
  type ViewImage,
  type ViewLayout,
  type ViewRelationship,
  type ViewSheet,
  type ViewSummary,
  type ViewTopic,
  type ViewTopicStyle,
  type XmindSheet,
} from '@genoffice/xmind-engine'

/** A sheet as every copy finds it: by id, or by place when the file gives it no id. */
export interface SheetRef {
  id: string | null
  index: number
}

/** The values of a topic the editor edits. */
export interface TopicValues {
  title: string
  folded: boolean
  labels: string[]
  note: string | null
  link: string | null
}

/** A topic new to the sheet. What is shown without being edited comes along, so the result can be checked against it. */
export interface NewTopic extends TopicValues {
  id: string
  image: ViewImage | null
  markers: string[]
  style: ViewTopicStyle
}

/** A summary whose range is named by the first and last branch it covers, not by position. */
export interface SharedSummary {
  id: string
  topicId: string
  title: string
  from: string
  to: string
}

export interface SheetEdit {
  added?: NewTopic[]
  /** every topic that went, the ones below a deleted branch included */
  removed?: string[]
  values?: Array<{ id: string } & Partial<TopicValues>>
  /** the branches of a topic, in their new order, and what the sender had there before */
  branches?: Array<{ id: string; was: string[]; now: string[] }>
  /** the whole list of summaries on a topic whose summaries changed */
  summaries?: Array<{ id: string; list: SharedSummary[] }>
  /** relationships added or changed */
  relationships?: ViewRelationship[]
  relationshipsRemoved?: string[]
  /** relationships whose curve the user moved: the file's curve goes */
  reshaped?: string[]
  layout?: { layout: ViewLayout; exact: boolean }
}

export type MapOp =
  | { kind: 'edit'; sheet: SheetRef; edit: SheetEdit }
  | { kind: 'add-sheet'; sheet: XmindSheet }
  | { kind: 'rename-sheet'; sheet: SheetRef; title: string }
  | { kind: 'delete-sheet'; sheet: SheetRef }
  | { kind: 'theme'; sheet: SheetRef; theme: ThemeId }

/** Deeper than the engine lets a file be; a walk of something deeper stops. */
const MAX_DEPTH = 1024
const VALUE_KEYS = ['title', 'folded', 'labels', 'note', 'link'] as const
const LAYOUTS: readonly ViewLayout[] = ['left', 'right', 'both', 'down']
const STYLE_KEYS = ['color', 'fill', 'fontWeight', 'fontSize'] as const

export function sheetRefOf(view: ViewSheet): SheetRef {
  return { id: view.id, index: view.index }
}

export function sameSheet(a: SheetRef, b: SheetRef): boolean {
  return a.id !== null || b.id !== null ? a.id === b.id : a.index === b.index
}

// ---- making an edit ----

interface Indexed {
  topics: Map<string, ViewTopic>
  /** null for the central topic */
  parents: Map<string, string | null>
}

function indexed(view: ViewSheet): Indexed {
  const topics = new Map<string, ViewTopic>()
  const parents = new Map<string, string | null>()
  const pending: Array<[ViewTopic, string | null, number]> = [[view.root, null, 0]]
  for (let item = pending.pop(); item; item = pending.pop()) {
    const [topic, parent, depth] = item
    if (topics.has(topic.id) || depth > MAX_DEPTH) continue
    topics.set(topic.id, topic)
    parents.set(topic.id, parent)
    for (const child of topic.children) pending.push([child, topic.id, depth + 1])
  }
  return { topics, parents }
}

const idsOf = (topics: readonly ViewTopic[]): string[] => topics.map((topic) => topic.id)

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, at) => item === b[at])
}

function valuesOf(topic: ViewTopic): TopicValues {
  return {
    title: topic.title,
    folded: topic.folded,
    labels: [...topic.labels],
    note: topic.note || null,
    link: topic.link,
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b
}

function sharedSummaries(topic: ViewTopic): SharedSummary[] {
  const out: SharedSummary[] = []
  for (const summary of topic.summaries) {
    const from = topic.children[summary.start]?.id
    const to = topic.children[summary.end]?.id
    if (from === undefined || to === undefined) continue
    out.push({ id: summary.id, topicId: summary.topicId, title: summary.title, from, to })
  }
  return out
}

/**
 * What changed from `before` to `after` (two views of one sheet); null when
 * nothing did. `reshaped` names relationships whose curve the file lost.
 */
export function diffSheet(
  before: ViewSheet,
  after: ViewSheet,
  reshaped: readonly string[] = [],
): SheetEdit | null {
  const was = indexed(before)
  const now = indexed(after)
  const edit: SheetEdit = {}
  const added: NewTopic[] = []
  const values: Array<{ id: string } & Partial<TopicValues>> = []
  const branches: Array<{ id: string; was: string[]; now: string[] }> = []
  const summaries: Array<{ id: string; list: SharedSummary[] }> = []

  for (const [id, topic] of now.topics) {
    const old = was.topics.get(id)
    if (!old) {
      added.push({
        id,
        ...valuesOf(topic),
        image: topic.image ? { ...topic.image } : null,
        markers: [...topic.markers],
        style: { ...topic.style },
      })
    } else {
      const next = valuesOf(topic)
      const prev = valuesOf(old)
      const changed: { id: string } & Partial<TopicValues> = { id }
      let any = false
      for (const key of VALUE_KEYS) {
        if (sameValue(prev[key], next[key])) continue
        Object.assign(changed, { [key]: next[key] })
        any = true
      }
      if (any) values.push(changed)
    }
    const nowIds = idsOf(topic.children)
    const wasIds = old ? idsOf(old.children) : []
    if (!sameList(nowIds, wasIds)) branches.push({ id, was: wasIds, now: nowIds })
    const list = sharedSummaries(topic)
    if (JSON.stringify(list) !== JSON.stringify(old ? sharedSummaries(old) : [])) {
      summaries.push({ id, list })
    }
  }
  const removed = [...was.topics.keys()].filter((id) => !now.topics.has(id))

  const oldLines = new Map(before.relationships.map((line) => [line.id, line]))
  const newLines = new Map(after.relationships.map((line) => [line.id, line]))
  const lines: ViewRelationship[] = []
  for (const [id, line] of newLines) {
    const old = oldLines.get(id)
    if (old && old.fromId === line.fromId && old.toId === line.toId && old.title === line.title)
      continue
    lines.push({ id, fromId: line.fromId, toId: line.toId, title: line.title })
  }
  const linesRemoved = [...oldLines.keys()].filter((id) => !newLines.has(id))
  const moved = new Set(lines.map((line) => line.id))
  const curves = reshaped.filter((id) => oldLines.has(id) && newLines.has(id) && !moved.has(id))

  if (added.length > 0) edit.added = added
  if (removed.length > 0) edit.removed = removed
  if (values.length > 0) edit.values = values
  if (branches.length > 0) edit.branches = branches
  if (summaries.length > 0) edit.summaries = summaries
  if (lines.length > 0) edit.relationships = lines
  if (linesRemoved.length > 0) edit.relationshipsRemoved = linesRemoved
  if (curves.length > 0) edit.reshaped = curves
  if (before.layout !== after.layout || before.layoutExact !== after.layoutExact) {
    edit.layout = { layout: after.layout, exact: after.layoutExact }
  }
  return Object.keys(edit).length > 0 ? edit : null
}

// ---- laying an edit over a view ----

class Conflict extends Error {}

/**
 * The view `edit` makes of `view`, or null when the two cannot be put
 * together (a topic would end up under itself). The result is a state for
 * reconciling: the engine follows summaries over branches that moved, and
 * drops what a relationship lost its end with.
 */
export function mergeEdit(view: ViewSheet, edit: SheetEdit): ViewSheet | null {
  try {
    return merge(view, edit)
  } catch (error) {
    if (error instanceof Conflict) return null
    throw error
  }
}

function merge(view: ViewSheet, edit: SheetEdit): ViewSheet {
  const source = indexed(view)
  const removed = new Set(edit.removed ?? [])
  if (removed.has(view.root.id)) throw new Conflict()
  const nodes = new Map<string, ViewTopic>()
  for (const [id, topic] of source.topics) {
    if (removed.has(id)) continue
    nodes.set(id, {
      ...topic,
      labels: [...topic.labels],
      summaries: topic.summaries.map((summary) => ({ ...summary })),
      children: [],
    })
  }
  for (const topic of edit.added ?? []) {
    const { id, image, markers, style, ...values } = topic
    const there = nodes.get(id)
    // the same op once more (a catch-up that already held it): its values only
    if (there) Object.assign(there, values)
    else nodes.set(id, { id, ...values, image, markers, style, summaries: [], children: [] })
  }

  const placed = new Set<string>()
  for (const change of edit.branches ?? []) change.now.forEach((id) => placed.add(id))
  const changes = new Map((edit.branches ?? []).map((change) => [change.id, change]))
  const lists = new Map<string, string[]>()
  for (const id of nodes.keys()) {
    const current = idsOf(source.topics.get(id)?.children ?? [])
    const change = changes.get(id)
    lists.set(
      id,
      change
        ? mergeBranches(current, change, nodes, placed)
        : current.filter((child) => nodes.has(child) && !placed.has(child)),
    )
  }

  const shown = new Set<string>()
  const build = (id: string, depth: number): ViewTopic => {
    const node = nodes.get(id)
    if (!node || shown.has(id) || depth > MAX_DEPTH) throw new Conflict()
    shown.add(id)
    node.children = (lists.get(id) ?? []).map((child) => build(child, depth + 1))
    return node
  }
  const root = build(view.root.id, 0)
  // left out because its parent went: deleted with it; left out in a ring of
  // its own (one copy moved a under c, the other c under a): a conflict
  const parentOf = new Map<string, string>()
  for (const [id, list] of lists) list.forEach((child) => parentOf.set(child, id))
  for (const id of nodes.keys()) {
    const seen = new Set<string>()
    for (
      let up: string | undefined = id;
      up !== undefined && !shown.has(up);
      up = parentOf.get(up)
    ) {
      if (seen.has(up)) throw new Conflict()
      seen.add(up)
    }
  }

  for (const change of edit.values ?? []) {
    const node = shown.has(change.id) ? nodes.get(change.id) : undefined
    if (!node) continue
    for (const key of VALUE_KEYS) {
      if (change[key] !== undefined) Object.assign(node, { [key]: change[key] })
    }
  }

  const summaryLists = new Map((edit.summaries ?? []).map((entry) => [entry.id, entry.list]))
  // a summary the edit puts on one topic is not left behind on another
  const claimed = new Set<string>()
  for (const list of summaryLists.values()) list.forEach((summary) => claimed.add(summary.topicId))
  const ends = new Set(shown)
  for (const id of shown) {
    const node = nodes.get(id)!
    const list = summaryLists.get(id)
    node.summaries = list
      ? placeSummaries(node, list)
      : node.summaries.filter((summary) => !claimed.has(summary.topicId))
    node.summaries.forEach((summary) => ends.add(summary.topicId))
  }

  const lines = new Map(view.relationships.map((line) => [line.id, { ...line }]))
  for (const id of edit.relationshipsRemoved ?? []) lines.delete(id)
  for (const line of edit.relationships ?? []) lines.set(line.id, { ...line })
  const relationships = [...lines.values()].filter(
    (line) => ends.has(line.fromId) && ends.has(line.toId),
  )

  return {
    index: view.index,
    id: view.id,
    title: view.title,
    layout: edit.layout?.layout ?? view.layout,
    layoutExact: edit.layout?.exact ?? view.layoutExact,
    root,
    relationships,
  }
}

/**
 * The branches of a topic after an edit that reordered them: the sender's
 * order for the branches it knew, and the ones only this copy has after the
 * branch they followed here.
 */
function mergeBranches(
  current: readonly string[],
  change: { was: readonly string[]; now: readonly string[] },
  nodes: ReadonlyMap<string, ViewTopic>,
  placed: ReadonlySet<string>,
): string[] {
  const out = change.now.filter((id) => nodes.has(id))
  const known = new Set(change.was)
  const kept = new Set(out)
  let at = 0
  for (const id of current) {
    if (kept.has(id)) {
      at = out.indexOf(id) + 1
      continue
    }
    if (known.has(id) || placed.has(id) || !nodes.has(id)) continue
    out.splice(at, 0, id)
    kept.add(id)
    at++
  }
  return out
}

function placeSummaries(topic: ViewTopic, list: readonly SharedSummary[]): ViewSummary[] {
  const at = new Map(topic.children.map((child, index) => [child.id, index]))
  const out: ViewSummary[] = []
  for (const summary of list) {
    const start = at.get(summary.from)
    const end = at.get(summary.to)
    // what it covered is gone from here: it cannot be placed
    if (start === undefined || end === undefined || start > end) continue
    out.push({ id: summary.id, topicId: summary.topicId, title: summary.title, start, end })
  }
  return out
}

// ---- which ops can pass each other ----

/**
 * The parts of a sheet an edit depends on: `v:` a value of a topic, `p:` where
 * a topic is, `b:` the branches of a topic, `r:` a relationship.
 */
export function touches(edit: SheetEdit): Set<string> {
  const out = new Set<string>()
  for (const topic of edit.added ?? []) out.add(`p:${topic.id}`)
  for (const id of edit.removed ?? []) out.add(`p:${id}`)
  for (const change of edit.values ?? []) {
    for (const key of VALUE_KEYS) if (change[key] !== undefined) out.add(`v:${change.id}:${key}`)
  }
  for (const change of edit.branches ?? []) {
    out.add(`b:${change.id}`)
    const was = new Set(change.was)
    const now = new Set(change.now)
    for (const id of change.now) if (!was.has(id)) out.add(`p:${id}`)
    for (const id of change.was) if (!now.has(id)) out.add(`p:${id}`)
  }
  // summaries count positions among the branches
  for (const entry of edit.summaries ?? []) out.add(`b:${entry.id}`)
  for (const line of edit.relationships ?? []) {
    out.add(`r:${line.id}`)
    out.add(`p:${line.fromId}`)
    out.add(`p:${line.toId}`)
  }
  for (const id of edit.relationshipsRemoved ?? []) out.add(`r:${id}`)
  for (const id of edit.reshaped ?? []) out.add(`r:${id}`)
  if (edit.layout) out.add('layout')
  return out
}

/** Whether two ops give the same map in either order. */
export function commutes(a: MapOp, b: MapOp): boolean {
  // new sheets go to the end: two of them in another order are another file
  if (a.kind === 'add-sheet' || b.kind === 'add-sheet') return a.kind !== b.kind
  if (!sameSheet(a.sheet, b.sheet)) return true
  if (a.kind === 'edit' && b.kind === 'edit') {
    const mine = touches(a.edit)
    for (const part of touches(b.edit)) if (mine.has(part)) return false
    return true
  }
  // a title or a theme set twice ends with the later one
  return a.kind !== b.kind || a.kind === 'delete-sheet'
}

// ---- reading an op that came over the network ----

const isString = (value: unknown): value is string => typeof value === 'string'
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)
const isTextOrNull = (value: unknown): value is string | null => value === null || isString(value)
const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

function readRef(value: unknown): SheetRef | null {
  if (!isRecord(value) || !isTextOrNull(value.id)) return null
  const { index } = value
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return null
  return { id: value.id, index }
}

function readImage(value: unknown): ViewImage | null | undefined {
  if (value === null) return null
  if (!isRecord(value) || !isString(value.src) || !isTextOrNull(value.entryName)) return undefined
  if (!isNumberOrNull(value.width) || !isNumberOrNull(value.height)) return undefined
  return { src: value.src, entryName: value.entryName, width: value.width, height: value.height }
}

function readStyle(value: unknown): ViewTopicStyle | undefined {
  if (!isRecord(value)) return undefined
  const out: ViewTopicStyle = {}
  for (const key of STYLE_KEYS) {
    const item = value[key]
    if (item === undefined) continue
    if (!isString(item)) return undefined
    out[key] = item
  }
  return out
}

/** The values present in `value`, checked; undefined when one has the wrong type. */
function readValues(
  value: Record<string, unknown>,
  all: boolean,
): Partial<TopicValues> | undefined {
  const out: Partial<TopicValues> = {}
  const { title, folded, labels, note, link } = value
  if (title !== undefined || all) {
    if (!isString(title)) return undefined
    out.title = title
  }
  if (folded !== undefined || all) {
    if (typeof folded !== 'boolean') return undefined
    out.folded = folded
  }
  if (labels !== undefined || all) {
    if (!isStrings(labels)) return undefined
    out.labels = [...labels]
  }
  if (note !== undefined || all) {
    if (!isTextOrNull(note)) return undefined
    out.note = note
  }
  if (link !== undefined || all) {
    if (!isTextOrNull(link)) return undefined
    out.link = link
  }
  return out
}

function readList<T>(value: unknown, read: (item: unknown) => T | undefined): T[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) return undefined
  const out: T[] = []
  for (const item of value) {
    const read1 = read(item)
    if (read1 === undefined) return undefined
    out.push(read1)
  }
  return out
}

function readEdit(value: unknown): SheetEdit | null {
  if (!isRecord(value)) return null
  const added = readList(value.added, (item): NewTopic | undefined => {
    if (!isRecord(item) || !isString(item.id)) return undefined
    const values = readValues(item, true)
    const image = readImage(item.image)
    const style = readStyle(item.style)
    if (!values || image === undefined || !style || !isStrings(item.markers)) return undefined
    return { id: item.id, ...(values as TopicValues), image, markers: [...item.markers], style }
  })
  const values = readList(value.values, (item) => {
    if (!isRecord(item) || !isString(item.id)) return undefined
    const read = readValues(item, false)
    return read ? { id: item.id, ...read } : undefined
  })
  const branches = readList(value.branches, (item) =>
    isRecord(item) && isString(item.id) && isStrings(item.was) && isStrings(item.now)
      ? { id: item.id, was: [...item.was], now: [...item.now] }
      : undefined,
  )
  const summaries = readList(value.summaries, (item) => {
    if (!isRecord(item) || !isString(item.id)) return undefined
    const list = readList(item.list, (summary): SharedSummary | undefined =>
      isRecord(summary) &&
      isString(summary.id) &&
      isString(summary.topicId) &&
      isString(summary.title) &&
      isString(summary.from) &&
      isString(summary.to)
        ? {
            id: summary.id,
            topicId: summary.topicId,
            title: summary.title,
            from: summary.from,
            to: summary.to,
          }
        : undefined,
    )
    return list ? { id: item.id, list } : undefined
  })
  const relationships = readList(value.relationships, (item): ViewRelationship | undefined =>
    isRecord(item) &&
    isString(item.id) &&
    isString(item.fromId) &&
    isString(item.toId) &&
    isString(item.title)
      ? { id: item.id, fromId: item.fromId, toId: item.toId, title: item.title }
      : undefined,
  )
  const removed = readList(value.removed, (item) => (isString(item) ? item : undefined))
  const linesRemoved = readList(value.relationshipsRemoved, (item) =>
    isString(item) ? item : undefined,
  )
  const reshaped = readList(value.reshaped, (item) => (isString(item) ? item : undefined))
  if (
    !added ||
    !values ||
    !branches ||
    !summaries ||
    !relationships ||
    !removed ||
    !linesRemoved ||
    !reshaped
  ) {
    return null
  }
  const edit: SheetEdit = {}
  if (added.length > 0) edit.added = added
  if (removed.length > 0) edit.removed = removed
  if (values.length > 0) edit.values = values
  if (branches.length > 0) edit.branches = branches
  if (summaries.length > 0) edit.summaries = summaries
  if (relationships.length > 0) edit.relationships = relationships
  if (linesRemoved.length > 0) edit.relationshipsRemoved = linesRemoved
  if (reshaped.length > 0) edit.reshaped = reshaped
  if (value.layout !== undefined) {
    const { layout } = value
    if (!isRecord(layout) || typeof layout.exact !== 'boolean') return null
    if (!LAYOUTS.includes(layout.layout as ViewLayout)) return null
    edit.layout = { layout: layout.layout as ViewLayout, exact: layout.exact }
  }
  return edit
}

/** The op in `value`, checked and copied; null for anything that is not one. */
export function readOp(value: unknown): MapOp | null {
  if (!isRecord(value)) return null
  if (value.kind === 'add-sheet') {
    const { sheet } = value
    if (!isRecord(sheet) || !checkContentStructure([sheet]).ok) return null
    return { kind: 'add-sheet', sheet: structuredClone(sheet) as XmindSheet }
  }
  const sheet = readRef(value.sheet)
  if (!sheet) return null
  switch (value.kind) {
    case 'edit': {
      const edit = readEdit(value.edit)
      return edit ? { kind: 'edit', sheet, edit } : null
    }
    case 'rename-sheet':
      return isString(value.title) ? { kind: 'rename-sheet', sheet, title: value.title } : null
    case 'delete-sheet':
      return { kind: 'delete-sheet', sheet }
    case 'theme':
      return isThemeId(value.theme) ? { kind: 'theme', sheet, theme: value.theme } : null
    default:
      return null
  }
}

// ---- checking a result ----

/**
 * Whether the view after reconciling shows what the state asked for. Summary
 * positions are left out (the engine moves a summary along with the branches
 * it covers), so are the ids of summary records.
 */
export function showsState(state: ViewSheet, view: ViewSheet): boolean {
  return shown(state) === shown(view)
}

function shown(sheet: ViewSheet): string {
  const topic = (node: ViewTopic): unknown => [
    node.id,
    node.title,
    node.folded,
    node.labels,
    node.note || null,
    node.link,
    node.image ? [node.image.src, node.image.entryName, node.image.width, node.image.height] : null,
    node.markers,
    STYLE_KEYS.map((key) => node.style[key] ?? null),
    node.summaries.map((summary) => JSON.stringify([summary.topicId, summary.title])).sort(),
    node.children.map(topic),
  ]
  const lines = sheet.relationships
    .map((line) => JSON.stringify([line.id, line.fromId, line.toId, line.title]))
    .sort()
  return JSON.stringify([sheet.layout, topic(sheet.root), lines])
}
