/**
 * What this editor adds to the topics the drawing library made: the colours
 * of each main branch, the markers, the picture and the topic's own style.
 *
 * The library is never given a node's `style`, `image` or `icons` (it would
 * put file values into styles and addresses into elements as they are; see
 * `convert.ts`). So these are drawn here, on the finished elements, from the
 * values in a node's `metadata`:
 *
 * - markers become glyphs of this app, looked up by id (`markers.ts`);
 * - a picture becomes an `<img>` only for an entry inside the archive, and a
 *   mark without any source for every other reference (`images.ts`);
 * - the style values of a topic reach its style only through the filter in
 *   `style-values.ts`: colours and numbers this module writes out itself.
 *
 * Nothing here uses `innerHTML`, and no text of the file is put into an
 * attribute or a style.
 *
 * `before` runs right before the library measures the topics to draw the
 * branch lines, so what is added is already part of what it measures. `after`
 * runs right after. It draws every line with the values `line-resolve.ts`
 * decides for it (colour, width, pattern, shape; the rainbow colour of a main
 * branch by its place in the map), and it draws every line again from the
 * exact boxes: the library measures in whole pixels, each line in the frame
 * of its own drawing, so a line and the underline it continues could end up
 * a pixel apart. Measured exactly, they meet.
 *
 * A line drawn as the theme draws it gets nothing of its own: the lines from
 * the centre keep the colour attribute they always had, the others the rules
 * of `map.css`. Only a value that differs goes onto the path, as a style: a
 * filtered colour of the file (or `--mm-strong`, the theme's line colour,
 * with the rainbow off), a width in pixels, the dashes of a pattern. A tree
 * and a timeline keep their own lines and take only those three.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'
import type { NodeObj } from 'mind-elixir'
import { mixColors, type ThemeLook, type ViewImage } from '@genoffice/xmind-engine'
import { boxWidth, type MapNodeMeta } from '../document/convert'
import {
  type BranchBoxes,
  type BranchGeometry,
  linePatternDash,
  mainBranchPath,
  subBranchPath,
  taperedBranchPath,
  timelineStepPath,
  treeBranchPath,
} from './branches'
import { archivePictureEntry, pictureBox, type PictureStore } from './images'
import {
  branchIndexOf,
  DEFAULT_LINE_SETTINGS,
  lineChainOf,
  type MapLineSettings,
  resolveBranchLine,
  type ResolvedBranchLine,
} from './line-resolve'
import {
  branchCount,
  branchGeometry,
  branchVars,
  lineHeightFor,
  readableOn,
  type SheetLook,
} from './look'
import { markerElement, markerGlyph } from './markers'
import {
  decorationValue,
  fontFamilyValue,
  isPlainStyle,
  NO_FILL,
  ownTopicStyle,
  splitAlpha,
} from './style-values'
import { drawnRuns, runElement, TITLE_RUN_CLASS } from './title-runs'

/** What assistive technology reads for the things drawn here. All of it comes from the app's dictionaries. */
export interface DecorationStrings {
  /** priority 1 to 9 */
  priority: readonly string[]
  /** progress from not started to done, nine steps */
  progress: readonly string[]
  flag: string
  star: string
  otherMarker: string
  /** a picture that is not loaded because it does not live in the file */
  pictureNotShown: string
}

type Level = 'central' | 'main' | 'sub'

/** A topic element with what this module remembers about it. */
interface DecoratedTopic extends Topic {
  mmMarkers?: HTMLElement
  mmMarkerIds?: string
  mmPicture?: HTMLElement
  mmPictureSrc?: string
  mmOwn?: string
  mmRuns?: string
}

const SVG = 'http://www.w3.org/2000/svg'
export const MARKERS_CLASS = 'mm-markers'
export const PICTURE_CLASS = 'mm-picture'
export const PICTURE_MISSING_CLASS = 'mm-picture-missing'

function metaOf(topic: Topic): Partial<MapNodeMeta> {
  const meta = (topic.nodeObj as { metadata?: unknown } | undefined)?.metadata
  return typeof meta === 'object' && meta !== null ? (meta as Partial<MapNodeMeta>) : {}
}

