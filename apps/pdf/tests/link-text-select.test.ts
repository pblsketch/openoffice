/**
 * Text under a link stays selectable (sheet row 247): links take no pointer
 * input, so a drag over link text selects it and a right-click reaches the
 * text menu, while a plain click still follows the link through its anchor
 * and hovering still marks the link and hands its address to the screen tip.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LINK_CLICK_SLOP,
  LinkLayer,
  followLinkAt,
  followsLinkClick,
  linkAt,
  linkBoxAt,
  onLinkSurface,
} from '../src/renderer/LinkLayer'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom has no PointerEvent; the hover code builds one for the screen tips
  if (typeof globalThis.PointerEvent === 'undefined') {
    class PointerEventShim extends MouseEvent {
      pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerType = init.pointerType ?? ''
      }
    }
    vi.stubGlobal('PointerEvent', PointerEventShim)
  }
})

/** A page with a text span, a link layer and a note pin (for the surface and click rules) */
function makePage(className = 'pdf-page'): { page: HTMLDivElement; span: HTMLElement } {
  const page = document.createElement('div')
  page.className = className
  page.innerHTML =
    '<div class="pdf-page-content"><div class="textLayer"><span>link text</span></div></div>' +
    '<div class="pdf-link-layer"><a class="pdf-link" href="https://a.example/"></a></div>' +
    '<div class="pdf-note-pin"></div>'
  document.body.appendChild(page)
  return { page, span: page.querySelector('span')! }
}

type RawLink = { subtype: string; rect: number[]; url?: string; dest?: unknown }

let roots: Root[] = []

/**
 * A 100x100pt page at scale 1 with a real LinkLayer rendered straight into it,
 * as in App, and its text layer in front. jsdom puts the page at (0, 0), so
 * client and page coordinates are the same; PDF y runs up, CSS y down.
 */
async function mountLinks(annots: RawLink[], onGoToDest = vi.fn()) {
  const doc = {
    getPage: async () => ({ getAnnotations: async () => annots }),
  } as unknown as PDFDocumentProxy
  const page = document.createElement('div')
  page.className = 'pdf-page'
  document.body.appendChild(page)
  const root = createRoot(page)
  roots.push(root)
  await act(async () => {
    root.render(
      createElement(LinkLayer, {
        doc,
        pageNo: 1,
        geom: { pw: 100, ph: 100, rot: 0 },
        scale: 1,
        onGoToDest,
      }),
    )
  })
  const content = document.createElement('div')
  content.className = 'pdf-page-content'
  content.innerHTML = '<div class="textLayer"><span>link text</span></div>'
  page.insertBefore(content, page.firstChild)
  const links = [...page.querySelectorAll<HTMLAnchorElement>('.pdf-link')]
  return { page, span: page.querySelector('span')!, links }
}

/** two overlapping links on CSS y 10..30: a over x 10..60, b over x 40..90 (later = on top) */
const OVERLAPPING: RawLink[] = [
  { subtype: 'Link', rect: [10, 70, 60, 90], url: 'https://a.example/' },
  { subtype: 'Link', rect: [40, 70, 90, 90], url: 'https://b.example/' },
]

/** A primary press on `target` at client (x, y); the press watcher sees it on the window */
const press = (target: EventTarget, x: number, y: number) =>
  target.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }),
  )

const click = (target: EventTarget, x: number, y: number, over: Partial<MouseEvent> = {}) => ({
  button: 0,
  detail: 1,
  shiftKey: false,
  isTrusted: true,
  target,
  clientX: x,
  clientY: y,
  ...over,
})

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()))
  roots = []
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

