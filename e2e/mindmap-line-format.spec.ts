import { mkdirSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  createXmindDocumentFromSheets,
  openXmind,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import {
  closeAndSaveVideo,
  launchShell,
  screenshotPath,
  waitForPageWithUrl,
  type LaunchedApp,
} from './helpers'

/**
 * The line format of the mind map editor, driven in the shell with the mouse
 * and the keyboard as a person would: the line of a branch from the format
 * panel (the line into the topic and every line below it, mixed values, the
 * note of the tree layout), the two map-wide switches of the theme panel and
 * that they outlive another theme, a relationship's shape, ends, colour and a
 * dragged curve, a summary bracket, boundaries (made from the toolbar and the
 * topic menu, the refusals, selected by the outline, titled with Space and
 * F2, deleted with Delete and from their menu, let go by a press on empty
 * space), the format painter (once, held, Esc, another kind refused), Ctrl+Z
 * and the original bytes of a save after undo, the AI's line edits through a
 * scripted model, and a save opened again in the app.
 *
 * Every map is built here with the engine, and every saved file is read back
 * with it. Files and profiles go under E2E_SCRATCH_DIR (the system temp folder
 * when not set) and are removed at the end of each test.
 */

const SCRATCH = process.env.E2E_SCRATCH_DIR ?? tmpdir()

async function scratchDir(name: string): Promise<string> {
  mkdirSync(SCRATCH, { recursive: true })
  return mkdtemp(join(SCRATCH, `mindmap-lines-${name}-`))
}

// ---- maps ----

type Props = Record<string, string>

const t = (
  id: string,
  title: string,
  extra: Partial<XmindTopic> = {},
  attached: XmindTopic[] = [],
) =>
  ({
    id,
    title,
    ...extra,
    ...(attached.length
      ? { children: { ...((extra.children as object | undefined) ?? {}), attached } }
      : {}),
  }) as XmindTopic

const styled = (properties: Props) => ({ style: { id: crypto.randomUUID(), properties } })

const id = (n: number): string => `40000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

const ID = {
  sheet: id(0xff),
  root: id(1),
  a: id(2),
  a1: id(3),
  a2: id(4),
  a3: id(5),
  b: id(6),
  b1: id(7),
  b2: id(8),
  c: id(9),
  c1: id(10),
  d: id(11),
  d1: id(12),
  rel: id(20),
  rel2: id(21),
  sumRecord: id(30),
  sumTopic: id(31),
  sumRecord2: id(32),
  sumTopic2: id(33),
}

/** The curve and end points the first relationship has in the file before it is dragged. */
const FILE_CURVE = { '0': { x: 40, y: -60 }, '1': { x: -40, y: -60 } }
const FILE_END_POINTS = { '0': { x: 1, y: 1 }, '1': { x: 2, y: 2 } }

/** Three main branches with children, a relationship (with a curve in the file) and a summary. */
function linesSheet(): XmindSheet {
  return {
    id: ID.sheet,
    title: 'Lines',
    rootTopic: t(ID.root, 'Line format', {}, [
      t(
        ID.a,
        'Branch A',
        {
          summaries: [{ id: ID.sumRecord, range: '(0,1)', topicId: ID.sumTopic }],
          children: { summary: [t(ID.sumTopic, 'Sum')] },
        } as Partial<XmindTopic>,
        [t(ID.a1, 'A one'), t(ID.a2, 'A two')],
      ),
      t(ID.b, 'Branch B', {}, [t(ID.b1, 'B one'), t(ID.b2, 'B two')]),
      t(ID.c, 'Branch C', {}, [t(ID.c1, 'C one')]),
    ]),
    relationships: [
      {
        id: ID.rel,
        end1Id: ID.a1,
        end2Id: ID.c1,
        title: 'Link',
        controlPoints: FILE_CURVE,
        lineEndPoints: FILE_END_POINTS,
      },
    ],
  } as unknown as XmindSheet
}

/** Four main branches (two each side in the "both sides" layout), A with three children. */
function boundarySheet(): XmindSheet {
  return {
    id: ID.sheet,
    title: 'Boundaries',
    rootTopic: t(ID.root, 'Boundaries', {}, [
      t(ID.a, 'Branch A', {}, [t(ID.a1, 'A one'), t(ID.a2, 'A two'), t(ID.a3, 'A three')]),
      t(ID.b, 'Branch B', {}, [t(ID.b1, 'B one')]),
      t(ID.c, 'Branch C', {}, [t(ID.c1, 'C one')]),
      t(ID.d, 'Branch D', {}, [t(ID.d1, 'D one')]),
    ]),
  } as unknown as XmindSheet
}

/** The line A has (and A1 under it) in the file. */
const A_LINE: Props = {
  'line-class': 'org.xmind.branchConnection.straight',
  'line-width': '4pt',
  'line-color': '#00a0a0',
  'line-pattern': 'dash',
}

/** The format of the first relationship and of the first summary, in the file. */
const REL_STYLE: Props = {
  'shape-class': 'org.xmind.relationshipShape.straight',
  'arrow-begin-class': 'org.xmind.arrowShape.dot',
  'arrow-end-class': 'org.xmind.arrowShape.triangle',
  'line-color': '#cc0000',
}

/** Formats in the file to copy: a branch line, a relationship and a summary each with and without one. */
function painterSheet(): XmindSheet {
  return {
    id: ID.sheet,
    title: 'Painter',
    rootTopic: t(ID.root, 'Painter', {}, [
      t(ID.a, 'Branch A', styled(A_LINE) as Partial<XmindTopic>, [
        t(ID.a1, 'A one', styled(A_LINE) as Partial<XmindTopic>),
      ]),
      t(
        ID.b,
        'Branch B',
        {
          summaries: [
            {
              id: ID.sumRecord,
              range: '(0,0)',
              topicId: ID.sumTopic,
              ...styled({ 'shape-class': 'org.xmind.summaryShape.square' }),
            },
          ],
          children: { summary: [t(ID.sumTopic, 'Sum B')] },
        } as Partial<XmindTopic>,
        [t(ID.b1, 'B one')],
      ),
      t(
        ID.c,
        'Branch C',
        {
          summaries: [{ id: ID.sumRecord2, range: '(0,0)', topicId: ID.sumTopic2 }],
          children: { summary: [t(ID.sumTopic2, 'Sum C')] },
        } as Partial<XmindTopic>,
        [t(ID.c1, 'C one')],
      ),
      t(ID.d, 'Branch D', {}, [t(ID.d1, 'D one')]),
    ]),
    relationships: [
      { id: ID.rel, end1Id: ID.a1, end2Id: ID.b1, title: 'Styled', ...styled(REL_STYLE) },
      { id: ID.rel2, end1Id: ID.c1, end2Id: ID.d1, title: 'Plain' },
    ],
  } as unknown as XmindSheet
}

async function writeSheet(path: string, sheet: XmindSheet): Promise<void> {
  const document = await createXmindDocumentFromSheets([sheet])
  await writeFile(path, await document.save())
}

// ---- maps for looking at: every shape of the file drawn side by side ----

const vid = (sheet: number, n: number): string =>
  `5${sheet.toString(16).padStart(2, '0')}00000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

const COLOURS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#566573']

const branchLine = (shape: string, width: number, pattern: string, colour: string): Props => ({
  'line-class': `org.xmind.branchConnection.${shape}`,
  'line-width': `${width}pt`,
  'line-color': colour,
  'line-pattern': pattern,
})

/** One main branch per line case; its two children carry the same line (as the app writes it). */
const LINE_CASES: Array<{ title: string; line: Props }> = [
  ...['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve', 'none'].map((shape, at) => ({
    title: `${shape} 4`,
    line: branchLine(shape, 4, 'solid', COLOURS[at % COLOURS.length]!),
  })),
  { title: 'curve 1', line: branchLine('curve', 1, 'solid', '#333333') },
  { title: 'elbow 6', line: branchLine('elbow', 6, 'solid', '#884400') },
  ...['dash', 'dot', 'dash-dot', 'dash-dot-dot', 'round-dot'].map((pattern, at) => ({
    title: `${pattern} 3`,
    line: branchLine('curve', 3, pattern, COLOURS[(at + 2) % COLOURS.length]!),
  })),
]

function lookLinesSheet(formatted: boolean): XmindSheet {
  const s = formatted ? 1 : 2
  let n = 10
  const branches = LINE_CASES.map((entry) => {
    const extra = formatted ? (styled(entry.line) as Partial<XmindTopic>) : {}
    return t(vid(s, n++), entry.title, extra, [
      t(vid(s, n++), 'child one', extra),
      t(vid(s, n++), 'child two', extra),
    ])
  })
  return {
    id: vid(s, 1),
    title: formatted ? 'Look lines' : 'Look plain',
    rootTopic: t(vid(s, 2), formatted ? 'Every line' : 'No formats', {}, branches),
  } as unknown as XmindSheet
}

const SUMMARY_SHAPES = ['curly', 'angle', 'square', 'round', 'bracket', 'sharp', 'fold', 'straight']
const REL_CASES = [
  { shape: 'curved', begin: 'none', end: 'normal' },
  { shape: 'straight', begin: 'spearhead', end: 'triangle' },
  { shape: 'angled', begin: 'dot', end: 'square' },
  { shape: 'zigzag', begin: 'diamond', end: 'herringbone' },
]

function lookPartsSheet(): XmindSheet {
  let n = 10
  const kids: string[][] = []
  const branches = SUMMARY_SHAPES.map((shape) => {
    const own = vid(3, n++)
    const children = [vid(3, n++), vid(3, n++), vid(3, n++)]
    kids.push(children)
    const sumTopic = vid(3, n++)
    return t(
      own,
      `summary ${shape}`,
      {
        summaries: [
          {
            id: vid(3, n++),
            range: '(0,1)',
            topicId: sumTopic,
            ...styled({ 'shape-class': `org.xmind.summaryShape.${shape}` }),
          },
        ],
        children: { summary: [t(sumTopic, shape)] },
      } as Partial<XmindTopic>,
      children.map((child, at) => t(child, `${shape} ${at + 1}`)),
    )
  })
  const relationships = REL_CASES.map((entry, at) => ({
    id: vid(3, 500 + at),
    end1Id: kids[at * 2]![2]!,
    end2Id: kids[at * 2 + 1]![2]!,
    title: `${entry.shape} ${entry.begin}/${entry.end}`,
    ...styled({
      'shape-class': `org.xmind.relationshipShape.${entry.shape}`,
      'arrow-begin-class': `org.xmind.arrowShape.${entry.begin}`,
      'arrow-end-class': `org.xmind.arrowShape.${entry.end}`,
      'line-color': COLOURS[at]!,
      'line-width': `${at + 1}pt`,
    }),
  }))
  return {
    id: vid(3, 1),
    title: 'Look parts',
    rootTopic: t(vid(3, 2), 'Summaries and relationships', {}, branches),
    relationships,
  } as unknown as XmindSheet
}

const BOUNDARY_SHAPES = [
  'rect',
  'roundedRect',
  'scallops',
  'waves',
  'tension',
  'polygon',
  'roundedPolygon',
]

function lookBoundarySheet(): XmindSheet {
  let n = 10
  const branches = BOUNDARY_SHAPES.map((shape, at) => {
    const own = vid(4, n++)
    const children = [vid(4, n++), vid(4, n++), vid(4, n++)]
    // the first boundary has no values: the default look
    const look =
      at === 0
        ? {}
        : styled({
            'shape-class': `org.xmind.boundaryShape.${shape}`,
            'line-color': COLOURS[at % COLOURS.length]!,
            'line-width': `${(at % 3) + 1}pt`,
            'line-pattern': at % 2 ? 'dash' : 'solid',
            'svg:fill': at % 3 === 0 ? 'none' : '#fff3c4',
          })
    return t(
      own,
      `boundary ${shape}`,
      {
        boundaries: [{ id: vid(4, n++), range: '(0,1)', title: shape, ...look }],
      } as Partial<XmindTopic>,
      children.map((child, i) => t(child, `${shape} ${i + 1}`)),
    )
  })
  // a branch whose child is folded: the boundary wraps the visible box only
  const folded = t(vid(4, 300), 'Folded child', { branch: 'folded' } as Partial<XmindTopic>, [
    t(vid(4, 301), 'hidden one'),
    t(vid(4, 302), 'hidden two'),
  ])
  const holder = t(
    vid(4, 303),
    'Holder',
    {
      boundaries: [{ id: vid(4, 304), range: '(0,0)', title: 'around folded' }],
    } as Partial<XmindTopic>,
    [folded],
  )
  return {
    id: vid(4, 1),
    title: 'Look boundaries',
    rootTopic: t(
      vid(4, 2),
      'Boundaries',
      // over the first four main branches: on a map spread to both sides it is drawn per side
      {
        boundaries: [{ id: vid(4, 305), range: '(0,3)', title: 'across sides' }],
      } as Partial<XmindTopic>,
      [...branches, holder],
    ),
  } as unknown as XmindSheet
}

const ARROW_ENDS = [
  'normal',
  'spearhead',
  'triangle',
  'dot',
  'square',
  'diamond',
  'herringbone',
  'none',
]
const REL_SHAPES = ['curved', 'straight', 'angled', 'zigzag']

/**
 * The relationship ends of one kind (`at`: its place in ARROW_ENDS), half of
 * them (`half` 0: curved and straight, 1: angled and zigzag): four
 * relationships, each shape solid and dashed, at widths 1, none (1.5), 3 and 6
 * over the two halves, the same end at both of their ends. The map grows
 * downward, so each joins the child of one main branch to the child of the next.
 */
function endsSheet(at: number, half: 0 | 1): XmindSheet {
  const end = ARROW_ENDS[at]!
  const s = 0x10 + at * 2 + half
  const widths: Array<number | null> = [1, null, 3, 6]
  let n = 10
  const branches: XmindTopic[] = []
  const relationships: Array<Record<string, unknown>> = []
  for (const i of half === 0 ? [0, 1] : [2, 3]) {
    const shape = REL_SHAPES[i]!
    for (const pattern of ['solid', 'dash']) {
      const width = pattern === 'solid' ? widths[i]! : widths[3 - i]!
      const from = vid(s, n++)
      const to = vid(s, n++)
      const label = `${shape} w${width ?? '-'} ${pattern}`
      branches.push(t(vid(s, n++), label, {}, [t(from, 'from')]))
      branches.push(t(vid(s, n++), `${end} end`, {}, [t(to, 'to')]))
      relationships.push({
        id: vid(s, 900 + relationships.length),
        end1Id: from,
        end2Id: to,
        ...styled({
          'shape-class': `org.xmind.relationshipShape.${shape}`,
          'arrow-begin-class': `org.xmind.arrowShape.${end}`,
          'arrow-end-class': `org.xmind.arrowShape.${end}`,
          ...(width === null ? {} : { 'line-width': `${width}pt` }),
          // written even when solid: a relationship with no pattern is drawn dashed
          'line-pattern': pattern,
        }),
      })
    }
  }
  return {
    id: vid(s, 1),
    title: `Ends ${end} ${half + 1}`,
    rootTopic: t(
      vid(s, 2),
      `Ends: ${end}`,
      { structureClass: 'org.xmind.ui.org-chart.down' } as Partial<XmindTopic>,
      branches,
    ),
    relationships,
  } as unknown as XmindSheet
}

/** The arrowed curve of a branch at three widths and dashed, and a timeline's step arrows. */
function arrowedSheets(): XmindSheet[] {
  let n = 10
  const arrowed = [
    { width: 1, pattern: 'solid' },
    { width: 4, pattern: 'solid' },
    { width: 6, pattern: 'solid' },
    { width: 4, pattern: 'dash' },
  ].map(({ width, pattern }) => {
    const extra = styled(
      branchLine('arrowedCurve', width, pattern, '#2471a3'),
    ) as Partial<XmindTopic>
    return t(vid(9, n++), `arrowed ${width} ${pattern}`, extra, [
      t(vid(9, n++), 'one', extra),
      t(vid(9, n++), 'two', extra),
    ])
  })
  const steps = ['Plan', 'Build', 'Check', 'Ship'].map((title) =>
    t(vid(9, n++), title, {}, [t(vid(9, n++), `${title} detail`)]),
  )
  return [
    {
      id: vid(9, 1),
      title: 'Arrowed',
      rootTopic: t(
        vid(9, 2),
        'Arrowed curve',
        { structureClass: 'org.xmind.ui.logic.right' } as Partial<XmindTopic>,
        arrowed,
      ),
    },
    {
      id: vid(9, 3),
      title: 'Timeline',
      rootTopic: t(
        vid(9, 4),
        'Timeline',
        { structureClass: 'org.xmind.ui.timeline.horizontal' } as Partial<XmindTopic>,
        steps,
      ),
    },
  ] as unknown as XmindSheet[]
}

// ---- reading the saved file ----

interface SavedSheet {
  rootTopic: XmindTopic
  relationships?: Array<Record<string, unknown>>
  theme?: { map?: { properties?: Props } }
}

async function savedSheet(path: string): Promise<SavedSheet> {
  const opened = await openXmind(new Uint8Array(await readFile(path)))
  if (opened.status !== 'ok') throw new Error(`the saved file does not open: ${opened.status}`)
  return opened.document.sheets[0] as unknown as SavedSheet
}

function topicsById(sheet: SavedSheet): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>()
  const walk = (node: XmindTopic): void => {
    byId.set(node.id, node as unknown as Record<string, unknown>)
    for (const child of node.children?.attached ?? []) walk(child)
    for (const child of node.children?.summary ?? []) walk(child)
  }
  walk(sheet.rootTopic)
  return byId
}

