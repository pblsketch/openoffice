/**
 * Real-run check of the line format in the built standalone editor.
 *
 * Opens a map built here with the engine (two main branches with children, a
 * third one, a relationship, a summary) and, with the mouse and the keyboard
 * on the real screen: formats the line of a branch from the format panel,
 * switches the two map-wide line settings in the theme panel, gives the
 * relationship ends and a shape and drags its curve, puts a boundary around
 * two sibling topics from the toolbar (title, shape) and selects it again by
 * its outline, copies the branch's format onto another branch with the format
 * painter, undoes one step and redoes it, saves, and reads the saved file
 * with the engine.
 *
 * Not part of `npm test`: it needs a build and opens a window.
 *
 *   npm run build -w @genoffice/mindmap
 *   npx tsx apps/mindmap/tests/real-run/lines-run.ts
 *
 * Screenshots, the profile and the file it wrote go to MINDMAP_REAL_RUN_OUT (a
 * folder in the system temp directory when not set). A step the screen does
 * not let a person do is logged as a FINDING; the run then goes on the way a
 * person would get round it, and says so.
 */
import { _electron as electron, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createXmindDocumentFromSheets,
  openXmind,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = process.env.MINDMAP_REAL_RUN_OUT ?? mkdtempSync(join(tmpdir(), 'mindmap-lines-run-'))
mkdirSync(OUT, { recursive: true })

const ID = {
  sheet: '30000000-0000-4000-8000-0000000000ff',
  root: '30000000-0000-4000-8000-000000000001',
  a: '30000000-0000-4000-8000-000000000002',
  a1: '30000000-0000-4000-8000-000000000003',
  a2: '30000000-0000-4000-8000-000000000004',
  b: '30000000-0000-4000-8000-000000000005',
  b1: '30000000-0000-4000-8000-000000000006',
  b2: '30000000-0000-4000-8000-000000000007',
  c: '30000000-0000-4000-8000-000000000008',
  c1: '30000000-0000-4000-8000-000000000009',
  rel: '30000000-0000-4000-8000-00000000000a',
  summaryRecord: '30000000-0000-4000-8000-00000000000b',
  summaryTopic: '30000000-0000-4000-8000-00000000000c',
}

/** The curve and end points the relationship has in the file before it is dragged. */
const FILE_CURVE = { '0': { x: 40, y: -60 }, '1': { x: -40, y: -60 } }
const FILE_END_POINTS = { '0': { x: 1, y: 1 }, '1': { x: 2, y: 2 } }

const BOUNDARY_TITLE = '묶음 Group'

const findings: string[] = []

const failures: string[] = []

/** A check that fails is reported and the run goes on, so one run shows every step. */
function check(condition: unknown, what: string): void {
  if (!condition) {
    failures.push(what)
    console.log(`  CHECK FAILED: ${what}`)
    return
  }
  console.log(`  ok  ${what}`)
}

function finding(what: string): void {
  findings.push(what)
  console.log(`  FINDING  ${what}`)
}

function sheet(): XmindSheet {
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
  return {
    id: ID.sheet,
    title: '선',
    rootTopic: t(ID.root, '선 서식', {}, [
      t(
        ID.a,
        '가지 A',
        {
          summaries: [{ id: ID.summaryRecord, range: '(0,1)', topicId: ID.summaryTopic }],
          children: { summary: [t(ID.summaryTopic, '요약')] },
        },
        [t(ID.a1, 'A 하나'), t(ID.a2, 'A 둘')],
      ),
      t(ID.b, '가지 B', {}, [t(ID.b1, 'B 하나'), t(ID.b2, 'B 둘')]),
      t(ID.c, '가지 C', {}, [t(ID.c1, 'C 하나')]),
    ]),
    relationships: [
      {
        id: ID.rel,
        end1Id: ID.a1,
        end2Id: ID.c1,
        title: '관계',
        controlPoints: FILE_CURVE,
        lineEndPoints: FILE_END_POINTS,
      },
    ],
  } as XmindSheet
}

const HOST = '.mm-sheet-host:not([hidden])'
const topic = (id: string): string => `${HOST} me-tpc[data-nodeid="me${id}"]`
const PANEL = '.mm-format-panel'
const LINE = `${PANEL} [data-format-section="line"]`

interface DrawnLine {
  d: string
  stroke: string | null
  fill: string | null
  styleStroke: string
  width: string
  dash: string
}

/**
 * The lines drawn for a main branch: the line from the centre into it, and
 * the lines inside it (into its children and below), as the page holds them.
 */
const branchLines = (page: Page, mainId: string) =>
  page.evaluate(
    ([host, id]) => {
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
          wrapper.firstElementChild?.firstElementChild?.getAttribute('data-nodeid') === `me${id}`,
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

/** A colour as the page computes it (`rgb(r, g, b)`), whatever form it is written in. */
const rgbOf = (page: Page, colour: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }, colour)

const isStraight = (d: string): boolean => d.length > 0 && !/[CcQqSsTtAa]/.test(d)

/** A point on a path of the map, in the page's coordinates, `fraction` of the way along it. */
const pointOn = (page: Page, selector: string, fraction: number) =>
  page.evaluate(
    ([sel, part]) => {
      const path = document.querySelector<SVGGeometryElement>(sel)
      const matrix = path?.getScreenCTM()
      if (!path || !matrix) return null
      const p = path.getPointAtLength(path.getTotalLength() * part)
      return {
        x: matrix.a * p.x + matrix.c * p.y + matrix.e,
        y: matrix.b * p.x + matrix.d * p.y + matrix.f,
      }
    },
    [selector, fraction] as const,
  )

/**
 * A point of the boundary outline a press can reach. `under`: nothing that is
 * an item of its own lies on top there (the map finds the boundary below
 * what is on top, as for a single press); `top`: the outline itself is the
 * topmost element (what a double click needs).
 */
const outlinePoint = (page: Page, mode: 'under' | 'top') =>
  page.evaluate(
    ([sel, items, how]) => {
      const path = document.querySelector<SVGGeometryElement>(sel)
      const matrix = path?.getScreenCTM()
      if (!path || !matrix) return null
      const length = path.getTotalLength()
      for (let step = 0; step < 200; step++) {
        const p = path.getPointAtLength((length * step) / 200)
        const x = matrix.a * p.x + matrix.c * p.y + matrix.e
        const y = matrix.b * p.x + matrix.d * p.y + matrix.f
        const top = document.elementFromPoint(x, y)
        if (!top) continue
        const label = `${top.tagName.toLowerCase()}.${top.getAttribute('class') ?? ''}`
        if (how === 'top') {
          if (top.closest('[data-mm-boundary]')) return { x, y, top: label }
          continue
        }
        if (top.closest(items)) continue
        if (document.elementsFromPoint(x, y).some((el) => el.closest('[data-mm-boundary]'))) {
          return { x, y, top: label }
        }
      }
      return null
    },
    [
      `${HOST} g[data-mm-boundary] .mm-boundary-shape`,
      'me-tpc, me-epd, .svg-label, .topiclinks, .summary, .linkcontroller',
      mode,
    ] as const,
  )

const formatKind = (page: Page) =>
  page
    .locator(`${PANEL} .mm-theme-body`)
    .getAttribute('data-format-kind')
    .catch(() => null)

async function openFormatPanel(page: Page): Promise<void> {
  if ((await page.locator(PANEL).count()) > 0) return
  await page.locator('[data-action="text-format"]').click()
  await page.waitForSelector(PANEL)
}

async function pickFrom(page: Page, dropdown: string, value: string): Promise<void> {
  await page.locator(`${dropdown} .gs-dd-btn`).click()
  await page.locator(`${dropdown} .gs-dd-pop [data-value="${value}"]`).click()
  await page.waitForTimeout(250)
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) })

