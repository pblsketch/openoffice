/**
 * The drawing copy of one chapter: what the chapter frame shows.
 *
 * The chapter's text comes from the main process exactly as the book holds
 * it. Before it is drawn, a copy is made here:
 *
 * - every editable block gets `data-epub-block="<engine id>"`, placed from the
 *   block ranges `epub:read-chapter` returned, so the screen can find a block
 *   by id (reading position, editing);
 * - the book's scripts, `on…` attributes, `javascript:` addresses, frames,
 *   plug-ins, `<base>` and `http-equiv` metas are removed;
 * - the head gets a Content-Security-Policy that runs no script and loads
 *   pictures, styles and fonts only from `epub-asset:`, then a `<base>` at the
 *   chapter's own `epub-asset:` address so the book's relative links, styles
 *   and pictures resolve inside the book, then the book's own styles, then the
 *   screen-only view settings (`VIEW_STYLE_ID`).
 *
 * The copy is HTML, never saved: saving replaces ranges of the original text
 * (spec §12.1). A well-formed chapter is read as XHTML and written out as
 * HTML, so `<a id="x"/>` stays an empty element; a broken one is read with the
 * HTML parser.
 */

/** Marks an editable block of the drawn chapter; the value is the engine's block id. */
export const BLOCK_ATTR = 'data-epub-block'

/** The `<style>` in the frame's head that carries the view settings. */
export const VIEW_STYLE_ID = 'genoffice-epub-view'

/** A temporary marker written into the chapter text before it is parsed. */
const MARK_ATTR = 'data-genoffice-epub-block-mark'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/**
 * The policy of the drawn chapter. No script runs, nothing is fetched from
 * outside the open book, sound and video are not loaded (spec §4), and the
 * only base address allowed is a book address. The editor page's own policy
 * (index.html) is inherited on top of this one.
 */
export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  'img-src epub-asset: data:',
  "style-src epub-asset: 'unsafe-inline'",
  'font-src epub-asset: data:',
  "media-src 'none'",
  'base-uri epub-asset:',
].join('; ')

/** The part of a block the drawing copy needs: where its start tag begins. */
export interface ChapterBlockRef {
  id: string
  /** qualified tag name as written */
  tag: string
  outer: { start: number }
}

export interface ChapterHtmlInput {
  /** the chapter's current text */
  source: string
  /** not well-formed: read with the HTML parser */
  broken: boolean
  blocks: readonly ChapterBlockRef[]
  /** the chapter's own `epub-asset:` address: the base of its links, styles and pictures */
  baseUrl: string
  /** CSS for the view settings; empty when left out */
  viewCss?: string
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Writes a marker attribute into the start tag of every block, at the offsets
 * the main process gave. A block whose offset does not point at its start tag
 * is left unmarked rather than marking the wrong element.
 */
export function markBlocks(source: string, blocks: readonly ChapterBlockRef[]): string {
  const marks: Array<{ at: number; text: string }> = []
  for (const block of blocks) {
    const start = block.outer.start
    if (source.charCodeAt(start) !== 0x3c /* < */) continue
    if (!source.startsWith(block.tag, start + 1)) continue
    const at = start + 1 + block.tag.length
    const next = source[at]
    if (next === undefined || !/[\s/>]/.test(next)) continue
    marks.push({ at, text: ` ${MARK_ATTR}="${escapeAttr(block.id)}"` })
  }
  marks.sort((a, b) => b.at - a.at)
  let out = source
  for (const mark of marks) out = out.slice(0, mark.at) + mark.text + out.slice(mark.at)
  return out
}

function hasParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0
}

/**
 * Reads the chapter: as XHTML when it is well-formed and in the XHTML
 * namespace, else with the HTML parser.
 */
export function parseChapter(source: string, broken: boolean): Document {
  const parser = new DOMParser()
  if (!broken) {
    try {
      const xml = parser.parseFromString(source, 'application/xhtml+xml')
      if (!hasParserError(xml) && xml.documentElement?.namespaceURI === XHTML_NS) return xml
    } catch {
      // read it as HTML below
    }
  }
  return parser.parseFromString(source, 'text/html')
}

const REMOVED_ELEMENTS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'portal',
  'fencedframe',
])

const SCRIPT_URL = /^(?:javascript|vbscript):/i

/** Whether an attribute value is a script address (control characters and spaces are ignored, as browsers do). */
export function isScriptUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- browsers drop these before reading a scheme
  return SCRIPT_URL.test(value.replace(/[\u0000- ]/g, ''))
}

