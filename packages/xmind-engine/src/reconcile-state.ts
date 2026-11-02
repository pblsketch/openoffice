/**
 * Reading the state the editor hands in for reconciling.
 *
 * The state comes from a renderer window and is not trusted: it is typed as
 * view data, but nothing has checked that. Everything reconciling reads is
 * checked and copied here first, so the rest works on values of a known shape
 * and never on the caller's objects. What reconciling never writes (pictures,
 * markers, styles, the sheet's own title) is not looked at.
 */

import { VIEW_LAYOUTS, type ViewLayout } from './layout'
import { MAX_TOPIC_DEPTH } from './structure-check'
import { isRecord } from './types'
import { isShownLink, type ViewImage } from './view'

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
  /** the width given to the topic's box; null when it takes the width of its text */
  width: number | null
  summaries: StateSummary[]
  children: StateTopic[]
}

export interface StateSummary {
  id: string
  topicId: string
  title: string
  start: number
  end: number
}

export interface StateRelationship {
  id: string
  fromId: string
  toId: string
  title: string
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
  return {
    layout: state.layout as ViewLayout,
    layoutExact: state.layoutExact,
    root: readTopic(state.root, 0, new Set()),
    relationships: state.relationships.map(readRelationship),
  }
}

/**
 * Recursion is bounded by the depth limit a file is held to. An id seen twice
 * ends the walk at once, so a state that loops back into itself cannot keep it
 * going either.
 */
function readTopic(topic: unknown, depth: number, seen: Set<string>): StateTopic {
  if (!isRecord(topic)) refuse('a topic of the state is not an object')
  const { id, title, folded, labels, note, link, image, width, summaries, children } = topic
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
    summaries: summaries.map((summary) => readSummary(summary, id)),
    children: children.map((child) => readTopic(child, depth + 1, seen)),
  }
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
  const { id, topicId, title, start, end } = summary
  if (typeof id !== 'string' || id === '' || typeof topicId !== 'string' || topicId === '') {
    refuse(`a summary of topic ${owner} has no id`)
  }
  if (typeof title !== 'string') refuse(`the title of summary ${topicId} is not text`)
  if (!isPosition(start) || !isPosition(end) || start > end) {
    refuse(`the range of summary ${topicId} is not a first and a last position`)
  }
  return { id, topicId, title, start, end }
}

function readRelationship(relationship: unknown): StateRelationship {
  if (!isRecord(relationship)) refuse('a relationship of the state is not an object')
  const { id, fromId, toId, title } = relationship
  const texts = [id, fromId, toId].every((value) => typeof value === 'string' && value !== '')
  if (!texts || typeof title !== 'string') {
    refuse(`relationship ${String(id)} of the state lacks an id, an end or a title`)
  }
  return { id: id as string, fromId: fromId as string, toId: toId as string, title }
}

function isTexts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
