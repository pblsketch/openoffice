/**
 * What an export is made of, with the real drawing library in jsdom: the
 * still copy of a sheet, the page for PDF and print, the SVG the picture is
 * drawn from, and the small rules around them (names, page fitting, picture
 * sizes, the preview picture of a save).
 *
 * The rules of 5.12 hold for every output: the file's text stays text, no
 * outside address is named, a style reaches the output only through the
 * filter, and only pictures from inside the file are carried, as `data:`.
 * The colours are the map's own: the output is the same with the app light or
 * dark, and names no token of the app's chrome.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { XmindDocument, XmindSheet } from '@genoffice/xmind-engine'
import { MapController, type MapHost } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import {
  cleanCopy,
  copyDrawing,
  type DrawnBox,
  type MapSnapshot,
} from '../src/renderer/export/snapshot'
import {
  exportStyles,
  PAGE_CSP,
  pageFit,
  pictureScale,
  snapshotPage,
  snapshotSvg,
  THUMBNAIL_BOX,
  thumbnailScale,
} from '../src/renderer/export/render'
import { containedSize, shrinkPixels } from '../src/renderer/export/resample'
import { documentName, sheetExportName } from '../src/renderer/export/names'
import { thumbnailFor } from '../src/renderer/export/use-map-export'
import {
  documentOf,
  documentWithEntries,
  FORMAT_IDS,
  lineFormatSheet,
  plainSheet,
  TINY_PNG,
  topic,
} from './helpers/fixtures'

const HERE = dirname(fileURLToPath(import.meta.url))
const RENDERER = resolve(HERE, '../src/renderer')
const TOKENS_CSS = resolve(HERE, '../../../packages/ui/src/tokens.css')

/** Every custom property the app's chrome defines: the shared tokens, and this editor's own. */
function chromeTokens(): Set<string> {
  const names = new Set<string>()
  for (const file of [TOKENS_CSS, join(RENDERER, 'styles.css')]) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
      names.add(match[1]!)
    }
  }
  return names
}

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function show(doc: XmindDocument) {
  const session = new DocumentSession(doc)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const host: MapHost = {
    confirmDelete: vi.fn(async () => true),
    openLink: vi.fn(),
    onRequest: vi.fn(),
    onStateChange: vi.fn(),
  }
  const key = session.tabs()[0]!.key
  const controller = new MapController({
    el,
    session,
    sheetKey: key,
    strings: mapStrings('en'),
    host,
  })
  mounted.push(controller)
  return { session, el, key, controller, mind: controller.mind }
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

// ---- a map that tries everything ----

const ID = {
  root: 'e0000000-0000-4000-8000-000000000001',
  title: 'e0000000-0000-4000-8000-000000000002',
  styled: 'e0000000-0000-4000-8000-000000000003',
  pictures: 'e0000000-0000-4000-8000-000000000004',
  inside: 'e0000000-0000-4000-8000-000000000005',
  svg: 'e0000000-0000-4000-8000-000000000006',
  web: 'e0000000-0000-4000-8000-000000000007',
  file: 'e0000000-0000-4000-8000-000000000008',
  folded: 'e0000000-0000-4000-8000-000000000009',
  under: 'e0000000-0000-4000-8000-00000000000a',
  line: 'e0000000-0000-4000-8000-00000000000b',
  rich: 'e0000000-0000-4000-8000-00000000000c',
}

/** The address every hostile value points at. It must appear nowhere in an output. */
const EVIL = 'evil.example'
const HOSTILE_TITLE = `<img src="https://${EVIL}/t.png" onerror="alert(1)"><script>alert(2)</script>`
const HOSTILE_LABEL = `<a href="https://${EVIL}/l">label</a>`
const HOSTILE_LINE = `<iframe src="https://${EVIL}/f"></iframe>`

const SVG_PICTURE = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    `<script>fetch("https://${EVIL}/from-script")</script>` +
    `<image href="https://${EVIL}/from-svg.png" width="5" height="5"/></svg>`,
)

