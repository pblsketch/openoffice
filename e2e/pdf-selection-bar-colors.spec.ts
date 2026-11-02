import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'

/** One page: a line in the middle and a short line against the right margin */
function twoLinePdf(): Buffer {
  const stream =
    'BT /F1 14 Tf 72 500 Td (Middle line of text to mark) Tj ET ' +
    'BT /F1 14 Tf 500 400 Td (Edge words) Tj ET'
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/** Drag across a text-layer span like a user would, so the bar opens on mouseup */
async function dragSelect(page: Page, text: string): Promise<void> {
  const span = page.locator('.textLayer span', { hasText: text }).first()
  // the text layer is rebuilt after a zoom: wait until it holds still
  let last = ''
  await expect
    .poll(
      async () => {
        await span.scrollIntoViewIfNeeded().catch(() => {})
        const now = JSON.stringify(await span.boundingBox().catch(() => null))
        const steady = now !== 'null' && now === last
        last = now
        return steady
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  const box = await span.boundingBox()
  if (!box) throw new Error(`no box for ${text}`)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 1, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 1, y, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.pdf-sel-popup')).toBeVisible()
}

/** Click blank viewer space: the selection and its bar go away */
async function clickBlank(page: Page): Promise<void> {
  const box = await page.locator('.pdf-scroll').boundingBox()
  if (!box) throw new Error('no viewer')
  await page.mouse.click(box.x + 8, box.y + 8)
  await expect(page.locator('.pdf-sel-popup')).toBeHidden()
}

async function expectInside(page: Page, selector: string, container: string): Promise<void> {
  const inner = await page.locator(selector).boundingBox()
  const outer = await page.locator(container).boundingBox()
  expect(inner && outer).toBeTruthy()
  expect(inner!.x).toBeGreaterThanOrEqual(outer!.x)
  expect(inner!.y).toBeGreaterThanOrEqual(outer!.y)
  expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 0.5)
  expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 0.5)
}

test('selection bar: three highlighter pens, line markup colors, kept inside the viewer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-pdf-selbar-'))
  const pdfPath = join(dir, 'twolines.pdf')
  await writeFile(pdfPath, twoLinePdf())

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-selection-bar-colors',
    openFile: pdfPath,
  })
  try {
    const page = await waitForPageWithUrl(launched.app, '://pdf/')
    await expect(page.locator('.textLayer span').first()).toBeVisible({ timeout: 30_000 })
    const setWidth = (width: number) =>
      launched.app.evaluate(({ BrowserWindow }, w) => {
        BrowserWindow.getAllWindows()[0]?.setSize(w, 860)
      }, width)

    // ── a viewer narrower than the bar: it stays inside the window instead ──
    await setWidth(760)
    await dragSelect(page, 'Edge words')
    const win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    const narrow = await page.locator('.pdf-sel-popup').boundingBox()
    expect(narrow!.x).toBeGreaterThanOrEqual(0)
    expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(win.w + 0.5)

    // ── the edge line at the viewer's right edge: the bar stays inside the viewer ──
    await setWidth(1280)
    await clickBlank(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Equal')
    // the page is now wider than the viewer: bring its right side and the edge line into view
    await expect
      .poll(() => page.locator('.pdf-scroll').evaluate((el) => el.scrollWidth > el.clientWidth))
      .toBe(true)
    await page.locator('.pdf-scroll').evaluate((el) => {
      el.scrollLeft = el.scrollWidth
      el.scrollTop = el.scrollHeight * 0.48 - el.clientHeight / 2
    })
    await dragSelect(page, 'Edge words')
    const viewer = await page.locator('.pdf-scroll').boundingBox()
    const edge = await page.locator('.textLayer span', { hasText: 'Edge words' }).boundingBox()
    // the selection really is near the edge: a centered bar would stick out
    const bar = await page.locator('.pdf-sel-popup').boundingBox()
    expect(edge!.x + edge!.width / 2 + bar!.width / 2).toBeGreaterThan(viewer!.x + viewer!.width)
    await expectInside(page, '.pdf-sel-popup', '.pdf-scroll')

    await clickBlank(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Minus')

    // ── the middle line: pens paint, recolor and remove ──
    await dragSelect(page, 'Middle line')
    const pens = page.locator('.pdf-sel-pen')
    await expect(pens).toHaveCount(3)
    const highlights = page.locator('.pdf-markup-highlight')

    await pens.nth(1).click()
    // one markup may draw one box per quad: count the boxes the first paint made
    await expect.poll(() => highlights.count()).toBeGreaterThan(0)
    const boxes = await highlights.count()
    await expect(pens.nth(1)).toHaveAttribute('aria-pressed', 'true')

    // another pen recolors the highlight instead of stacking a second one
    await pens.nth(0).click()
    await expect(highlights).toHaveCount(boxes)
    await expect(pens.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(pens.nth(1)).toHaveAttribute('aria-pressed', 'false')

    // the same pen again removes it
    await pens.nth(0).click()
    await expect(highlights).toHaveCount(0)

    // ── underline: the color row opens without moving the buttons ──
    const underline = page.locator('.pdf-sel-popup-row button', { hasText: 'U' })
    const before = await underline.boundingBox()
    await underline.click()
    const row = page.locator('.pdf-sel-colors')
    await expect(row).toBeVisible()
    const after = await underline.boundingBox()
    expect(after?.x).toBeCloseTo(before!.x, 0)
    expect(after?.y).toBeCloseTo(before!.y, 0)
    await expectInside(page, '.pdf-sel-popup', '.pdf-scroll')

    const swatches = row.locator('button')
    await expect(swatches).toHaveCount(8)
    await swatches.nth(5).click()
    await expect(swatches.nth(5)).toHaveAttribute('aria-pressed', 'true')
    // the underline button now shows the remembered color
    const ulColor = await underline
      .locator('.sel-swatch')
      .evaluate((el) => getComputedStyle(el).color)
    expect(ulColor).toBe('rgb(216, 27, 96)')

    // ── right-click a pen: its color picker opens on screen and changes the pen ──
    const penBg = (i: number) =>
      pens
        .nth(i)
        .locator('.sel-swatch')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    const cyan = await penBg(2)
    await pens.nth(2).click({ button: 'right' })
    const picker = page.locator('.pdf-sel-pen-picker')
    await expect(picker).toBeVisible()
    const pb = await picker.boundingBox()
    const vp =
      page.viewportSize() ??
      (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    expect(pb!.x).toBeGreaterThanOrEqual(0)
    expect(pb!.y).toBeGreaterThanOrEqual(0)
    expect(pb!.x + pb!.width).toBeLessThanOrEqual(vp.width + 0.5)
    expect(pb!.y + pb!.height).toBeLessThanOrEqual(vp.height + 0.5)
    await picker.locator('.gcp-standard-row .gcp-swatch').first().click()
    await expect(picker).toBeHidden()
    expect(await penBg(2)).not.toBe(cyan)

    // the pen keeps its new color on the next selection
    const changed = await penBg(2)
    await clickBlank(page)
    await dragSelect(page, 'Middle line')
    expect(await penBg(2)).toBe(changed)
  } finally {
    await closeAndSaveVideo(launched, 'pdf-selection-bar-colors')
  }
})