const propsOf = (entry: Record<string, unknown> | undefined): Props =>
  ((entry?.style as { properties?: Props } | undefined)?.properties ?? {}) as Props

const lineOf = (entry: Record<string, unknown> | undefined): Props => {
  const props = propsOf(entry)
  return Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('line-')))
}

// ---- the map on the screen ----

const HOST = '.mm-sheet-host:not([hidden])'
const topic = (topicId: string): string => `${HOST} me-tpc[data-nodeid="me${topicId}"]`
const PANEL = '.mm-format-panel'
const LINE = `${PANEL} [data-format-section="line"]`
const REL_SECTION = `${PANEL} [data-format-section="relationship"]`
const BOUNDARY = `${HOST} g[data-mm-boundary]`
const relGroup = (relId: string): string => `${HOST} svg.topiclinks g[data-linkid="${relId}"]`
const relLine = (relId: string): string =>
  `${relGroup(relId)} > path:not([stroke="transparent"]):not(.mm-rel-end)`
const CONTAINER = `${HOST} .map-container`
/** what a press may land on that is an item of its own (as the editor tells them apart) */
const AN_ITEM = 'me-tpc, me-epd, .svg-label, .topiclinks, .summary, .linkcontroller'

interface DrawnLine {
  d: string
  stroke: string | null
  fill: string | null
  styleStroke: string
  width: string
  dash: string
}

