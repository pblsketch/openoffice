/**
 * Changes of line format, on the library's data: the line into a branch (on a
 * topic and every topic below it), and the values of a relationship, a summary
 * bracket and a boundary.
 *
 * A change is asked for in words and numbers (`curve`, `3`, `#336699`), the
 * way the format panel and the AI pick them, and becomes the strings the file
 * holds (`org.xmind.branchConnection.curve`, `3pt`). Only what the engine
 * writes is taken (`isWritable…` of the engine); anything else turns the whole
 * change down, so nothing is half applied. `null` takes a key off.
 *
 * A branch line is written on the topic and on every topic below it, over
 * the values the same keys had there: the line format draws from the line
 * into a topic to the end of its branch, and the format the file comes from
 * hands no shape down (`line-resolve.ts`). A topic that arrives under a new
 * parent takes the values the parent has written on itself, the same way;
 * a parent without any leaves the topic as it was.
 *
 * Pure apart from the nodes it is handed: no drawing, no file.
 */
import type { NodeObj } from 'mind-elixir'
import {
  ARROW_SHAPE_PREFIX,
  BOUNDARY_SHAPE_PREFIX,
  BOUNDARY_STYLE_PROPERTIES,
  type BoundaryStyleKey,
  BRANCH_LINE_CLASS_PREFIX,
  BRANCH_LINE_PROPERTIES,
  type BranchLineKey,
  isWritableBoundaryStyle,
  isWritableBranchLine,
  isWritableRelationshipStyle,
  isWritableSummaryStyle,
  lineWidthValue,
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  RELATIONSHIP_SHAPE_PREFIX,
  RELATIONSHIP_STYLE_PROPERTIES,
  type RelationshipStyleKey,
  SUMMARY_SHAPE_PREFIX,
  SUMMARY_STYLE_PROPERTIES,
  type SummaryStyleKey,
  type ViewBranchLine,
} from '@genoffice/xmind-engine'
import { emptyMeta, type MapNodeMeta } from '../document/convert'
import type {
  ArrowShape,
  BoundaryShape,
  BranchLineShape,
  LinePattern,
  RelationshipShape,
  SummaryShape,
} from './style-values'

/** A change of the line into a branch. A key that is there is set; `null` takes it off. Widths are whole points. */
export interface BranchLineChange {
  shape?: BranchLineShape | null
  width?: number | null
  /** `#rrggbb` */
  color?: string | null
  pattern?: LinePattern | null
}

export interface RelationshipStyleChange {
  shape?: RelationshipShape | null
  /** the end at the start (end1) */
  begin?: ArrowShape | null
  /** the end at the other end (end2) */
  end?: ArrowShape | null
  color?: string | null
  width?: number | null
  pattern?: LinePattern | null
}

export interface SummaryStyleChange {
  shape?: SummaryShape | null
}

export interface BoundaryStyleChange {
  shape?: BoundaryShape | null
  color?: string | null
  width?: number | null
  pattern?: LinePattern | null
  /** `#rrggbb`, or `none` for no fill */
  fill?: string | null
}

/** Values as the file holds them, by the view's names; `null` takes the key off. */
export type StyleEdits<K extends string> = Partial<Record<K, string | null>>

/** Values as the file holds them, by the view's names. */
export type StyleValues<K extends string> = Partial<Record<K, string>>

type Writer = (value: unknown) => string | null

const COLOR = /^#[0-9a-f]{6}$/i

const word =
  (prefix: string): Writer =>
  (value) =>
    typeof value === 'string' && value !== '' ? `${prefix}${value}` : null
const width: Writer = (value) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MIN_LINE_WIDTH &&
  value <= MAX_LINE_WIDTH
    ? lineWidthValue(value)
    : null
const color: Writer = (value) =>
  typeof value === 'string' && COLOR.test(value) ? value.toLowerCase() : null
const text: Writer = (value) => (typeof value === 'string' ? value : null)

