/**
 * Merge Shapes (PowerPoint Shape Format ▸ Merge Shapes): pure geometry. Each shape's
 * outline (box-local px) is flattened to rings, placed on the slide (flip, then rotation
 * about the box center) and combined with polygon-clipping. The result comes back as
 * slide-space boxes with box-local M/L/Z paths, ready for addElement + setShapeGeometry.
 */
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import type { PlacedBox, RenderNode, ShapeRenderNode } from '@genoffice/pptx-render'
import { shapeToEditablePath, type PathCmd } from './edit-points'
import { presetToShapeKind } from './konva-adapter'

export type MergeMode = 'union' | 'combine' | 'fragment' | 'intersect' | 'subtract'

export interface MergedShape {
  box: { x: number; y: number; w: number; h: number }
  path: { w: number; h: number; cmds: PathCmd[] }
}

/** Segments per curve when flattening: smooth at slide sizes, small enough to stay fast */
const CURVE_STEPS = 24
const K = 0.5522847498

function ellipsePath(w: number, h: number): PathCmd[] {
  const rx = w / 2
  const ry = h / 2
  const kx = rx * K
  const ky = ry * K
  return [
    { op: 'M', pts: [w, ry] },
    { op: 'C', pts: [w, ry + ky, rx + kx, h, rx, h] },
    { op: 'C', pts: [rx - kx, h, 0, ry + ky, 0, ry] },
    { op: 'C', pts: [0, ry - ky, rx - kx, 0, rx, 0] },
    { op: 'C', pts: [rx + kx, 0, w, ry - ky, w, ry] },
    { op: 'Z', pts: [] },
  ]
}

/** The outline of a mergeable node in box-local px; null for lines, pictures and outlines the renderer only approximates */
export function mergeOutline(node: RenderNode): PathCmd[] | null {
  if (node.type !== 'shape' && node.type !== 'text') return null
  const s = node as ShapeRenderNode
  if (s.line || !(s.box.w > 0 && s.box.h > 0)) return null
  const own = shapeToEditablePath(s)
  if (own) return own
  if (!s.pathData && !s.polygonPoints && presetToShapeKind(s.presetGeometry) === 'ellipse')
    return ellipsePath(s.box.w, s.box.h)
  return null
}

/** Flatten M/L/C/Q/Z commands into closed rings (curves sampled) */
export function flattenPath(cmds: PathCmd[], steps = CURVE_STEPS): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = []
  let cur: Array<[number, number]> = []
  let x = 0
  let y = 0
  const close = () => {
    if (cur.length >= 3) rings.push(cur)
    cur = []
  }
  for (const c of cmds) {
    const p = c.pts
    if (c.op === 'M') {
      close()
      x = p[0]!
      y = p[1]!
      cur.push([x, y])
    } else if (c.op === 'L') {
      x = p[0]!
      y = p[1]!
      cur.push([x, y])
    } else if (c.op === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        cur.push([
          u * u * x + 2 * u * t * p[0]! + t * t * p[2]!,
          u * u * y + 2 * u * t * p[1]! + t * t * p[3]!,
        ])
      }
      x = p[2]!
      y = p[3]!
    } else if (c.op === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        cur.push([
          u * u * u * x + 3 * u * u * t * p[0]! + 3 * u * t * t * p[2]! + t * t * t * p[4]!,
          u * u * u * y + 3 * u * u * t * p[1]! + 3 * u * t * t * p[3]! + t * t * t * p[5]!,
        ])
      }
      x = p[4]!
      y = p[5]!
    } else {
      close()
    }
  }
  close()
  return rings
}

/** Box-local point → slide point: flip inside the box, then rotate about its center */
function placer(box: PlacedBox): (pt: [number, number]) => [number, number] {
  const { x, y, w, h } = box
  const a = ((box.rotationDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return ([px, py]) => {
    const dx = (box.flipH ? w - px : px) - w / 2
    const dy = (box.flipV ? h - py : py) - h / 2
    return [x + w / 2 + dx * cos - dy * sin, y + h / 2 + dx * sin + dy * cos]
  }
}

/** A shape's filled area on the slide (subpaths combine even-odd, so a donut keeps its hole) */
function shapeArea(node: RenderNode, cmds: PathCmd[]): MultiPolygon {
  const place = placer(node.box)
  const rings: Ring[] = flattenPath(cmds).map((r) => r.map(place))
  if (!rings.length) return []
  return polygonClipping.xor([rings[0]!], ...rings.slice(1).map((r): Polygon => [r]))
}

/** PowerPoint's Fragment: every region the outlines cut each other into */
function fragments(areas: MultiPolygon[]): MultiPolygon[] {
  let pieces: MultiPolygon[] = [areas[0]!]
  for (const area of areas.slice(1)) {
    const next: MultiPolygon[] = []
    for (const piece of pieces) {
      const inside = polygonClipping.intersection(piece, area)
      const outside = polygonClipping.difference(piece, area)
      if (inside.length) next.push(inside)
      if (outside.length) next.push(outside)
    }
    const rest = polygonClipping.difference(area, ...pieces)
    if (rest.length) next.push(rest)
    pieces = next
  }
  // one shape per connected region
  return pieces.flatMap((mp) => mp.map((poly): MultiPolygon => [poly]))
}

/** Slide-space polygons → one shape: bounding box plus a box-local M/L/Z path */
function toShape(mp: MultiPolygon): MergedShape | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const poly of mp)
    for (const ring of poly)
      for (const [px, py] of ring) {
        minX = Math.min(minX, px)
        minY = Math.min(minY, py)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
      }
  const w = maxX - minX
  const h = maxY - minY
  if (!(w > 0.5 && h > 0.5)) return null
  const cmds: PathCmd[] = []
  for (const poly of mp)
    for (const ring of poly) {
      // polygon-clipping repeats the first point at the end of every ring
      const pts = ring.slice(0, -1)
      if (pts.length < 3) continue
      pts.forEach(([px, py], i) => cmds.push({ op: i ? 'L' : 'M', pts: [px - minX, py - minY] }))
      cmds.push({ op: 'Z', pts: [] })
    }
  if (!cmds.length) return null
  return { box: { x: minX, y: minY, w, h }, path: { w, h, cmds } }
}

/**
 * Merge the nodes (selection order: the first one is the base for Subtract and gives the
 * format). null when a node's outline is unknown; an empty list when nothing is left
 * (Intersect of shapes that don't overlap, Subtract that removes everything).
 */
export function mergeShapes(nodes: RenderNode[], mode: MergeMode): MergedShape[] | null {
  if (nodes.length < 2) return null
  const areas: MultiPolygon[] = []
  for (const n of nodes) {
    const cmds = mergeOutline(n)
    if (!cmds) return null
    areas.push(shapeArea(n, cmds))
  }
  const [first, ...rest] = areas as [MultiPolygon, ...MultiPolygon[]]
  let results: MultiPolygon[]
  if (mode === 'fragment') results = fragments(areas)
  else if (mode === 'union') results = [polygonClipping.union(first, ...rest)]
  else if (mode === 'combine') results = [polygonClipping.xor(first, ...rest)]
  else if (mode === 'intersect') results = [polygonClipping.intersection(first, ...rest)]
  else results = [polygonClipping.difference(first, ...rest)]
  return results.flatMap((mp) => {
    const s = mp.length ? toShape(mp) : null
    return s ? [s] : []
  })
}
