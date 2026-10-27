import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addElement,
  createBlankPptx,
  openPptx,
  savePptx,
  type TextElement,
} from '@genoffice/pptx-engine'
import type { RenderNode, RenderSlide } from '@genoffice/pptx-render'
import { launchShell, closeAndSaveVideo, screenshotPath, waitForPageWithUrl } from './helpers'

/** the slides preload API, as far as this test uses it */
interface SlidesWindow {
  slidesApi: {
    getRenderSlides(): Promise<RenderSlide[] | null>
    isDirty(): Promise<boolean>
    applyTxn(req: { ops: unknown[] }): Promise<unknown>
  }
}

/** every slides editor page of an app, in creation order */
async function slidesPages(app: ElectronApplication): Promise<Page[]> {
  const pages: Page[] = []
  for (const candidate of app.windows()) {
    const href = await candidate.evaluate(() => window.location.href).catch(() => '')
    if (href.includes('://slides/')) pages.push(candidate)
  }
  return pages
}

async function newSlidesPage(app: ElectronApplication, known: Page[]): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const fresh = (await slidesPages(app)).find((page) => !known.includes(page))
    if (fresh) return fresh
    await app.waitForEvent('window', { timeout: 300 }).catch(() => {})
  }
  throw new Error('the guest tab never opened')
}

/** a one-slide deck with one text box */
async function writeDeck(path: string, text: string): Promise<void> {
  const opened = await openPptx(await createBlankPptx())
  addElement(opened.deck.slides[0]!, {
    kind: 'textbox',
    offset: { x: 914400, y: 914400, cx: 5486400, cy: 914400 },
    paragraphs: [{ runs: [{ text }] }],
  })
  await writeFile(path, await savePptx(opened))
}

/** the deck as the main process holds it for this tab; empty until a new tab has loaded it */
const renderSlides = async (page: Page): Promise<RenderSlide[]> =>
  (await page.evaluate(() => (window as unknown as SlidesWindow).slidesApi.getRenderSlides())) ?? []

function nodeTexts(nodes: readonly RenderNode[]): string[] {
  return nodes.flatMap((n) => {
    const own =
      (n.type === 'shape' || n.type === 'text') && n.text
        ? [n.text.lines.map((l) => l.runs.map((r) => r.text).join('')).join(' ')]
        : []
    return n.type === 'group' ? [...own, ...nodeTexts(n.children)] : own
  })
}

const deckText = async (page: Page) =>
  (await renderSlides(page)).flatMap((s) => nodeTexts(s.nodes)).join('\n')

/** the text box holding `text` on the first slide */
async function textNode(page: Page, text: string): Promise<RenderNode> {
  const [first] = await renderSlides(page)
  const node = first!.nodes.find((n) => nodeTexts([n]).join('').includes(text))
  if (!node) throw new Error(`no text box with "${text}"`)
  return node
}

/** click the middle of an element on the canvas (the stage is zoomed to fit) */
async function clickNode(page: Page, node: RenderNode): Promise<void> {
  const [first] = await renderSlides(page)
  const stage = await page.locator('.stage-rel').first().boundingBox()
  if (!stage || !first) throw new Error('no stage')
  const scale = stage.width / first.widthPx
  await page.mouse.click(
    stage.x + (node.box.x + node.box.w / 2) * scale,
    stage.y + (node.box.y + node.box.h / 2) * scale,
  )
}

const setText = (page: Page, sourceId: string, text: string) =>
  page.evaluate(
    ({ sourceId, text }) =>
      (window as unknown as SlidesWindow).slidesApi.applyTxn({
        ops: [
          {
            op: 'setText',
            target: { slide: 0, el: sourceId },
            paragraphs: [{ runs: [{ text }] }],
          },
        ],
      }),
    { sourceId, text },
  )

/**
 * A File menu command for one tab. Slides saves only from the menu, and a
 * guest app has two slides tabs, so the page is marked to find its webContents.
 */
async function menuCommand(app: ElectronApplication, page: Page, command: string) {
  const mark = `menu-target-${Math.random().toString(36).slice(2)}`
  await page.evaluate((title) => {
    document.title = title
  }, mark)
  await app.evaluate(
    ({ webContents }, [title, cmd]) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getTitle() === title)
        ?.send('slides:menu', cmd)
    },
    [mark, command] as const,
  )
}

async function fileText(path: string): Promise<string> {
  const opened = await openPptx(new Uint8Array(await readFile(path)))
  return opened.deck.slides
    .flatMap((s) => s.elements)
    .map(
      (el) =>
        (el as TextElement).text?.paragraphs
          .map((p) => p.runs.map((r) => r.text).join(''))
          .join(' ') ?? '',
    )
    .join('\n')
}

