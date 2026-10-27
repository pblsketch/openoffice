/**
 * Where the others in a co-editing session are: each person publishes the
 * chapter on their screen, the first block in view and their caret (a block
 * id and plain-text offsets, the host's ids for everyone); here the others
 * are drawn into the chapter frame in their colour, with their name.
 *
 * The marks live in a layer beside the frame's body, never inside a block:
 * the edit controller pairs each block's DOM with its source, and redraws of
 * the body leave the layer alone. The frame is a drawing copy and a save
 * writes from the source text, so nothing drawn here reaches the book.
 */
import { collabColorValue, type CollabSession } from '@genoffice/collab'
import { COLLAB_COLOR_COUNT } from '@genoffice/electron-utils/collab-channels'
import { blockElement, topBlockId } from '../reader/frame-dom'

/** the awareness field this editor publishes */
export const PRESENCE_FIELD = 'epub'

export interface EpubPresence {
  spineIndex: number
  path: string
  /** the first block in view */
  top: string | null
  /** the caret or selection, when it lies inside one block */
  caret: { id: string; start: number; end: number } | null
}

/** Someone reading another chapter (the status line lists them). */
export interface PeerPlace {
  clientId: number
  name: string
  palette: number
  spineIndex: number
  top: string | null
}

interface PeerMark {
  name: string
  palette: number
  presence: EpubPresence
}

const LAYER_ID = 'genoffice-collab-layer'
const STYLE_ID = 'genoffice-collab-style'
/** how often this person's place goes out at most */
const PUBLISH_MS = 80

// the frame does not load the page's styles: the marks bring their own, in the palette's tokens
const LAYER_CSS = `#${LAYER_ID} { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 2147483647; }
#${LAYER_ID} > * { position: absolute; margin: 0; padding: 0; border: 0; box-sizing: border-box; }
#${LAYER_ID} .collab-caret { background: var(--c); }
#${LAYER_ID} .collab-selection { background: var(--c); opacity: 0.25; }
#${LAYER_ID} .collab-caret-label { padding: 0 4px; border-radius: 3px; background: var(--c); color: var(--collab-ink); font: 600 11px/16px system-ui, sans-serif; white-space: nowrap; transform: translateY(-100%); }
#${LAYER_ID} .collab-reader { opacity: 0.7; }`

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isIndex = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

/** Another peer's published place, checked (it came over the network). */
export function presenceOf(v: unknown): EpubPresence | null {
  if (!isRecord(v) || !isIndex(v.spineIndex) || typeof v.path !== 'string') return null
  const top = isId(v.top) ? v.top : null
  const c = v.caret
  const caret =
    isRecord(c) && isId(c.id) && isIndex(c.start) && isIndex(c.end)
      ? { id: c.id, start: c.start, end: c.end }
      : null
  return { spineIndex: v.spineIndex, path: v.path, top, caret }
}

function paletteOf(v: unknown): number {
  return isIndex(v) && v < COLLAB_COLOR_COUNT ? v : 0
}

/** Everyone else's place, split into this chapter's and the rest. */
export function peerPlaces(
  peers: ReadonlyArray<{
    clientId: number
    user: { name: string; palette: number }
    value: unknown
  }>,
  path: string | null,
): { here: PeerMark[]; elsewhere: PeerPlace[] } {
  const here: PeerMark[] = []
  const elsewhere: PeerPlace[] = []
  for (const peer of peers) {
    const presence = presenceOf(peer.value)
    if (!presence) continue
    const palette = paletteOf(peer.user.palette)
    if (presence.path === path) here.push({ name: peer.user.name, palette, presence })
    else {
      elsewhere.push({
        clientId: peer.clientId,
        name: peer.user.name,
        palette,
        spineIndex: presence.spineIndex,
        top: presence.top,
      })
    }
  }
  return { here, elsewhere }
}

function layerOf(doc: Document): HTMLElement {
  if (doc.head && !doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = LAYER_CSS
    doc.head.appendChild(style)
  }
  let layer = doc.getElementById(LAYER_ID)
  if (!layer) {
    layer = doc.createElement('div')
    layer.id = LAYER_ID
    layer.setAttribute('aria-hidden', 'true')
    // beside the body: outside every block and every redraw of the chapter
    doc.documentElement.appendChild(layer)
  }
  return layer
}

export function clearPresence(doc: Document): void {
  doc.getElementById(LAYER_ID)?.remove()
  doc.getElementById(STYLE_ID)?.remove()
}

function box(
  doc: Document,
  layer: HTMLElement,
  className: string,
  palette: number,
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const el = doc.createElement('div')
  el.className = className
  el.style.setProperty('--c', `var(--collab-${palette})`)
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  if (rect.width > 0) el.style.width = `${rect.width}px`
  if (rect.height > 0) el.style.height = `${rect.height}px`
  layer.appendChild(el)
  return el
}

function label(
  doc: Document,
  layer: HTMLElement,
  mark: PeerMark,
  at: { left: number; top: number },
  extra = '',
): void {
  const el = box(doc, layer, `collab-caret-label${extra}`, mark.palette, {
    ...at,
    width: 0,
    height: 0,
  })
  el.textContent = mark.name
}

function rectsOf(range: Range): DOMRect[] {
  return typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : []
}