function hostileSheet(): XmindSheet {
  return {
    id: 'e0000000-0000-4000-8000-0000000000ff',
    class: 'sheet',
    title: 'Hostile',
    rootTopic: topic(ID.root, 'Centre', {}, [
      topic(ID.title, HOSTILE_TITLE, { labels: [HOSTILE_LABEL] }),
      topic(ID.styled, 'Styled', {
        style: {
          id: 'e0000000-0000-4000-8000-0000000000fe',
          properties: {
            'svg:fill': `url(https://${EVIL}/fill.png)`,
            'fo:color': `red; background:url(https://${EVIL}/color.png)`,
            'fo:font-size': 'calc(100px)',
            'fo:font-weight': 'expression(alert(1))',
            'fo:font-family': `x"; background:url(https://${EVIL}/font.png)`,
            'fo:text-decoration': `url(https://${EVIL}/line.png)`,
            'fo:text-transform': 'expression(alert(1))',
          },
        },
      }),
      topic(ID.rich, `Bold ${HOSTILE_TITLE}`, {
        attributedTitle: [
          { text: 'Bold ', 'fo:font-weight': '700', 'fo:font-style': 'italic' },
          {
            text: HOSTILE_TITLE,
            'fo:color': `url(https://${EVIL}/run.png)`,
            'fo:font-family': `a"); background:url(https://${EVIL}/run-font.png`,
            'fo:text-decoration': 'line-through',
          },
        ],
      }),
      topic(ID.pictures, 'Pictures', {}, [
        topic(ID.inside, 'Inside', {
          image: { src: 'xap:resources/inside.png', width: 40, height: 30 },
        }),
        topic(ID.svg, 'SVG', { image: { src: 'xap:resources/drawing.svg' } }),
        topic(ID.web, 'Web', { image: { src: `https://${EVIL}/web.png`, width: 20, height: 20 } }),
        topic(ID.file, 'File', { image: { src: `file:///C:/${EVIL}/a.png` } }),
      ]),
      topic(ID.folded, 'Folded', { branch: 'folded' }, [topic(ID.under, 'Under the fold')]),
    ]),
    relationships: [{ id: ID.line, end1Id: ID.title, end2Id: ID.styled, title: HOSTILE_LINE }],
  }
}

const BOX: DrawnBox = { left: -10, top: -20, width: 640, height: 480 }

async function hostileSnapshot(): Promise<{ snapshot: MapSnapshot; el: HTMLElement }> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('')),
  )
  const doc = await documentWithEntries([hostileSheet()], {
    'resources/inside.png': TINY_PNG,
    'resources/drawing.svg': SVG_PICTURE,
  })
  const { mind, el } = show(doc)
  await settle()
  await settle()
  // chrome on the map at the moment of the export: a selection and an open edit box
  const topicEl = el.querySelector<HTMLElement>(`[data-nodeid="me${ID.styled}"]`)!
  mind.selectNode(topicEl as Parameters<typeof mind.selectNode>[0])
  const box = document.createElement('div')
  box.id = 'input-box'
  mind.nodes.appendChild(box)
  const snapshot = await copyDrawing({ mind, readEntry: (name) => doc.readEntry(name) }, BOX)
  box.remove()
  return { snapshot, el }
}

const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, 'text/html')

