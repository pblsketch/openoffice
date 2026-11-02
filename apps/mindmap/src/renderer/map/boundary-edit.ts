/**
 * Where a new boundary goes: around the selected topics, which must be
 * branches of one parent. The boundary goes around the range from the first
 * of them to the last, the branches between included; the central topic on
 * its own gets a boundary around the whole map (`master`).
 *
 * Turned down, with a reason the screen puts into words:
 *
 * - `nothing-selected`: no topic is selected;
 * - `different-parents`: the topics hang on different parents;
 * - `central-mixed`: the central topic is selected with other topics;
 * - `both-sides`: on a map laid out to both sides, the range reaches over
 *   the central topic, from its left to its right.
 *
 * Pure: it reads the library's nodes and their parents only.
 */
import type { NodeObj } from 'mind-elixir'
import type { ViewBoundaryRange } from '@genoffice/xmind-engine'

export type BoundaryRefusal =
  'nothing-selected' | 'different-parents' | 'central-mixed' | 'both-sides'

export type BoundaryPlace =
  { ok: true; topicId: string; range: ViewBoundaryRange } | { ok: false; reason: BoundaryRefusal }

/** Library side of a main topic laid out to both sides: 0 left, 1 right. */
const LEFT = 0
const RIGHT = 1

/**
 * The topic and range a boundary around `nodes` takes. `bothSides`: the map
 * is laid out to both sides of the central topic.
 */
export function boundaryPlaceFor(nodes: readonly NodeObj[], bothSides: boolean): BoundaryPlace {
  if (nodes.length === 0) return { ok: false, reason: 'nothing-selected' }
  const central = nodes.find((node) => !node.parent)
  if (central) {
    return nodes.length === 1
      ? { ok: true, topicId: central.id, range: 'master' }
      : { ok: false, reason: 'central-mixed' }
  }
  const parent = nodes[0]!.parent!
  if (nodes.some((node) => node.parent?.id !== parent.id)) {
    return { ok: false, reason: 'different-parents' }
  }
  const children = parent.children ?? []
  const positions = nodes.map((node) => children.findIndex((child) => child.id === node.id))
  if (positions.some((position) => position < 0)) return { ok: false, reason: 'different-parents' }
  const start = Math.min(...positions)
  const end = Math.max(...positions)
  if (bothSides && !parent.parent) {
    const sides = new Set(children.slice(start, end + 1).map((child) => child.direction))
    if (sides.has(LEFT) && sides.has(RIGHT)) return { ok: false, reason: 'both-sides' }
  }
  return { ok: true, topicId: parent.id, range: { start, end } }
}