/** The line from the centre into a main branch, and the lines inside it, as the page holds them. */
const branchLines = (map: Page, mainId: string) =>
  map.evaluate(
    ([host, wanted]) => {
      const read = (path: Element): DrawnLine => {
        const style = (path as SVGElement).style
        return {
          d: path.getAttribute('d') ?? '',
          stroke: path.getAttribute('stroke'),
          fill: path.getAttribute('fill'),
          styleStroke: style.stroke,
          width: style.strokeWidth,
          dash: style.strokeDasharray,
        }
      }
      const root = document.querySelector(host)!
      const wrappers = [...root.querySelectorAll('me-main > me-wrapper')]
      const at = wrappers.findIndex(
        (wrapper) =>
          wrapper.firstElementChild?.firstElementChild?.getAttribute('data-nodeid') ===
          `me${wanted}`,
      )
      if (at < 0) return null
      const mains = root.querySelector('svg.lines')?.children ?? []
      const main = mains[at]
      const inner = wrappers[at]!.lastElementChild
      const below = inner && inner.tagName.toLowerCase() === 'svg' ? [...inner.children] : []
      return { main: main ? read(main) : null, below: below.map(read) }
    },
    [HOST, mainId] as const,
  )

const mainLine = async (map: Page, mainId: string): Promise<DrawnLine> => {
  const lines = await branchLines(map, mainId)
  if (!lines?.main) throw new Error(`no line is drawn into ${mainId}`)
  return lines.main
}

/** A colour as the page computes it (`rgb(r, g, b)`), whatever form it is written in. */
const rgbOf = (map: Page, colour: string) =>
  map.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }, colour)

const isStraight = (d: string): boolean => d.length > 0 && !/[CcQqSsTtAa]/.test(d)

/**
 * A point on the outline of the boundary at `index` a press can reach: no item
 * of its own lies on top there (`under`), or the outline is the topmost
 * element itself (`top`, what a double click needs).
 */
const outlinePoint = (map: Page, index: number, mode: 'under' | 'top') =>
  map.evaluate(
    ([sel, items, how, at]) => {
      const path = document.querySelectorAll<SVGGeometryElement>(sel)[at]
      const matrix = path?.getScreenCTM()
      if (!path || !matrix) return null
      const own = path.closest('[data-mm-boundary]')
      const length = path.getTotalLength()
      for (let step = 0; step < 240; step++) {
        const p = path.getPointAtLength((length * step) / 240)
        const x = matrix.a * p.x + matrix.c * p.y + matrix.e
        const y = matrix.b * p.x + matrix.d * p.y + matrix.f
        const top = document.elementFromPoint(x, y)
        if (!top) continue
        if (how === 'top') {
          if (top.closest('[data-mm-boundary]') === own) return { x, y }
          continue
        }
        if (top.closest(items)) continue
        const stack = document.elementsFromPoint(x, y)
        const first = stack.find((el) => el.closest('[data-mm-boundary]'))
        if (first && first.closest('[data-mm-boundary]') === own) return { x, y }
      }
      return null
    },
    [`${BOUNDARY} .mm-boundary-shape`, AN_ITEM, mode, index] as const,
  )

/** A point of the map with nothing at all under it: no item and no boundary. */
const emptyPoint = (map: Page) =>
  map.evaluate(
    ([container, items]) => {
      const box = document.querySelector(container)?.getBoundingClientRect()
      if (!box) return null
      for (let row = 1; row < 12; row++) {
        for (let col = 1; col < 12; col++) {
          const x = box.left + (box.width * col) / 12
          const y = box.top + (box.height * row) / 12
          const stack = document.elementsFromPoint(x, y)
          if (!stack[0]?.closest(container)) continue
          if (stack.some((el) => el.closest(items) || el.closest('[data-mm-boundary]'))) continue
          return { x, y }
        }
      }
      return null
    },
    [CONTAINER, AN_ITEM] as const,
  )

/** The AI panel takes room from the map: closed for the pictures. */
async function closeAiPanel(map: Page): Promise<void> {
  if ((await map.locator('.ai-dock:not(.collapsed) .ai-panel-title').count()) > 0) {
    await map.locator('[data-action="ai"]').click()
    await map.waitForTimeout(400)
  }
}

/** A press on empty space: nothing stays selected. */
async function clearSelection(map: Page): Promise<void> {
  const at = await emptyPoint(map)
  if (!at) throw new Error('no empty space on the map')
  await map.mouse.click(at.x, at.y)
  await map.waitForTimeout(200)
}

const formatKind = (map: Page) =>
  map
    .locator(`${PANEL} .mm-theme-body`)
    .getAttribute('data-format-kind', { timeout: 2_000 })
    .catch(() => null)

async function openFormatPanel(map: Page): Promise<void> {
  if ((await map.locator(PANEL).count()) > 0) return
  await map.locator('[data-action="text-format"]').click()
  await map.waitForSelector(PANEL)
}

/** The "Line" side of the switch above a topic's format (the panel shows text or line, one at a time). */
async function showLineFormat(map: Page): Promise<void> {
  await map.locator(`${PANEL} [data-action="format-tab-line"]`).click()
  await map.waitForSelector(LINE)
}

async function pickFrom(map: Page, dropdown: string, value: string): Promise<void> {
  await map.locator(`${dropdown} .gs-dd-btn`).click()
  await map.locator(`${dropdown} .gs-dd-pop [data-value="${value}"]`).click()
  await map.waitForTimeout(250)
}

const statusText = (map: Page) => map.locator('.mm-save-status').textContent()

async function saveMap(map: Page): Promise<void> {
  await map.locator('[data-action="save"]').click()
  await expect(map.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'false', {
    timeout: 30_000,
  })
  await map.waitForTimeout(300)
}

/**
 * A point of a relationship or summary a press reaches: along its line, the
 * first place where the topmost element belongs to it (its line or its title),
 * not to something drawn over it. Null when nothing of it can be pressed.
 */
const reachablePoint = (map: Page, kind: 'relationship' | 'summary', partId: string) =>
  map.evaluate(
    ([host, which, wanted]) => {
      const groups = [
        ...document.querySelectorAll(
          which === 'relationship' ? `${host} svg.topiclinks g` : `${host} svg.summary g`,
        ),
      ]
      const owner = (el: Element | null): string | null => {
        if (!el) return null
        const label = el.closest<HTMLElement>('.svg-label')
        const group = label
          ? document.getElementById(label.dataset.svgId ?? '')
          : el.closest('.topiclinks, .summary')
            ? el.closest('g')
            : null
        const lib = group as
          (Element & { arrowObj?: { id?: string }; summaryObj?: { id?: string } }) | null
        return (which === 'relationship' ? lib?.arrowObj?.id : lib?.summaryObj?.id) ?? null
      }
      const group = groups.find((g) => {
        const lib = g as Element & { arrowObj?: { id?: string }; summaryObj?: { id?: string } }
        return (which === 'relationship' ? lib.arrowObj?.id : lib.summaryObj?.id) === wanted
      })
      if (!group) return null
      const paths = [...group.querySelectorAll<SVGGeometryElement>('path')].filter(
        (path) => !path.classList.contains('mm-rel-end') && path.getTotalLength() > 0,
      )
      for (const path of paths) {
        const matrix = path.getScreenCTM()
        if (!matrix) continue
        const length = path.getTotalLength()
        for (let step = 1; step < 40; step++) {
          const p = path.getPointAtLength((length * step) / 40)
          const x = matrix.a * p.x + matrix.c * p.y + matrix.e
          const y = matrix.b * p.x + matrix.d * p.y + matrix.f
          if (owner(document.elementFromPoint(x, y)) === wanted) return { x, y, covered: false }
        }
      }
      // nothing of it is on top anywhere: the middle of its first line
      const path = paths[0]
      const matrix = path?.getScreenCTM()
      if (!path || !matrix) return null
      const p = path.getPointAtLength(path.getTotalLength() / 2)
      return {
        x: matrix.a * p.x + matrix.c * p.y + matrix.e,
        y: matrix.b * p.x + matrix.d * p.y + matrix.f,
        covered: true,
      }
    },
    [HOST, kind, partId] as const,
  )

async function pressPart(
  map: Page,
  kind: 'relationship' | 'summary',
  partId: string,
): Promise<void> {
  const at = await reachablePoint(map, kind, partId)
  if (!at) throw new Error(`${kind} ${partId} is not drawn`)
  if (at.covered) {
    test.info().annotations.push({
      type: 'finding',
      description: `no point of ${kind} ${partId} lies on top: something else covers all of it`,
    })
  }
  await map.mouse.click(at.x, at.y)
  await map.waitForTimeout(300)
}

/** A click on a relationship's line (the editor selects it, or the painter puts a format on it). */
const clickRelationship = (map: Page, relId: string): Promise<void> =>
  pressPart(map, 'relationship', relId)

/** A click on a summary's bracket. */
const clickSummary = (map: Page, summaryTopicId: string): Promise<void> =>
  pressPart(map, 'summary', summaryTopicId)

const summaryPath = (map: Page, summaryTopicId: string) =>
  map.evaluate(
    ([host, wanted]) => {
      for (const group of document.querySelectorAll(`${host} svg.summary g`)) {
        const summary = (group as Element & { summaryObj?: { id?: string } }).summaryObj
        if (summary?.id === wanted) {
          return [...group.querySelectorAll('path')].map((p) => p.getAttribute('d')).join(' ')
        }
      }
      return null
    },
    [HOST, summaryTopicId] as const,
  )

const boundaryCount = (map: Page) => map.locator(BOUNDARY).count()

async function waitTitleBox(map: Page): Promise<boolean> {
  return map
    .waitForSelector('#input-box[data-type="boundary"]', { state: 'attached', timeout: 1_500 })
    .then(
      () => true,
      () => false,
    )
}

// ---- the app ----

interface OpenedMap {
  launched: LaunchedApp
  app: ElectronApplication
  shell: Page
  map: Page
}

interface ShellApis {
  aiOfficeTabs: {
    list(): Promise<Array<{ id: string; kind: string }>>
    close(id: string): Promise<void>
  }
  aiOffice: { openPath(path: string): Promise<void> }
}