describe('the page and the picture of a map with hostile text, styles and pictures', () => {
  it('hold the text as text and make no element of it', async () => {
    const { snapshot } = await hostileSnapshot()
    const page = parseHtml(snapshotPage(snapshot))
    const svg = new DOMParser().parseFromString(snapshotSvg(snapshot, 2), 'image/svg+xml')
    expect(svg.querySelector('parsererror')).toBeNull()
    for (const doc of [page, svg]) {
      const texts = [...doc.querySelectorAll('me-tpc')].map((each) => each.textContent ?? '')
      expect(texts.some((text) => text.includes(HOSTILE_TITLE))).toBe(true)
      expect(texts.some((text) => text.includes(HOSTILE_LABEL))).toBe(true)
      expect(doc.querySelectorAll('script, iframe, a, object, embed, link, image').length).toBe(0)
      // the line's title is text in its label
      expect(doc.documentElement.textContent).toContain(HOSTILE_LINE)
    }
  })

  it('name no outside address, run nothing, and carry only pictures from inside the file, as data:', async () => {
    const { snapshot } = await hostileSnapshot()
    const html = snapshotPage(snapshot)
    const svgText = snapshotSvg(snapshot, 1)
    // the hostile address is in text only (titles, label, line) — never in an attribute or a style
    for (const output of [html, svgText]) {
      const doc =
        output === html
          ? parseHtml(output)
          : new DOMParser().parseFromString(output, 'image/svg+xml')
      for (const element of doc.querySelectorAll('*')) {
        for (const { name, value } of element.attributes) {
          expect(name, `${element.localName} ${name}`).not.toMatch(
            /^on|^href$|^xlink:href$|^srcset$/i,
          )
          expect(value, `${element.localName} ${name}`).not.toContain(EVIL)
          if (name === 'src') expect(value).toMatch(/^data:image\/(?:png|svg\+xml);base64,/)
          if (name === 'style') expect(value).not.toMatch(/url\(|expression|@import/i)
        }
      }
      for (const style of doc.querySelectorAll('style'))
        expect(style.textContent).not.toContain(EVIL)
    }
    const page = parseHtml(html)
    const sources = [...page.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '')
    expect(sources).toHaveLength(2)
    expect(sources.filter((src) => src.startsWith('data:image/png;base64,'))).toHaveLength(1)
    // an SVG picture is carried as an image, never as markup of the page
    expect(sources.filter((src) => src.startsWith('data:image/svg+xml;base64,'))).toHaveLength(1)
    expect(page.querySelectorAll('svg script, svg image').length).toBe(0)
    // the two pictures outside the file are the mark without a source, as on screen
    expect(page.querySelectorAll('.mm-picture-missing').length).toBe(2)
    expect(snapshot.pictures.size).toBe(2)
    // the page loads nothing on its own
    expect(
      page.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content'),
    ).toBe(PAGE_CSP)
    expect(PAGE_CSP).toMatch(/default-src 'none'/)
    expect(PAGE_CSP).toMatch(/script-src 'none'/)
    expect(PAGE_CSP).toMatch(/img-src data:;/)
  })

  it('a topic style reaches the output only through the filter', async () => {
    const { snapshot } = await hostileSnapshot()
    const page = parseHtml(snapshotPage(snapshot))
    const styled = page.querySelector<HTMLElement>(`[data-nodeid="me${ID.styled}"]`)!
    const style = styled.getAttribute('style') ?? ''
    expect(style).not.toMatch(/url|calc|expression|background|red/i)
  })

  it('parts of a title are spans of text, formatted only through the filter', async () => {
    const { snapshot } = await hostileSnapshot()
    const page = parseHtml(snapshotPage(snapshot))
    const rich = page.querySelector<HTMLElement>(`[data-nodeid="me${ID.rich}"]`)!
    const parts = [...rich.querySelectorAll<HTMLElement>('.mm-run')]
    expect(parts.map((part) => part.textContent)).toEqual(['Bold ', HOSTILE_TITLE])
    expect(parts.every((part) => part.children.length === 0)).toBe(true)
    expect(parts[0]!.style.fontWeight).toBe('700')
    expect(parts[0]!.style.fontStyle).toBe('italic')
    expect(parts[1]!.style.textDecoration).toContain('line-through')
    for (const part of parts) {
      expect(part.getAttribute('style') ?? '').not.toMatch(/url|expression|background|evil/i)
      expect(part.style.fontFamily).toBe('')
      expect(part.style.color).toBe('')
    }
  })

  it('leave out what is only there for editing', async () => {
    const { snapshot, el } = await hostileSnapshot()
    // on screen: a selection, fold handles, an edit box
    expect(el.querySelectorAll('.selected').length).toBeGreaterThan(0)
    expect(el.querySelectorAll('me-epd').length).toBeGreaterThan(0)
    const page = parseHtml(snapshotPage(snapshot))
    expect(
      page.querySelectorAll('.selected, me-epd, #input-box, .circle, .linkcontroller').length,
    ).toBe(0)
    // a folded branch is folded: the topic under it is not in the copy
    expect(page.querySelector(`[data-nodeid="me${ID.folded}"]`)).not.toBeNull()
    expect(page.querySelector(`[data-nodeid="me${ID.under}"]`)).toBeNull()
  })

  it('a copy is cut to the drawn box and carries the colours of the theme', async () => {
    const { snapshot } = await hostileSnapshot()
    expect(snapshot.width).toBe(640)
    expect(snapshot.height).toBe(480)
    const canvas = snapshot.element.querySelector<HTMLElement>('.map-canvas')!
    expect(canvas.style.left).toBe('10px')
    expect(canvas.style.top).toBe('20px')
    expect(snapshot.ground).toMatch(/^#[0-9a-f]{6}/i)
    const page = parseHtml(snapshotPage(snapshot))
    expect(page.querySelector('.mm-page')!.getAttribute('style')).toBe(
      `--mm-page: ${snapshot.ground}`,
    )
  })
})

describe('the colours of an export are the map’s own', () => {
  it('the page and the picture are the same with the app light and dark', async () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const light = await hostileSnapshot()
    const lightPage = snapshotPage(light.snapshot)
    const lightSvg = snapshotSvg(light.snapshot, 2)
    mounted.splice(0).forEach((controller) => controller.destroy())
    document.body.innerHTML = ''
    document.documentElement.setAttribute('data-theme', 'dark')
    const dark = await hostileSnapshot()
    expect(snapshotPage(dark.snapshot)).toBe(lightPage)
    expect(snapshotSvg(dark.snapshot, 2)).toBe(lightSvg)
  })

  it('no output and no code of the export names a token of the app’s chrome or reads the app’s theme', async () => {
    const tokens = chromeTokens()
    expect(tokens.has('--surface')).toBe(true)
    const { snapshot } = await hostileSnapshot()
    for (const output of [snapshotPage(snapshot), snapshotSvg(snapshot, 1), exportStyles()]) {
      for (const match of output.matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(tokens.has(match[1]!), match[1]).toBe(false)
      }
      expect(output).not.toMatch(/data-theme|prefers-color-scheme/)
    }
    const exportDir = join(RENDERER, 'export')
    for (const name of readdirSync(exportDir)) {
      const source = readFileSync(join(exportDir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const used of source.matchAll(/--[a-z][\w-]*/g)) {
        expect(tokens.has(used[0]), `${name} ${used[0]}`).toBe(false)
      }
      expect(source, name).not.toMatch(/data-theme|prefers-color-scheme|matchMedia/)
    }
  })
})

describe('cleaning a copy', () => {
  it('keeps the elements a map is drawn with and drops everything else, with what it holds', () => {
    const root = document.createElement('me-nodes')
    root.innerHTML =
      '<me-tpc class="selected" tabindex="0" contenteditable="true" onclick="x()" title="t">' +
      '<span class="text" style="color: red">kept</span>' +
      '<script>bad()</script><iframe src="https://x.example/"></iframe>' +
      '<a href="https://x.example/">gone</a><img src="blob:x" onerror="y()">' +
      '<span style="background: url(https://x.example/)">styled</span>' +
      '<svg><path d="M0 0" onload="z()"/><foreignObject><div>gone</div></foreignObject>' +
      '<image href="https://x.example/i.png"/><use href="#a"/></svg>' +
      '<!-- a comment --></me-tpc>'
    cleanCopy(root)
    expect(root.innerHTML).toBe(
      '<me-tpc><span class="text" style="color: red">kept</span><img>' +
        '<span>styled</span><svg><path d="M0 0"></path></svg></me-tpc>',
    )
  })

  it('keeps the mark of a level below the third, which the map stylesheet steps', () => {
    const root = document.createElement('me-nodes')
    root.innerHTML = '<me-tpc data-mm-level="4">t</me-tpc>'
    cleanCopy(root)
    expect(root.querySelector('me-tpc')!.getAttribute('data-mm-level')).toBe('4')
  })

  it('keeps the room a boundary takes in the layout, so the copy is laid out as the map is', () => {
    const root = document.createElement('me-nodes')
    root.innerHTML =
      '<me-main><me-wrapper data-mm-room="31 0 0 12" style="padding-top: 31px; padding-right: 12px">' +
      '<me-parent><me-tpc>t</me-tpc></me-parent></me-wrapper></me-main>'
    cleanCopy(root)
    const wrapper = root.querySelector<HTMLElement>('me-wrapper')!
    expect(wrapper.getAttribute('data-mm-room')).toBe('31 0 0 12')
    expect(wrapper.style.paddingTop).toBe('31px')
    expect(wrapper.style.paddingRight).toBe('12px')
  })

  it('keeps on a topic only the style properties the editor sets', () => {
    const root = document.createElement('me-nodes')
    root.innerHTML =
      '<me-tpc style="position: fixed; width: 240px; max-width: none; opacity: 0; border-color: red; ' +
      'color: #112233; background-color: #445566; font-size: 20px; font-weight: 700; ' +
      'line-height: 28px; box-shadow: none; font-style: italic; text-align: right; ' +
      "text-transform: uppercase; font-family: 'A', sans-serif\">t</me-tpc>"
    cleanCopy(root)
    const topic = root.querySelector<HTMLElement>('me-tpc')!
    const names = Array.from({ length: topic.style.length }, (_, at) => topic.style.item(at))
    expect(names.sort()).toEqual(
      [
        'background-color',
        'box-shadow',
        'color',
        'font-size',
        'font-weight',
        'line-height',
        // the width the user gave the box
        'width',
        'max-width',
        'font-style',
        'text-align',
        'text-transform',
        'font-family',
      ].sort(),
    )
    expect(topic.style.fontSize).toBe('20px')
    expect(topic.style.lineHeight).toBe('28px')
  })
})

describe('names', () => {
  it('the map is named by its file, else by its central topic, else untitled', () => {
    const base = { firstRootTitle: 'Trip', defaultRootTitle: 'Central Topic', untitled: 'Untitled' }
    expect(documentName({ ...base, path: 'C:\\maps\\Plan.xmind' })).toBe('Plan')
    expect(documentName({ ...base, path: '/maps/plan.v2.XMIND' })).toBe('plan.v2')
    expect(documentName({ ...base, path: null })).toBe('Trip')
    expect(documentName({ ...base, path: null, firstRootTitle: 'Central Topic' })).toBe('Untitled')
    expect(documentName({ ...base, path: null, firstRootTitle: '  \n ' })).toBe('Untitled')
  })

  it('a sheet adds its title when the map has more than one', () => {
    expect(sheetExportName('Plan', 'Day 1', 1)).toBe('Plan')
    expect(sheetExportName('Plan', 'Day 1', 2)).toBe('Plan - Day 1')
    expect(sheetExportName('Plan', ' ', 2)).toBe('Plan')
    expect(sheetExportName('Plan', 'Plan', 2)).toBe('Plan')
  })
})

describe('sizes', () => {
  const A4_ROOM = { width: (297 - 20) * (96 / 25.4), height: (209.5 - 20) * (96 / 25.4) }

  it('a map is fitted onto one landscape A4 page, a small one enlarged at most twice', () => {
    for (const [width, height] of [
      [4000, 1000],
      [800, 3000],
      [1200, 800],
    ] as const) {
      const fit = pageFit(width, height)
      expect(fit.width).toBeLessThanOrEqual(A4_ROOM.width)
      expect(fit.height).toBeLessThanOrEqual(A4_ROOM.height)
      expect(
        Math.abs(fit.width - A4_ROOM.width) < 1 || Math.abs(fit.height - A4_ROOM.height) < 1,
      ).toBe(true)
    }
    expect(pageFit(100, 50).scale).toBe(2)
  })

  it('a picture is drawn at twice its size unless the canvas would be too large', () => {
    expect(pictureScale(1000, 800)).toBe(2)
    expect(pictureScale(20_000, 500) * 20_000).toBeLessThanOrEqual(16_384)
    const scale = pictureScale(9000, 9000)
    expect(9000 * 9000 * scale * scale).toBeLessThanOrEqual(48_000_000 + 1)
  })

  it('the preview picture fits its box and is never enlarged', () => {
    expect(thumbnailScale(400, 300)).toBe(1)
    const scale = thumbnailScale(4000, 1000)
    expect(4000 * scale).toBeLessThanOrEqual(THUMBNAIL_BOX.width)
    expect(1000 * scale).toBeLessThanOrEqual(THUMBNAIL_BOX.height)
  })

  it('a picture made smaller is the alpha-weighted mean of what it covers', () => {
    // 2x1: opaque red, fully transparent blue → one pixel of red at half opacity
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0])
    expect([...shrinkPixels(pixels, 2, 1, 1, 1)]).toEqual([255, 0, 0, 128])
    // 3x3 into 2x2: fractional coverage keeps a flat colour flat
    const flat = new Uint8ClampedArray(3 * 3 * 4).map((_, at) => [10, 20, 30, 255][at % 4]!)
    expect([...shrinkPixels(flat, 3, 3, 2, 2)]).toEqual([
      10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255,
    ])
    expect(containedSize(320, 192, 160, 160)).toEqual({ width: 160, height: 96 })
    expect(containedSize(0, 0, 50, 40)).toEqual({ width: 50, height: 40 })
  })
})

