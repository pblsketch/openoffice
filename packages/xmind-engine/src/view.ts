/**
 * The view data: what the editor is given to draw and edit, per sheet.
 *
 * This is the engine's own shape, not the data shape of the drawing library;
 * the editor converts. It carries only what is shown or edited: titles, the
 * order of branches, folding, labels, the note as plain text, the link,
 * summaries, relationships, boundaries, the layout, the picture reference, the
 * width given to a topic's box, marker ids, the style values set on a topic
 * itself, the parts of a title that carry a text format of their own, and the
 * line format of branches, relationships (with their curve), summary brackets
 * and boundaries (see `line-style.ts`).
 *
 * Everything else stays in the source tree and is not here: boundaries that
 * cannot be drawn, floating topics, callouts, the branches under a summary
 * topic, links to topics and to attachments, the end points of a curve, sheet
 * styles, extensions, themes and every key the engine does not know. A view is a fresh copy on every call; it
 * shares nothing with the tree and reading it never changes the tree.
 *
 * The readers here take whatever the file holds in a modelled key and fall back
 * to "not there" for a shape they do not expect. They never throw.
 */

import { layoutFromStructureClass, type ViewLayout } from './layout'
import {
  BOUNDARY_STYLE_PROPERTIES,
  BRANCH_LINE_PROPERTIES,
  readCurve,
  RELATIONSHIP_STYLE_PROPERTIES,
  styleValues,
  SUMMARY_STYLE_PROPERTIES,
  type ViewBoundaryStyle,
  type ViewBranchLine,
  type ViewCurve,
  type ViewRelationshipStyle,
  type ViewSummaryStyle,
} from './line-style'
import { noteText } from './notes'
import { titleRunsToView, type ViewTitleRun } from './text-style'
import { isRecord, type XmindSheet, type XmindTopic } from './types'

export interface ViewSheet {
  /** position of the sheet in the file; sheets are addressed by this, not by id */
  index: number
  /** the sheet's id, or null when the file gives none */
  id: string | null
  title: string
  /** how the central topic's branches are drawn */
  layout: ViewLayout
  /** false when `layout` stands in for an arrangement the editor cannot draw */
  layoutExact: boolean
  root: ViewTopic
  relationships: ViewRelationship[]
  /**
   * The boundaries the editor can draw, in file order, the ones under folded
   * branches included. Always there in a view. A state that leaves it out
   * changes no boundary.
   */
  boundaries?: ViewBoundary[]
}

export interface ViewTopic {
  /** the topic's id in the file: what a view topic is matched back by */
  id: string
  title: string
  folded: boolean
  labels: string[]
  /** the note as plain text; null when the topic has none */
  note: string | null
  /**
   * the topic's link as the file holds it, whatever it points at: a web
   * address, or one nothing will ever open (`javascript:`, `file:`). It is
   * text to show, not something to trust. A link to another topic or to an
   * attachment is not shown and is null here.
   */
  link: string | null
  image: ViewImage | null
  /**
   * the width the user gave the topic's box, in pixels (`customWidth`); left
   * out when the topic takes the width of its text
   */
  width?: number
  /** marker ids only, e.g. `priority-1` */
  markers: string[]
  style: ViewTopicStyle
  /**
   * the line values set on the topic itself (`line-class`, `line-width`,
   * `line-color`, `line-pattern`), as the file holds them; left out when the
   * topic has none
   */
  line?: ViewBranchLine
  /**
   * the title cut into parts that carry a text format of their own; null when
   * the title is one plain run (see `text-style.ts`). The parts' text is the title.
   */
  titleRuns: ViewTitleRun[] | null
  /** summaries over this topic's branches */
  summaries: ViewSummary[]
  /** the attached branches, in file order */
  children: ViewTopic[]
}

/** Values set on the topic itself, as the strings the file holds (`#rrggbb`, `700`, `14pt`, `italic`). */
export interface ViewTopicStyle {
  color?: string
  fill?: string
  fontWeight?: string
  fontSize?: string
  fontFamily?: string
  fontStyle?: string
  textDecoration?: string
  textAlign?: string
  textTransform?: string
}

export interface ViewImage {
  /** the reference as written in the file */
  src: string
  /** the archive entry holding the picture, when `src` points into the file */
  entryName: string | null
  width: number | null
  height: number | null
}

/** A summary bracket over branches `start`..`end` (inclusive) of the topic that carries it. */
export interface ViewSummary {
  /** id of the summary record */
  id: string
  /** id of the summary topic that holds the title */
  topicId: string
  title: string
  start: number
  end: number
  /** the values of the summary record's own style (the bracket); left out when it has none */
  style?: ViewSummaryStyle
}

/** A line between two shown topics. An end is a `ViewTopic.id` or a `ViewSummary.topicId`. */
export interface ViewRelationship {
  id: string
  fromId: string
  toId: string
  title: string
  /** the relationship's style values, as the file holds them; left out when it has none */
  style?: ViewRelationshipStyle
  /**
   * the curve the file gives (`controlPoints`); left out when it gives none
   * that can be read, and the line is drawn on its own. In a state, `null`
   * asks for the automatic curve.
   */
  curve?: ViewCurve | null
}