async function openMapInShell(dir: string, path: string, video: string): Promise<OpenedMap> {
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: video,
    openFile: path,
    userDataDir: await mkdtemp(join(dir, 'profile-')),
  })
  const { app } = launched
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setContentSize(1600, 1000)
  })
  const shell = await waitForPageWithUrl(app, 'shell/out')
  const map = await waitForPageWithUrl(app, '://mindmap/')
  await map.waitForSelector(`${HOST} me-tpc`)
  await sharpen(map)
  await map.waitForTimeout(600)
  // autosave would write the file on its own; these tests save when they mean to
  const autosave = map.locator('.autosave-toggle')
  if ((await autosave.getAttribute('class'))?.includes(' on')) await autosave.click()
  return { launched, app, shell, map }
}

/** Closes the map's tab (clean, so without a question) and opens the file again. */
async function reopen(opened: OpenedMap, path: string): Promise<Page> {
  const { shell, app } = opened
  const tabs = (await shell.evaluate(() =>
    (window as unknown as ShellApis).aiOfficeTabs.list(),
  )) as Array<{ id: string; kind: string }>
  for (const tab of tabs.filter((entry) => entry.kind === 'mindmap')) {
    await shell.evaluate(
      (tabId) => (window as unknown as ShellApis).aiOfficeTabs.close(tabId),
      tab.id,
    )
  }
  await expect(shell.locator('.tab-bar .tab-item:not(.tab-home)')).toHaveCount(0)
  await shell.evaluate((file) => (window as unknown as ShellApis).aiOffice.openPath(file), path)
  await expect(shell.locator('.tab-bar .tab-item:not(.tab-home)')).toHaveCount(1)
  const deadline = Date.now() + 30_000
  for (;;) {
    for (const candidate of app.windows()) {
      const ready = await candidate
        .evaluate(
          ([host]) =>
            window.location.href.includes('://mindmap/') &&
            document.querySelectorAll(`${host} me-tpc`).length > 0,
          [HOST] as const,
        )
        .catch(() => false)
      if (ready) {
        await candidate.waitForTimeout(600)
        return candidate
      }
    }
    if (Date.now() > deadline) throw new Error('the map did not open again')
    await new Promise((done) => setTimeout(done, 250))
  }
}

const shot = (map: Page, name: string) => map.screenshot({ path: shotFile(name), scale: 'css' })

/** Where the visual evidence goes: E2E_SHOT_DIR, else the suite's screenshot folder. */
const shotFile = (name: string): string =>
  process.env.E2E_SHOT_DIR
    ? join(process.env.E2E_SHOT_DIR, `${name}.png`)
    : screenshotPath(`mindmap-lines-${name}`)

/** Renders the map page at twice its pixel density, so crops show joints sharply. */
async function sharpen(map: Page, factor = 2): Promise<void> {
  try {
    const cdp = await map.context().newCDPSession(map)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 0,
      height: 0,
      deviceScaleFactor: factor,
      mobile: false,
    })
    await map.waitForTimeout(300)
  } catch (error) {
    test.info().annotations.push({ type: 'note', description: `no 2x rendering: ${String(error)}` })
  }
}

/** A crop around the elements, padded, at the page's pixel density. */
async function crop(map: Page, selectors: string[], name: string, pad = 48): Promise<void> {
  const box = await map.evaluate(
    ([sels, margin]) => {
      const rects = sels
        .flatMap((sel) => [...document.querySelectorAll(sel)])
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0 || rect.height > 0)
      if (rects.length === 0) return null
      const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - margin)
      const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - margin)
      const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + margin)
      const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + margin)
      if (right <= left || bottom <= top) return null
      return { x: left, y: top, width: right - left, height: bottom - top }
    },
    [selectors, pad] as const,
  )
  if (!box) return
  await map.screenshot({ path: shotFile(name), clip: box, scale: 'device' })
}

function rgbToHex(rgb: string): string {
  const parts = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A scripted model in place of the shared AI channels: Claude reads `ready`,
 * Codex `not-installed`, and `ai:stream` answers the replies below in turn
 * (the last one repeats). No `claude` or `codex` program is started, and the
 * requests are kept for the test to read.
 */
async function scriptAi(app: ElectronApplication, script: unknown[][]): Promise<void> {
  await app.evaluate(({ ipcMain, webContents }, replies) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as {
      send: (channel: string, ...args: unknown[]) => void
    }
    const realSend = proto.send
    proto.send = function (this: unknown, channel: string, ...args: unknown[]) {
      if (channel === 'ai:subscription-changed') return
      return realSend.call(this, channel, ...args)
    }
    const statuses = {
      'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
      codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
    }
    for (const channel of ['ai:subscription-statuses', 'ai:subscription-recheck']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => statuses)
    }
    const seen: unknown[] = []
    ;(globalThis as unknown as { __aiRequests: unknown[] }).__aiRequests = seen
    ipcMain.removeHandler('ai:stream')
    ipcMain.handle('ai:stream', (event, request: { requestId: string }) => {
      seen.push(request)
      const reply = replies[Math.min(seen.length - 1, replies.length - 1)]!
      setTimeout(() => {
        for (const chunk of reply as Array<Record<string, unknown>>) {
          realSend.call(event.sender, 'ai:stream-chunk', { requestId: request.requestId, ...chunk })
        }
      }, 300)
    })
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) realSend.call(wc, 'ai:subscription-changed', statuses)
    }
  }, script)
}

// ---- the tests ----

