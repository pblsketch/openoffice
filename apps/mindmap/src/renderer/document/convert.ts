/**
 * The two directions between the engine's view data and the data shape of the
 * drawing library.
 *
 * View to library (`viewToMind`): what the library is given to draw. Only
 * fields listed here are ever set on a node, and none of them is a field the
 * library turns into markup or into a link of its own:
 *
 * - `topic` is the title; the instance draws it as text (see `text-guard.ts`).
 * - `tags` are derived, for display only: the labels as plain strings, and one
 *   chip each for a note and for a link. The library sets them with
 *   `textContent`. The link chip is a span holding the address as text,
 *   whatever the address is; it is never an anchor.
 * - `metadata` carries the values themselves (labels, note, link, the text
 *   format in `style` and `titleRuns`) plus what the editor shows without
 *   editing (picture, markers, the fill in `style`).
 * - `dangerouslySetInnerHTML`, `hyperLink`, `image`, `icons` and `style` are
 *   never set.
 *
 * Library to state (`mindToState`): the state handed to reconciling. Values
 * are read from `metadata` only; what is drawn (`tags`) is never read back.
 *
 * Summaries and relationships need care, because the library forgets them on
 * its own: a summary whose range no longer fits is dropped, and so is a
 * relationship whose end it cannot draw. The file must not lose them for that.
 * So a summary or relationship the last view had stays in the state unless the
 * user removed it (`removedSummaries`, `removedRelationships`) or it lost an
 * end; the engine then follows the branches it covered by itself.
 */
import type { MindElixirData, NodeObj, TagObj } from 'mind-elixir'
import {
  isShownLink,
  isWritableTextStyle,
  MAX_TITLE_RUNS,
  newXmindId,
  RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  type ViewRunStyle,
  type ViewTitleRun,
  type ViewImage,
  type ViewLayout,
  type ViewRelationship,
  type ViewSheet,
  type ViewSummary,
  type ViewTopic,
  type ViewTopicStyle,
} from '@genoffice/xmind-engine'

/** The library's records for a relationship and a summary; its package exports the types only through its data shape. */
export type Arrow = NonNullable<MindElixirData['arrows']>[number]
export type Summary = NonNullable<MindElixirData['summaries']>[number]

/** What a node carries besides its title. Markers and the fill are shown only. */
export interface MapNodeMeta {
  labels: string[]
  note: string | null
  link: string | null
  image: ViewImage | null
  markers: string[]
  style: ViewTopicStyle
  /** the title in parts with a text format of their own; null for a plain title */
  titleRuns: ViewTitleRun[] | null
}

export type MapNode = NodeObj<MapNodeMeta>

/** Class names of the chips drawn after the labels. Styled in `map.css`; clicks are handled by the controller. */
export const NOTE_CHIP_CLASS = 'mm-chip mm-chip-note'
export const LINK_CHIP_CLASS = 'mm-chip mm-chip-link'
/** The note chip's text: a neutral glyph, the same in every language. */
const NOTE_CHIP_TEXT = '≡'

type Direction = 0 | 1 | 2 | 3

/**
 * The library knows four directions. A tree and a timeline are drawn on top
 * of one of them, by the editor's own rules (`map.css`, `branches.ts`): the
 * tree on the direction to the right, the timeline on the one downward, whose
 * main topics already stand in a row. `map` is a direction drawn as it is.
 */
export type MapStructure = 'map' | 'tree' | 'timeline'

const DIRECTION_OF: Readonly<Record<ViewLayout, Direction>> = {
  left: 0,
  right: 1,
  both: 2,
  down: 3,
  tree: 1,
  timeline: 3,
}
const LAYOUT_OF: readonly ViewLayout[] = ['left', 'right', 'both', 'down']

export function directionOfLayout(layout: ViewLayout): Direction {
  return DIRECTION_OF[layout]
}

export function structureOfLayout(layout: ViewLayout): MapStructure {
  return layout === 'tree' || layout === 'timeline' ? layout : 'map'
}

/** The layout of a library direction drawn as `structure`. A structure that does not sit on that direction is not drawn. */
export function layoutOfDirection(direction: unknown, structure: MapStructure = 'map'): ViewLayout {
  if (structure !== 'map' && direction === DIRECTION_OF[structure]) return structure
  return typeof direction === 'number' ? (LAYOUT_OF[direction] ?? 'both') : 'both'
}

export function emptyMeta(): MapNodeMeta {
  return {
    labels: [],
    note: null,
    link: null,
    image: null,
    markers: [],
    style: {},
    titleRuns: null,
  }
}

