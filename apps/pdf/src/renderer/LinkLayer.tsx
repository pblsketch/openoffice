import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfRectToCss } from './annotations'
import { PAN_CLICK_SLOP } from './pan-drag'
import type { PageGeom } from './annotations'

interface LinkItem {
  rect: [number, number, number, number]
  url?: string
  dest?: unknown
}

interface RawLinkAnnotation {
  subtype?: string
  rect?: number[]
  url?: string
  dest?: unknown
  action?: string
}

/** Max link overlays per page: a hostile PDF can carry thousands of annots. */
export const MAX_PAGE_LINKS = 500

function isFiniteRect(rect: unknown): rect is [number, number, number, number] {
  return (
    Array.isArray(rect) &&
    rect.length === 4 &&
    rect.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/**
 * Filter raw pdfjs annotations down to renderable links: Link subtype with a
 * finite rect and a target, capped per page. Exported for tests.
 */
export function collectPageLinks(annots: RawLinkAnnotation[]): LinkItem[] {
  const out: LinkItem[] = []
  for (const a of annots) {
    if (out.length >= MAX_PAGE_LINKS) break
    if (a.subtype !== 'Link' || (!a.url && !a.dest)) continue
    if (!isFiniteRect(a.rect)) continue
    out.push({ rect: a.rect, url: a.url, dest: a.dest })
  }
  return out
}

/** Where a link may be followed or hovered: the page's own text and picture (not overlays) */
const LINK_SURFACE = '.pdf-page-content, .pdf-ocr-layer'

/** Page modes in which a click on the page means something else (edit or insert text) */
const LINK_IDLE_PAGE = '.pdf-editing-text, .pdf-inserting-text'

export type LinkBox = { left: number; top: number; width: number; height: number }

/** Index of the topmost box holding page point (x, y) (CSS px from the page's top left), or -1 */
export function linkBoxAt(boxes: readonly LinkBox[], x: number, y: number): number {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i]!
    if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height) return i
  }
  return -1
}

/** Each page's link boxes (the same CSS boxes its anchors are drawn with) and layer */
const pageLinks = new WeakMap<Element, { boxes: readonly LinkBox[]; layer: HTMLElement }>()

/**
 * The link whose box holds client point (x, y) on `page`, the topmost first.
 * Links take no pointer input themselves (sheet row 247): the text under them
 * keeps its drag selection and right-click menu, so the page asks here. The
 * boxes come from the page geometry, so a lookup measures only the page.
 */
export function linkAt(page: Element, x: number, y: number): HTMLAnchorElement | null {
  const entry = pageLinks.get(page)
  if (!entry) return null
  const r = page.getBoundingClientRect()
  const i = linkBoxAt(entry.boxes, x - r.left - page.clientLeft, y - r.top - page.clientTop)
  if (i < 0) return null
  const link = entry.layer.children[i]
  return link instanceof HTMLAnchorElement ? link : null
}

/** Whether a pointer over `target` may hover or follow a link (text or picture of a page in no editing mode) */
export function onLinkSurface(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  return !!el?.closest(LINK_SURFACE) && !el.closest(LINK_IDLE_PAGE)
}

/** pointer travel (px) after which a press is a drag over the text, not a click on its link */
export const LINK_CLICK_SLOP = PAN_CLICK_SLOP

export type PressPoint = { x: number; y: number }

/**
 * Whether a click follows the link under it: a real single primary click on
 * the page's text or picture whose press did not travel. A press that travelled
 * is a drag selecting the text, and Shift+click extends the selection. A click
 * inside text that is already selected still follows (its selection only goes
 * after the click), so the press, not the selection, decides; without a known
 * press, a selection the click left standing counts as a drag.
 */
export function followsLinkClick(
  e: {
    button: number
    detail: number
    shiftKey: boolean
    isTrusted: boolean
    target: EventTarget | null
    clientX: number
    clientY: number
  },
  press: PressPoint | null,
  selection: Pick<Selection, 'isCollapsed'> | null,
): boolean {
  // the second click of a double-click picks a word; the first one already followed
  if (!e.isTrusted || e.button !== 0 || e.detail !== 1 || e.shiftKey) return false
  if (!onLinkSurface(e.target)) return false
  if (press)
    return (
      Math.abs(e.clientX - press.x) <= LINK_CLICK_SLOP &&
      Math.abs(e.clientY - press.y) <= LINK_CLICK_SLOP
    )
  return !selection || selection.isCollapsed
}

/** Where the latest primary press went down. Window capture sees it before any
 *  handler can stop it (the hand tool stops presses on the document). */
