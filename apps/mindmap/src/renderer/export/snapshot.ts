/**
 * A still copy of one sheet exactly as it is drawn: what the picture, the PDF,
 * the printed page and the preview picture in the file are made from.
 *
 * The copy is the sheet's own drawing (the library's topics with what
 * `decorate.ts` added, the branch lines as `after` drew them, the colours as
 * `--mm-` properties on the container and on each main branch). Nothing is
 * drawn a second way, so an export looks like the map on screen. Folded
 * branches are folded in it, because they are folded on screen.
 *
 * What is only there for editing is taken out: the selection, the fold
 * handles, the edit box, the handles of a relationship and the glow of a
 * selected one. Then the copy is cleaned on a list of what may stay. Only the
 * elements the map is drawn with stay, no attribute that runs code or names
 * an address does, a style that names an address goes, and the only picture
 * source is a `data:` address this module makes from bytes read out of the
 * file. A drawn line (a branch line, a relationship and its ends, a summary
 * bracket, a boundary) keeps of its inline style only the properties a line
 * is drawn with, and only values of a known form: a colour of numbers, a map
 * colour (`var(--mm-…)`), numbers, and the few words of a line's ends and joins. The
 * file's text was text on screen and is still text here; it is never parsed.
 *
 * Pictures. A picture that lives in the file is read again from the archive
 * through the engine (`archivePictureEntry`, the same rule as on screen), its
 * type told from its bytes (`pictureType`), and put in as a `data:` address at
 * the size it has on screen. An SVG picture stays an image. A picture outside
 * the file was only a mark on screen and is the same mark here, with no
 * source. The reference in the file is never followed.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'
import type { ViewImage } from '@genoffice/xmind-engine'
import { archivePictureEntry, pictureType } from '../map/images'

/** A copy of a sheet, ready to be written out. */
export interface MapSnapshot {
  /** a detached `.mm-card.mm-export` element holding the copy, with its size set */
  element: HTMLElement
  /** CSS pixels */
  width: number
  height: number
  /** the colour of the map's ground, as the theme gives it */
  ground: string
  /** the pictures of the file in the copy, with the bytes they were made from */
  pictures: ReadonlyMap<HTMLImageElement, SnapshotPicture>
}

export interface SnapshotPicture {
  bytes: Uint8Array
  /** the type told from the bytes */
  type: string
}

export interface SnapshotSource {
  mind: MindElixirInstance
  /** the bytes of an entry of the map file */
  readEntry(name: string): Promise<Uint8Array | null>
}

/** The part of the sheet that is drawn, in the coordinates of the library's `me-nodes`. */
export interface DrawnBox {
  left: number
  top: number
  width: number
  height: number
}

export const EXPORT_CLASS = 'mm-export'

/** Room left around a relationship or a summary that reaches past the topics. */
const OVERFLOW_PAD = 8
/** How long a picture that is still loading is waited for. */
const PICTURE_WAIT_MS = 3000

/** Elements of the drawing that are there for editing only. */
const CHROME = [
  'me-epd',
  '#input-box',
  '.linkcontroller',
  '.circle',
  '.insert-preview',
  '.context-menu',
  '.tips',
  '.selection-area',
  '.mind-elixir-ghost',
  '.arrow-highlight',
].join(',')

/** Every element a drawn map is made of. Anything else is dropped with what it holds. */
const KEPT_ELEMENTS = new Set([
  'me-nodes',
  'me-main',
  'me-wrapper',
  'me-parent',
  'me-children',
  'me-root',
  'me-tpc',
  'div',
  'span',
  'p',
  'br',
  'img',
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
])

/** Attributes that never stay: they run code, take input, or point somewhere. */
const DROPPED_ATTRIBUTES =
  /^(?:on.*|href|xlink:href|src|srcset|action|formaction|contenteditable|tabindex|draggable|spellcheck|title|xml:base)$/i