test.describe('mind map line format', () => {
  test('branch lines, the theme switches, a relationship and a summary; saved and opened again', async () => {
    test.setTimeout(300_000)
    const dir = await scratchDir('lines')
    const path = join(dir, 'lines.xmind')
    await writeSheet(path, linesSheet())
    const opened = await openMapInShell(dir, path, 'mindmap-lines-branch')
    const { map } = opened
    try {
      // ── the line of branch A from the format panel: the line into A and every line below it
      const before = (await branchLines(map, ID.a))!
      expect(before.main).not.toBeNull()
      expect(before.below).toHaveLength(2)
      await map.locator(topic(ID.a)).click()
      await openFormatPanel(map)
      expect(await formatKind(map)).toBe('topics')
      await showLineFormat(map)
      await expect(map.locator(LINE)).toBeVisible()
      await map.locator(`${LINE} [data-action="line-shape-straight"]`).click()
      await map.waitForTimeout(250)
      await pickFrom(map, `${LINE} .line-width`, '4')
      const swatch = map.locator(`${LINE} .gcp-standard-row .gcp-swatch`).first()
      const colour = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
      const hex = rgbToHex(colour)
      await swatch.click()
      await map.waitForTimeout(250)
      await pickFrom(map, `${LINE} .line-pattern`, 'dash')
      await shot(map, '01-branch-line')
      await crop(map, [topic(ID.root), topic(ID.a), topic(ID.a1), topic(ID.a2)], '01c-branch-a')

      const lined = (await branchLines(map, ID.a))!
      expect
        .soft(isStraight(lined.main!.d), `the line into A is straight (${lined.main!.d})`)
        .toBe(true)
      expect
        .soft(await rgbOf(map, lined.main!.stroke ?? ''), 'the line into A has the colour')
        .toBe(colour)
      expect.soft(lined.main!.width, 'the line into A is 4 wide').toBe('4px')
      expect.soft(lined.main!.dash, 'the line into A is dashed').not.toBe('')
      for (const line of lined.below) {
        expect.soft(isStraight(line.d), 'a line below A is straight').toBe(true)
        expect.soft(line.width, 'a line below A is 4 wide').toBe('4px')
        expect.soft(line.dash, 'a line below A is dashed').not.toBe('')
        expect.soft(line.styleStroke, 'a line below A has the colour').toBe(colour)
      }
      await expect
        .soft(map.locator(`${LINE} .line-width .gs-dd-btn`))
        .toHaveAttribute('data-value', '4')
      await expect
        .soft(map.locator(`${LINE} .line-pattern .gs-dd-btn`))
        .toHaveAttribute('data-value', 'dash')
      await expect
        .soft(map.locator(`${LINE} [data-action="line-shape-straight"]`))
        .toHaveAttribute('aria-pressed', 'true')

      // ── A and B together: the panel says "mixed"; one width goes on both as one step
      await map.locator(topic(ID.b)).click({ modifiers: ['Control'] })
      await map.waitForTimeout(250)
      expect(await map.locator(`${HOST} me-tpc.selected`).count()).toBe(2)
      await expect
        .soft(map.locator(`${LINE} .line-width .gs-dd-btn`))
        .toHaveAttribute('data-value', 'mixed')
      await expect.soft(map.locator(`${LINE} [data-format-state="mixed"]`).first()).toBeVisible()
      await shot(map, '02-mixed')
      await pickFrom(map, `${LINE} .line-width`, '2')
      expect.soft((await mainLine(map, ID.a)).width, 'A takes 2 with B').toBe('2px')
      expect.soft((await mainLine(map, ID.b)).width, 'B takes 2 with A').toBe('2px')
      expect
        .soft(
          (await branchLines(map, ID.b))!.below.every((line) => line.width === '2px'),
          'below B too',
        )
        .toBe(true)
      await map.keyboard.press('Control+z')
      await map.waitForTimeout(400)
      expect.soft((await mainLine(map, ID.a)).width, 'Ctrl+Z gives A its 4 back').toBe('4px')
      expect.soft((await mainLine(map, ID.b)).width, 'Ctrl+Z takes 2 off B').not.toBe('2px')

      // ── the theme panel: rainbow off, tapered on, and both outlive another theme
      const rainbowBefore = {
        b: (await mainLine(map, ID.b)).stroke,
        c: (await mainLine(map, ID.c)).stroke,
      }
      expect
        .soft(rainbowBefore.b, 'before: each main branch has its own colour')
        .not.toBe(rainbowBefore.c)
      await map.locator('[data-action="theme"]').click()
      const rainbow = map.locator('[data-action="theme-rainbow"]')
      const tapered = map.locator('[data-action="theme-tapered"]')
      await expect(rainbow).toBeVisible()
      await expect.soft(rainbow).toHaveAttribute('aria-checked', 'true')
      await expect.soft(tapered).toHaveAttribute('aria-checked', 'false')
      await rainbow.click()
      await map.waitForTimeout(250)
      await tapered.click()
      await map.waitForTimeout(400)
      await expect.soft(rainbow).toHaveAttribute('aria-checked', 'false')
      await expect.soft(tapered).toHaveAttribute('aria-checked', 'true')
      const switched = {
        b: await mainLine(map, ID.b),
        c: await mainLine(map, ID.c),
        a: await mainLine(map, ID.a),
      }
      expect.soft(switched.b.stroke, 'tapered: the line into B is a filled shape').toBe('none')
      expect.soft(switched.b.fill, 'rainbow off: B and C share one colour').toBe(switched.c.fill)
      expect.soft(switched.a.dash, 'A keeps its own dashed line').not.toBe('')
      await shot(map, '03-theme-switches')
      const otherTheme = map.locator('[data-theme-pick^="band:"]:not(.on)').first()
      await otherTheme.click()
      await map.waitForTimeout(500)
      await expect
        .soft(rainbow, 'rainbow stays off after another theme')
        .toHaveAttribute('aria-checked', 'false')
      await expect
        .soft(tapered, 'tapered stays on after another theme')
        .toHaveAttribute('aria-checked', 'true')
      const afterTheme = {
        b: await mainLine(map, ID.b),
        c: await mainLine(map, ID.c),
        a: await mainLine(map, ID.a),
      }
      expect.soft(afterTheme.b.stroke, 'still tapered after another theme').toBe('none')
      expect.soft(afterTheme.b.fill, 'still one colour after another theme').toBe(afterTheme.c.fill)
      expect.soft(afterTheme.a.width, "A's own line outlives the theme").toBe('4px')
      await shot(map, '04-other-theme')
      await crop(
        map,
        [topic(ID.root), topic(ID.a), topic(ID.b), topic(ID.c)],
        '04c-tapered-joints',
        24,
      )

      // ── the relationship: ends, colour, width, pattern, shapes and a dragged curve
      await openFormatPanel(map)
      await clickRelationship(map, ID.rel)
      expect(await formatKind(map), 'a click on the line selects the relationship').toBe(
        'relationship',
      )
      await map.locator(`${PANEL} [data-action="rel-begin-dot"]`).click()
      await map.waitForTimeout(200)
      await map.locator(`${PANEL} [data-action="rel-end-triangle"]`).click()
      await map.waitForTimeout(200)
      const relSwatch = map.locator(`${REL_SECTION} .gcp-standard-row .gcp-swatch`).nth(4)
      const relColour = await relSwatch.evaluate((el) => getComputedStyle(el).backgroundColor)
      await relSwatch.click()
      await map.waitForTimeout(200)
      await pickFrom(map, `${REL_SECTION} .rel-width`, '3')
      await pickFrom(map, `${REL_SECTION} .rel-pattern`, 'dot')
      expect
        .soft(await map.locator(`${relGroup(ID.rel)} .mm-rel-end[data-mm-end="begin"]`).count())
        .toBe(1)
      expect
        .soft(await map.locator(`${relGroup(ID.rel)} .mm-rel-end[data-mm-end="end"]`).count())
        .toBe(1)
      await map.locator(`${PANEL} [data-action="rel-shape-zigzag"]`).click()
      await map.waitForTimeout(300)
      const zigzag = (await map.locator(relLine(ID.rel)).first().getAttribute('d')) ?? ''
      expect.soft(isStraight(zigzag), `zigzag is drawn with straight pieces (${zigzag})`).toBe(true)
      expect
        .soft(
          await map.locator(`${HOST} me-nodes > .circle`).first().isVisible(),
          'zigzag has no handles',
        )
        .toBe(false)
      await shot(map, '05-relationship-zigzag')
      await map.locator(`${PANEL} [data-action="rel-shape-curved"]`).click()
      await map.waitForTimeout(300)
      const curved = (await map.locator(relLine(ID.rel)).first().getAttribute('d')) ?? ''
      expect.soft(curved, 'back to curved, the line is a curve').toMatch(/C/)
      const handle = map.locator(`${HOST} me-nodes > .circle`).first()
      const handleShown = await handle.isVisible()
      expect
        .soft(handleShown, 'curved again: the curve handles show without selecting the line again')
        .toBe(true)
      if (!handleShown) {
        // a person selects the relationship again to get the handles
        await map.locator(topic(ID.c)).click()
        await clickRelationship(map, ID.rel)
      }
      await expect(handle).toBeVisible()
      const grip = (await handle.boundingBox())!
      await map.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await map.mouse.down()
      await map.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2 + 50, {
        steps: 12,
      })
      await map.mouse.up()
      await map.waitForTimeout(400)
      const dragged = (await map.locator(relLine(ID.rel)).first().getAttribute('d')) ?? ''
      expect.soft(dragged, 'dragging the handle reshapes the curve').not.toBe(curved)
      await shot(map, '06-relationship-dragged')
      await crop(map, [relGroup(ID.rel), topic(ID.a1), topic(ID.c1)], '06c-relationship')

      // ── the summary bracket
      const bracketBefore = await summaryPath(map, ID.sumTopic)
      expect(bracketBefore).not.toBeNull()
      await clickSummary(map, ID.sumTopic)
      expect(await formatKind(map), 'a click on the summary selects it').toBe('summary')
      await map.locator(`${PANEL} [data-action="summary-shape-square"]`).click()
      await map.waitForTimeout(300)
      const bracketSquare = await summaryPath(map, ID.sumTopic)
      expect.soft(bracketSquare, 'the square bracket is drawn').not.toBe(bracketBefore)
      await shot(map, '07-summary')
      await crop(map, [`${HOST} svg.summary g`, topic(ID.a1), topic(ID.a2)], '07c-summary')

      // ── save, and read the file
      await saveMap(map)
      const saved = await savedSheet(path)
      const byId = topicsById(saved)
      const wanted = {
        'line-class': 'org.xmind.branchConnection.straight',
        'line-width': '4pt',
        'line-color': hex,
        'line-pattern': 'dash',
      }
      for (const topicId of [ID.a, ID.a1, ID.a2]) {
        expect.soft(lineOf(byId.get(topicId)), `the line of ${topicId} in the file`).toEqual(wanted)
      }
      for (const topicId of [ID.b, ID.b1, ID.c]) {
        expect.soft(lineOf(byId.get(topicId)), `no line values on ${topicId}`).toEqual({})
      }
      const themeMap = saved.theme?.map?.properties ?? {}
      expect.soft(themeMap['line-tapered'], 'the theme holds tapered').toBe('tapered')
      expect.soft(themeMap['multi-line-colors'], 'the theme holds the rainbow off').toBe('none')
      const rel = saved.relationships?.find((entry) => entry.id === ID.rel)
      const relProps = propsOf(rel)
      expect.soft(relProps['arrow-begin-class']).toBe('org.xmind.arrowShape.dot')
      expect.soft(relProps['arrow-end-class']).toBe('org.xmind.arrowShape.triangle')
      expect.soft(relProps['shape-class']).toBe('org.xmind.relationshipShape.curved')
      expect.soft(relProps['line-width']).toBe('3pt')
      expect.soft(relProps['line-pattern']).toBe('dot')
      expect.soft(relProps['line-color']).toBe(rgbToHex(relColour))
      expect.soft(rel?.controlPoints, 'the dragged curve is saved').toBeDefined()
      expect
        .soft(rel?.controlPoints, 'the dragged curve replaces the one of the file')
        .not.toEqual(FILE_CURVE)
      expect.soft(rel && 'lineEndPoints' in rel, 'the old end points are gone').toBe(false)
      const summary = (byId.get(ID.a)?.summaries as Array<Record<string, unknown>> | undefined)?.[0]
      expect
        .soft(propsOf(summary)['shape-class'], 'the bracket is on the summary record')
        .toBe('org.xmind.summaryShape.square')
      expect
        .soft(propsOf(byId.get(ID.sumTopic))['shape-class'], 'not on the summary topic')
        .toBeUndefined()

      // ── opened again: the formats are still drawn
      const again = await reopen(opened, path)
      const reLined = (await branchLines(again, ID.a))!
      expect
        .soft(isStraight(reLined.main!.d), 'opened again: the line into A is straight')
        .toBe(true)
      expect.soft(reLined.main!.dash, 'opened again: the line into A is dashed').not.toBe('')
      expect
        .soft(reLined.below.every((line) => line.width === '4px' && isStraight(line.d)))
        .toBe(true)
      expect.soft((await mainLine(again, ID.b)).stroke, 'opened again: tapered').toBe('none')
      expect
        .soft(
          await again.locator(`${relGroup(ID.rel)} .mm-rel-end`).count(),
          'opened again: both ends',
        )
        .toBe(2)
      expect
        .soft(await summaryPath(again, ID.sumTopic), 'opened again: the square bracket')
        .toBe(bracketSquare)
      await again.locator('[data-action="theme"]').click()
      await expect
        .soft(again.locator('[data-action="theme-rainbow"]'))
        .toHaveAttribute('aria-checked', 'false')
      await expect
        .soft(again.locator('[data-action="theme-tapered"]'))
        .toHaveAttribute('aria-checked', 'true')
      await shot(again, '08-opened-again')

      // ── the tree layout: colour, width and pattern stay; the shape cannot be picked
      await again.locator('.mm-layout-pick .gs-dd-btn').click()
      await again.locator('.mm-layout-pick .gs-dd-pop [data-value="tree"]').click()
      await again.waitForTimeout(600)
      await again.locator(topic(ID.a)).click()
      await openFormatPanel(again)
      await showLineFormat(again)
      const locked = again.locator(`${LINE} [data-format-state="locked"]`)
      await expect.soft(locked).toBeVisible()
      await expect.soft(again.locator(`${LINE} [data-action="line-shape-straight"]`)).toBeDisabled()
      await expect.soft(again.locator(`${LINE} .line-width .gs-dd-btn`)).toBeEnabled()
      await shot(again, '09-tree-layout')
      await saveMap(again)
      const tree = topicsById(await savedSheet(path))
      expect
        .soft(lineOf(tree.get(ID.a))['line-class'], 'the file keeps the shape in the tree layout')
        .toBe('org.xmind.branchConnection.straight')
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-branch')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('boundaries: make, refuse, select by the outline, title, delete, and let go', async () => {
    test.setTimeout(300_000)
    const dir = await scratchDir('boundary')
    const path = join(dir, 'boundaries.xmind')
    await writeSheet(path, boundarySheet())
    const opened = await openMapInShell(dir, path, 'mindmap-lines-boundary')
    const { map } = opened
    try {
      await openFormatPanel(map)

      // ── refusals: topics of different parents, the centre with another, both sides
      await map.locator(topic(ID.a1)).click()
      await map.locator(topic(ID.b1)).click({ modifiers: ['Control'] })
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(300)
      expect.soft(await boundaryCount(map), 'different parents: no boundary').toBe(0)
      expect
        .soft(await statusText(map))
        .toContain('Only topics under the same parent can share a boundary')
      await shot(map, '10-refused-parents')

      await map.locator(topic(ID.root)).click()
      await map.locator(topic(ID.a)).click({ modifiers: ['Control'] })
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(300)
      expect.soft(await boundaryCount(map), 'the centre with a branch: no boundary').toBe(0)
      expect
        .soft(await statusText(map))
        .toContain('Only topics under the same parent can share a boundary')

      const sides = await map.evaluate(
        ([host, ids]) =>
          Object.fromEntries(
            ids.map((topicId) => {
              const el = document.querySelector(`${host} me-tpc[data-nodeid="me${topicId}"]`)
              return [topicId, el?.closest('.lhs') ? 'lhs' : el?.closest('.rhs') ? 'rhs' : 'other']
            }),
          ),
        [HOST, [ID.a, ID.b, ID.c, ID.d]] as const,
      )
      const right = [ID.a, ID.b, ID.c, ID.d].find((topicId) => sides[topicId] === 'rhs')
      const left = [ID.a, ID.b, ID.c, ID.d].find((topicId) => sides[topicId] === 'lhs')
      expect(right && left, `the map spreads to both sides (${JSON.stringify(sides)})`).toBeTruthy()
      // a plain click on a topic of a selection of several: does it leave that topic alone selected?
      await map.locator(topic(ID.root)).click()
      await map.locator(topic(right!)).click({ modifiers: ['Control'] })
      await map.locator(topic(right!)).click()
      await map.waitForTimeout(200)
      const keptAfterPlainClick = await map.locator(`${HOST} me-tpc.selected`).count()
      test.info().annotations.push({
        type: 'probe',
        description: `after a plain click on one topic of two selected, ${keptAfterPlainClick} topic(s) are selected`,
      })
      await clearSelection(map)
      await map.locator(topic(right!)).click()
      await map.locator(topic(left!)).click({ modifiers: ['Control'] })
      expect(await map.locator(`${HOST} me-tpc.selected`).count(), 'one branch each side').toBe(2)
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(300)
      expect.soft(await boundaryCount(map), 'both sides: no boundary').toBe(0)
      expect
        .soft(await statusText(map))
        .toContain('Only topics on the same side can share a boundary')
      await shot(map, '11-refused-sides')

      // ── made from the toolbar around A1 and A3: A2 between them goes in too
      await map.locator(topic(ID.a1)).click()
      await map.locator(topic(ID.a3)).click({ modifiers: ['Control'] })
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(400)
      expect(await boundaryCount(map), 'the boundary is drawn').toBe(1)
      await expect.soft(map.locator(`${BOUNDARY}.selected`)).toHaveCount(1)
      expect.soft(await formatKind(map), 'the panel shows the boundary').toBe('boundary')
      expect
        .soft(await map.locator(`${HOST} me-tpc.selected`).count(), 'no topic stays selected')
        .toBe(0)

      // its title with Space, as a person would right after making it
      await map.keyboard.press('Space')
      let box = await waitTitleBox(map)
      expect.soft(box, 'Space on the new boundary opens its title box').toBe(true)
      if (!box) {
        const onTop = await outlinePoint(map, 0, 'top')
        if (onTop) await map.mouse.dblclick(onTop.x, onTop.y)
        box = await waitTitleBox(map)
      }
      expect(box, 'a title box opens one way or another').toBe(true)
      await map.keyboard.type('Group <b>one</b>')
      await map.keyboard.press('Enter')
      await map.waitForTimeout(300)
      const title = map.locator(`${BOUNDARY} .mm-boundary-title`)
      await expect.soft(title).toHaveText('Group <b>one</b>')
      expect
        .soft(await map.locator(`${BOUNDARY} b`).count(), 'the title is not read as HTML')
        .toBe(0)
      await shot(map, '12-boundary-title')
      await crop(map, [BOUNDARY], '12c-boundary')

      // shape and fill from the panel
      if ((await formatKind(map)) !== 'boundary') {
        expect.soft(false, 'after its title is typed the boundary is still selected').toBe(true)
        const at = await outlinePoint(map, 0, 'under')
        if (at) await map.mouse.click(at.x, at.y)
        await map.waitForTimeout(300)
      }
      const outlineBefore =
        (await map.locator(`${BOUNDARY} .mm-boundary-shape`).getAttribute('d')) ?? ''
      await map.locator(`${PANEL} [data-action="boundary-shape-scallops"]`).click()
      await map.waitForTimeout(300)
      expect
        .soft((await map.locator(`${BOUNDARY} .mm-boundary-shape`).getAttribute('d')) ?? '')
        .not.toBe(outlineBefore)
      await map.locator(`${PANEL} [data-action="boundary-fill-none"]`).click()
      await map.waitForTimeout(300)

      // ── a press on empty space lets it go
      const empty = await emptyPoint(map)
      expect(empty, 'there is empty space on the map').not.toBeNull()
      await map.mouse.click(empty!.x, empty!.y)
      await map.waitForTimeout(300)
      await expect.soft(map.locator(`${BOUNDARY}.selected`)).toHaveCount(0)

      // ── selected by a click on its outline, and only it
      await map.locator(topic(ID.c)).click()
      await map.waitForTimeout(200)
      const press = await outlinePoint(map, 0, 'under')
      expect(press, 'a point of the outline can be pressed').not.toBeNull()
      await map.mouse.click(press!.x, press!.y)
      await map.waitForTimeout(300)
      await expect.soft(map.locator(`${BOUNDARY}.selected`)).toHaveCount(1)
      expect.soft(await map.locator(`${HOST} me-tpc.selected`).count()).toBe(0)
      expect.soft(await formatKind(map)).toBe('boundary')
      await expect
        .soft(map.locator(`${PANEL} [data-action="boundary-shape-scallops"]`))
        .toHaveAttribute('aria-pressed', 'true')

      // F2 edits the title of the selected boundary
      await map.keyboard.press('F2')
      const f2 = await waitTitleBox(map)
      expect.soft(f2, 'F2 on the selected boundary opens its title box').toBe(true)
      if (f2) {
        await map.keyboard.press('Control+a')
        await map.keyboard.type('Group A')
        await map.keyboard.press('Enter')
        await map.waitForTimeout(300)
        await expect.soft(title).toHaveText('Group A')
      }
      await shot(map, '13-boundary-selected')

      // ── a boundary around B1 from the topic's menu, deleted with Delete and back with Ctrl+Z
      await map.locator(topic(ID.b1)).click({ button: 'right' })
      const menuEntry = map.locator(`${HOST} .context-menu .menu-list > li`, {
        hasText: 'Add boundary',
      })
      await expect(menuEntry).toBeVisible()
      await menuEntry.click()
      await map.waitForTimeout(400)
      expect(await boundaryCount(map), 'the topic menu made a second boundary').toBe(2)
      const bIndex = await map.evaluate(
        ([sel, wanted]) =>
          [...document.querySelectorAll(sel)].findIndex(
            (group) => !group.querySelector('.mm-boundary-title') || group.textContent !== wanted,
          ),
        [BOUNDARY, 'Group A'] as const,
      )
      await map.locator(topic(ID.c)).click()
      const bPress = await outlinePoint(map, bIndex, 'under')
      expect(bPress, 'the outline around B1 can be pressed').not.toBeNull()
      await map.mouse.click(bPress!.x, bPress!.y)
      await map.waitForTimeout(300)
      await expect.soft(map.locator(`${BOUNDARY}.selected`)).toHaveCount(1)
      await map.keyboard.press('Delete')
      await map.waitForTimeout(400)
      expect.soft(await boundaryCount(map), 'Delete removes the selected boundary').toBe(1)
      await expect.soft(map.locator(topic(ID.b1)), 'the topic it went round stays').toBeVisible()
      await map.keyboard.press('Control+z')
      await map.waitForTimeout(400)
      expect.soft(await boundaryCount(map), 'Ctrl+Z brings it back').toBe(2)

      // and its own menu removes it
      const menuAt = await outlinePoint(map, bIndex, 'under')
      if (menuAt) {
        await map.mouse.click(menuAt.x, menuAt.y, { button: 'right' })
        await map.locator('[data-action="boundary-remove"]').click()
        await map.waitForTimeout(400)
      }
      expect.soft(await boundaryCount(map), '"Remove boundary" removes it').toBe(1)

      // ── the centre alone: a boundary round the whole map, taken back with Ctrl+Z
      await map.locator(topic(ID.root)).click()
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(400)
      expect.soft(await boundaryCount(map), 'the centre takes a boundary round the map').toBe(2)
      await shot(map, '14-master-boundary')
      await map.keyboard.press('Control+z')
      await map.waitForTimeout(400)
      expect.soft(await boundaryCount(map)).toBe(1)

      // ── saved
      await saveMap(map)
      const byId = topicsById(await savedSheet(path))
      const aBoundaries = byId.get(ID.a)?.boundaries as Array<Record<string, unknown>> | undefined
      expect.soft(aBoundaries?.length).toBe(1)
      expect.soft(aBoundaries?.[0]?.range).toBe('(0,2)')
      expect.soft(aBoundaries?.[0]?.title).toBe('Group A')
      expect.soft(propsOf(aBoundaries?.[0])['shape-class']).toBe('org.xmind.boundaryShape.scallops')
      expect.soft(propsOf(aBoundaries?.[0])['svg:fill']).toBe('none')
      expect.soft((byId.get(ID.b)?.boundaries as unknown[] | undefined)?.length ?? 0).toBe(0)
      expect.soft((byId.get(ID.root)?.boundaries as unknown[] | undefined)?.length ?? 0).toBe(0)

      const again = await reopen(opened, path)
      await expect.soft(again.locator(`${BOUNDARY} .mm-boundary-title`)).toHaveText('Group A')
      await shot(again, '15-boundary-opened-again')
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-boundary')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('format painter once, held and Esc, another kind refused; undo gives the original bytes', async () => {
    test.setTimeout(300_000)
    const dir = await scratchDir('painter')
    const path = join(dir, 'painter.xmind')
    await writeSheet(path, painterSheet())
    const original = await readFile(path)
    const opened = await openMapInShell(dir, path, 'mindmap-lines-painter')
    const { map } = opened
    try {
      await openFormatPanel(map)

      // ── three changes of three kinds, each taken back with Ctrl+Z: the save is the file as it was
      const bWidth = (await mainLine(map, ID.b)).width
      await map.locator(topic(ID.b)).click()
      await showLineFormat(map)
      await pickFrom(map, `${LINE} .line-width`, '6')
      expect.soft((await mainLine(map, ID.b)).width).toBe('6px')
      await map.locator(topic(ID.c1)).click()
      await map.locator('[data-action="boundary"]').click()
      await map.waitForTimeout(400)
      expect.soft(await boundaryCount(map)).toBe(1)
      await clickRelationship(map, ID.rel2)
      await map.locator(`${PANEL} [data-action="rel-end-diamond"]`).click()
      await map.waitForTimeout(300)
      for (let step = 0; step < 3; step++) {
        await map.keyboard.press('Control+z')
        await map.waitForTimeout(400)
      }
      expect.soft((await mainLine(map, ID.b)).width, 'three Ctrl+Z: B is back').toBe(bWidth)
      expect.soft(await boundaryCount(map), 'three Ctrl+Z: no boundary').toBe(0)
      await saveMap(map)
      const afterUndo = await readFile(path)
      expect
        .soft(Buffer.compare(afterUndo, original), 'the save after undo is the original bytes')
        .toBe(0)

      // ── once: A's line goes onto B and its branch, then the painter lets go
      const painter = map.locator(`${PANEL} [data-action="format-painter"]`)
      await map.locator(topic(ID.a)).click()
      await painter.click()
      await expect.soft(map.locator(CONTAINER)).toHaveAttribute('data-mm-painter', 'topic')
      await expect.soft(painter).toHaveAttribute('aria-pressed', 'true')
      await expect.soft(painter).toHaveAttribute('data-painter', 'once')
      const cursor = await map.locator(CONTAINER).evaluate((el) => getComputedStyle(el).cursor)
      expect.soft(cursor, 'the cursor changes while the painter holds a format').not.toBe('auto')
      await map.locator(topic(ID.b)).click()
      await map.waitForTimeout(400)
      await expect.soft(map.locator(CONTAINER)).not.toHaveAttribute('data-mm-painter', /.+/)
      const aLine = await mainLine(map, ID.a)
      const painted = (await branchLines(map, ID.b))!
      expect.soft(isStraight(painted.main!.d), 'B: straight').toBe(true)
      expect.soft(painted.main!.width, 'B: 4 wide').toBe('4px')
      expect.soft(painted.main!.stroke, 'B: the colour of A').toBe(aLine.stroke)
      expect
        .soft(painted.below.every((line) => line.width === '4px' && line.dash !== ''))
        .toBe(true)
      await shot(map, '16-painter-once')
      await crop(map, [topic(ID.b), topic(ID.b1), topic(ID.root)], '16c-painted-b')

      // ── held: two presses on the button, two branches, then Esc
      await map.locator(topic(ID.a)).click()
      await painter.click()
      await painter.click()
      await expect.soft(painter).toHaveAttribute('data-painter', 'sticky')
      await map.locator(topic(ID.c)).click()
      await map.waitForTimeout(300)
      await map.locator(topic(ID.d)).click()
      await map.waitForTimeout(300)
      await expect.soft(map.locator(CONTAINER)).toHaveAttribute('data-mm-painter', 'topic')
      expect.soft((await mainLine(map, ID.c)).width).toBe('4px')
      expect.soft((await mainLine(map, ID.d)).width).toBe('4px')
      await map.keyboard.press('Escape')
      await map.waitForTimeout(300)
      await expect.soft(map.locator(CONTAINER)).not.toHaveAttribute('data-mm-painter', /.+/)
      await expect.soft(painter).toHaveAttribute('aria-pressed', 'false')
      await shot(map, '17-painter-held')

      // ── a topic's format pressed onto a relationship: refused and said
      await map.locator(topic(ID.a)).click()
      await painter.click()
      await clickRelationship(map, ID.rel2)
      expect.soft(await statusText(map)).toContain("A topic's format can only go onto topics")
      expect
        .soft(await map.locator(`${relGroup(ID.rel2)} .mm-rel-end[data-mm-end="begin"]`).count())
        .toBe(0)
      await shot(map, '18-painter-refused')
      await map.keyboard.press('Escape')
      await map.waitForTimeout(200)

      // ── a relationship's format onto the other one, then Ctrl+Z and Ctrl+Y
      await clickRelationship(map, ID.rel)
      expect(await formatKind(map)).toBe('relationship')
      await painter.click()
      await expect.soft(map.locator(CONTAINER)).toHaveAttribute('data-mm-painter', 'relationship')
      await clickRelationship(map, ID.rel2)
      expect
        .soft(
          await map.locator(`${relGroup(ID.rel2)} .mm-rel-end[data-mm-end="begin"]`).count(),
          'the dot end came over',
        )
        .toBe(1)
      expect
        .soft(isStraight((await map.locator(relLine(ID.rel2)).first().getAttribute('d')) ?? ''))
        .toBe(true)
      await map.keyboard.press('Control+z')
      await map.waitForTimeout(400)
      expect
        .soft(
          await map.locator(`${relGroup(ID.rel2)} .mm-rel-end[data-mm-end="begin"]`).count(),
          'Ctrl+Z: one step back',
        )
        .toBe(0)
      await map.keyboard.press('Control+y')
      await map.waitForTimeout(400)
      expect
        .soft(await map.locator(`${relGroup(ID.rel2)} .mm-rel-end[data-mm-end="begin"]`).count())
        .toBe(1)

      // ── a summary's bracket onto the other one
      await clickSummary(map, ID.sumTopic)
      expect(await formatKind(map)).toBe('summary')
      await painter.click()
      const bracketBefore = await summaryPath(map, ID.sumTopic2)
      await clickSummary(map, ID.sumTopic2)
      expect
        .soft(await summaryPath(map, ID.sumTopic2), 'the square bracket came over')
        .not.toBe(bracketBefore)
      await shot(map, '19-painter-kinds')

      // ── saved
      await saveMap(map)
      const saved = await savedSheet(path)
      const byId = topicsById(saved)
      for (const topicId of [ID.b, ID.b1, ID.c, ID.c1, ID.d, ID.d1]) {
        expect.soft(lineOf(byId.get(topicId)), `the painted line on ${topicId}`).toEqual(A_LINE)
      }
      const rel2 = saved.relationships?.find((entry) => entry.id === ID.rel2)
      expect
        .soft(propsOf(rel2), 'the relationship took every format key of the other')
        .toEqual(REL_STYLE)
      const sum2 = (byId.get(ID.c)?.summaries as Array<Record<string, unknown>> | undefined)?.[0]
      expect.soft(propsOf(sum2)['shape-class']).toBe('org.xmind.summaryShape.square')
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-painter')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the AI sets a line, a relationship and a bracket and adds a relationship (scripted model)', async () => {
    test.setTimeout(240_000)
    const dir = await scratchDir('ai')
    const path = join(dir, 'ai.xmind')
    await writeSheet(path, linesSheet())
    const opened = await openMapInShell(dir, path, 'mindmap-lines-ai')
    const { app, map } = opened
    try {
      await scriptAi(app, [
        [
          {
            type: 'tool-call',
            toolCall: {
              id: 'call-1',
              name: 'edit_map',
              input: {
                edits: [
                  {
                    op: 'set_line',
                    id: ID.b,
                    shape: 'straight',
                    width: 6,
                    color: '#ff0000',
                    pattern: 'dot',
                  },
                  { op: 'set_relationship_style', id: ID.rel, begin: 'dot', end: 'diamond' },
                  { op: 'add_relationship', fromId: ID.b1, toId: ID.c1, title: 'AI link' },
                  { op: 'set_summary_style', id: ID.sumTopic, shape: 'round' },
                  { op: 'set_line', id: ID.c, width: 99 },
                ],
              },
            },
          },
          { type: 'done' },
        ],
        [{ type: 'delta', text: 'Done.' }, { type: 'done' }],
      ])
      const button = map.locator('[data-action="ai"]')
      if (
        (await map.locator('.ai-dock.collapsed').count()) > 0 ||
        (await map.locator('.ai-dock').count()) === 0
      ) {
        await button.click()
      }
      await map.locator('.ai-input-box textarea').fill('Make branch B a red dotted line')
      await map.locator('.ai-send-btn').click()
      await expect(map.locator('.ai-msg-streaming')).toHaveCount(0, { timeout: 30_000 })
      await expect
        .poll(async () => (await mainLine(map, ID.b)).width, { timeout: 15_000 })
        .toBe('6px')
      const bLines = (await branchLines(map, ID.b))!
      expect.soft(isStraight(bLines.main!.d)).toBe(true)
      expect.soft(bLines.below.every((line) => line.width === '6px' && line.dash !== '')).toBe(true)
      expect
        .soft(
          await map.locator(`${HOST} svg.topiclinks g[data-linkid]`).count(),
          'a relationship was added',
        )
        .toBe(2)
      expect
        .soft(await map.locator(`${relGroup(ID.rel)} .mm-rel-end[data-mm-end="begin"]`).count())
        .toBe(1)
      expect
        .soft((await mainLine(map, ID.c)).width, 'the refused width did not go on')
        .not.toBe('99px')
      const requests = (await app.evaluate(
        () =>
          (globalThis as unknown as { __aiRequests: Array<{ messages: unknown }> }).__aiRequests,
      )) as Array<{ messages: unknown }>
      expect.soft(JSON.stringify(requests[1]?.messages ?? '')).toContain('4 of 5 edit(s) applied')
      await shot(map, '20-ai-edits')

      // the batch is one step
      await map.locator(topic(ID.a)).click()
      await map.keyboard.press('Control+z')
      await map.waitForTimeout(500)
      expect
        .soft((await mainLine(map, ID.b)).width, 'Ctrl+Z takes the AI batch back')
        .not.toBe('6px')
      expect.soft(await map.locator(`${HOST} svg.topiclinks g[data-linkid]`).count()).toBe(1)
      await map.keyboard.press('Control+y')
      await map.waitForTimeout(500)

      await saveMap(map)
      const saved = await savedSheet(path)
      const byId = topicsById(saved)
      expect.soft(lineOf(byId.get(ID.b1))).toEqual({
        'line-class': 'org.xmind.branchConnection.straight',
        'line-width': '6pt',
        'line-color': '#ff0000',
        'line-pattern': 'dot',
      })
      expect.soft(saved.relationships?.length).toBe(2)
      const summary = (byId.get(ID.a)?.summaries as Array<Record<string, unknown>> | undefined)?.[0]
      expect.soft(propsOf(summary)['shape-class']).toBe('org.xmind.summaryShape.round')
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-ai')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('every shape drawn side by side, in several themes and layouts (pictures to look at)', async () => {
    test.setTimeout(480_000)
    const dir = await scratchDir('look')
    const path = join(dir, 'look.xmind')
    const document = await createXmindDocumentFromSheets([
      lookLinesSheet(true),
      lookLinesSheet(false),
      lookPartsSheet(),
      lookBoundarySheet(),
    ])
    await writeFile(path, await document.save())
    const opened = await openMapInShell(dir, path, 'mindmap-lines-look')
    const { map } = opened
    await closeAiPanel(map)
    const fit = async (): Promise<void> => {
      await map.locator('[data-action="zoom-fit"]').click()
      await map.waitForTimeout(500)
    }
    const sheet = async (title: string): Promise<void> => {
      await map.locator('.mm-sheet .mm-sheet-name', { hasText: title }).click()
      await map.waitForTimeout(800)
      await fit()
    }
    const layout = async (value: string): Promise<void> => {
      await map.locator('.mm-layout-pick .gs-dd-btn').click()
      await map.locator(`.mm-layout-pick .gs-dd-pop [data-value="${value}"]`).click()
      await map.waitForTimeout(600)
      await fit()
    }
    const openTheme = async (): Promise<void> => {
      if ((await map.locator('[data-action="theme-tapered"]').count()) === 0) {
        await map.locator('[data-action="theme"]').click()
      }
    }
    const closeTheme = async (): Promise<void> => {
      await map.locator('[data-action="theme-close"]').click()
      await map.waitForTimeout(300)
      await fit()
    }
    const theme = async (pick: string): Promise<void> => {
      await openTheme()
      await map.locator(`[data-theme-pick="${pick}"]`).click()
      await map.waitForTimeout(600)
      await closeTheme()
    }
    const mainIds = (): Promise<string[]> =>
      map.evaluate(
        ([host]) =>
          [...document.querySelectorAll(`${host} me-main > me-wrapper > me-parent > me-tpc`)].map(
            (el) => (el.getAttribute('data-nodeid') ?? '').slice(2),
          ),
        [HOST] as const,
      )
    /** each main branch with its children, one crop each */
    const cropBranches = async (prefix: string): Promise<void> => {
      const ids = await mainIds()
      for (const [at, mainId] of ids.entries()) {
        await crop(
          map,
          [
            `${HOST} me-tpc[data-nodeid="me${mainId}"]`,
            `${HOST} me-wrapper:has(> me-parent > me-tpc[data-nodeid="me${mainId}"]) me-tpc`,
          ],
          `${prefix}-${String(at).padStart(2, '0')}`,
          28,
        )
      }
    }
    try {
      // ── branch lines: default theme, both sides, and the same map with no formats
      await sheet('Look plain')
      await shot(map, 'v00-plain-both')
      await sheet('Look lines')
      await shot(map, 'v01-lines-both')
      await cropBranches('v01c-lines-both')
      await crop(map, [topic(vid(1, 2))], 'v01c-centre-joints', 90)
      // right side only, tapered on: the main lines leave the centre
      await layout('right')
      await openTheme()
      await map.locator('[data-action="theme-tapered"]').click()
      await map.waitForTimeout(400)
      await closeTheme()
      await shot(map, 'v02-lines-right-tapered')
      await crop(map, [topic(vid(1, 2))], 'v02c-tapered-centre', 120)
      await cropBranches('v02c-lines-right')
      // the underline skeleton: the line runs under the text
      await theme('skeleton:line')
      await shot(map, 'v03-lines-underline')
      await cropBranches('v03c-lines-underline')
      // the block skeleton
      await theme('skeleton:block')
      await shot(map, 'v04-lines-block')
      await cropBranches('v04c-lines-block')
      // the tree layout
      await layout('tree')
      await shot(map, 'v05-lines-tree')
      await cropBranches('v05c-lines-tree')

      // ── summaries and relationships
      await sheet('Look parts')
      await shot(map, 'v10-parts-both')
      for (const [at] of REL_CASES.entries()) {
        await crop(map, [relGroup(vid(3, 500 + at))], `v10c-rel-${at}`, 40)
      }
      const summaryGroups = await map.locator(`${HOST} svg.summary g`).count()
      for (let at = 0; at < summaryGroups; at++) {
        await crop(map, [`${HOST} svg.summary g:nth-of-type(${at + 1})`], `v10c-summary-${at}`, 60)
      }
      await theme('skeleton:block')
      await layout('right')
      await shot(map, 'v11-parts-block-right')

      // ── boundaries
      await sheet('Look boundaries')
      await shot(map, 'v20-boundaries-both')
      const groups = await map.locator(BOUNDARY).count()
      for (let at = 0; at < groups; at++) {
        await crop(map, [`${BOUNDARY}:nth-of-type(${at + 1})`], `v20c-boundary-${at}`, 24)
      }
      await theme('skeleton:line')
      await layout('right')
      await shot(map, 'v21-boundaries-underline-right')
      await layout('tree')
      await shot(map, 'v22-boundaries-tree')
      expect(groups, 'boundaries are drawn').toBeGreaterThan(0)
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-look')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('relationship ends, the arrowed curve and timeline steps up close (pictures to look at)', async () => {
    test.setTimeout(480_000)
    const dir = await scratchDir('ends')
    const path = join(dir, 'ends.xmind')
    const document = await createXmindDocumentFromSheets([
      ...ARROW_ENDS.flatMap((_, at) => [endsSheet(at, 0), endsSheet(at, 1)]),
      ...arrowedSheets(),
    ])
    await writeFile(path, await document.save())
    const opened = await openMapInShell(dir, path, 'mindmap-lines-ends')
    const { map } = opened
    await sharpen(map, 3)
    await closeAiPanel(map)
    const sheet = async (title: string): Promise<void> => {
      await map.locator('.mm-sheet .mm-sheet-name', { hasText: new RegExp(`^${title}$`) }).click()
      await map.waitForTimeout(800)
      await map.locator('[data-action="zoom-fit"]').click()
      await map.waitForTimeout(500)
    }
    try {
      for (const [at, end] of ARROW_ENDS.entries()) {
        for (const half of [0, 1] as const) {
          const s = 0x10 + at * 2 + half
          await sheet(`Ends ${end} ${half + 1}`)
          await shot(map, `e-${end}-${half + 1}`)
          const drawn = await map.locator(`${HOST} svg.topiclinks g[data-linkid]`).count()
          expect.soft(drawn, `four relationships with ${end} ends are drawn`).toBe(4)
          for (let i = 0; i < 4; i++) {
            const name = `e-${end}-${REL_SHAPES[half * 2 + (i >> 1)]}-${i % 2 ? 'dash' : 'solid'}`
            await crop(map, [relGroup(vid(s, 900 + i))], name, 20)
          }
          if (end !== 'none') {
            // what the page draws at the ends: one mark at each end of every relationship
            const marks = await map.locator(`${HOST} svg.topiclinks .mm-rel-end`).count()
            expect.soft(marks, `${end}: a mark at both ends of the four`).toBe(8)
          }
        }
      }
      await sheet('Arrowed')
      await shot(map, 'e-arrowed')
      await crop(map, [`${HOST} me-tpc`], 'e-arrowed-all', 16)
      await sheet('Timeline')
      await shot(map, 'e-timeline')
      await crop(map, [`${HOST} me-tpc`], 'e-timeline-all', 16)
    } finally {
      await closeAndSaveVideo(opened.launched, 'mindmap-lines-ends')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
