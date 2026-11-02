/**
 * What a press on the map lands on: a topic, a relationship, a summary or a
 * boundary, by its id. The format painter puts a format on it, and a boundary
 * is selected by it.
 *
 * Relationships and summaries are found the way the drawing library finds
 * them (their title, or their group of paths). A boundary is found by the
 * mark its outline and title carry (`relations.ts`), compared as a value and
 * never put into a selector.
 */
import { BOUNDARY_ID_ATTRIBUTE } from './relations'
import type { FormatKind } from './format-painter'

export interface MapTarget {
  kind: FormatKind
  id: string
}

interface LibraryGroup extends Element {
  arrowObj?: { id?: unknown }
  summaryObj?: { id?: unknown }
}

/** The item an element belongs to; null for empty space, an edit box and everything else. */
export function targetOf(element: Element | null): MapTarget | null {
  if (!element || element.closest('#input-box')) return null
  const boundary = boundaryOf(element)
  if (boundary !== null) return { kind: 'boundary', id: boundary }
  const topic = element.closest('me-tpc') as (Element & { nodeObj?: { id?: unknown } }) | null
  if (topic) {
    if (element.closest('me-epd')) return null
    const id = topic.nodeObj?.id
    return typeof id === 'string' ? { kind: 'topic', id } : null
  }
  const label = element.closest<HTMLElement>('.svg-label')
  const group: LibraryGroup | null = label
    ? (element.ownerDocument.getElementById(label.dataset.svgId ?? '') as LibraryGroup | null)
    : element.closest('.topiclinks, .summary')
      ? element.closest('g')
      : null
  if (!group) return null
  const arrow = group.arrowObj?.id
  if (typeof arrow === 'string') return { kind: 'relationship', id: arrow }
  const summary = group.summaryObj?.id
  if (typeof summary === 'string') return { kind: 'summary', id: summary }
  return null
}

/** The id of the boundary an element (an outline or a title) belongs to. */
export function boundaryOf(element: Element | null): string | null {
  const marked = element?.closest(`[${BOUNDARY_ID_ATTRIBUTE}]`)
  const id = marked?.getAttribute(BOUNDARY_ID_ATTRIBUTE)
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * A boundary under a point, below whatever lies on top there. A boundary lies
 * under the topics and their branches, so a press on its outline can land on
 * the box of a branch around it first. Only where the press landed on no item
 * of its own (`targetOf` found nothing), and only where the page can tell what
 * lies at a point.
 */
export function boundaryUnder(document: Document, x: number, y: number): string | null {
  if (typeof document.elementsFromPoint !== 'function') return null
  for (const element of document.elementsFromPoint(x, y)) {
    const id = boundaryOf(element)
    if (id !== null) return id
  }
  return null
}