function levelOf(topic: Topic): Level {
  const parent = topic.nodeObj?.parent
  if (!parent) return 'central'
  return parent.parent ? 'sub' : 'main'
}

/** How deep a topic sits: 1 for the centre, 2 for a main branch, 3 for its children and so on. */
function depthOf(topic: Topic): number {
  let depth = 1
  for (let node = topic.nodeObj?.parent; node; node = node.parent) depth++
  return depth
}

export class TopicDecorator {
  readonly #mind: MindElixirInstance
  readonly #pictures: PictureStore
  /** called when a picture arrived or took its size: the lines have to be drawn again */
  readonly #onResize: () => void
  #look: ThemeLook
  #geometry: BranchGeometry
  #lineSettings: MapLineSettings
  #strings: DecorationStrings

  constructor(options: {
    mind: MindElixirInstance
    pictures: PictureStore
    look: SheetLook
    strings: DecorationStrings
    onResize(): void
  }) {
    this.#mind = options.mind
    this.#pictures = options.pictures
    this.#look = options.look
    this.#geometry = branchGeometry(options.look)
    this.#lineSettings = { ...(options.look.lineSettings ?? DEFAULT_LINE_SETTINGS) }
    this.#strings = options.strings
    this.#onResize = options.onResize
  }

  /**
   * Draws with another look. A look that carries the sheet's line settings
   * (`lookOfSheet`) brings them along; one made from a theme alone leaves the
   * settings as they were, since picking a theme keeps them.
   */
  setLook(look: SheetLook): void {
    this.#look = look
    this.#geometry = branchGeometry(look)
    if (look.lineSettings) this.#lineSettings = { ...look.lineSettings }
  }

