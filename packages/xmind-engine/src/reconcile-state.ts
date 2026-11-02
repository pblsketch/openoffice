/**
 * Reading the state the editor hands in for reconciling.
 *
 * The state comes from a renderer window and is not trusted: it is typed as
 * view data, but nothing has checked that. Everything reconciling reads is
 * checked and copied here first, so the rest works on values of a known shape
 * and never on the caller's objects. What reconciling never writes (markers,
 * the sheet's own title) is not looked at.
 *
 * Style values are kept as strings under the names the view uses; whether one
 * has a shape the engine writes is decided where it is written. A key left out
 * of a state is "not set", except for the boundaries of a sheet and the curve
 * of a relationship, where a missing key means "not carried": nothing changes.
 * A curve that is not two points is read as not carried too: the file keeps
 * its own, and the rest of the state still applies.
 */

import { VIEW_LAYOUTS, type ViewLayout } from './layout'
import { MAX_TOPIC_DEPTH } from './structure-check'
import {
  MAX_TITLE_RUNS,
  RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  type TextStyleKey,
  type ViewRunStyle,
} from './text-style'
import {
  BOUNDARY_STYLE_PROPERTIES,
  BRANCH_LINE_PROPERTIES,
  isFiniteNumber,
  RELATIONSHIP_STYLE_PROPERTIES,
  SUMMARY_STYLE_PROPERTIES,
  type ViewBoundaryStyle,
  type ViewBranchLine,
  type ViewCurve,
  type ViewRelationshipStyle,
  type ViewSummaryStyle,
} from './line-style'
import { isRecord } from './types'
import { isShownLink, type ViewBoundaryRange, type ViewImage } from './view'

/** Thrown for a state that cannot be applied. It never leaves the package: callers get a result. */
export class Refusal extends Error {}

export function refuse(problem: string): never {
  throw new Refusal(problem)
}

export interface StateSheet {
  layout: ViewLayout
  layoutExact: boolean
  root: StateTopic
  relationships: StateRelationship[]
  /** null when the state carries no boundaries: then none is added, changed or moved */
  boundaries: StateBoundary[] | null
}

export interface StateTopic {
  id: string
  title: string
  folded: boolean
  labels: string[]
  note: string | null
  link: string | null
  /**
   * The picture the state shows. Only an entry under `resources/` is ever
   * written from this (see `reconcile-tree.ts`); any other reference is kept
   * here only so that the state and the view compare equal.
   */
  image: ViewImage | null
  /** the text style values the state shows for the whole topic; a missing key is "not set" */
  textStyle: Partial<Record<TextStyleKey, string>>
  /** the fill the state shows for the topic's box (`svg:fill`) */
  fill: string | undefined
  /** the line values the state shows on the topic itself */
  line: ViewBranchLine
  /** the title in parts with a format of their own; null for a plain title */
  titleRuns: StateRun[] | null
  /** the width given to the topic's box; null when it takes the width of its text */
  width: number | null
  summaries: StateSummary[]
  children: StateTopic[]
}

export interface StateRun {
  text: string
  style: ViewRunStyle
}

export interface StateSummary {
  id: string
  topicId: string
  title: string
  start: number
  end: number
  style: ViewSummaryStyle
}

export interface StateRelationship {
  id: string
  fromId: string
  toId: string
  title: string
  style: ViewRelationshipStyle
  /** undefined when the state carries no curve, or none that can be written; null asks for the automatic one */
  curve: ViewCurve | null | undefined
}

export interface StateBoundary {
  id: string
  topicId: string
  range: ViewBoundaryRange
  title: string
  style: ViewBoundaryStyle
}

const LAYOUTS: ReadonlySet<unknown> = new Set<ViewLayout>(VIEW_LAYOUTS)

/**
 * The checked copy of a state, or a `Refusal` naming the first thing wrong
 * with it. Topic ids are unique in the copy. Whether an id or a position fits
 * the source tree is not decided here.
 */