test('two apps edit one PowerPoint deck together over the LAN with a PIN', async () => {
  test.setTimeout(240_000)
  const dir = await mkdtemp(join(tmpdir(), 'collab-slides-'))
  const shared = join(dir, 'plan.pptx')
  const other = join(dir, 'other.pptx')
  await writeDeck(shared, 'Plan from the host')
  await writeDeck(other, 'Something else')

  const host = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-slides-host',
    openFile: shared,
    settings: { collabProfile: { name: 'Host Mina', color: 1 } },
  })
  const guest = await launchShell({
    onboardingSeen: true,
    videoDir: 'collab-slides-guest',
    openFile: other,
    settings: { collabProfile: { name: 'Guest Jun', color: 3 } },
  })
  try {
    const hostPage = await waitForPageWithUrl(host.app, '://slides/')
    await expect.poll(() => deckText(hostPage)).toContain('Plan from the host')

    // host: share, read the PIN
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Start sharing' }).click()
    const pinText = (await hostPage.locator('.collab-pin').innerText()).replace(/\D/g, '')
    expect(pinText).toMatch(/^\d{6}$/)
    await hostPage.screenshot({ path: screenshotPath('collab-slides-host-sharing') })
    await hostPage.locator('.collab-dialog').getByRole('button', { name: 'Close' }).click()

    // guest: a wrong PIN is refused, the right one opens the shared deck in a new tab
    const guestFirst = await waitForPageWithUrl(guest.app, '://slides/')
    const before = await slidesPages(guest.app)
    await guestFirst.locator('.qa-collab').click()
    await guestFirst.getByRole('tab', { name: 'Join' }).click()
    await guestFirst.getByLabel('Address').fill('127.0.0.1')
    const wrong = pinText === '000000' ? '111111' : '000000'
    await guestFirst.getByLabel('PIN (6 digits)').fill(wrong)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestFirst.locator('.collab-error')).toHaveText('That PIN is not right.')
    await guestFirst.getByLabel('PIN (6 digits)').fill(pinText)
    await guestFirst.getByRole('button', { name: 'Join', exact: true }).click()

    const guestPage = await newSlidesPage(guest.app, before)
    await expect.poll(() => deckText(guestPage)).toContain('Plan from the host')
    // the copy is the host's deck, not an unsaved document of this PC
    await expect
      .poll(() => guestPage.evaluate(() => (window as unknown as SlidesWindow).slidesApi.isDirty()))
      .toBe(false)

    // guest selects the text box: the host sees where the guest is, with the name
    await clickNode(guestPage, await textNode(guestPage, 'Plan from the host'))
    await expect(hostPage.locator('.collab-box-label')).toHaveText('Guest Jun')

    // guest edits the text: the host's deck has it
    const guestBox = await textNode(guestPage, 'Plan from the host')
    await setText(guestPage, guestBox.sourceId, 'Guest was here')
    await expect.poll(() => deckText(hostPage)).toContain('Guest was here')

    // host adds a slide from the keyboard: the guest's deck has it too
    await hostPage.locator('.thumb').first().click()
    await hostPage.keyboard.press('Control+m')
    await expect.poll(async () => (await renderSlides(guestPage)).length).toBe(2)
    await hostPage.locator('.thumb').first().click()
    await clickNode(hostPage, await textNode(hostPage, 'Guest was here'))
    await expect(guestPage.locator('.collab-box-label')).toHaveText('Host Mina')
    await hostPage.screenshot({ path: screenshotPath('collab-slides-host') })
    await guestPage.screenshot({ path: screenshotPath('collab-slides-guest') })

    // undo on the guest never takes back the host's slide
    await guestPage.locator('.thumb').first().click()
    await guestPage.keyboard.press('Control+z')
    await expect(guestPage.locator('.app-toast')).toContainText(
      'This is not available during a session.',
    )
    expect((await renderSlides(hostPage)).length).toBe(2)

    // a guest cannot save; the host saves everyone's work to its file
    await menuCommand(guest.app, guestPage, 'save')
    await expect(guestPage.locator('.app-toast')).toContainText(
      'During a session, the person sharing saves the file.',
    )
    await expect
      .poll(() => hostPage.evaluate(() => (window as unknown as SlidesWindow).slidesApi.isDirty()))
      .toBe(true)
    await menuCommand(host.app, hostPage, 'save')
    await expect.poll(() => fileText(shared)).toContain('Guest was here')
    expect((await openPptx(new Uint8Array(await readFile(shared)))).deck.slides.length).toBe(2)

    // the host stops sharing: the guest is told and keeps an unsaved copy
    await hostPage.locator('.qa-collab').click()
    await hostPage.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(guestPage.locator('.collab-notice')).toContainText('ended the session')
    expect(await deckText(guestPage)).toContain('Guest was here')
    await expect
      .poll(() => guestPage.evaluate(() => (window as unknown as SlidesWindow).slidesApi.isDirty()))
      .toBe(true)
  } finally {
    await closeAndSaveVideo(guest, 'collab-slides-guest')
    await closeAndSaveVideo(host, 'collab-slides-host')
  }
})