  /** The map-wide line settings the lines are drawn with. */
  get lineSettings(): MapLineSettings {
    return { ...this.#lineSettings }
  }

  /** Switches the map-wide line settings; they take effect on the next drawing of the lines. */
  setLineSettings(settings: MapLineSettings): void {
    this.#lineSettings = { tapered: settings.tapered, rainbow: settings.rainbow }
  }

  /** The values the line into a topic is drawn with now, inherited ones included. */
  lineOf(node: NodeObj): ResolvedBranchLine {
    return resolveBranchLine(lineChainOf(node), {
      look: this.#look,
      rainbow: this.#lineSettings.rainbow,
      branchIndex: branchIndexOf(node),
    })
  }

  setStrings(strings: DecorationStrings): void {
    this.#strings = strings
    // the glyphs carry their names: they are made again on the next pass
    for (const topic of this.#topics()) delete topic.mmMarkerIds
  }

  /** Before the library measures: everything that takes room or sets a colour. */
  before(): void {
    const { container } = this.#mind
    const look = this.#look
    container.dataset.mmSkeleton = look.skeleton
    container.dataset.mmVariant = look.variant
    container.dataset.mmTheme = look.id

    const mains = this.#mind.nodeData.children ?? []
    const count = branchCount(look)
    for (const wrapper of this.#mainWrappers()) {
      const index = Math.max(0, mains.indexOf(mainTopicOf(wrapper)?.nodeObj as never))
      const key = `${look.id}#${index % count}`
      if (wrapper.dataset.mmBranch === key) continue
      wrapper.dataset.mmBranch = key
      for (const [name, value] of Object.entries(branchVars(look, index))) {
        wrapper.style.setProperty(name, value)
      }
    }
    for (const topic of this.#topics()) this.#decorate(topic)
  }

  /**
   * After the library drew the lines: every line is drawn with the values
   * decided for it, and, when the map is laid out, again from exact
   * measurements. `only` is the main branch the library just drew the lower
   * lines of, when it drew those of one branch alone.
   *
   * The paths are the library's own elements, in the order it made them: one
   * per main branch, and below each main branch one per topic, parent before
   * child. Any other number of paths below a main branch means the library
   * drew something this walk does not know: those paths stand as drawn.
   */
  after(only?: Element | null): void {
    const look = this.#look
    const geometry = this.#geometry
    const { tapered, rainbow } = this.#lineSettings
    const mains = this.#mind.nodeData.children ?? []
    const lines = this.#mind.lines.children
    const wrappers = this.#mainWrappers()
    // null when not laid out (hidden sheet, or no layout engine): the library's own paths stand
    const measured = this.#measured()
    // set by the controller when the map is drawn as a tree or a timeline
    const structure = this.#mind.container.dataset.mmStructure
    const structured = structure === 'tree' || structure === 'timeline'

    wrappers.forEach((wrapper, at) => {
      const topic = mainTopicOf(wrapper)
      if (!topic) return
      // the library writes the colour of its own palette here; the rules of `map.css` decide instead
      topic.style.borderColor = ''
      const index = Math.max(0, mains.indexOf(topic.nodeObj as never))
      const context = { look, rainbow, branchIndex: index }
      const resolve = (node: NodeObj): ResolvedBranchLine =>
        resolveBranchLine(lineChainOf(node), context)
      const direction = wrapper.parentElement?.className ?? ''

      const path = lines[at]
      if (path) {
        const line = resolve(topic.nodeObj)
        let filled = false
        if (measured) {
          const box = (from: DOMRect): BranchBoxes =>
            measured.boxes(from, measured.rect(topic), measured.frame, direction)
          let d: string
          if (structure === 'tree') {
            d = treeBranchPath(geometry, box(measured.centre), 'central')
          } else if (structure === 'timeline') {
            // each step leaves from the one before it, the first from the central topic
            const before = at > 0 ? mainTopicOf(wrappers[at - 1]!) : null
            const from = before ? measured.rect(before) : measured.centre
            d = timelineStepPath(geometry, box(from), !before)
          } else if (tapered && line.shape !== 'none' && line.pattern === 'solid') {
            // a filled outline cannot be dashed: a line with a pattern stays a line
            const shape = { shape: line.shape, width: line.width }
            d = taperedBranchPath(geometry, box(measured.centre), shape)
            filled = true
          } else {
            d = mainBranchPath(geometry, box(measured.centre), line)
          }
          path.setAttribute('d', d)
        }
        paintLine(path, line, { main: true, filled })
      }

      if (only && only !== wrapper) return
      const drawn = wrapper.lastElementChild
      if (!drawn || drawn.tagName.toLowerCase() !== 'svg') return
      const pieces = subLinesOf(wrapper)
      if (pieces.length !== drawn.children.length) return
      const origin = measured ? wrapper.getBoundingClientRect() : null
      pieces.forEach((piece, place) => {
        const path = drawn.children[place]!
        const line = piece.node ? resolve(piece.node) : null
        if (measured && origin) {
          const from = measured.rect(piece.from)
          const box = measured.boxes(
            from,
            measured.rect(piece.to),
            origin,
            direction,
            piece.isFirst,
          )
          // below the main topics, a timeline lists its topics as a tree does
          const d = structured
            ? treeBranchPath(geometry, box, piece.isFirst ? 'main' : 'sub')
            : subBranchPath(geometry, box, line ?? {})
          path.setAttribute('d', d)
        }
        if (line) paintLine(path, line, { main: false, filled: false })
      })
    })
  }

  /**
   * How the map is laid out, in fractions of a pixel: its frame, the central
   * topic's box, each element's box (measured once in a pass), and the boxes
   * of two elements inside a frame as the branch functions take them. Null
   * while nothing has a size.
   */
  #measured() {
    const { nodes, map } = this.#mind
    const frame = nodes.getBoundingClientRect()
    if (!(frame.width > 0) || !(nodes.offsetWidth > 0)) return null
    const scale = frame.width / nodes.offsetWidth
    const centre = map.querySelector('me-root')?.getBoundingClientRect()
    if (!centre) return null
    const rects = new Map<Element, DOMRect>()
    const rect = (element: Element): DOMRect => {
      let known = rects.get(element)
      if (!known) {
        known = element.getBoundingClientRect()
        rects.set(element, known)
      }
      return known
    }
    const boxes = (
      parent: DOMRect,
      child: DOMRect,
      origin: DOMRect,
      direction: string,
      isFirst?: boolean,
    ): BranchBoxes => ({
      pT: (parent.top - origin.top) / scale,
      pL: (parent.left - origin.left) / scale,
      pW: parent.width / scale,
      pH: parent.height / scale,
      cT: (child.top - origin.top) / scale,
      cL: (child.left - origin.left) / scale,
      cW: child.width / scale,
      cH: child.height / scale,
      direction,
      isFirst,
    })
    return { frame, centre, rect, boxes }
  }

  #mainWrappers(): HTMLElement[] {
    return [...this.#mind.map.querySelectorAll<HTMLElement>('me-main > me-wrapper')]
  }

  #topics(): DecoratedTopic[] {
    return [...this.#mind.map.querySelectorAll<DecoratedTopic>('me-tpc')]
  }

  #decorate(topic: DecoratedTopic): void {
    if (!topic.nodeObj) return
    this.#level(topic)
    const meta = metaOf(topic)
    this.#ownStyle(topic, meta)
    this.#titleRuns(topic, meta)
    this.#width(topic, meta)
    this.#markers(topic, meta)
    this.#picture(topic, meta)
  }

  // ---- the width of the box ----

  /** A box the user gave a width: that width, past the usual longest line, the text wrapping inside. */
  #width(topic: DecoratedTopic, meta: Partial<MapNodeMeta>): void {
    const width = boxWidth(meta.width)
    const { style } = topic
    const value = width === null ? '' : `${Math.round(width * 100) / 100}px`
    if (style.width === value) return
    style.width = value
    style.maxWidth = width === null ? '' : 'none'
    style.overflowWrap = width === null ? '' : 'anywhere'
  }