describe('the preview picture of a save', () => {
  it('is not made for a save that changes nothing, nor for a first sheet that was never drawn', async () => {
    const doc = await documentOf(plainSheet(), plainSheet('Second'))
    const session = new DocumentSession(doc)
    expect(await thumbnailFor(session, new Map())).toBeNull()
    doc.sheets[0]!.title = 'Changed'
    session.renameSheet(session.tabs()[0]!.key, 'Changed')
    expect(doc.changed).toBe(true)
    expect(await thumbnailFor(session, new Map())).toBeNull()
    expect(await thumbnailFor(null, new Map())).toBeNull()
  })

  it('a first sheet that cannot be laid out gives none, in good time', async () => {
    const { session, key, controller } = show(await documentOf(plainSheet()))
    session.renameSheet(key, 'Changed')
    const started = Date.now()
    expect(await thumbnailFor(session, new Map([[key, controller]]), 500)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1500)
  })
})

// ---- relationships, summary brackets and boundaries ----

/** jsdom lays nothing out: each element a box of its own, so boundaries and shaped lines have a place. */
function layOut(): void {
  const boxes = new WeakMap<Element, DOMRect>()
  let next = 0
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.localName === 'me-nodes') return new DOMRect(0, 0, 100, 100)
    let box = boxes.get(this)
    if (!box) {
      next++
      box = new DOMRect(40 + next * 70, 20 + next * 45, 100, 30)
      boxes.set(this, box)
    }
    return box
  })
}

