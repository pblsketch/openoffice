import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'

/** Three Letter pages with a line of text each, so the text layer is there to select */
function textPdf(): Buffer {
  const pages = [3, 5, 7]
  const content = 'BT /F1 28 Tf 72 700 Td (Drag me around the page) Tj ET'
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    `<</Type/Pages/Kids[${pages.map((n) => `${n} 0 R`).join(' ')}]/Count ${pages.length}>>`,
  ]
  for (const n of pages) {
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 9 0 R>>>>/Contents ${n + 1} 0 R>>`,
      `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    )
  }
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

const scrollPos = (page: Page) =>
  page.locator('.pdf-scroll').evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }))

const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '')

/** Drag from the middle of the pane by (dx, dy) */
async function drag(page: Page, dx: number, dy: number, button: 'left' | 'middle') {
  const box = (await page.locator('.pdf-scroll').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button })
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 })
  await page.mouse.move(x + dx, y + dy, { steps: 4 })
  await page.mouse.up({ button })
}

test('the hand tool and the middle button drag the PDF view', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-pdf-pan-'))
  const pdfPath = join(dir, 'pan.pdf')
  await writeFile(pdfPath, textPdf())

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-hand-pan',
    openFile: pdfPath,
  })
  try {
    const editorPage = await waitForPageWithUrl(launched.app, '://pdf/')
    await expect(editorPage.locator('.pdf-page').first()).toBeVisible()
    await expect(editorPage.locator('.textLayer span').first()).toBeAttached()

    // zoom past the pane width so both directions can scroll
    const zoomIn = editorPage.getByRole('button', { name: 'Zoom in' }).first()
    for (let i = 0; i < 6; i++) await zoomIn.click()
    await expect
      .poll(() =>
        editorPage.locator('.pdf-scroll').evaluate((el) => el.scrollWidth > el.clientWidth + 100),
      )
      .toBe(true)
    await editorPage.locator('.pdf-scroll').evaluate((el) => {
      el.scrollLeft = 100
      el.scrollTop = 100
    })

    // the middle button pans with no tool armed
    const before = await scrollPos(editorPage)
    await drag(editorPage, -80, -120, 'middle')
    const afterMiddle = await scrollPos(editorPage)
    expect(afterMiddle.left).toBeGreaterThan(before.left + 60)
    expect(afterMiddle.top).toBeGreaterThan(before.top + 100)

    // the left button still selects text, the view stays put
    await drag(editorPage, -80, -120, 'left')
    expect(await scrollPos(editorPage)).toEqual(afterMiddle)
    await editorPage.evaluate(() => window.getSelection()?.removeAllRanges())

    // with the hand tool on, the left button pans and selects nothing
    const hand = editorPage.getByRole('button', { name: 'Hand tool' })
    await hand.click()
    await expect(hand).toHaveAttribute('aria-pressed', 'true')
    await expect(editorPage.locator('.pdf-scroll')).toHaveClass(/pdf-hand/)
    await drag(editorPage, 70, 90, 'left')
    const afterHand = await scrollPos(editorPage)
    expect(afterHand.left).toBeLessThan(afterMiddle.left - 50)
    expect(afterHand.top).toBeLessThan(afterMiddle.top - 70)
    expect(await selectedText(editorPage)).toBe('')
    await expect(editorPage.locator('.pdf-scroll')).not.toHaveAttribute('data-panning', /.*/)

    // Escape turns it off
    await editorPage.locator('.pdf-scroll').click({ position: { x: 20, y: 20 } })
    await editorPage.keyboard.press('Escape')
    await expect(hand).toHaveAttribute('aria-pressed', 'false')
    await expect(editorPage.locator('.pdf-scroll')).not.toHaveClass(/pdf-hand/)
  } finally {
    await closeAndSaveVideo(launched, 'pdf-hand-pan')
  }
})