  // ---- the level ----

  /**
   * Marks a topic below the third level with how deep it sits, so `map.css`
   * can step its text down (`THEME_DEEP_LEVELS`). The file has three levels
   * only, so this is drawn and never written; deeper levels than the theme
   * has sizes for keep the last size.
   */
  #level(topic: DecoratedTopic): void {
    const depth = depthOf(topic)
    const level = depth > 3 ? String(Math.min(depth, 3 + this.#look.deepSizes.length)) : ''
    if (level === '') {
      if (topic.dataset.mmLevel !== undefined) delete topic.dataset.mmLevel
      return
    }
    if (topic.dataset.mmLevel !== level) topic.dataset.mmLevel = level
  }

  // ---- the topic's own style ----

  #ownStyle(topic: DecoratedTopic, meta: Partial<MapNodeMeta>): void {
    const own = ownTopicStyle(meta.style)
    const look = this.#look
    const key = isPlainStyle(own) ? '' : `${look.id}|${JSON.stringify(own)}`
    if ((topic.mmOwn ?? '') === key) return
    topic.mmOwn = key
    const { style } = topic
    const level = levelOf(topic)

    let background = ''
    let color: string = own.color ?? ''
    if (own.fill === NO_FILL) {
      background = 'transparent'
      // without its fill the topic stands on the ground, and is read against it
      if (!own.color) color = level === 'sub' ? look.text : look.strongText
    } else if (own.fill) {
      background = own.fill
      if (!own.color) {
        const { solid, alpha } = splitAlpha(own.fill)
        color = readableOn(look, mixColors(look.ground, solid, alpha))
      }
    }
    style.backgroundColor = background
    style.boxShadow = own.fill ? 'none' : ''
    style.color = color
    style.fontWeight = own.fontWeight === null ? '' : String(own.fontWeight)
    style.fontSize = own.fontSize === null ? '' : `${own.fontSize}px`
    style.lineHeight = own.fontSize === null ? '' : `${lineHeightFor(own.fontSize)}px`
    style.fontFamily = own.fontFamily === null ? '' : fontFamilyValue(own.fontFamily)
    style.fontStyle = own.italic === null ? '' : own.italic ? 'italic' : 'normal'
    style.textDecoration = own.decoration === null ? '' : decorationValue(own.decoration)
    style.textAlign = own.textAlign ?? ''
    style.textTransform = own.textTransform ?? ''
    if (key === '') delete topic.dataset.mmOwn
    else topic.dataset.mmOwn = 'true'
    // a fill of its own on a topic that is bare text in this skeleton still needs the shape of a box
    if (own.fill && own.fill !== NO_FILL) topic.dataset.mmOwnFill = 'true'
    else delete topic.dataset.mmOwnFill
  }

  // ---- the parts of the title ----