/** The tags a node is drawn with. Plain text only. */
export function tagsOf(meta: MapNodeMeta): (string | TagObj)[] {
  const tags: (string | TagObj)[] = [...meta.labels]
  if (meta.note) tags.push({ text: NOTE_CHIP_TEXT, className: NOTE_CHIP_CLASS })
  if (meta.link) tags.push({ text: meta.link, className: LINK_CHIP_CLASS })
  return tags
}

/** A node object for a topic of the view. `withTags` leaves `tags` out when there is nothing to draw. */
function withTags(node: MapNode): MapNode {
  const tags = tagsOf(node.metadata ?? emptyMeta())
  if (tags.length > 0) node.tags = tags
  else delete node.tags
  return node
}

/** The node to hand the library when a topic's labels, note or link change. */
export function nodePatch(meta: MapNodeMeta): Pick<MapNode, 'metadata' | 'tags'> {
  return { metadata: meta, tags: tagsOf(meta) }
}

function topicToNode(topic: ViewTopic, isRoot: boolean): MapNode {
  const node: MapNode = {
    id: topic.id,
    topic: topic.title,
    metadata: {
      labels: [...topic.labels],
      note: topic.note,
      link: topic.link,
      image: topic.image ? { ...topic.image } : null,
      markers: [...topic.markers],
      style: { ...topic.style },
      titleRuns: topic.titleRuns ? copyRuns(topic.titleRuns) : null,
    },
  }
  // The library has no fold handle on the central topic; its value is kept by `mindToState`.
  if (topic.folded && !isRoot) node.expanded = false
  if (topic.children.length > 0)
    node.children = topic.children.map((child) => topicToNode(child, false))
  return withTags(node)
}

/** What the library is given to draw one sheet. */
export function viewToMind(view: ViewSheet): MindElixirData {
  const nodeData = topicToNode(view.root, true)
  const direction = directionOfLayout(view.layout)
  if (direction === 2) {
    // Both sides: the first half of the main branches to the right, the rest to the left.
    const mains = nodeData.children ?? []
    const right = Math.ceil(mains.length / 2)
    mains.forEach((main, at) => {
      main.direction = at < right ? 1 : 0
    })
  }
  const summaries: Summary[] = []
  const collect = (topic: ViewTopic): void => {
    for (const summary of topic.summaries) {
      summaries.push({
        id: summary.topicId,
        label: summary.title,
        parent: topic.id,
        start: summary.start,
        end: summary.end,
      })
    }
    topic.children.forEach(collect)
  }
  collect(view.root)
  const arrows: Arrow[] = view.relationships.map((relationship) => ({
    id: relationship.id,
    label: relationship.title,
    from: relationship.fromId,
    to: relationship.toId,
  }))
  return { nodeData, arrows, summaries, direction }
}

/** What `mindToState` needs to know besides the library's data. */
export interface StateBase {
  /** the view the screen was last brought in line with */
  view: ViewSheet
  /** the user picked a layout since then, so the layout shown is meant */
  layoutPicked: boolean
  /** summary topic ids of summaries the user removed since then */
  removedSummaries: ReadonlySet<string>
  /** ids of relationships the user removed since then */
  removedRelationships: ReadonlySet<string>
  /** how the screen draws the library's direction; absent: as the last view was drawn */
  structure?: MapStructure
}

function readMeta(value: unknown): MapNodeMeta {
  const meta = isObject(value) ? value : {}
  return {
    labels: Array.isArray(meta.labels)
      ? meta.labels.filter((label) => typeof label === 'string')
      : [],
    note: typeof meta.note === 'string' && meta.note !== '' ? meta.note : null,
    link: isShownLink(meta.link) ? meta.link : null,
    image: isObject(meta.image) ? (meta.image as unknown as ViewImage) : null,
    markers: Array.isArray(meta.markers)
      ? meta.markers.filter((marker) => typeof marker === 'string')
      : [],
    style: isObject(meta.style) ? (meta.style as ViewTopicStyle) : {},
    titleRuns: Array.isArray(meta.titleRuns) ? (meta.titleRuns as ViewTitleRun[]) : null,
  }
}

function copyRuns(runs: readonly ViewTitleRun[]): ViewTitleRun[] {
  return runs.map((run) => ({ text: run.text, style: { ...run.style } }))
}

/**
 * The state of one sheet as the screen shows it, in the engine's view shape.
 * `data` is what the library's `getData()` returned.
 */