function linkIsStylesheet(el: Element): boolean {
  const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
  return rel.includes('stylesheet') && !rel.includes('alternate')
}

function removedElement(el: Element): boolean {
  const name = el.localName.toLowerCase()
  if (REMOVED_ELEMENTS.has(name)) return true
  if (name === 'meta') return el.hasAttribute('http-equiv')
  if (name === 'link') return !linkIsStylesheet(el)
  // SVG animation of an address can set a script URL after the attributes were checked
  if (name === 'set' || name === 'animate') {
    const target = (el.getAttribute('attributeName') ?? '').toLowerCase()
    return target === 'href' || target === 'xlink:href'
  }
  return false
}

/**
 * Removes what could run or reach outside the book, in place, and turns the
 * block markers into `data-epub-block`. A `data-epub-block` the book itself
 * carried is dropped first, so every one on screen is an engine id.
 */
export function sanitizeTree(root: Document | Element): void {
  const all = Array.from(root.getElementsByTagName('*'))
  for (const el of all) {
    // inside an element already removed
    if (!root.contains(el)) continue
    if (removedElement(el)) {
      el.remove()
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === BLOCK_ATTR ||
        isScriptUrl(attr.value)
      ) {
        el.removeAttributeNode(attr)
      }
    }
    const tag = el.localName.toLowerCase()
    if (tag === 'audio' || tag === 'video') {
      el.removeAttribute('autoplay')
      el.removeAttribute('controls')
    }
  }
  for (const el of Array.from(root.querySelectorAll(`[${MARK_ATTR}]`))) {
    el.setAttribute(BLOCK_ATTR, el.getAttribute(MARK_ATTR) ?? '')
    el.removeAttribute(MARK_ATTR)
  }
}

function childByName(parent: Element | null, name: string): Element | null {
  if (!parent) return null
  for (const child of Array.from(parent.children)) {
    if (child.localName.toLowerCase() === name) return child
  }
  return null
}

/** Copies the attributes a book's CSS may select on (`class`, `dir`, `lang`, `epub:type`…), not namespace declarations. */
function copyAttributes(from: Element, to: Element): void {
  for (const attr of Array.from(from.attributes)) {
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
    try {
      to.setAttribute(attr.name, attr.value)
    } catch {
      // a name HTML cannot carry: the attribute is not needed to draw
    }
  }
  const xmlLang = from.getAttribute('xml:lang')
  if (xmlLang && !to.hasAttribute('lang')) to.setAttribute('lang', xmlLang)
}

/** The drawing copy of a chapter, as an HTML document text for the frame's `srcdoc`. */
export function buildChapterHtml(input: ChapterHtmlInput): string {
  const parsed = parseChapter(markBlocks(input.source, input.blocks), input.broken)
  const out = document.implementation.createHTMLDocument('')
  // the empty <title> createHTMLDocument adds; the book's own comes below
  out.head.replaceChildren()
  const root = parsed.documentElement
  const isHtmlRoot = root?.localName.toLowerCase() === 'html'
  const srcHead = isHtmlRoot ? childByName(root, 'head') : null
  const srcBody = isHtmlRoot ? childByName(root, 'body') : null
  if (root && isHtmlRoot) copyAttributes(root, out.documentElement)
  if (srcBody) copyAttributes(srcBody, out.body)

  // the book's own styles, in their order
  if (srcHead) {
    for (const el of Array.from(srcHead.children)) {
      const name = el.localName.toLowerCase()
      if (name === 'style' || (name === 'link' && linkIsStylesheet(el)) || name === 'title') {
        out.head.appendChild(out.importNode(el, true))
      }
    }
  }
  if (srcBody) {
    for (const node of Array.from(srcBody.childNodes))
      out.body.appendChild(out.importNode(node, true))
  } else if (root && !isHtmlRoot) {
    // a chapter that is a picture (an SVG spine item) is drawn inside the body
    out.body.appendChild(out.importNode(root, true))
  }
  sanitizeTree(out)

  // ours, after the clean-up: charset, policy (before the base it allows), base, view settings
  const charset = out.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  const csp = out.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', FRAME_CSP)
  const base = out.createElement('base')
  base.setAttribute('href', input.baseUrl)
  out.head.prepend(charset, csp, base)
  const view = out.createElement('style')
  view.id = VIEW_STYLE_ID
  view.textContent = input.viewCss ?? ''
  out.head.appendChild(view)

  return `<!DOCTYPE html>\n${out.documentElement.outerHTML}`
}