  /**
   * A title whose parts carry a format of their own is drawn as one span per
   * part: the part's text as `textContent`, its format through the filter. The
   * library draws the title as one text whenever it draws the topic, so the
   * spans are made again when they are not there. A title without parts is
   * left as the library drew it.
   */
  #titleRuns(topic: DecoratedTopic, meta: Partial<MapNodeMeta>): void {
    const text = (topic as Topic & { text?: HTMLElement }).text
    if (!text) return
    const title = typeof topic.nodeObj?.topic === 'string' ? topic.nodeObj.topic : ''
    const runs = drawnRuns(meta.titleRuns, title)
    const drawn = text.firstElementChild?.classList.contains(TITLE_RUN_CLASS) === true
    if (!runs) {
      if (drawn) text.textContent = title
      topic.mmRuns = undefined
      return
    }
    const key = JSON.stringify(runs)
    if (drawn && topic.mmRuns === key) return
    topic.mmRuns = key
    text.replaceChildren(...runs.map(runElement))
  }

  // ---- markers ----

  #markers(topic: DecoratedTopic, meta: Partial<MapNodeMeta>): void {
    const ids = Array.isArray(meta.markers)
      ? meta.markers.filter((id) => typeof id === 'string')
      : []
    const key = ids.join('\n')
    const drawn = topic.mmMarkers?.parentNode === topic ? topic.mmMarkers : null
    if (drawn && topic.mmMarkerIds === key) return
    drawn?.remove()
    topic.mmMarkers = undefined
    topic.mmMarkerIds = key
    if (ids.length === 0) return
    const doc = topic.ownerDocument
    const strip = doc.createElement('span')
    strip.className = MARKERS_CLASS
    for (const id of ids) strip.appendChild(markerElement(doc, id, this.#markerName(id)))
    // in front of the title, on its line
    topic.insertBefore(strip, topic.text?.parentNode === topic ? topic.text : topic.firstChild)
    topic.mmMarkers = strip
  }

  #markerName(id: string): string {
    const glyph = markerGlyph(id)
    const strings = this.#strings
    switch (glyph.family) {
      case 'priority':
        return strings.priority[glyph.level - 1] ?? strings.otherMarker
      case 'progress':
        return strings.progress[glyph.eighths] ?? strings.otherMarker
      case 'flag':
        return strings.flag
      case 'star':
        return strings.star
      case 'other':
        return strings.otherMarker
    }
  }

  // ---- the picture ----

  #picture(topic: DecoratedTopic, meta: Partial<MapNodeMeta>): void {
    const image = isViewImage(meta.image) ? meta.image : null
    const key = image ? image.src : ''
    const drawn = topic.mmPicture?.parentNode === topic ? topic.mmPicture : null
    if (drawn && topic.mmPictureSrc === key) return
    drawn?.remove()
    topic.mmPicture = undefined
    topic.mmPictureSrc = key
    if (!image) return
    const box = topic.ownerDocument.createElement('span')
    box.className = PICTURE_CLASS
    const entry = archivePictureEntry(image)
    if (entry === null) this.#missing(box)
    else this.#fromArchive(box, entry, image)
    // above the title
    topic.insertBefore(box, topic.firstChild)
    topic.mmPicture = box
  }

  /** A picture that lives in the file: an image element fed from the archive's bytes. */
  #fromArchive(box: HTMLElement, entry: string, image: ViewImage): void {
    const known = this.#pictures.peek(entry)
    if (known === null) {
      this.#missing(box)
      return
    }
    const img = box.ownerDocument.createElement('img')
    img.alt = ''
    img.draggable = false
    const size = pictureBox(image)
    if (size) {
      img.width = size.width
      img.height = size.height
    } else {
      // it takes its own size once it has loaded, and the lines move with it
      img.addEventListener('load', this.#onResize, { once: true })
    }
    img.addEventListener(
      'error',
      () => {
        this.#missing(box)
        this.#onResize()
      },
      { once: true },
    )
    box.appendChild(img)
    if (known !== undefined) {
      img.src = known
      return
    }
    void this.#pictures.load(entry).then((url) => {
      if (!box.isConnected) return
      if (url === null) {
        this.#missing(box)
        this.#onResize()
      } else {
        img.src = url
      }
    })
  }

  /** The mark for a picture that is not shown. It has no source, so nothing is ever asked for. */
  #missing(box: HTMLElement): void {
    const doc = box.ownerDocument
    box.replaceChildren()
    box.classList.add(PICTURE_MISSING_CLASS)
    box.setAttribute('role', 'img')
    box.setAttribute('aria-label', this.#strings.pictureNotShown)
    const svg = doc.createElementNS(SVG, 'svg')
    svg.setAttribute('viewBox', '0 0 20 20')
    svg.setAttribute('focusable', 'false')
    svg.setAttribute('aria-hidden', 'true')
    for (const [name, attributes] of [
      ['rect', { x: 3, y: 4.25, width: 14, height: 11.5, rx: 2 }],
      ['circle', { cx: 7.25, cy: 8.25, r: 1.25 }],
      ['path', { d: 'm3.5 13.5 3.5-3 2.75 2.25L13 9.5l3.5 3.5' }],
    ] as const) {
      const part = doc.createElementNS(SVG, name)
      for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, String(value))
      svg.appendChild(part)
    }
    box.appendChild(svg)
  }
}