/** The line format sheet with a hostile value in every place a value of the format can be. */
function hostileFormatSheet(): XmindSheet {
  const sheet = lineFormatSheet()
  const evil = `url(https://${EVIL}/x.png)`
  const lines = sheet.relationships as Record<string, unknown>[]
  lines.push({
    id: 'e1000000-0000-4000-8000-000000000001',
    end1Id: FORMAT_IDS.rightA,
    end2Id: FORMAT_IDS.rightB,
    title: HOSTILE_LINE,
    style: {
      id: 'e1000000-0000-4000-8000-000000000002',
      properties: {
        'shape-class': 'javascript:alert(1)',
        'arrow-begin-class': `org.xmind.arrowShape.${HOSTILE_TITLE}`,
        'arrow-end-class': evil,
        'line-color': `#fff; background:${evil}`,
        'line-width': 'expression(alert(1))',
        'line-pattern': evil,
      },
    },
  })
  const right = sheet.rootTopic.children!.attached![0]!
  ;(right.summaries as Record<string, unknown>[])[0]!.style = {
    id: 'e1000000-0000-4000-8000-000000000003',
    properties: { 'shape-class': evil },
  }
  ;(right.boundaries as Record<string, unknown>[])[0] = {
    id: FORMAT_IDS.around,
    range: '(0,1)',
    title: HOSTILE_TITLE,
    style: {
      id: 'e1000000-0000-4000-8000-000000000004',
      properties: {
        'shape-class': evil,
        'line-color': evil,
        'line-width': `3pt; background:${evil}`,
        'line-pattern': 'expression(alert(1))',
        'svg:fill': evil,
      },
    },
  }
  return sheet
}

