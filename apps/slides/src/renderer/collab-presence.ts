/**
 * Where a person is in the deck, as co-editing presence (decision 0073): the
 * slide by part path (stable on every peer, unlike indexes when slides move)
 * and the selected boxes as fractions of the slide, so peers draw them at any
 * zoom or fit width.
 */
import type { RenderNode, RenderSlide } from '@genoffice/pptx-render'

export const PRESENCE_FIELD = 'slides'

export interface PresenceBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SlidePresence {
  /** the slide's part path */
  slide: string
  boxes: PresenceBox[]
  /** typing into one of them */
  editing: boolean
}

const MAX_BOXES = 24

/** the selected elements' boxes (group children included) as fractions of the slide */
export function presenceBoxes(slide: RenderSlide, ids: readonly string[]): PresenceBox[] {
  if (!ids.length || slide.widthPx <= 0 || slide.heightPx <= 0) return []
  const wanted = new Set(ids)
  const out: PresenceBox[] = []
  const round = (v: number) => Math.round(v * 10000) / 10000
  const walk = (nodes: readonly RenderNode[], ox: number, oy: number) => {
    for (const node of nodes) {
      if (out.length >= MAX_BOXES) return
      const b = node.box
      if (wanted.has(node.sourceId)) {
        out.push({
          x: round((ox + b.x) / slide.widthPx),
          y: round((oy + b.y) / slide.heightPx),
          w: round(b.w / slide.widthPx),
          h: round(b.h / slide.heightPx),
        })
      }
      // group children carry coordinates local to the group
      if (node.type === 'group') walk(node.children, ox + b.x, oy + b.y)
    }
  }
  walk(slide.nodes, 0, 0)
  return out
}

export function samePresence(a: SlidePresence | null, b: SlidePresence | null): boolean {
  if (a === b) return true
  if (!a || !b || a.slide !== b.slide || a.editing !== b.editing) return false
  if (a.boxes.length !== b.boxes.length) return false
  return a.boxes.every((box, i) => {
    const other = b.boxes[i]!
    return box.x === other.x && box.y === other.y && box.w === other.w && box.h === other.h
  })
}

/** a peer's value as it arrived: anything malformed is ignored */
export function presenceOf(raw: unknown): SlidePresence | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { slide?: unknown; boxes?: unknown; editing?: unknown }
  if (typeof r.slide !== 'string') return null
  const boxes = Array.isArray(r.boxes)
    ? r.boxes
        .slice(0, MAX_BOXES)
        .filter(
          (b): b is PresenceBox =>
            !!b &&
            typeof b === 'object' &&
            ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((b as Record<string, unknown>)[k])),
        )
    : []
  return { slide: r.slide, boxes, editing: r.editing === true }
}