/** A change as the strings the file holds; null when any value of it is not one the engine writes. */
function editsOf<K extends string>(
  change: object,
  writers: Readonly<Record<K, Writer>>,
  writable: (key: K, value: string) => boolean,
): StyleEdits<K> | null {
  const out: StyleEdits<K> = {}
  for (const [name, value] of Object.entries(change) as [string, unknown][]) {
    if (value === undefined) continue
    if (!Object.hasOwn(writers, name)) return null
    const key = name as K
    if (value === null) {
      out[key] = null
      continue
    }
    const written = writers[key](value)
    if (written === null || !writable(key, written)) return null
    out[key] = written
  }
  return out
}

export function branchLineEdits(change: BranchLineChange): StyleEdits<BranchLineKey> | null {
  return editsOf<BranchLineKey>(
    change,
    { shape: word(BRANCH_LINE_CLASS_PREFIX), width, color, pattern: text },
    isWritableBranchLine,
  )
}

export function relationshipStyleEdits(
  change: RelationshipStyleChange,
): StyleEdits<RelationshipStyleKey> | null {
  return editsOf<RelationshipStyleKey>(
    change,
    {
      shape: word(RELATIONSHIP_SHAPE_PREFIX),
      begin: word(ARROW_SHAPE_PREFIX),
      end: word(ARROW_SHAPE_PREFIX),
      color,
      width,
      pattern: text,
    },
    isWritableRelationshipStyle,
  )
}

export function summaryStyleEdits(change: SummaryStyleChange): StyleEdits<SummaryStyleKey> | null {
  return editsOf<SummaryStyleKey>(
    change,
    { shape: word(SUMMARY_SHAPE_PREFIX) },
    isWritableSummaryStyle,
  )
}

export function boundaryStyleEdits(
  change: BoundaryStyleChange,
): StyleEdits<BoundaryStyleKey> | null {
  const fill: Writer = (value) => (value === 'none' ? 'none' : color(value))
  return editsOf<BoundaryStyleKey>(
    change,
    { shape: word(BOUNDARY_SHAPE_PREFIX), color, width, pattern: text, fill },
    isWritableBoundaryStyle,
  )
}

/** Edits that take every key of a kind off. */
export function clearingEdits<K extends string>(names: Readonly<Record<K, string>>): StyleEdits<K> {
  const out: StyleEdits<K> = {}
  for (const key of Object.keys(names) as K[]) out[key] = null
  return out
}

export const CLEAR_BRANCH_LINE = clearingEdits(BRANCH_LINE_PROPERTIES)
export const CLEAR_RELATIONSHIP_STYLE = clearingEdits(RELATIONSHIP_STYLE_PROPERTIES)
export const CLEAR_SUMMARY_STYLE = clearingEdits(SUMMARY_STYLE_PROPERTIES)
export const CLEAR_BOUNDARY_STYLE = clearingEdits(BOUNDARY_STYLE_PROPERTIES)

/** The values with the edits made. */
export function withEdits<K extends string>(
  values: StyleValues<K> | null | undefined,
  edits: StyleEdits<K>,
): StyleValues<K> {
  const next: StyleValues<K> = { ...(values ?? {}) }
  for (const key of Object.keys(edits) as K[]) {
    const value = edits[key]
    if (value === null) delete next[key]
    else if (value !== undefined) next[key] = value
  }
  return next
}

/** Whether two sets of values hold the same keys with the same values. */
export function sameValues(
  a: Readonly<Record<string, string | undefined>> | null | undefined,
  b: Readonly<Record<string, string | undefined>> | null | undefined,
): boolean {
  const left = Object.entries(a ?? {}).filter(([, value]) => value !== undefined)
  const right = Object.entries(b ?? {}).filter(([, value]) => value !== undefined)
  return left.length === right.length && left.every(([key, value]) => (b ?? {})[key] === value)
}

// ---- the line into a branch, on the library's nodes ----

const LINE_KEYS = Object.keys(BRANCH_LINE_PROPERTIES) as BranchLineKey[]