export function readState(state: unknown): StateSheet {
  if (!isRecord(state)) refuse('the state is not a sheet')
  if (!LAYOUTS.has(state.layout)) {
    refuse(`layout ${String(state.layout)} is not one the editor draws`)
  }
  if (typeof state.layoutExact !== 'boolean')
    refuse('the state does not say how exact its layout is')
  if (!isRecord(state.root)) refuse('the state has no central topic')
  if (!Array.isArray(state.relationships)) refuse('the relationships of the state are not a list')
  // a state written before boundaries were carried has no key: that is "leave them all"
  if (state.boundaries != null && !Array.isArray(state.boundaries)) {
    refuse('the boundaries of the state are not a list')
  }
  return {
    layout: state.layout as ViewLayout,
    layoutExact: state.layoutExact,
    root: readTopic(state.root, 0, new Set()),
    relationships: state.relationships.map(readRelationship),
    boundaries: Array.isArray(state.boundaries) ? readBoundaries(state.boundaries) : null,
  }
}

/**
 * Recursion is bounded by the depth limit a file is held to. An id seen twice
 * ends the walk at once, so a state that loops back into itself cannot keep it
 * going either.
 */
function readTopic(topic: unknown, depth: number, seen: Set<string>): StateTopic {
  if (!isRecord(topic)) refuse('a topic of the state is not an object')
  const {
    id,
    title,
    folded,
    labels,
    note,
    link,
    image,
    width,
    style,
    line,
    titleRuns,
    summaries,
    children,
  } = topic
  if (typeof id !== 'string' || id === '') refuse('a topic of the state has no id')
  if (seen.has(id)) refuse(`topic id ${id} is used more than once in the state`)
  seen.add(id)
  if (depth > MAX_TOPIC_DEPTH)
    refuse(`the state nests topics deeper than ${MAX_TOPIC_DEPTH} levels`)
  if (typeof title !== 'string') refuse(`the title of topic ${id} is not text`)
  if (typeof folded !== 'boolean') refuse(`folded of topic ${id} is not true or false`)
  if (!isTexts(labels)) refuse(`the labels of topic ${id} are not a list of texts`)
  if (note !== null && typeof note !== 'string') refuse(`the note of topic ${id} is not text`)
  if (link !== null && !isShownLink(link)) {
    refuse(`the link of topic ${id} is empty or a reference into the file`)
  }
  // a state written before pictures were carried has no key: that is "no picture to set"
  if (image != null && !isViewImage(image)) refuse(`the picture of topic ${id} is not a reference`)
  // no key and null are the same: the topic takes the width of its text
  if (width != null && !(typeof width === 'number' && Number.isFinite(width) && width > 0)) {
    refuse(`the width of topic ${id} is not a positive number`)
  }
  // a state written before text formats were carried has neither key: nothing set, nothing cut
  if (style != null && !isRecord(style)) refuse(`the style of topic ${id} is not a set of values`)
  if (line != null && !isRecord(line)) refuse(`the line of topic ${id} is not a set of values`)
  if (titleRuns != null && !Array.isArray(titleRuns)) {
    refuse(`the title parts of topic ${id} are not a list`)
  }
  if (!Array.isArray(summaries)) refuse(`the summaries of topic ${id} are not a list`)
  if (!Array.isArray(children)) refuse(`the children of topic ${id} are not a list`)
  return {
    id,
    title,
    folded,
    labels: [...labels],
    note,
    link,
    image: image == null ? null : copyImage(image),
    width: width == null ? null : (width as number),
    textStyle: readTextStyle(style),
    fill: isRecord(style) && typeof style.fill === 'string' ? style.fill : undefined,
    line: readStyle(line, BRANCH_LINE_PROPERTIES),
    titleRuns: Array.isArray(titleRuns) ? readRuns(titleRuns, id) : null,
    summaries: summaries.map((summary) => readSummary(summary, id)),
    children: children.map((child) => readTopic(child, depth + 1, seen)),
  }
}