describe('linkBoxAt', () => {
  it('finds the topmost box holding the point', () => {
    const boxes = [
      { left: 10, top: 10, width: 50, height: 20 },
      { left: 40, top: 10, width: 50, height: 20 },
    ]
    expect(linkBoxAt(boxes, 20, 20)).toBe(0)
    expect(linkBoxAt(boxes, 50, 20)).toBe(1)
    expect(linkBoxAt(boxes, 100, 20)).toBe(-1)
    expect(linkBoxAt(boxes, 20, 40)).toBe(-1)
    expect(linkBoxAt([], 20, 20)).toBe(-1)
  })
})

describe('linkAt', () => {
  it('finds the topmost link from the page geometry, measuring only the page', async () => {
    const { page, links } = await mountLinks(OVERLAPPING)
    const measured = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    expect(linkAt(page, 20, 20)).toBe(links[0])
    expect(linkAt(page, 50, 20)).toBe(links[1])
    expect(linkAt(page, 100, 20)).toBeNull()
    expect(linkAt(page, 20, 40)).toBeNull()
    expect(measured).toHaveBeenCalledTimes(4)
    expect(measured.mock.contexts.every((el) => el === page)).toBe(true)
    measured.mockRestore()
  })

  it('knows no links on a page without a link layer', () => {
    expect(linkAt(makePage().page, 20, 20)).toBeNull()
  })
})

describe('onLinkSurface', () => {
  it('is the page text and picture, outside editing modes and overlays', () => {
    const { span, page } = makePage()
    expect(onLinkSurface(span)).toBe(true)
    expect(onLinkSurface(page.querySelector('.pdf-note-pin'))).toBe(false)
    expect(onLinkSurface(null)).toBe(false)
    for (const mode of ['pdf-editing-text', 'pdf-inserting-text']) {
      const other = makePage(`pdf-page ${mode}`)
      expect(onLinkSurface(other.span)).toBe(false)
    }
  })
})

describe('followsLinkClick', () => {
  const span = () => makePage().span
  const collapsed = { isCollapsed: true }
  const selected = { isCollapsed: false }
  const still = { x: 0, y: 0 }

  it('follows a primary click whose press did not travel over the page', () => {
    expect(followsLinkClick(click(span(), 20, 20), still, collapsed)).toBe(true)
    expect(followsLinkClick(click(span(), 20, 20), { x: LINK_CLICK_SLOP, y: 0 }, null)).toBe(true)
    // inside text already selected: the selection only goes after the click
    expect(followsLinkClick(click(span(), 20, 20), still, selected)).toBe(true)
  })

  it('leaves a press that travelled (a drag, or a scroll with the button held) to the text', () => {
    expect(followsLinkClick(click(span(), 20, 20), { x: 40, y: 0 }, selected)).toBe(false)
    expect(
      followsLinkClick(click(span(), 20, 20), { x: 0, y: -(LINK_CLICK_SLOP + 1) }, collapsed),
    ).toBe(false)
  })

  it('without a known press, a selection left standing counts as a drag', () => {
    expect(followsLinkClick(click(span(), 20, 20), null, collapsed)).toBe(true)
    expect(followsLinkClick(click(span(), 20, 20), null, null)).toBe(true)
    expect(followsLinkClick(click(span(), 20, 20), null, selected)).toBe(false)
  })

  it('leaves Shift+click, other buttons and overlays alone', () => {
    expect(followsLinkClick(click(span(), 20, 20, { shiftKey: true }), still, collapsed)).toBe(
      false,
    )
    expect(followsLinkClick(click(span(), 20, 20, { button: 1 }), still, collapsed)).toBe(false)
    const pin = makePage().page.querySelector('.pdf-note-pin')
    expect(followsLinkClick(click(pin!, 20, 20), still, collapsed)).toBe(false)
  })

  it('leaves the second click of a double-click (picking a word) alone', () => {
    expect(followsLinkClick(click(span(), 20, 20, { detail: 2 }), still, collapsed)).toBe(false)
    expect(followsLinkClick(click(span(), 20, 20, { detail: 3 }), still, collapsed)).toBe(false)
  })

  it('ignores the synthetic click it sends to the anchor itself', () => {
    expect(followsLinkClick({ ...click(span(), 20, 20), isTrusted: false }, still, collapsed)).toBe(
      false,
    )
  })
})