/** One line below a main topic: the parent's and the child's row (`me-parent`), and the child's node. */
interface SubLine {
  from: Element
  to: Element
  node: NodeObj | null
  /** the parent is the main topic */
  isFirst: boolean
}

/** The lines the library draws below a main topic, in its order: parent before child, open branches only. */
function subLinesOf(wrapper: Element): SubLine[] {
  const pieces: SubLine[] = []
  const walk = (branch: Element, isFirst: boolean): void => {
    const parent = branch.firstElementChild
    const below = branch.children[1]
    if (!parent || !below || below.tagName !== 'ME-CHILDREN') return
    for (const child of below.children) {
      const to = child.firstElementChild
      if (!to) continue
      const topic = to.firstElementChild as Topic | null
      pieces.push({ from: parent, to, node: topic?.nodeObj ?? null, isFirst })
      // the library draws below a topic only while its fold handle says it is open
      if ((to.children[1] as { expanded?: boolean } | undefined)?.expanded) walk(child, false)
    }
  }
  walk(wrapper, true)
  return pieces
}

/**
 * Puts the values of one line on its path. What the theme draws anyway is
 * taken off, so a line drawn as the theme draws it carries nothing of its
 * own. A line from the centre takes its colour as an attribute, as it always
 * did (`stroke`, or `fill` when tapered); the others through a style, since
 * `map.css` colours them.
 */
function paintLine(
  path: Element,
  line: ResolvedBranchLine,
  how: { main: boolean; filled: boolean },
): void {
  const { style } = path as SVGElement
  if (how.main) {
    path.setAttribute('stroke', how.filled ? 'none' : line.color)
    path.setAttribute('fill', how.filled ? line.color : 'none')
  } else if (line.colorFrom === 'rainbow') {
    style.removeProperty('stroke')
  } else {
    // with the rainbow off and nothing written: the theme's line colour, the central topic's
    style.setProperty('stroke', line.colorFrom === 'theme' ? 'var(--mm-strong)' : line.color)
  }
  const width = how.filled || line.widthFrom === 'theme' ? null : `${line.width}px`
  const dash = how.filled ? null : linePatternDash(line.pattern, line.width)
  setOrRemove(style, 'stroke-width', width)
  setOrRemove(style, 'stroke-dasharray', dash?.dasharray ?? null)
  setOrRemove(style, 'stroke-linecap', dash?.linecap ?? null)
  if (style.length === 0) path.removeAttribute('style')
}

function setOrRemove(style: CSSStyleDeclaration, name: string, value: string | null): void {
  if (value === null) style.removeProperty(name)
  else style.setProperty(name, value)
}

function mainTopicOf(wrapper: Element): Topic | null {
  const topic = wrapper.firstElementChild?.firstElementChild
  return topic && topic.tagName === 'ME-TPC' ? (topic as Topic) : null
}

function isViewImage(value: unknown): value is ViewImage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { src?: unknown }).src === 'string' &&
    (value as { src: string }).src !== ''
  )
}