let lastPress: PressPoint | null = null
let pressWatchers = 0
const onPress = (e: PointerEvent) => {
  if (e.button === 0) lastPress = { x: e.clientX, y: e.clientY }
}

/** Watch presses while some page shows links; one window listener for all of them */
function watchPresses(): () => void {
  if (pressWatchers++ === 0) window.addEventListener('pointerdown', onPress, true)
  return () => {
    if (--pressWatchers > 0) return
    window.removeEventListener('pointerdown', onPress, true)
    lastPress = null
  }
}

/**
 * Follow the link under a click on `page`, through the link's own anchor (the
 * same href, target and handler a direct click on it used). True when a link
 * was followed.
 */
export function followLinkAt(
  page: Element,
  e: {
    button: number
    detail: number
    shiftKey: boolean
    isTrusted: boolean
    target: EventTarget | null
    clientX: number
    clientY: number
  },
): boolean {
  if (!followsLinkClick(e, lastPress, window.getSelection())) return false
  const link = linkAt(page, e.clientX, e.clientY)
  if (!link) return false
  link.click()
  return true
}

/**
 * Hover for links that take no pointer input: marks the link under the pointer
 * (`is-hover` for its look, `data-link-hover` on the page for the hand cursor)
 * and hands it to the screen tips, which show the link's address from
 * `data-tip` on pointerover. Nothing is marked while a button is down (a drag
 * selecting text) or in a page editing mode.
 */
function trackLinkHover(page: HTMLElement): () => void {
  let hovered: HTMLAnchorElement | null = null
  const set = (next: HTMLAnchorElement | null, e: PointerEvent | null) => {
    if (next === hovered) return
    hovered?.classList.remove('is-hover')
    hovered = next
    if (next) {
      next.classList.add('is-hover')
      page.setAttribute('data-link-hover', '')
    } else page.removeAttribute('data-link-hover')
    if (!e) return
    // the tip follows pointerover; tell it the pointer is now over the link (or off it again)
    const over = next ?? (e.target instanceof Element ? e.target : page)
    over.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      }),
    )
  }
  const onMove = (e: PointerEvent) => {
    const next =
      e.buttons === 0 && onLinkSurface(e.target) ? linkAt(page, e.clientX, e.clientY) : null
    set(next, e)
  }
  const onLeave = () => set(null, null)
  page.addEventListener('pointermove', onMove, { passive: true })
  page.addEventListener('pointerleave', onLeave)
  const unwatch = watchPresses()
  return () => {
    page.removeEventListener('pointermove', onMove)
    page.removeEventListener('pointerleave', onLeave)
    unwatch()
    set(null, null)
  }
}

/** Link annot hit areas: external links open a new window (main process routes to shell.openExternal); internal dests jump pages */
export function LinkLayer({
  doc,
  pageNo,
  geom,
  scale,
  onGoToDest,
}: {
  doc: PDFDocumentProxy
  pageNo: number
  geom: PageGeom
  scale: number
  onGoToDest: (dest: unknown) => void
}): ReactElement | null {
  const [links, setLinks] = useState<LinkItem[] | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const hasLinks = !!links && links.length > 0

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const page = await doc.getPage(pageNo)
      const annots = (await page.getAnnotations()) as RawLinkAnnotation[]
      if (cancelled) return
      setLinks(collectPageLinks(annots))
    })()
    return () => {
      cancelled = true
    }
  }, [doc, pageNo])

  const boxes = useMemo(
    () => (links ?? []).map((l) => pdfRectToCss(geom, l.rect, scale)),
    [links, geom, scale],
  )

  useLayoutEffect(() => {
    const layer = layerRef.current
    const page = layer?.parentElement
    if (!layer || !page || boxes.length === 0) return
    pageLinks.set(page, { boxes, layer })
    return () => {
      if (pageLinks.get(page)?.layer === layer) pageLinks.delete(page)
    }
  }, [boxes])

  useEffect(() => {
    const page = layerRef.current?.parentElement
    if (!hasLinks || !page) return
    return trackLinkHover(page)
  }, [hasLinks])

  if (!links || links.length === 0) return null

  return (
    <div ref={layerRef} className="pdf-link-layer">
      {links.map((l, i) => (
        <a
          key={i}
          className="pdf-link"
          style={boxes[i]}
          href={l.url ?? '#'}
          data-tip={l.url}
          target={l.url ? '_blank' : undefined}
          rel="noreferrer"
          onClick={(e) => {
            if (!l.url) {
              e.preventDefault()
              onGoToDest(l.dest)
            }
          }}
        />
      ))}
    </div>
  )
}