const REL_GROUP = `${HOST} svg.topiclinks g[data-linkid="${ID.rel}"]`
const REL_LINE = `${REL_GROUP} > path:not([stroke="transparent"]):not(.mm-rel-end)`

async function main(): Promise<void> {
  const file = join(OUT, 'lines.xmind')
  const doc = await createXmindDocumentFromSheets([sheet()])
  writeFileSync(file, await doc.save())

  const require = createRequire(join(APP_DIR, 'package.json'))
  const executablePath = require('electron') as unknown as string
  const { ELECTRON_RUN_AS_NODE: _ignored, ...hostEnv } = process.env
  const app = await electron.launch({
    executablePath,
    args: [APP_DIR, file],
    env: {
      ...hostEnv,
      GENOFFICE_USER_DATA: mkdtempSync(join(OUT, 'profile-')),
      GENOFFICE_LANG: 'ko',
    },
  })
  let shownPage: Page | null = null
  try {
    const page = await app.firstWindow()
    shownPage = page
    await page.waitForLoadState('domcontentloaded')
    // the script runner wraps named functions in a helper the page does not have
    await page.evaluate('globalThis.__name = (fn) => fn')
    await page.waitForSelector(topic(ID.a1))
    await page.waitForTimeout(600)
    await shot(page, '0-opened')

    const before = await branchLines(page, ID.a)
    check(
      before?.main && before.below.length === 2,
      `the branch of A is drawn: a line from the centre and two inside (${before?.below.length})`,
    )

    // ---- (a) the line of branch A from the format panel ----
    await page.locator(topic(ID.a)).click()
    await openFormatPanel(page)
    check((await formatKind(page)) === 'topics', 'the panel shows the topic format for A')
    // the panel shows text or line, one at a time
    await page.locator(`${PANEL} [data-action="format-tab-line"]`).click()
    await page.locator(`${LINE} [data-action="line-shape-straight"]`).click()
    await page.waitForTimeout(250)
    await pickFrom(page, `${LINE} .line-width`, '4')
    const swatch = page.locator(`${LINE} .gcp-standard-row .gcp-swatch`).first()
    const swatchRgb = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
    await swatch.click()
    await page.waitForTimeout(250)
    await pickFrom(page, `${LINE} .line-pattern`, 'dash')
    await shot(page, '1-branch-line')

    const colour = swatchRgb
    const hex = rgbToHex(colour)
    const styled = (await branchLines(page, ID.a))!
    console.log(JSON.stringify(styled, null, 2))
    const mainLine = styled.main!
    check(isStraight(mainLine.d), `the line into A is straight (${mainLine.d})`)
    check(
      (await rgbOf(page, mainLine.stroke ?? '')) === colour,
      `the line into A has the colour picked (${mainLine.stroke} = ${colour})`,
    )
    check(mainLine.width === '4px', `the line into A is 4 wide (${mainLine.width})`)
    check(mainLine.dash !== '', `the line into A is dashed (${mainLine.dash})`)
    check(
      styled.below.length === 2 &&
        styled.below.every(
          (line) =>
            isStraight(line.d) &&
            line.width === '4px' &&
            line.dash !== '' &&
            line.styleStroke === colour,
        ),
      'the lines below A (into A1 and A2) carry the same shape, width, colour and dash',
    )
    check(
      (await page.locator(`${LINE} .line-width .gs-dd-btn`).getAttribute('data-value')) === '4' &&
        (await page.locator(`${LINE} .line-pattern .gs-dd-btn`).getAttribute('data-value')) ===
          'dash' &&
        (await page
          .locator(`${LINE} [data-action="line-shape-straight"]`)
          .getAttribute('aria-pressed')) === 'true',
      'the panel shows the values set',
    )

    // ---- (b) the map-wide settings in the theme panel ----
    const linesBeforeSwitch = {
      b: (await branchLines(page, ID.b))!.main!,
      c: (await branchLines(page, ID.c))!.main!,
    }
    check(
      linesBeforeSwitch.b.stroke !== linesBeforeSwitch.c.stroke,
      'before: every main branch has its own colour',
    )
    await page.locator('[data-action="theme"]').click()
    await page.waitForSelector('[data-action="theme-rainbow"]')
    const rainbow = page.locator('[data-action="theme-rainbow"]')
    const tapered = page.locator('[data-action="theme-tapered"]')
    check(
      (await rainbow.getAttribute('aria-checked')) === 'true' &&
        (await tapered.getAttribute('aria-checked')) === 'false',
      'the theme panel shows the rainbow on and the tapered lines off',
    )
    await rainbow.click()
    await page.waitForTimeout(250)
    await tapered.click()
    await page.waitForTimeout(400)
    await shot(page, '2-theme-switches')
    check(
      (await rainbow.getAttribute('aria-checked')) === 'false' &&
        (await tapered.getAttribute('aria-checked')) === 'true',
      'the switches show rainbow off, tapered on',
    )
    const afterSwitch = {
      a: (await branchLines(page, ID.a))!.main!,
      b: (await branchLines(page, ID.b))!.main!,
      c: (await branchLines(page, ID.c))!.main!,
    }
    console.log(JSON.stringify(afterSwitch, null, 2))
    check(
      afterSwitch.b.stroke === 'none' &&
        afterSwitch.c.stroke === 'none' &&
        afterSwitch.b.fill !== 'none' &&
        afterSwitch.b.fill === afterSwitch.c.fill,
      'unstyled main lines are drawn tapered (filled), all in one colour with the rainbow off',
    )
    check(
      afterSwitch.a.stroke !== 'none' &&
        (await rgbOf(page, afterSwitch.a.stroke ?? '')) === colour &&
        afterSwitch.a.dash !== '',
      'the dashed line of A stays a line in its own colour',
    )

    // ---- (c) the relationship: ends, shape, curve ----
    await openFormatPanel(page)
    const relPoint = await pointOn(page, REL_LINE, 0.3)
    check(relPoint, 'the relationship is drawn')
    await page.mouse.click(relPoint!.x, relPoint!.y)
    await page.waitForTimeout(300)
    check(
      (await formatKind(page)) === 'relationship',
      'a click on the relationship line selects it (the panel shows its format)',
    )
    await page.locator(`${PANEL} [data-action="rel-begin-dot"]`).click()
    await page.waitForTimeout(200)
    await page.locator(`${PANEL} [data-action="rel-end-triangle"]`).click()
    await page.waitForTimeout(200)
    check(
      (await page.locator(`${REL_GROUP} .mm-rel-end[data-mm-end="begin"]`).count()) === 1 &&
        (await page.locator(`${REL_GROUP} .mm-rel-end[data-mm-end="end"]`).count()) === 1,
      'both ends of the relationship are drawn by the app',
    )
    await page.locator(`${PANEL} [data-action="rel-shape-zigzag"]`).click()
    await page.waitForTimeout(300)
    const zigzag = (await page.locator(REL_LINE).first().getAttribute('d')) ?? ''
    check(isStraight(zigzag), `the zigzag relationship is drawn with straight pieces (${zigzag})`)
    await shot(page, '3-relationship-zigzag')
    await page.locator(`${PANEL} [data-action="rel-shape-curved"]`).click()
    await page.waitForTimeout(300)
    const curved = (await page.locator(REL_LINE).first().getAttribute('d')) ?? ''
    check(/C/.test(curved), `back to curved, the line is a curve (${curved})`)
    const handle = page.locator(`${HOST} me-nodes > .circle`).first()
    if (!(await handle.isVisible())) {
      finding(
        'after switching a relationship from zigzag back to curved, its curve handles stay hidden until it is selected again',
      )
      await page.locator(topic(ID.c)).click()
      const again = await pointOn(page, REL_LINE, 0.3)
      await page.mouse.click(again!.x, again!.y)
      await page.waitForTimeout(300)
      console.log('  (selected the relationship again with a click to get the handles)')
    }
    check(await handle.isVisible(), 'the curved relationship shows its curve handles')
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 50, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const dragged = (await page.locator(REL_LINE).first().getAttribute('d')) ?? ''
    check(dragged !== curved, 'dragging the handle reshapes the curve')
    check(
      (await page.locator(`${REL_GROUP} .mm-rel-end`).count()) === 2,
      'the ends are drawn on the reshaped curve',
    )
    await shot(page, '4-relationship-dragged')

    // ---- (d) a boundary around B1 and B2 from the toolbar ----
    await page.locator(topic(ID.b1)).click()
    await page.locator(topic(ID.b2)).click({ modifiers: ['Control'] })
    await page.waitForTimeout(200)
    const selectedCount = await page.locator(`${HOST} me-tpc.selected`).count()
    check(selectedCount === 2, `two sibling topics are selected (${selectedCount})`)
    await page.locator('[data-action="boundary"]').click()
    await page.waitForTimeout(400)
    const boundaryGroup = `${HOST} g[data-mm-boundary]`
    check((await page.locator(boundaryGroup).count()) === 1, 'the boundary is drawn')
    check(
      (await page.locator(`${boundaryGroup}.selected`).count()) === 1 &&
        (await formatKind(page)) === 'boundary',
      'the new boundary is selected and the panel shows its format',
    )
    // its title: Space, as for a topic. What happens to the title box and the
    // focus is recorded, so a box that does not stay open can be told apart
    // from one that never opened.
    await page.evaluate(() => {
      const log: string[] = []
      ;(window as unknown as { __boxLog: string[] }).__boxLog = log
      const started = performance.now()
      const at = (): string => `${Math.round(performance.now() - started)}ms`
      const name = (node: unknown): string =>
        node instanceof Element
          ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${node.getAttribute('class') ?? ''}`
          : String(node)
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.id === 'input-box') {
              log.push(`+box(${node.dataset.type ?? ''}) ${at()}`)
            }
          }
          for (const node of record.removedNodes) {
            if (node instanceof HTMLElement && node.id === 'input-box') {
              log.push(
                `-box(${node.dataset.type ?? ''}) ${at()} active=${name(document.activeElement)}`,
              )
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true })
      document.addEventListener(
        'focusin',
        (event) => log.push(`focus ${name(event.target)} ${at()}`),
        true,
      )
    })
    const boxLog = () =>
      page.evaluate(() =>
        (window as unknown as { __boxLog: string[] }).__boxLog.splice(0).join(' | '),
      )
    const activeName = () =>
      page.evaluate(() => {
        const el = document.activeElement
        const inMap = el?.closest('.map-container') ? ' (in the map)' : ' (outside the map)'
        return el ? `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}${inMap}` : 'none'
      })
    // attached, not visible: the box is as wide as its text, so a box with no title yet has no width
    const waitBox = () =>
      page
        .waitForSelector('#input-box[data-type="boundary"]', { state: 'attached', timeout: 1500 })
        .catch(() => null)
    console.log(`  the keyboard is on: ${await activeName()}`)
    await page.keyboard.press('Space')
    let titleBox = await waitBox()
    console.log(`  after Space: ${await boxLog()}`)
    const emptyBox = await page
      .locator('#input-box[data-type="boundary"]')
      .boundingBox()
      .catch(() => null)
    if (titleBox && emptyBox && emptyBox.width < 4) {
      finding(
        `the title box of a boundary with no title yet is ${emptyBox.width.toFixed(1)}px wide (only its outline shows)`,
      )
    }
    if (!titleBox) {
      finding(
        `Space on the new boundary (selected after the toolbar button) leaves no title box open; the keyboard was on ${await activeName()}`,
      )
      // a person would press the boundary itself and try again
      const pressAt = await outlinePoint(page, 'under')
      if (pressAt) {
        await page.mouse.click(pressAt.x, pressAt.y)
        await page.waitForTimeout(200)
        console.log(`  pressed the outline; the keyboard is on: ${await activeName()}`)
        await page.keyboard.press('Space')
        titleBox = await waitBox()
        console.log(`  after a press on the outline and Space: ${await boxLog()}`)
      }
    }
    if (!titleBox) {
      const onTop = await outlinePoint(page, 'top')
      if (!onTop) {
        finding('no point of the boundary outline lies on top, so a double click cannot reach it')
      } else {
        await page.mouse.dblclick(onTop.x, onTop.y)
        titleBox = await waitBox()
        console.log(`  after a double click on the outline: ${await boxLog()}`)
      }
    }
    check(titleBox, 'the boundary title box opens and stays open')
    if (titleBox) {
      await page.keyboard.type(BOUNDARY_TITLE)
      await page.keyboard.press('Enter')
    }
    await page.waitForTimeout(300)
    const titles = page.locator(`${boundaryGroup} .mm-boundary-title`)
    check(
      (await titles.count()) === 1 && (await titles.textContent()) === BOUNDARY_TITLE,
      'the boundary shows the title typed',
    )
    const outline = `${boundaryGroup} .mm-boundary-shape`
    const outlineBefore = (await page.locator(outline).getAttribute('d')) ?? ''
    await openFormatPanel(page)
    if ((await formatKind(page)) !== 'boundary') {
      finding('after its title is typed the boundary is no longer the selection')
      const again = await outlinePoint(page, 'under')
      if (again) await page.mouse.click(again.x, again.y)
      await page.waitForTimeout(300)
      console.log(`  (pressed the outline to select the boundary again: ${await formatKind(page)})`)
    }
    await page.locator(`${PANEL} [data-action="boundary-shape-scallops"]`).click()
    await page.waitForTimeout(300)
    check(
      ((await page.locator(outline).getAttribute('d')) ?? '') !== outlineBefore,
      'the scallops shape redraws the outline',
    )
    await shot(page, '5-boundary')

    // select something else, then the boundary again by its outline
    await page.locator(topic(ID.c)).click()
    await page.waitForTimeout(200)
    check(
      (await page.locator(`${boundaryGroup}.selected`).count()) === 0,
      'selecting a topic ends the boundary selection',
    )
    const press = await outlinePoint(page, 'under')
    if (!press) {
      finding(
        'no point of the boundary outline can be pressed: it is covered everywhere or takes no pointer',
      )
      const title = await page.locator(`${boundaryGroup} .mm-boundary-title`).boundingBox()
      if (title) {
        await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2)
        console.log('  (selected the boundary by its title instead)')
      }
    } else {
      console.log(
        `  pressing the outline at ${press.x.toFixed(1)},${press.y.toFixed(1)} (${press.top})`,
      )
      await page.mouse.click(press.x, press.y)
    }
    await page.waitForTimeout(300)
    check(
      (await page.locator(`${boundaryGroup}.selected`).count()) === 1 &&
        (await page.locator(`${HOST} me-tpc.selected`).count()) === 0,
      'a click on the outline selects the boundary (and nothing else)',
    )
    check((await formatKind(page)) === 'boundary', 'the panel shows the boundary format')
    check(
      (await page
        .locator(`${PANEL} [data-action="boundary-shape-scallops"]`)
        .getAttribute('aria-pressed')) === 'true',
      'the panel shows the scallops shape pressed',
    )
    await shot(page, '6-boundary-selected')

    // ---- (e) the format painter from A onto B ----
    await page.locator(topic(ID.a)).click()
    await page.waitForTimeout(200)
    await page.locator(`${PANEL} [data-action="format-painter"]`).click()
    await page.waitForTimeout(200)
    const container = `${HOST} .map-container`
    check(
      (await page.locator(container).getAttribute('data-mm-painter')) === 'topic',
      'the painter holds a topic format',
    )
    await page.locator(topic(ID.b)).click()
    await page.waitForTimeout(400)
    check(
      (await page.locator(container).getAttribute('data-mm-painter')) === null,
      'the painter lets go after one topic',
    )
    const painted = (await branchLines(page, ID.b))!
    console.log(JSON.stringify(painted, null, 2))
    const paintedOk = (lines: { main: DrawnLine | null; below: DrawnLine[] }): boolean =>
      lines.main !== null &&
      isStraight(lines.main.d) &&
      lines.main.width === '4px' &&
      lines.main.dash !== '' &&
      lines.below.length === 2 &&
      lines.below.every(
        (line) =>
          isStraight(line.d) &&
          line.width === '4px' &&
          line.dash !== '' &&
          line.styleStroke === colour,
      )
    check(paintedOk(painted), 'the branch of B takes the line of A, below it too')
    check(
      (await rgbOf(page, painted.main!.stroke ?? '')) === colour,
      'the line into B has the colour of A',
    )
    await shot(page, '7-painter')

    // ---- (f) one step back, and forward again ----
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(400)
    const undone = (await branchLines(page, ID.b))!
    check(
      undone.main!.width !== '4px' && undone.below.every((line) => line.width !== '4px'),
      'Ctrl+Z takes the painted format off B',
    )
    check(
      (await branchLines(page, ID.a))!.main!.width === '4px' &&
        (await page.locator(`${HOST} g[data-mm-boundary]`).count()) === 1,
      'only that step: A keeps its line and the boundary stays',
    )
    await shot(page, '8-undone')
    await page.locator('[data-action="redo"]').click()
    await page.waitForTimeout(400)
    check(paintedOk((await branchLines(page, ID.b))!), 'redo puts the painted format back')

    // ---- (g) save and read the file ----
    await page.keyboard.press('Control+s')
    await page.waitForFunction(
      () => document.querySelector('.mm-save-status')?.textContent === '저장됨',
      undefined,
      { timeout: 20_000 },
    )
    await shot(page, '9-saved')
    const opened = await openXmind(new Uint8Array(readFileSync(file)))
    if (opened.status !== 'ok') throw new Error(`the saved file does not open: ${opened.status}`)
    const saved = opened.document.sheets[0]!
    writeFileSync(join(OUT, 'saved-sheet.json'), JSON.stringify(saved, null, 2))
    const byId = new Map<string, XmindTopic>()
    const walk = (node: XmindTopic): void => {
      byId.set(node.id, node)
      for (const child of node.children?.attached ?? []) walk(child)
    }
    walk(saved.rootTopic)
    const props = (id: string): Record<string, string> =>
      ((byId.get(id)?.style as { properties?: Record<string, string> } | undefined)?.properties ??
        {}) as Record<string, string>
    const lineOf = (id: string) => {
      const p = props(id)
      return [p['line-class'], p['line-width'], p['line-color'], p['line-pattern']]
    }
    const wanted = ['org.xmind.branchConnection.straight', '4pt', hex, 'dash']
    for (const [name, id] of [
      ['A', ID.a],
      ['A1', ID.a1],
      ['A2', ID.a2],
    ] as const) {
      check(
        JSON.stringify(lineOf(id)) === JSON.stringify(wanted),
        `${name} has the line in the file (${JSON.stringify(lineOf(id))})`,
      )
    }
    for (const [name, id] of [
      ['B', ID.b],
      ['B1', ID.b1],
      ['B2', ID.b2],
    ] as const) {
      check(
        JSON.stringify(lineOf(id)) === JSON.stringify(wanted),
        `${name} has the painted line in the file (${JSON.stringify(lineOf(id))})`,
      )
    }
    check(
      lineOf(ID.c).every((value) => value === undefined),
      'C has no line values in the file',
    )
    const themeMap = (saved.theme as { map?: { properties?: Record<string, string> } } | undefined)
      ?.map?.properties
    check(
      themeMap?.['line-tapered'] === 'tapered' && themeMap['multi-line-colors'] === 'none',
      `the theme's map level holds line-tapered=tapered, multi-line-colors=none (${JSON.stringify(themeMap)})`,
    )
    const rel = (saved.relationships as Record<string, unknown>[] | undefined)?.find(
      (entry) => entry.id === ID.rel,
    )
    const relProps = (rel?.style as { properties?: Record<string, string> } | undefined)?.properties
    check(
      relProps?.['arrow-begin-class'] === 'org.xmind.arrowShape.dot' &&
        relProps['arrow-end-class'] === 'org.xmind.arrowShape.triangle',
      `the relationship ends are saved (${JSON.stringify(relProps)})`,
    )
    check(
      relProps?.['shape-class'] === 'org.xmind.relationshipShape.curved',
      `the relationship shape is saved (${relProps?.['shape-class']})`,
    )
    check(
      rel?.controlPoints !== undefined &&
        JSON.stringify(rel.controlPoints) !== JSON.stringify(FILE_CURVE),
      `the dragged curve is saved (${JSON.stringify(rel?.controlPoints)})`,
    )
    check(rel && !('lineEndPoints' in rel), 'the old end points are gone')
    const boundaries = byId.get(ID.b)?.boundaries as Record<string, unknown>[] | undefined
    const boundary = boundaries?.[0]
    check(
      boundaries?.length === 1 &&
        boundary?.range === '(0,1)' &&
        boundary.title === BOUNDARY_TITLE &&
        (boundary.style as { properties?: Record<string, string> } | undefined)?.properties?.[
          'shape-class'
        ] === 'org.xmind.boundaryShape.scallops',
      `B holds the boundary: range, title and shape (${JSON.stringify(boundaries)})`,
    )
    const summaries = byId.get(ID.a)?.summaries as unknown[] | undefined
    check(summaries?.length === 1, 'the summary is still in the file')

    if (failures.length) {
      const list = failures.map((f) => `  - ${f}`).join('\n')
      console.log(`${failures.length} check(s) failed:\n${list}`)
      process.exitCode = 1
    }
    console.log(
      findings.length
        ? `done with ${findings.length} finding(s):\n${findings.map((f) => `  - ${f}`).join('\n')}`
        : 'done; no findings',
    )
    console.log(`pictures and the file are in ${OUT}`)
  } catch (error) {
    await shownPage?.screenshot({ path: join(OUT, 'x-failed.png') }).catch(() => undefined)
    throw error
  } finally {
    // a window that asks about unsaved changes must not keep the run (or the app) alive
    const closed = app.close().then(
      () => true,
      () => false,
    )
    const timedOut = new Promise<boolean>((done) => setTimeout(() => done(false), 15_000))
    if (!(await Promise.race([closed, timedOut]))) app.process().kill()
  }
}

function rgbToHex(rgb: string): string {
  const parts = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

main().catch((error) => {
  console.error(error)
  if (findings.length)
    console.error(`findings so far:\n${findings.map((f) => `  - ${f}`).join('\n')}`)
  process.exitCode = 1
})