describe('followLinkAt', () => {
  it('clicks the anchor under a plain click on link text', async () => {
    const { page, span, links } = await mountLinks(OVERLAPPING)
    const clicked: string[] = []
    for (const link of links)
      link.addEventListener('click', (e) => {
        e.preventDefault()
        clicked.push(link.href)
      })
    expect(followLinkAt(page, click(span, 20, 20))).toBe(true)
    expect(followLinkAt(page, click(span, 80, 20))).toBe(true)
    expect(clicked).toEqual(['https://a.example/', 'https://b.example/'])
    // off every link: the page's own click handling goes on
    expect(followLinkAt(page, click(span, 100, 20))).toBe(false)
    // a double-click picking a word on the link opens it once, not twice
    expect(followLinkAt(page, click(span, 20, 20, { detail: 2 }))).toBe(false)
    expect(clicked).toHaveLength(2)
  })

  it('does not follow once the drag selected the link text', async () => {
    const { page, span, links } = await mountLinks(OVERLAPPING)
    const onClick = vi.fn((e: Event) => e.preventDefault())
    links[0]!.addEventListener('click', onClick)
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.addRange(range)
    expect(window.getSelection()!.isCollapsed).toBe(false)
    expect(followLinkAt(page, click(span, 20, 20))).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('LinkLayer', () => {
  /** a web link on CSS y 80..100 and an internal one on y 40..60, both x 0..50 */
  const mount = (onGoToDest = vi.fn()) =>
    mountLinks(
      [
        { subtype: 'Link', rect: [0, 0, 50, 20], url: 'https://a.example/' },
        { subtype: 'Link', rect: [0, 40, 50, 60], dest: ['p2'] },
      ],
      onGoToDest,
    )

  it('keeps the anchors (address tip, keyboard focus) and their click handling', async () => {
    const onGoToDest = vi.fn()
    const { links, page, span } = await mount(onGoToDest)
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('data-tip')).toBe('https://a.example/')
    expect(links[0]!.target).toBe('_blank')
    expect(links[0]!.rel).toBe('noreferrer')
    // an internal link jumps through the same handler as before
    expect(followLinkAt(page, click(span, 10, 50))).toBe(true)
    expect(onGoToDest).toHaveBeenCalledWith(['p2'])
  })

  it('tells a click inside selected link text from a drag by the press', async () => {
    const { links, page, span } = await mount()
    const onClick = vi.fn((e: Event) => e.preventDefault())
    links[0]!.addEventListener('click', onClick)
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.addRange(range)
    // pressed and released in place on the selected text: follows
    press(span, 10, 90)
    expect(followLinkAt(page, click(span, 11, 90))).toBe(true)
    // pressed elsewhere and dragged onto the link: the drag selected text
    press(span, 10, 50)
    expect(followLinkAt(page, click(span, 10, 90))).toBe(false)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('opens nothing when the page scrolled under a held button', async () => {
    const { links, page, span } = await mount()
    const clicked: string[] = []
    for (const link of links)
      link.addEventListener('click', (e) => {
        e.preventDefault()
        clicked.push(link.getAttribute('href')!)
      })
    // the page's top on screen; scrolling moves it while the pointer stays put
    let top = 0
    page.getBoundingClientRect = () => ({ left: 0, top, right: 100, bottom: top + 100 }) as DOMRect
    // pressed on the web link (page y 80..100), wheel-scrolled 40px: released over the internal one
    press(span, 10, 90)
    top = 40
    expect(followLinkAt(page, click(span, 10, 90))).toBe(false)
    // pressed on plain text (page y 30), scrolled until the internal link (40..60) is there
    top = 0
    press(span, 10, 30)
    top = -20
    expect(followLinkAt(page, click(span, 10, 30))).toBe(false)
    // still the same link, but the page moved past the slop
    top = 0
    press(span, 10, 90)
    top = -(LINK_CLICK_SLOP + 2)
    expect(followLinkAt(page, click(span, 10, 90))).toBe(false)
    expect(clicked).toEqual([])
    // no scroll: the same press and release still opens it
    top = 0
    press(span, 10, 90)
    expect(followLinkAt(page, click(span, 10, 90))).toBe(true)
    expect(clicked).toEqual(['https://a.example/'])
  })

  it('judges the hover again when a scroll moves the page under a resting pointer', async () => {
    const { page, span, links } = await mount()
    let top = 0
    page.getBoundingClientRect = () => ({ left: 0, top, right: 100, bottom: top + 100 }) as DOMRect
    let under: Element | null = span
    // jsdom has no hit testing
    document.elementFromPoint = () => under
    const scroll = () => document.dispatchEvent(new Event('scroll'))
    span.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 90 }))
    expect(links[0]!.classList.contains('is-hover')).toBe(true)
    // scrolled 40px up: the web link (page y 80..100) left the pointer, nothing is under it now
    top = -40
    scroll()
    expect(links[0]!.classList.contains('is-hover')).toBe(false)
    expect(page.hasAttribute('data-link-hover')).toBe(false)
    // scrolled back: the link comes under the resting pointer again
    top = 0
    scroll()
    expect(links[0]!.classList.contains('is-hover')).toBe(true)
    expect(page.hasAttribute('data-link-hover')).toBe(true)
    // scrolled until another page is under the pointer: no mark left here
    under = document.body
    scroll()
    expect(links[0]!.classList.contains('is-hover')).toBe(false)
    expect(page.hasAttribute('data-link-hover')).toBe(false)
    delete (document as { elementFromPoint?: unknown }).elementFromPoint
  })

  it('marks the hovered link and hands it to the screen tip, but not mid-drag', async () => {
    const { page: host, span, links } = await mount()
    const overs: EventTarget[] = []
    const onOver = (e: Event) => overs.push(e.target!)
    document.addEventListener('pointerover', onOver, true)
    const move = (x: number, y: number, buttons = 0) =>
      span.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons }),
      )
    move(10, 90)
    expect(links[0]!.classList.contains('is-hover')).toBe(true)
    expect(host.hasAttribute('data-link-hover')).toBe(true)
    expect(overs.at(-1)).toBe(links[0])
    // a pressed button is a text drag: no link look, no hand cursor
    move(10, 90, 1)
    expect(links[0]!.classList.contains('is-hover')).toBe(false)
    expect(host.hasAttribute('data-link-hover')).toBe(false)
    // off the link the tip is told the pointer is over the text again
    expect(overs.at(-1)).toBe(span)
    move(10, 50)
    expect(links[1]!.classList.contains('is-hover')).toBe(true)
    host.dispatchEvent(new PointerEvent('pointerleave'))
    expect(links[1]!.classList.contains('is-hover')).toBe(false)
    document.removeEventListener('pointerover', onOver, true)
  })
})

describe('link styles and page wiring', () => {
  const css = readFileSync(join(process.cwd(), 'src/renderer/styles.css'), 'utf8')
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    expect(at).toBeGreaterThanOrEqual(0)
    return css.slice(at, css.indexOf('}', at))
  }

  it('lets pointer input through every link to the text under it', () => {
    expect(rule('.pdf-link-layer')).toContain('pointer-events: none')
    expect(rule('.pdf-link')).not.toContain('pointer-events: auto')
    expect(css).not.toContain('.pdf-link:hover')
    expect(rule('.pdf-link.is-hover')).toContain('background')
  })

  it('follows a page click on a link before the page click handling', () => {
    const app = readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
    expect(app).toContain(
      'else if (!followLinkAt(e.currentTarget, e.nativeEvent))\n                              handlePageClick(origIdx, e)',
    )
  })
})
