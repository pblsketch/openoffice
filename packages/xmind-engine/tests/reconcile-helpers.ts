import type { XmindDocument } from '../src/document'
import { isRecord, type XmindSheet, type XmindTopic } from '../src/types'
import type { ViewSheet, ViewTopic } from '../src/view'
import { buildMapFile, openOk } from './helpers'

/** What the tests of reconciling share. Every tree here is written by hand. */

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A document around these sheets, opened from an archive the way a file is. */
export async function openSheets(content: unknown[]): Promise<XmindDocument> {
  return openOk(await buildMapFile({ content }))
}

/** An independent copy of a JSON value, to compare against later. */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** The topic with this id in a view; the test fails when there is none. */
export function inView(view: ViewSheet, id: string): ViewTopic {
  const hit = findInView(view.root, id)
  if (!hit) throw new Error(`no topic ${id} in the view`)
  return hit
}

function findInView(topic: ViewTopic, id: string): ViewTopic | null {
  if (topic.id === id) return topic
  for (const child of topic.children) {
    const hit = findInView(child, id)
    if (hit) return hit
  }
  return null
}

/** Takes a topic out of the view it sits in and returns it, as a drag or a delete does. */
export function detach(view: ViewSheet, id: string): ViewTopic {
  const parent = parentInView(view.root, id)
  if (!parent) throw new Error(`no topic ${id} below the central topic of the view`)
  const at = parent.children.findIndex((child) => child.id === id)
  return parent.children.splice(at, 1)[0]!
}

function parentInView(topic: ViewTopic, id: string): ViewTopic | null {
  for (const child of topic.children) {
    if (child.id === id) return topic
    const hit = parentInView(child, id)
    if (hit) return hit
  }
  return null
}

/** A topic the way the editor hands in one the user just made. */
export function freshTopic(id: string, title: string, more: Partial<ViewTopic> = {}): ViewTopic {
  return {
    id,
    title,
    folded: false,
    labels: [],
    note: null,
    link: null,
    image: null,
    markers: [],
    style: {},
    titleRuns: null,
    summaries: [],
    children: [],
    ...more,
  }
}

/** The topic with this id anywhere in a sheet of the source tree, whatever kind it is. */
export function inSource(sheet: XmindSheet, id: string): XmindTopic | null {
  const pending: XmindTopic[] = [sheet.rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    if (topic.id === id) return topic
    for (const list of Object.values(topic.children ?? {})) {
      if (Array.isArray(list)) pending.push(...(list.filter(isRecord) as XmindTopic[]))
    }
  }
  return null
}

/**
 * Where two JSON values differ, value by value: one path per differing leaf,
 * per key only one side has, and per object whose keys changed order.
 */
export function differences(before: unknown, after: unknown, path = '$'): string[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: string[] = []
    for (let index = 0; index < Math.max(before.length, after.length); index++) {
      if (index >= before.length || index >= after.length) out.push(`${path}[${index}]`)
      else out.push(...differences(before[index], after[index], `${path}[${index}]`))
    }
    return out
  }
  if (isRecord(before) && isRecord(after)) {
    const out: string[] = []
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key)) out.push(`${path}.${key}`)
      else out.push(...differences(before[key], after[key], `${path}.${key}`))
    }
    const shared = (keysOf: object, other: object): string[] =>
      Object.keys(keysOf).filter((key) => Object.hasOwn(other, key))
    if (shared(before, after).join('\n') !== shared(after, before).join('\n')) {
      out.push(`${path} (key order)`)
    }
    return out
  }
  return Object.is(before, after) ? [] : [path]
}
