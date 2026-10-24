/**
 * The frame one chapter is drawn in.
 *
 * `sandbox="allow-same-origin"` without `allow-scripts`: the book's code never
 * runs (its copy has no script left either, and its policy forbids one), and
 * the editor page, sharing the origin, reaches into the frame's document to
 * scroll, find blocks, mark search hits and, for editing, make blocks
 * editable. Every listener below is the page's own. A link (`<a>`, or an
 * image map's `<area>`) never navigates the frame: a press on it is stopped
 * here and handed to `onLink`.
 */
import { useEffect, useRef } from 'react'
import { VIEW_STYLE_ID } from '../reader/chapter-html'
import { frameEdges } from '../reader/frame-dom'

const XLINK_NS = 'http://www.w3.org/1999/xlink'

export interface FrameWheel {
  deltaY: number
  atStart: boolean
  atEnd: boolean
}

export interface ChapterFrameProps {
  /** the drawing copy (`buildChapterHtml`) */
  html: string
  title: string
  /** the chapter's document is ready */
  onReady(doc: Document): void
  /** a link was pressed: its `href` as written */
  onLink(href: string | null): void
  onWheel(wheel: FrameWheel): void
  onScroll(): void
  onKeyDown(event: KeyboardEvent, edges: { atStart: boolean; atEnd: boolean }): void
  /** a press inside the chapter (menus of the page close) */
  onPress(): void
}

export function linkHref(anchor: Element): string | null {
  return anchor.getAttribute('href') ?? anchor.getAttributeNS(XLINK_NS, 'href')
}

/** Wires a chapter document to the handlers: links, wheel, scroll, keys and presses. */
export function wireChapterDocument(doc: Document, handlers: () => ChapterFrameProps): void {
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null
    // an image map's area links like an anchor
    const anchor = target?.closest?.('a, area')
    if (!anchor) return
    e.preventDefault()
    if (e.type === 'click') handlers().onLink(linkHref(anchor))
  }
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('auxclick', onClick, true)
  // a form of the book never submits (the sandbox forbids it as well)
  doc.addEventListener('submit', (e) => e.preventDefault(), true)
  doc.addEventListener(
    'wheel',
    (e) => {
      const edges = frameEdges(doc)
      handlers().onWheel({ deltaY: e.deltaY, ...edges })
    },
    { passive: true },
  )
  doc.addEventListener('scroll', () => handlers().onScroll(), { passive: true })
  doc.addEventListener('keydown', (e) => handlers().onKeyDown(e, frameEdges(doc)))
  doc.addEventListener('mousedown', () => handlers().onPress(), true)
}

export function ChapterFrame(props: ChapterFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  // the frame is remounted for every chapter (the caller keys it), so it loads once
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const onLoad = () => {
      const doc = frame.contentDocument
      // the initial empty document, or a document that is not the chapter's copy
      if (!doc || !doc.getElementById(VIEW_STYLE_ID)) return
      wireChapterDocument(doc, () => propsRef.current)
      propsRef.current.onReady(doc)
    }
    frame.addEventListener('load', onLoad)
    return () => frame.removeEventListener('load', onLoad)
  }, [])

  return (
    <iframe
      ref={frameRef}
      className="epub-frame"
      title={props.title}
      sandbox="allow-same-origin"
      srcDoc={props.html}
    />
  )
}