async function formatSnapshot(sheet: XmindSheet): Promise<MapSnapshot> {
  layOut()
  const doc = await documentOf(sheet)
  const { mind } = show(doc)
  await settle()
  // a selected relationship: its glow is editing only
  mind.selectArrow(mind.arrowSvg.querySelector('g') as never)
  return copyDrawing({ mind, readEntry: (name) => doc.readEntry(name) }, BOX)
}

describe('an export draws relationships, brackets and boundaries as the screen does', () => {
  it('the shaped lines, the ends, the brackets and the boundaries are in the page and the picture', async () => {
    const snapshot = await formatSnapshot(lineFormatSheet())
    const page = parseHtml(snapshotPage(snapshot))
    const svg = new DOMParser().parseFromString(snapshotSvg(snapshot, 1), 'image/svg+xml')
    expect(svg.querySelector('parsererror')).toBeNull()
    for (const doc of [page, svg]) {
      expect(doc.querySelectorAll('.mm-boundaries g[data-mm-boundary]').length).toBe(4)
      expect(doc.querySelectorAll('.topiclinks .mm-rel-end').length).toBeGreaterThanOrEqual(3)
      expect(doc.querySelector('.summary g[data-mm-shape="curly"]')).not.toBeNull()
      const styled = [...doc.querySelectorAll('.topiclinks > g')].find(
        (group) => group.getAttribute('data-linkid') === FORMAT_IDS.styledLine,
      )!
      expect(styled.hasAttribute('data-mm-color')).toBe(true)
      expect(doc.querySelector('.mm-boundaries path[stroke-dasharray="8 4"]')).not.toBeNull()
      expect(doc.querySelector('.mm-boundaries path[fill="#eeddcc"]')).not.toBeNull()
      // a title's chip is kept; the rim a selected boundary shows has no colour, so it draws nothing
      expect(doc.querySelectorAll('.mm-boundaries .mm-boundary-chip').length).toBeGreaterThan(0)
      for (const ring of doc.querySelectorAll('.mm-boundaries .mm-boundary-ring')) {
        expect(ring.hasAttribute('stroke')).toBe(false)
      }
      // the dashes fitted to a relationship's line stay on it
      const line = styled.querySelector('path:not([stroke="transparent"]):not(.mm-rel-end)')!
      expect(line.getAttribute('style') ?? '').toMatch(/stroke-dasharray: none/)
      // the title is text
      const titles = [...doc.querySelectorAll('.mm-boundary-title')].map(
        (title) => title.textContent,
      )
      expect(titles).toContain('<b>around</b>')
      expect(doc.querySelectorAll('.mm-boundaries b, .arrow-highlight').length).toBe(0)
    }
  })

  it('the same with the app light and dark', async () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const light = await formatSnapshot(lineFormatSheet())
    const lightPage = snapshotPage(light)
    const lightSvg = snapshotSvg(light, 1)
    mounted.splice(0).forEach((controller) => controller.destroy())
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    document.documentElement.setAttribute('data-theme', 'dark')
    const dark = await formatSnapshot(lineFormatSheet())
    expect(snapshotPage(dark)).toBe(lightPage)
    expect(snapshotSvg(dark, 1)).toBe(lightSvg)
  })

  it('hostile values of the format make no element, name no address and leave no unfiltered style', async () => {
    const snapshot = await formatSnapshot(hostileFormatSheet())
    const html = snapshotPage(snapshot)
    const svgText = snapshotSvg(snapshot, 1)
    for (const output of [html, svgText]) {
      const doc =
        output === html
          ? parseHtml(output)
          : new DOMParser().parseFromString(output, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(doc.querySelectorAll('script, iframe, a, object, embed, image').length).toBe(0)
      for (const element of doc.querySelectorAll('*')) {
        for (const { name, value } of element.attributes) {
          expect(name, `${element.localName} ${name}`).not.toMatch(/^on|^href$|^xlink:href$/i)
          expect(value, `${element.localName} ${name}`).not.toContain(EVIL)
          expect(value, `${element.localName} ${name}`).not.toMatch(/url\(|expression|javascript:/i)
        }
      }
      // the boundary's title is its characters
      const titles = [...doc.querySelectorAll('.mm-boundary-title')].map(
        (title) => title.textContent,
      )
      expect(titles).toContain(HOSTILE_TITLE)
    }
  })
})

describe('cleaning the copy of a drawn line', () => {
  it('keeps of an inline style only the properties of a line, with values of a known form', () => {
    const root = document.createElement('me-nodes')
    root.innerHTML =
      '<svg class="lines"><path d="M0 0" style="stroke: #aabbcc; stroke-width: 3px; ' +
      'stroke-dasharray: 12 6; stroke-linecap: butt; position: fixed"></path>' +
      '<path d="M0 0" style="stroke: var(--mm-strong); fill: var(--surface)"></path>' +
      '<path d="M0 0" style="stroke: url(https://x.example/a); stroke-width: calc(1px + 2px)"></path>' +
      '<path d="M0 0" fill="url(#x)" stroke="#123456" stroke-dasharray="3 3"></path>' +
      '<g class="arrow-highlight"><path d="M0 0"></path></g></svg>'
    cleanCopy(root)
    const paths = [...root.querySelectorAll('path')]
    expect(paths).toHaveLength(4)
    // a browser writes a hex colour back as rgb()
    expect(paths[0]!.style.getPropertyValue('stroke')).toBe('rgb(170, 187, 204)')
    expect(paths[0]!.style.getPropertyValue('stroke-width')).toBe('3px')
    expect(paths[0]!.style.getPropertyValue('stroke-dasharray')).toBe('12 6')
    expect(paths[0]!.style.getPropertyValue('stroke-linecap')).toBe('butt')
    expect(paths[0]!.style.getPropertyValue('position')).toBe('')
    expect(paths[1]!.getAttribute('style')).toBe('stroke: var(--mm-strong);')
    expect(paths[2]!.hasAttribute('style')).toBe(false)
    expect(paths[3]!.hasAttribute('fill')).toBe(false)
    expect(paths[3]!.getAttribute('stroke')).toBe('#123456')
    expect(paths[3]!.getAttribute('stroke-dasharray')).toBe('3 3')
    expect(root.querySelector('.arrow-highlight')).toBeNull()
  })
})