/** The text style values of a state topic: strings only, under the keys a text format has. */
function readTextStyle(style: unknown): Partial<Record<TextStyleKey, string>> {
  const out: Partial<Record<TextStyleKey, string>> = {}
  if (!isRecord(style)) return out
  for (const key of TEXT_STYLE_KEYS) {
    const value = style[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** The string values of a set of style values, under the keys the view gives them. */
function readStyle<K extends string>(
  values: unknown,
  names: Readonly<Record<K, string>>,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  if (!isRecord(values)) return out
  for (const key of Object.keys(names) as K[]) {
    const value = values[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function readRuns(runs: unknown[], owner: string): StateRun[] {
  if (runs.length > MAX_TITLE_RUNS) refuse(`the title of topic ${owner} is cut into too many parts`)
  return runs.map((run) => {
    if (!isRecord(run) || typeof run.text !== 'string') {
      refuse(`a title part of topic ${owner} is not a text with a format`)
    }
    if (run.style != null && !isRecord(run.style)) {
      refuse(`a title part of topic ${owner} has a format that is not a set of values`)
    }
    const given = isRecord(run.style) ? run.style : {}
    const style: ViewRunStyle = {}
    for (const key of RUN_STYLE_KEYS) {
      const value = given[key]
      if (typeof value === 'string') style[key] = value
    }
    return { text: run.text, style }
  })
}

function isViewImage(value: unknown): value is ViewImage {
  if (!isRecord(value)) return false
  const { src, entryName, width, height } = value
  return (
    typeof src === 'string' &&
    src !== '' &&
    (entryName === null || typeof entryName === 'string') &&
    (width === null || (typeof width === 'number' && Number.isFinite(width))) &&
    (height === null || (typeof height === 'number' && Number.isFinite(height)))
  )
}

function copyImage(image: ViewImage): ViewImage {
  return { src: image.src, entryName: image.entryName, width: image.width, height: image.height }
}

function readSummary(summary: unknown, owner: string): StateSummary {
  if (!isRecord(summary)) refuse(`a summary of topic ${owner} is not an object`)
  const { id, topicId, title, start, end, style } = summary
  if (typeof id !== 'string' || id === '' || typeof topicId !== 'string' || topicId === '') {
    refuse(`a summary of topic ${owner} has no id`)
  }
  if (typeof title !== 'string') refuse(`the title of summary ${topicId} is not text`)
  if (!isPosition(start) || !isPosition(end) || start > end) {
    refuse(`the range of summary ${topicId} is not a first and a last position`)
  }
  if (style != null && !isRecord(style)) {
    refuse(`the style of summary ${topicId} is not a set of values`)
  }
  return { id, topicId, title, start, end, style: readStyle(style, SUMMARY_STYLE_PROPERTIES) }
}

function readRelationship(relationship: unknown): StateRelationship {
  if (!isRecord(relationship)) refuse('a relationship of the state is not an object')
  const { id, fromId, toId, title, style, curve } = relationship
  const texts = [id, fromId, toId].every((value) => typeof value === 'string' && value !== '')
  if (!texts || typeof title !== 'string') {
    refuse(`relationship ${String(id)} of the state lacks an id, an end or a title`)
  }
  if (style != null && !isRecord(style)) {
    refuse(`the style of relationship ${String(id)} is not a set of values`)
  }
  return {
    id: id as string,
    fromId: fromId as string,
    toId: toId as string,
    title,
    style: readStyle(style, RELATIONSHIP_STYLE_PROPERTIES),
    curve: readStateCurve(curve),
  }
}

/** A curve of the state; undefined (the curve untouched) for anything that is not two points. */
export function readStateCurve(curve: unknown): ViewCurve | null | undefined {
  if (curve === null) return null
  if (!isRecord(curve)) return undefined
  const from = statePoint(curve.from)
  const to = statePoint(curve.to)
  return from && to ? { from, to } : undefined
}

function statePoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null
  return { x: value.x, y: value.y }
}

/** Boundary ids are unique in the copy. */
function readBoundaries(boundaries: unknown[]): StateBoundary[] {
  const seen = new Set<string>()
  return boundaries.map((boundary) => {
    if (!isRecord(boundary)) refuse('a boundary of the state is not an object')
    const { id, topicId, range, title, style } = boundary
    if (typeof id !== 'string' || id === '' || typeof topicId !== 'string' || topicId === '') {
      refuse('a boundary of the state has no id or no topic')
    }
    if (seen.has(id)) refuse(`boundary id ${id} is used more than once in the state`)
    seen.add(id)
    if (typeof title !== 'string') refuse(`the title of boundary ${id} is not text`)
    if (style != null && !isRecord(style)) {
      refuse(`the style of boundary ${id} is not a set of values`)
    }
    return {
      id,
      topicId,
      range: readBoundaryRange(range, id),
      title,
      style: readStyle(style, BOUNDARY_STYLE_PROPERTIES),
    }
  })
}

function readBoundaryRange(range: unknown, owner: string): ViewBoundaryRange {
  if (range === 'master') return 'master'
  if (isRecord(range) && isPosition(range.start) && isPosition(range.end)) {
    if (range.start <= range.end) return { start: range.start, end: range.end }
  }
  return refuse(`the range of boundary ${owner} is not a first and a last position`)
}

function isTexts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