export function mindToState(data: MindElixirData, base: StateBase): ViewSheet {
  const byId = new Map<string, ViewTopic>()
  const toTopic = (node: NodeObj, isRoot: boolean): ViewTopic => {
    const meta = readMeta(node.metadata)
    const topic: ViewTopic = {
      id: String(node.id),
      title: typeof node.topic === 'string' ? node.topic : String(node.topic ?? ''),
      folded: isRoot ? base.view.root.folded : node.expanded === false,
      labels: meta.labels,
      note: meta.note,
      link: meta.link,
      image: meta.image,
      markers: meta.markers,
      style: meta.style,
      titleRuns: meta.titleRuns,
      summaries: [],
      children: [],
    }
    // The first topic under an id wins; a second one is left to the engine to refuse.
    if (!byId.has(topic.id)) byId.set(topic.id, topic)
    topic.children = (node.children ?? []).map((child) => toTopic(child, false))
    return topic
  }
  const root = toTopic(data.nodeData, true)

  const ends = new Set(byId.keys())
  placeSummaries(data.summaries ?? [], base, byId, ends)

  const layout = layoutOfDirection(
    data.direction,
    base.structure ?? structureOfLayout(base.view.layout),
  )
  return {
    index: base.view.index,
    id: base.view.id,
    title: base.view.title,
    layout,
    layoutExact: base.layoutPicked || layout !== base.view.layout ? true : base.view.layoutExact,
    root,
    relationships: relationshipsOf(data.arrows ?? [], base, ends),
  }
}

function placeSummaries(
  shown: readonly Summary[],
  base: StateBase,
  byId: ReadonlyMap<string, ViewTopic>,
  ends: Set<string>,
): void {
  const labels = new Map(shown.map((summary) => [summary.id, summary.label]))
  const known = new Set<string>()
  const keep = (topic: ViewTopic): void => {
    for (const summary of topic.summaries) {
      known.add(summary.topicId)
      if (base.removedSummaries.has(summary.topicId)) continue
      const owner = byId.get(topic.id)
      // Its topic is gone: the engine decides whether a covered branch lives on elsewhere.
      if (!owner) continue
      const label = labels.get(summary.topicId)
      // The range is handed back as the file has it; the engine follows the branches.
      owner.summaries.push({ ...summary, title: typeof label === 'string' ? label : summary.title })
      ends.add(summary.topicId)
    }
    topic.children.forEach(keep)
  }
  keep(base.view.root)

  for (const summary of shown) {
    if (known.has(summary.id) || ends.has(summary.id)) continue
    const owner = byId.get(summary.parent)
    if (!owner || !isRange(summary.start, summary.end, owner.children.length)) continue
    const added: ViewSummary = {
      id: newXmindId(),
      topicId: summary.id,
      title: typeof summary.label === 'string' ? summary.label : '',
      start: summary.start,
      end: summary.end,
    }
    owner.summaries.push(added)
    ends.add(summary.id)
  }
}

function relationshipsOf(
  shown: readonly Arrow[],
  base: StateBase,
  ends: ReadonlySet<string>,
): ViewRelationship[] {
  const drawn = new Map(shown.map((arrow) => [arrow.id, arrow]))
  const out: ViewRelationship[] = []
  const known = new Set<string>()
  for (const relationship of base.view.relationships) {
    known.add(relationship.id)
    if (base.removedRelationships.has(relationship.id)) continue
    // One that lost an end goes with it, exactly as the engine would take it out.
    if (!ends.has(relationship.fromId) || !ends.has(relationship.toId)) continue
    const arrow = drawn.get(relationship.id)
    out.push({
      ...relationship,
      title: arrow && typeof arrow.label === 'string' ? arrow.label : relationship.title,
    })
  }
  for (const arrow of shown) {
    if (known.has(arrow.id)) continue
    if (!ends.has(arrow.from) || !ends.has(arrow.to)) continue
    known.add(arrow.id)
    out.push({
      id: arrow.id,
      fromId: arrow.from,
      toId: arrow.to,
      title: typeof arrow.label === 'string' ? arrow.label : '',
    })
  }
  return out
}

