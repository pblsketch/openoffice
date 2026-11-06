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

/** A point in a page's own CSS px (from its top left), which scrolling does not move */
export type PagePoint = { x: number; y: number }

/** Client point (x, y) in `page`'s own coordinates */
function pagePoint(page: Element, x: number, y: number): PagePoint {
  const r = page.getBoundingClientRect()
  return { x: x - r.left - page.clientLeft, y: y - r.top - page.clientTop }
}

/**
 * Whether a click follows the link under it: a real single primary click on
 * the page's text or picture whose press did not travel over the page.
 * `travel` is how far the click lies from its press in page coordinates, so
 * scrolling with the button held counts as travel. A press that travelled is a
 * drag selecting the text, and Shift+click extends the selection. A click
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
  },
  travel: PagePoint | null,
  selection: Pick<Selection, 'isCollapsed'> | null,
): boolean {
  // the second click of a double-click picks a word; the first one already followed
  if (!e.isTrusted || e.button !== 0 || e.detail !== 1 || e.shiftKey) return false
  if (!onLinkSurface(e.target)) return false
  if (travel) return Math.abs(travel.x) <= LINK_CLICK_SLOP && Math.abs(travel.y) <= LINK_CLICK_SLOP
  return !selection || selection.isCollapsed
}

/** The latest primary press: its page (if any), where on that page, and the link there */
type Press = { page: Element | null; at: PagePoint; link: HTMLAnchorElement | null }

/** Window capture sees a press before any handler can stop it (the hand tool
 *  stops presses on the document). */
let lastPress: Press | null = null
let pointerWatchers = 0

/** The last pointer position and buttons, for judging hover again after a scroll */
let lastPointer: { x: number; y: number; buttons: number; pointerType: string } | null = null

/** Pages showing links, each judging its hover again from the last pointer position */
const hoverTrackers = new Set<(under: Element | null) => void>()

const onPress = (e: PointerEvent) => {
  if (e.button !== 0) return
  const page = e.target instanceof Element ? e.target.closest('.pdf-page') : null
  lastPress = page
    ? {
        page,
        at: pagePoint(page, e.clientX, e.clientY),
        link: linkAt(page, e.clientX, e.clientY),
      }
    : { page: null, at: { x: e.clientX, y: e.clientY }, link: null }
}

const onPointer = (e: PointerEvent) => {
  lastPointer = { x: e.clientX, y: e.clientY, buttons: e.buttons, pointerType: e.pointerType }
}

/** A scroll moves the pages under a resting pointer: judge every page's hover again */
const onScroll = () => {
  if (!lastPointer) return
  const under = document.elementFromPoint(lastPointer.x, lastPointer.y)
  for (const judge of hoverTrackers) judge(under)
}

const POINTER_TYPES = ['pointerdown', 'pointermove', 'pointerup'] as const

/** Watch presses, the pointer and scrolling while some page shows links; one set of listeners for all */
function watchPointer(): () => void {
  if (pointerWatchers++ === 0) {
    window.addEventListener('pointerdown', onPress, true)
    for (const type of POINTER_TYPES)
      window.addEventListener(type, onPointer, { capture: true, passive: true })
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  }
  return () => {
    if (--pointerWatchers > 0) return
    window.removeEventListener('pointerdown', onPress, true)
    for (const type of POINTER_TYPES) window.removeEventListener(type, onPointer, true)
    document.removeEventListener('scroll', onScroll, true)
    lastPress = null
    lastPointer = null
  }
}

/**
 * Follow the link under a click on `page`, through the link's own anchor (the
 * same href, target and handler a direct click on it used). The press must
 * have gone down on that same link of that same page, and the page must not
 * have moved under the pointer since (by a drag, or by scrolling with the
 * button held). True when a link was followed.
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
  const link = linkAt(page, e.clientX, e.clientY)
  if (!link) return false
  const press = lastPress
  let travel: PagePoint | null = null
  if (press) {
    if (press.page !== page || press.link !== link) return false
    const at = pagePoint(page, e.clientX, e.clientY)
    travel = { x: at.x - press.at.x, y: at.y - press.at.y }
  }
  if (!followsLinkClick(e, travel, window.getSelection())) return false
  link.click()
  return true
}

/**
 * Hover for links that take no pointer input: marks the link under the pointer
 * (`is-hover` for its look, `data-link-hover` on the page for the hand cursor)
 * and hands it to the screen tips, which show the link's address from
 * `data-tip` on pointerover. Nothing is marked while a button is down (a drag
 * selecting text) or in a page editing mode. A scroll judges it again from the
 * last pointer position, so a link scrolled out from under a resting pointer
 * loses its mark and one scrolled under it gains it.
 */
function trackLinkHover(page: HTMLElement): () => void {
  type At = { x: number; y: number; target: EventTarget | null; pointerType: string }
  let hovered: HTMLAnchorElement | null = null
  const set = (next: HTMLAnchorElement | null, at: At | null) => {
    if (next === hovered) return
    hovered?.classList.remove('is-hover')
    hovered = next
    if (next) {
      next.classList.add('is-hover')
      page.setAttribute('data-link-hover', '')
    } else page.removeAttribute('data-link-hover')
    if (!at) return
    // the tip follows pointerover; tell it the pointer is now over the link (or off it again)
    const over = next ?? (at.target instanceof Element ? at.target : page)
    over.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        clientX: at.x,
        clientY: at.y,
        pointerType: at.pointerType,
      }),
    )
  }
  const judge = (at: At, buttons: number) => {
    const next = buttons === 0 && onLinkSurface(at.target) ? linkAt(page, at.x, at.y) : null
    set(next, at)
  }
  const onMove = (e: PointerEvent) =>
    judge({ x: e.clientX, y: e.clientY, target: e.target, pointerType: e.pointerType }, e.buttons)
  const onLeave = () => set(null, null)
  const rejudge = (under: Element | null) => {
    const p = lastPointer
    if (!p) return
    // scrolled off this page: no mark here, and the tip hears from the page now under the pointer
    if (!under || !page.contains(under)) return set(null, null)
    judge({ x: p.x, y: p.y, target: under, pointerType: p.pointerType }, p.buttons)
  }
  page.addEventListener('pointermove', onMove, { passive: true })
  page.addEventListener('pointerleave', onLeave)
  hoverTrackers.add(rejudge)
  const unwatch = watchPointer()
  return () => {
    page.removeEventListener('pointermove', onMove)
    page.removeEventListener('pointerleave', onLeave)
    hoverTrackers.delete(rejudge)
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
