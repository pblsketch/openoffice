import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'

const PAGES = 40

/** Letter pages with their number written on them */
function numberedPdf(): Buffer {
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '']
  const kids: number[] = []
  for (let i = 0; i < PAGES; i++) {
    const content = `BT /F1 48 Tf 72 680 Td (Page ${i + 1}) Tj ET`
    kids.push(objects.length + 1)
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 ${2 * PAGES + 3} 0 R>>>>/Contents ${objects.length + 2} 0 R>>`,
      `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    )
  }
  objects[1] = `<</Type/Pages/Kids[${kids.map((n) => `${n} 0 R`).join(' ')}]/Count ${PAGES}>>`
  objects.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>')
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

const listScroll = (page: Page) =>
  page.locator('.pdf-thumbs').evaluate((el) => ({
    top: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }))

/** Centre of a thumbnail's page box, as it is on screen now */
async function thumbCentre(page: Page, idx: number) {
  const b = (await page.locator(`.pdf-thumb[data-idx="${idx}"] .pdf-thumb-box`).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('dragging a thumbnail to the list edge scrolls the list (issue #312)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-pdf-thumb-drag-'))
  const pdfPath = join(dir, 'numbered.pdf')
  await writeFile(pdfPath, numberedPdf())

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-thumb-drag-scroll',
    openFile: pdfPath,
  })
  try {
    const pdf = await waitForPageWithUrl(launched.app, '://pdf/')
    await expect(pdf.locator('.pdf-thumb')).toHaveCount(PAGES, { timeout: 30_000 })
    const list = pdf.locator('.pdf-thumbs')
    const listBox = (await list.boundingBox())!
    const header = (await pdf.locator('.pdf-thumbs-header').boundingBox())!
    expect((await listScroll(pdf)).max).toBeGreaterThan(1000)

    await test.step('the bottom edge scrolls down while the drag rests there', async () => {
      const from = await thumbCentre(pdf, 0)
      await pdf.mouse.move(from.x, from.y)
      await pdf.mouse.down()
      await pdf.mouse.move(from.x, from.y + 20, { steps: 4 })
      // inside the bottom band of the list (deeper than the browser's own thin edge), then hold still
      await pdf.mouse.move(from.x, listBox.y + listBox.height - 30, { steps: 6 })
      await expect
        .poll(async () => (await listScroll(pdf)).top, { timeout: 15_000 })
        .toBeGreaterThan(400)
      // back to the middle: the list stops
      await pdf.mouse.move(from.x, listBox.y + listBox.height / 2, { steps: 4 })
      const stopped = (await listScroll(pdf)).top
      await pdf.waitForTimeout(400)
      expect((await listScroll(pdf)).top).toBe(stopped)
      // into the bottom band again, then out of the list: leaving it stops the scroll too
      await pdf.mouse.move(from.x, listBox.y + listBox.height - 30, { steps: 4 })
      await expect.poll(async () => (await listScroll(pdf)).top).toBeGreaterThan(stopped)
      await pdf.mouse.move(listBox.x + listBox.width + 200, listBox.y + listBox.height - 30, {
        steps: 4,
      })
      const left = (await listScroll(pdf)).top
      await pdf.waitForTimeout(400)
      expect((await listScroll(pdf)).top).toBe(left)
      await pdf.mouse.up()
      // released outside the list: no page moved
      await expect(pdf.locator('.pdf-page').first()).toHaveAttribute('data-page', '0')
    })

    await test.step('the last page travels to the top in one drag', async () => {
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const from = await thumbCentre(pdf, PAGES - 1)
      await pdf.mouse.move(from.x, from.y)
      await pdf.mouse.down()
      await pdf.mouse.move(from.x, from.y - 20, { steps: 4 })
      // over the sticky header: the list scrolls all the way up
      await pdf.mouse.move(from.x, header.y + header.height / 2, { steps: 8 })
      await expect.poll(async () => (await listScroll(pdf)).top, { timeout: 30_000 }).toBe(0)
      const to = await thumbCentre(pdf, 0)
      await pdf.mouse.move(to.x, to.y, { steps: 6 })
      await pdf.mouse.up()
      // the page that was last is now first, and the list stays put after the drop
      await expect(pdf.locator('.pdf-page').first()).toHaveAttribute('data-page', String(PAGES - 1))
      const after = (await listScroll(pdf)).top
      await pdf.waitForTimeout(400)
      expect((await listScroll(pdf)).top).toBe(after)
    })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-thumb-drag-scroll')
  }
})