function isRange(start: unknown, end: unknown, branches: number): boolean {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    (start as number) >= 0 &&
    (start as number) <= (end as number) &&
    (end as number) < branches
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Cleans a node tree that came from the clipboard, in place, before the
 * library draws it. The clipboard is text any program can write, and the
 * library would otherwise take a pasted `dangerouslySetInnerHTML`, link or
 * picture address as it is.
 *
 * What stays: the id (the library replaces it anyway), the title as text,
 * folding, the side, the labels, note and web link, the text format values
 * the engine would write, the parts of the title when they spell it, and the
 * children. What a state cannot write (picture, markers, the fill) is cleared,
 * so the screen never shows something the file will not hold.
 */
export function cleanPastedNode(node: unknown, depth = 0): void {
  if (!isObject(node)) return
  const pasted = readMeta(node.metadata)
  const title = typeof node.topic === 'string' ? node.topic : String(node.topic ?? '')
  const meta: MapNodeMeta = {
    ...emptyMeta(),
    labels: pasted.labels,
    note: pasted.note,
    link: pasted.link,
    style: writableTextStyle(pasted.style),
    titleRuns: writableRuns(pasted.titleRuns, title),
  }
  const kept: Record<string, unknown> = {
    id: typeof node.id === 'string' ? node.id : '',
    topic: title,
  }
  if (node.expanded === false) kept.expanded = false
  if (node.direction === 0 || node.direction === 1) kept.direction = node.direction
  const tags = tagsOf(meta)
  if (tags.length > 0) kept.tags = tags
  kept.metadata = meta
  // Deeper than a file may nest: the rest is cut rather than walked.
  const children = Array.isArray(node.children) && depth < MAX_PASTE_DEPTH ? node.children : []
  const branches = children.filter(isObject)
  branches.forEach((child) => cleanPastedNode(child, depth + 1))
  if (branches.length > 0) kept.children = branches
  for (const key of Object.keys(node)) delete node[key]
  Object.assign(node, kept)
}

const MAX_PASTE_DEPTH = 200

/** The text format values of a style that the engine would write; nothing else. */
function writableTextStyle(style: unknown): ViewTopicStyle {
  const out: ViewTopicStyle = {}
  if (!isObject(style)) return out
  for (const key of TEXT_STYLE_KEYS) {
    const value = style[key]
    if (typeof value === 'string' && isWritableTextStyle(key, value)) out[key] = value
  }
  return out
}

/** Parts of a title that spell it, each with the values the engine would write; null otherwise. */
function writableRuns(runs: unknown, title: string): ViewTitleRun[] | null {
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > MAX_TITLE_RUNS) return null
  const out: ViewTitleRun[] = []
  for (const run of runs as unknown[]) {
    if (!isObject(run) || typeof run.text !== 'string') return null
    const style: ViewRunStyle = {}
    const given = isObject(run.style) ? run.style : {}
    for (const key of RUN_STYLE_KEYS) {
      const value = given[key]
      if (typeof value === 'string' && isWritableTextStyle(key, value)) style[key] = value
    }
    out.push({ text: run.text, style })
  }
  if (out.map((run) => run.text).join('') !== title) return null
  return out.some((run) => Object.keys(run.style).length > 0) ? out : null
}

/** The shape of an id the file format uses, and so the only shape a new topic's id is kept in. */
export const XMIND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Node fields the library would draw as given (markup, a link, a picture, inline styles). Never set by this editor. */
const DRAWN_AS_GIVEN = ['dangerouslySetInnerHTML', 'hyperLink', 'image', 'icons', 'style'] as const

/**
 * Brings a node tree that was edited as data into the shape the editor
 * draws, in place: fields the library would draw as given are removed, titles
 * are text, labels, note and link are read as values and the tags are made
 * from them again, and a topic the file does not know gets an id the file can
 * keep. `known` are the topic ids of the last view.
 */
export function normaliseTree(root: NodeObj, known: ReadonlySet<string>): void {
  const seen = new Set<string>()
  const visit = (node: NodeObj, depth: number): void => {
    const loose = node as unknown as Record<string, unknown>
    for (const key of DRAWN_AS_GIVEN) delete loose[key]
    if (typeof node.topic !== 'string') node.topic = String(node.topic ?? '')
    const id = typeof node.id === 'string' ? node.id : ''
    if (id === '' || seen.has(id) || (!known.has(id) && !XMIND_ID.test(id))) node.id = newXmindId()
    seen.add(node.id)
    const meta = readMeta(node.metadata)
    node.metadata = meta
    withTags(node as MapNode)
    if (!Array.isArray(node.children) || depth >= MAX_PASTE_DEPTH) {
      delete node.children
      return
    }
    node.children = node.children.filter(isObject) as unknown as NodeObj[]
    for (const child of node.children) visit(child, depth + 1)
  }
  visit(root, 0)
}

/** Every topic id of a view. */
export function topicIdsOf(view: ViewSheet): Set<string> {
  const ids = new Set<string>()
  const visit = (topic: ViewTopic): void => {
    ids.add(topic.id)
    topic.children.forEach(visit)
  }
  visit(view.root)
  return ids
}