/**
 * A boundary around branches of a shown topic, or around the topic itself.
 * One on a topic the view does not show, or with a range that cannot be read
 * or reaches past the branches, is not drawn and stays in the file only.
 */
export interface ViewBoundary {
  /** id of the boundary record */
  id: string
  /** id of the topic that carries the record */
  topicId: string
  /** branches `start`..`end` (inclusive) of that topic, or `'master'`: the topic itself */
  range: ViewBoundaryRange
  title: string
  style: ViewBoundaryStyle
}

export type ViewBoundaryRange = { start: number; end: number } | 'master'

/** The view of one sheet of the source tree. */
export function sheetToView(sheet: XmindSheet, index: number): ViewSheet {
  const shown = new Set<string>()
  const root = topicToView(sheet.rootTopic, shown)
  const boundaries = shownSheetBoundaries(sheet).map((shownBoundary): ViewBoundary => ({
    id: shownBoundary.id,
    topicId: shownBoundary.owner.id,
    range: shownBoundary.range,
    title: stringOr(shownBoundary.record.title, ''),
    style: styleValues(shownBoundary.record.style, BOUNDARY_STYLE_PROPERTIES),
  }))
  const { layout, exact } = layoutFromStructureClass(sheet.rootTopic.structureClass)
  return {
    index,
    id: typeof sheet.id === 'string' ? sheet.id : null,
    title: stringOr(sheet.title, ''),
    layout,
    layoutExact: exact,
    root,
    relationships: relationshipsToView(sheet.relationships, shown),
    boundaries,
  }
}

/**
 * Recursion is bounded: the structure check refuses trees deeper than
 * MAX_TOPIC_DEPTH. `shown` collects the ids a relationship may end on: the
 * topic itself and the summary topics of the summaries it shows.
 */
function topicToView(topic: XmindTopic, shown: Set<string>): ViewTopic {
  shown.add(topic.id)
  const attached = topic.children?.attached ?? []
  const summaries = summariesToView(topic, attached.length)
  for (const summary of summaries) shown.add(summary.topicId)
  const width = topicWidth(topic.customWidth)
  const line = styleValues(topic.style, BRANCH_LINE_PROPERTIES)
  return {
    id: topic.id,
    title: stringOr(topic.title, ''),
    folded: topic.branch === 'folded',
    labels: strings(topic.labels),
    note: noteText(topic.notes),
    link: isShownLink(topic.href) ? topic.href : null,
    image: imageToView(topic.image),
    ...(width === null ? {} : { width }),
    markers: records(topic.markers)
      .map((marker) => marker.markerId)
      .filter((id): id is string => typeof id === 'string'),
    style: styleToView(topic.style),
    ...(Object.keys(line).length > 0 ? { line } : {}),
    titleRuns: titleRunsToView(topic.attributedTitle, stringOr(topic.title, '')),
    summaries,
    children: attached.map((child) => topicToView(child, shown)),
  }
}

/**
 * Whether an `href` is a web link: `http`, `https` or `mailto`. These are the
 * links the outline text writes, and the only ones worth offering to open.
 */
export function isWebLink(href: unknown): href is string {
  return typeof href === 'string' && /^(?:https?:\/\/|mailto:)/i.test(href)
}

/**
 * Whether an `href` is one of the two references into the file itself: a link
 * to another topic (`xmind:#…`) or to an attachment (`xap:…`). The editor does
 * not show these; they stay in the file as they are.
 */
export function isInternalLink(href: unknown): href is string {
  return typeof href === 'string' && /^\s*(?:xmind|xap):/i.test(href)
}

/**
 * Whether a topic's `href` is a link the editor shows and edits: any text
 * that is not empty and not an internal reference. That includes addresses
 * nothing should open; showing one is not opening it.
 */
export function isShownLink(href: unknown): href is string {
  return typeof href === 'string' && href.trim() !== '' && !isInternalLink(href)
}

const ATTACHMENT_SCHEME = 'xap:'

/**
 * The width a topic's box was given, when the file holds one that can be
 * drawn: a positive number. Any other value stays in the file and is not shown.
 */