/** Where a collapsed range sits; a point between elements has no box of its own, its element does. */
function caretRect(range: Range, doc: Document): DOMRect {
  const own = rectsOf(range)[0]
  if (own && (own.height > 0 || own.width > 0)) return own
  const node = range.startContainer
  const el = node.nodeType === 1 ? (node as Element) : (node.parentElement ?? doc.body)
  return el.getBoundingClientRect()
}

/** Draws the marks of the people in this chapter (`locate` finds a caret's range on screen). */
export function drawPresence(
  doc: Document,
  marks: readonly PeerMark[],
  locate: (id: string, start: number, end: number) => Range | null,
): void {
  if (marks.length === 0) {
    clearPresence(doc)
    return
  }
  const layer = layerOf(doc)
  // the frame has none of the page's tokens: the palette goes in resolved
  const root = document.documentElement
  for (let n = 0; n < COLLAB_COLOR_COUNT; n++) {
    layer.style.setProperty(`--collab-${n}`, collabColorValue(n, root))
  }
  layer.style.setProperty(
    '--collab-ink',
    getComputedStyle(root).getPropertyValue('--collab-ink').trim(),
  )
  layer.replaceChildren()
  for (const mark of marks) {
    const { caret, top } = mark.presence
    const range = caret ? locate(caret.id, caret.start, caret.end) : null
    if (range) {
      if (!range.collapsed) {
        for (const r of rectsOf(range)) box(doc, layer, 'collab-selection', mark.palette, r)
      }
      const end = range.cloneRange()
      end.collapse(false)
      const r = caretRect(end, doc)
      const at = end.startContainer.parentElement ?? doc.body
      const vertical = /^vertical/.test(
        (doc.defaultView ?? window).getComputedStyle(at).writingMode,
      )
      box(doc, layer, 'collab-caret', mark.palette, {
        left: r.left,
        top: r.top,
        width: vertical ? Math.max(r.width, 2) : 2,
        height: vertical ? 2 : Math.max(r.height, 2),
      })
      label(doc, layer, mark, { left: r.left, top: r.top })
      continue
    }
    const el = top ? blockElement(doc, top) : null
    if (!el) continue
    const r = el.getBoundingClientRect()
    // the first block in view may start above it: the tag stays in sight
    label(doc, layer, mark, { left: r.left, top: Math.max(r.top, 16) }, ' collab-reader')
  }
}

/**
 * Keeps this person's place published and the others' drawn, for the chapter
 * frame of the moment (`attach` it whenever a chapter is drawn).
 */
export class PresenceSync {
  private doc: Document | null = null
  private offDoc: Array<() => void> = []
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  private drawFrame = 0
  private readonly offPeers: () => void

  constructor(
    private readonly o: {
      session: CollabSession
      /** the chapter in the frame */
      chapter(): { spineIndex: number; path: string } | null
      caret(): EpubPresence['caret']
      locate(id: string, start: number, end: number): Range | null
      elsewhere(places: PeerPlace[]): void
    },
  ) {
    this.offPeers = o.session.onPeersChanged(() => this.redraw())
  }

  attach(doc: Document): void {
    this.detach()
    this.doc = doc
    const win = doc.defaultView
    const on = (target: EventTarget, type: string, handler: () => void) => {
      target.addEventListener(type, handler, { passive: true })
      this.offDoc.push(() => target.removeEventListener(type, handler))
    }
    on(doc, 'selectionchange', () => this.publishSoon())
    on(doc, 'scroll', () => {
      this.publishSoon()
      this.redraw()
    })
    if (win) on(win, 'resize', () => this.redraw())
    // typing and the controller's redraws move the marks
    const observer = new MutationObserver(() => this.redraw())
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true })
    this.offDoc.push(() => observer.disconnect())
    this.publish()
    this.redraw()
  }

  stop(): void {
    this.detach()
    this.offPeers()
    if (this.publishTimer !== null) clearTimeout(this.publishTimer)
    this.publishTimer = null
    this.o.session.setPresence(PRESENCE_FIELD, null)
    this.o.elsewhere([])
  }

  private detach(): void {
    for (const off of this.offDoc.splice(0)) off()
    if (this.doc) clearPresence(this.doc)
    this.doc = null
    if (this.drawFrame) cancelAnimationFrame(this.drawFrame)
    this.drawFrame = 0
  }

  private publishSoon(): void {
    if (this.publishTimer !== null) return
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null
      this.publish()
    }, PUBLISH_MS)
  }

  private publish(): void {
    const doc = this.doc
    const chapter = this.o.chapter()
    if (!doc || !chapter) return
    const presence: EpubPresence = {
      spineIndex: chapter.spineIndex,
      path: chapter.path,
      top: topBlockId(doc),
      caret: this.o.caret(),
    }
    this.o.session.setPresence(PRESENCE_FIELD, presence)
  }

  private redraw(): void {
    if (this.drawFrame) return
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = 0
      const chapter = this.o.chapter()
      const places = peerPlaces(
        this.o.session.presences<unknown>(PRESENCE_FIELD),
        chapter?.path ?? null,
      )
      this.o.elsewhere(places.elsewhere)
      const doc = this.doc
      if (!doc) return
      drawPresence(doc, places.here, (id, start, end) => {
        const range = this.o.locate(id, start, end)
        // while a new frame loads, the controller may already hold it
        return range?.startContainer.ownerDocument === doc ? range : null
      })
    })
  }
}