/** The line values written on a topic itself, as the file holds them. */
export function ownLineOf(node: NodeObj): ViewBranchLine {
  const meta = node.metadata as Partial<MapNodeMeta> | undefined
  const line = meta?.line
  const out: ViewBranchLine = {}
  if (typeof line !== 'object' || line === null) return out
  for (const key of LINE_KEYS) {
    const value = (line as Record<string, unknown>)[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** The values of a topic's own line that the engine writes: what a topic arriving under it takes. */
export function writableLineOf(node: NodeObj): ViewBranchLine {
  const out: ViewBranchLine = {}
  for (const [key, value] of Object.entries(ownLineOf(node)) as [BranchLineKey, string][]) {
    if (isWritableBranchLine(key, value)) out[key] = value
  }
  return out
}

/** Puts the line values on a topic's metadata, leaving the key out when there are none. */
function putLine(node: NodeObj, line: ViewBranchLine): void {
  const meta: MapNodeMeta = {
    ...emptyMeta(),
    ...((node.metadata as Partial<MapNodeMeta> | undefined) ?? {}),
  }
  delete meta.line
  if (Object.keys(line).length > 0) meta.line = { ...line }
  node.metadata = meta
}

/** Every topic of a branch, the topic first; stops at a depth no file reaches. */
export function branchNodes(node: NodeObj): NodeObj[] {
  const out: NodeObj[] = []
  const visit = (at: NodeObj, depth: number): void => {
    out.push(at)
    if (depth > MAX_DEPTH) return
    for (const child of at.children ?? []) visit(child, depth + 1)
  }
  visit(node, 0)
  return out
}

const MAX_DEPTH = 1024

/**
 * Makes the edits on a topic and on every topic below it. Returns the ids of
 * the topics whose values changed.
 */
export function editBranchLine(node: NodeObj, edits: StyleEdits<BranchLineKey>): string[] {
  const changed: string[] = []
  for (const at of branchNodes(node)) {
    const before = ownLineOf(at)
    const after = withEdits(before, edits)
    if (sameValues(before, after)) continue
    putLine(at, after)
    changed.push(at.id)
  }
  return changed
}

/** Makes the edits on one topic alone. True when its values changed. */
export function editOwnLine(node: NodeObj, edits: StyleEdits<BranchLineKey>): boolean {
  const before = ownLineOf(node)
  const after = withEdits(before, edits)
  if (sameValues(before, after)) return false
  putLine(node, after)
  return true
}

/**
 * A topic arrived under `parent`: it and every topic below it take the line
 * values the parent has written on itself (those the engine writes). Nothing
 * changes when the parent has none. Returns the ids of the topics that changed.
 */
export function inheritBranchLine(parent: NodeObj, node: NodeObj): string[] {
  const line = writableLineOf(parent)
  if (Object.keys(line).length === 0) return []
  return editBranchLine(node, line)
}

/** The parent of every topic of a tree, by id; the central topic has none. */
export function parentsOf(root: NodeObj): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const visit = (node: NodeObj, parent: string | null, depth: number): void => {
    if (typeof node.id !== 'string' || out.has(node.id)) return
    out.set(node.id, parent)
    if (depth > MAX_DEPTH) return
    for (const child of node.children ?? []) visit(child, node.id, depth + 1)
  }
  visit(root, null, 0)
  return out
}

/**
 * After a change of the tree: every topic that stands under another parent
 * than before (or is new), and is not below another such topic, takes the
 * line values of its new parent with its branch. `before` is `parentsOf` the
 * tree before the change. Returns the ids of the topics that changed.
 */
export function inheritArrivals(
  root: NodeObj,
  before: ReadonlyMap<string, string | null>,
): string[] {
  const changed: string[] = []
  const visit = (node: NodeObj, depth: number): void => {
    if (depth > MAX_DEPTH) return
    for (const child of node.children ?? []) {
      const was = before.get(child.id)
      if (was === undefined || was !== node.id) {
        changed.push(...inheritBranchLine(node, child))
        continue
      }
      visit(child, depth + 1)
    }
  }
  visit(root, 0)
  return changed
}