export function topicWidth(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function imageToView(image: unknown): ViewImage | null {
  if (!isRecord(image) || typeof image.src !== 'string' || image.src === '') return null
  const { src } = image
  return {
    src,
    entryName: src.startsWith(ATTACHMENT_SCHEME) ? src.slice(ATTACHMENT_SCHEME.length) : null,
    width: finiteOr(image.width, null),
    height: finiteOr(image.height, null),
  }
}

/** The style properties the view carries, by the name the file uses for each. */
const STYLE_PROPERTIES = {
  color: 'fo:color',
  fill: 'svg:fill',
  fontWeight: 'fo:font-weight',
  fontSize: 'fo:font-size',
  fontFamily: 'fo:font-family',
  fontStyle: 'fo:font-style',
  textDecoration: 'fo:text-decoration',
  textAlign: 'fo:text-align',
  textTransform: 'fo:text-transform',
} as const satisfies Record<keyof ViewTopicStyle, string>

function styleToView(style: unknown): ViewTopicStyle {
  const properties = isRecord(style) && isRecord(style.properties) ? style.properties : {}
  const out: ViewTopicStyle = {}
  for (const [key, property] of Object.entries(STYLE_PROPERTIES)) {
    const value = properties[property]
    if (typeof value === 'string') out[key as keyof ViewTopicStyle] = value
  }
  return out
}

/**
 * A summary is shown when its record names a summary topic that exists and a
 * range that lies inside the branches. Any other record stays in the file only.
 */
function summariesToView(topic: XmindTopic, branchCount: number): ViewSummary[] {
  const titles = new Map<string, string>()
  for (const summaryTopic of topic.children?.summary ?? []) {
    titles.set(summaryTopic.id, stringOr(summaryTopic.title, ''))
  }
  const out: ViewSummary[] = []
  for (const record of records(topic.summaries)) {
    const { id, topicId } = record
    const range = parseRange(record.range)
    if (typeof id !== 'string' || typeof topicId !== 'string' || !range) continue
    const title = titles.get(topicId)
    if (title === undefined || range.end >= branchCount) continue
    const style = styleValues(record.style, SUMMARY_STYLE_PROPERTIES)
    out.push({
      id,
      topicId,
      title,
      start: range.start,
      end: range.end,
      ...(Object.keys(style).length > 0 ? { style } : {}),
    })
  }
  return out
}

/** A boundary record the editor can draw, with its range read. */
export interface ShownBoundaryRecord {
  id: string
  range: ViewBoundaryRange
  record: Record<string, unknown>
}

/**
 * The boundary records of a topic that can be drawn when the topic is shown,
 * in file order: those with an id and a range that is `master` or lies inside
 * the topic's branches.
 */
export function shownBoundaryRecords(topic: XmindTopic): ShownBoundaryRecord[] {
  const branchCount = topic.children?.attached?.length ?? 0
  const out: ShownBoundaryRecord[] = []
  for (const record of records(topic.boundaries)) {
    if (typeof record.id !== 'string' || record.id === '') continue
    if (record.range === 'master') {
      out.push({ id: record.id, range: 'master', record })
      continue
    }
    const range = parseRange(record.range)
    if (!range || range.end >= branchCount) continue
    out.push({ id: record.id, range, record })
  }
  return out
}

/**
 * The boundary records the view of a sheet shows, each with the topic that
 * carries it: those of `shownBoundaryRecords` on the attached branches, the
 * central topic first and each topic before its branches. Of records that
 * share an id only the first is shown, as the editor keeps the first; the
 * others stay in the file as they are.
 */
export function shownSheetBoundaries(
  sheet: XmindSheet,
): (ShownBoundaryRecord & { owner: XmindTopic })[] {
  const out: (ShownBoundaryRecord & { owner: XmindTopic })[] = []
  const ids = new Set<string>()
  const pending: XmindTopic[] = [sheet.rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    for (const shownBoundary of shownBoundaryRecords(topic)) {
      if (ids.has(shownBoundary.id)) continue
      ids.add(shownBoundary.id)
      out.push({ ...shownBoundary, owner: topic })
    }
    const attached = topic.children?.attached ?? []
    for (let at = attached.length - 1; at >= 0; at--) pending.push(attached[at]!)
  }
  return out
}

/**
 * Reads the `"(start,end)"` range of a summary or boundary: positions in the
 * carrying topic's attached branches, counted from 0, end included. Null for
 * any other form.
 */
export function parseRange(range: unknown): { start: number; end: number } | null {
  if (typeof range !== 'string') return null
  const match = /^\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*$/.exec(range)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end
    ? { start, end }
    : null
}

/** Writes a range the way the format does: no space after the comma. */
export function formatRange(start: number, end: number): string {
  return `(${start},${end})`
}

/**
 * A relationship is shown when both of its ends are shown: a branch of the
 * tree, or the summary topic of a shown summary. One that ends on a floating
 * topic, a callout or a branch under a summary topic stays in the file only.
 */
function relationshipsToView(relationships: unknown, shown: Set<string>): ViewRelationship[] {
  const out: ViewRelationship[] = []
  for (const relationship of records(relationships)) {
    const { id, end1Id, end2Id } = relationship
    if (typeof id !== 'string' || typeof end1Id !== 'string' || typeof end2Id !== 'string') continue
    if (!shown.has(end1Id) || !shown.has(end2Id)) continue
    const style = styleValues(relationship.style, RELATIONSHIP_STYLE_PROPERTIES)
    const curve = readCurve(relationship.controlPoints)
    out.push({
      id,
      fromId: end1Id,
      toId: end2Id,
      title: stringOr(relationship.title, ''),
      ...(Object.keys(style).length > 0 ? { style } : {}),
      ...(curve ? { curve } : {}),
    })
  }
  return out
}

function stringOr<T>(value: unknown, fallback: T): string | T {
  return typeof value === 'string' ? value : fallback
}

function finiteOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}