/** A value that could reach outside or run something. */
const UNSAFE_VALUE = /url\s*\(|expression\s*\(|@import|javascript:|vbscript:|\\/i

/**
 * Cleans a copy of a drawing in place: what is there for editing goes, then
 * everything not on the lists. Exported for the tests.
 */
export function cleanCopy(root: Element): void {
  root.querySelectorAll(CHROME).forEach((element) => element.remove())
  const walk = (element: Element): void => {
    for (const child of [...element.childNodes]) {
      if (
        child.nodeType === Node.COMMENT_NODE ||
        child.nodeType === Node.PROCESSING_INSTRUCTION_NODE
      ) {
        child.remove()
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const inner = child as Element
      if (!KEPT_ELEMENTS.has(inner.localName.toLowerCase())) {
        inner.remove()
        continue
      }
      walk(inner)
    }
    cleanAttributes(element)
  }
  walk(root)
}

function cleanAttributes(element: Element): void {
  element.classList.remove('selected')
  if (element.getAttribute('class') === '') element.removeAttribute('class')
  for (const { name, value } of [...element.attributes]) {
    if (DROPPED_ATTRIBUTES.test(name) || UNSAFE_VALUE.test(value)) element.removeAttribute(name)
  }
  if (element.localName === 'me-tpc' && element instanceof HTMLElement) keepTopicStyle(element)
  else if (element.namespaceURI === SVG_NS) keepDrawingStyle(element as SVGElement)
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The properties a drawn line may set inline: what `decorate.ts` and `relations.ts` set. */
const DRAWING_STYLE = [
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'fill',
  'fill-opacity',
  'opacity',
] as const

/**
 * A value of a drawn line: a colour (hex, or the `rgb()` a browser writes a
 * hex colour back as), a map colour, numbers (a width, dashes), or a word of
 * a line's ends.
 */
const DRAWING_VALUE =
  /^(?:#[0-9a-f]{3,8}|rgba?\(\d{1,3}(?:, \d{1,3}){2}(?:, (?:0|1|0?\.\d+))?\)|var\(--mm-[\w-]+\)|none|round|butt|square|miter|bevel|\d+(?:\.\d+)?(?:px)?(?:[\s,]+\d+(?:\.\d+)?(?:px)?)*)$/i

function keepDrawingStyle(element: SVGElement): void {
  if (!element.hasAttribute('style')) return
  const kept = DRAWING_STYLE.map(
    (name) => [name, element.style.getPropertyValue(name).trim()] as const,
  )
  element.removeAttribute('style')
  for (const [name, value] of kept) {
    if (value !== '' && DRAWING_VALUE.test(value) && !UNSAFE_VALUE.test(value)) {
      element.style.setProperty(name, value)
    }
  }
  if (element.style.length === 0) element.removeAttribute('style')
}

/** The properties `decorate.ts` sets on a topic: the only ones a copied topic keeps. */
const TOPIC_STYLE = [
  'background-color',
  'box-shadow',
  'color',
  'font-weight',
  'font-size',
  'line-height',
  'font-family',
  'font-style',
  'text-decoration',
  'text-align',
  'text-transform',
  'width',
  'max-width',
  'overflow-wrap',
] as const

function keepTopicStyle(topic: HTMLElement): void {
  if (!topic.hasAttribute('style')) return
  const kept = TOPIC_STYLE.map((name) => [name, topic.style.getPropertyValue(name)] as const)
  topic.removeAttribute('style')
  for (const [name, value] of kept) {
    if (value !== '' && !UNSAFE_VALUE.test(value)) topic.style.setProperty(name, value)
  }
}

/** The custom properties of an inline style, as name and value. */
function customProperties(style: string | null): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const part of (style ?? '').split(';')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const name = part.slice(0, colon).trim()
    const value = part.slice(colon + 1).trim()
    if (/^--[\w-]+$/.test(name) && value !== '' && !UNSAFE_VALUE.test(value))
      out.push([name, value])
  }
  return out
}

const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

interface PictureJob {
  img: HTMLImageElement
  entry: string
}

function imageOf(topic: Element): ViewImage | null {
  const node = (topic as Element & { nodeObj?: Topic['nodeObj'] }).nodeObj
  const image = (node?.metadata as { image?: unknown } | undefined)?.image
  return typeof image === 'object' && image !== null ? (image as ViewImage) : null
}

/**
 * Makes the copy of a drawing that is laid out on screen. `box` is the part to
 * keep (`measureDrawing`). The copy is taken at once, so it is the drawing of
 * this moment; reading the pictures out of the file comes after.
 */
export async function copyDrawing(source: SnapshotSource, box: DrawnBox): Promise<MapSnapshot> {
  const { mind } = source
  const doc = mind.nodes.ownerDocument
  const copy = mind.nodes.cloneNode(true) as HTMLElement

  // pictures: the copy's topics are in the same order as the drawing's
  const jobs: PictureJob[] = []
  const drawn = [...mind.nodes.querySelectorAll('me-tpc')]
  const copied = [...copy.querySelectorAll('me-tpc')]
  drawn.forEach((topic, index) => {
    const shown = topic.querySelector<HTMLImageElement>(':scope > .mm-picture > img')
    const img = copied[index]?.querySelector<HTMLImageElement>(':scope > .mm-picture > img')
    if (!shown || !img) return
    const entry = archivePictureEntry(imageOf(topic))
    // the size it has on screen, so the copy is laid out as the drawing is
    if (shown.offsetWidth > 0 && shown.offsetHeight > 0) {
      img.setAttribute('width', String(shown.offsetWidth))
      img.setAttribute('height', String(shown.offsetHeight))
    }
    if (entry !== null) jobs.push({ img, entry })
  })

  cleanCopy(copy)
  copy.querySelectorAll('img').forEach((img) => img.setAttribute('alt', ''))
  const pictures = new Map<HTMLImageElement, SnapshotPicture>()
  await Promise.all(
    jobs.map(async (job) => {
      const picture = await fillPicture(source, job)
      if (picture) pictures.set(job.img, picture)
    }),
  )

  const container = doc.createElement('div')
  container.className = 'map-container'
  for (const [name, value] of customProperties(mind.container.getAttribute('style'))) {
    container.style.setProperty(name, value)
  }
  for (const name of ['mmSkeleton', 'mmVariant', 'mmTheme', 'mmStructure'] as const) {
    const value = mind.container.dataset[name]
    if (value && /^[\w-]+$/.test(value)) container.dataset[name] = value
  }
  const canvas = doc.createElement('div')
  canvas.className = 'map-canvas'
  canvas.style.left = `${-box.left}px`
  canvas.style.top = `${-box.top}px`
  canvas.appendChild(copy)
  container.appendChild(canvas)

  const element = doc.createElement('div')
  element.className = `mm-card ${EXPORT_CLASS}`
  element.style.width = `${box.width}px`
  element.style.height = `${box.height}px`
  element.appendChild(container)

  const ground = container.style.getPropertyValue('--mm-ground').trim()
  return {
    element,
    width: box.width,
    height: box.height,
    ground: HEX_COLOR.test(ground) ? ground : '',
    pictures,
  }
}

/** Puts a picture of the file into the copy as a `data:` address, or leaves its place empty. */
async function fillPicture(
  source: SnapshotSource,
  { img, entry }: PictureJob,
): Promise<SnapshotPicture | null> {
  let bytes: Uint8Array | null
  try {
    bytes = await source.readEntry(entry)
  } catch {
    bytes = null
  }
  const type = bytes ? pictureType(bytes) : null
  if (!bytes || !type) return null
  img.setAttribute('src', `data:${type};base64,${base64Of(bytes)}`)
  return { bytes, type }
}

export function base64Of(bytes: Uint8Array): string {
  let text = ''
  const step = 0x8000
  for (let at = 0; at < bytes.length; at += step) {
    text += String.fromCharCode(...bytes.subarray(at, at + step))
  }
  return btoa(text)
}

/**
 * The part of the sheet that is drawn: the library's `me-nodes` (the topics
 * and the room the theme leaves around them), widened to take in a
 * relationship or a summary that reaches past it. In CSS pixels of the map at
 * its own size, whatever the zoom on screen. Null when the sheet is not laid
 * out.
 */
export function measureDrawing(mind: MindElixirInstance): DrawnBox | null {
  const nodes = mind.nodes
  const frame = nodes.getBoundingClientRect()
  if (!(nodes.offsetWidth > 0) || !(nodes.offsetHeight > 0) || !(frame.width > 0)) return null
  const scale = frame.width / nodes.offsetWidth
  let left = 0
  let top = 0
  let right = nodes.offsetWidth
  let bottom = nodes.offsetHeight
  for (const part of nodes.querySelectorAll(
    '.topiclinks path, .summary path, .label-container > *, .mm-boundaries path, .mm-boundaries text',
  )) {
    const rect = part.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    left = Math.min(left, (rect.left - frame.left) / scale - OVERFLOW_PAD)
    top = Math.min(top, (rect.top - frame.top) / scale - OVERFLOW_PAD)
    right = Math.max(right, (rect.right - frame.left) / scale + OVERFLOW_PAD)
    bottom = Math.max(bottom, (rect.bottom - frame.top) / scale + OVERFLOW_PAD)
  }
  left = Math.floor(left)
  top = Math.floor(top)
  return { left, top, width: Math.ceil(right) - left, height: Math.ceil(bottom) - top }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits until every picture of the drawing has its source and has loaded, or the wait is over. */
async function picturesSettled(mind: MindElixirInstance, waitMs: number): Promise<void> {
  const until = Date.now() + waitMs
  const loading = (): boolean =>
    [...mind.nodes.querySelectorAll<HTMLImageElement>('.mm-picture > img')].some(
      (img) => !img.getAttribute('src') || !img.complete,
    )
  let waited = false
  while (loading() && Date.now() < until) {
    waited = true
    await delay(30)
  }
  // a picture that took its size has its lines drawn again on the next turn
  if (waited) await delay(30)
}

/**
 * A sheet whose host is hidden is shown for as long as it is measured and
 * copied: in place, unseen, without taking a click. The returned function
 * hides it again. Everything between the two runs in one go, so the screen
 * never shows it and nothing else gets to change the host meanwhile.
 */
function showUnseen(host: HTMLElement): (() => void) | null {
  if (!host.hidden) return null
  const style = host.getAttribute('style')
  host.hidden = false
  host.style.position = 'absolute'
  host.style.inset = '0'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  return () => {
    host.hidden = true
    if (style === null) host.removeAttribute('style')
    else host.setAttribute('style', style)
  }
}

export interface SnapshotOptions {
  /** how long a picture still loading is waited for */
  pictureWaitMs?: number
}

/**
 * A still copy of a sheet as it is drawn. A sheet that is not on screen is
 * laid out unseen for the moment it takes, and its lines are drawn again from
 * what is measured then. Null when the sheet cannot be laid out.
 */
export async function snapshotSheet(
  source: SnapshotSource,
  options: SnapshotOptions = {},
): Promise<MapSnapshot | null> {
  const { mind } = source
  await picturesSettled(mind, options.pictureWaitMs ?? PICTURE_WAIT_MS)
  const host = mind.el
  const hide = showUnseen(host)
  let box: DrawnBox | null
  let copying: Promise<MapSnapshot>
  try {
    // lines drawn while the sheet was hidden could not be measured: drawn again now
    if (hide) mind.linkDiv()
    box = measureDrawing(mind)
    if (!box) return null
    // the copy is taken here, synchronously, before the sheet is hidden again
    copying = copyDrawing(source, box)
  } finally {
    hide?.()
  }
  return copying
}
