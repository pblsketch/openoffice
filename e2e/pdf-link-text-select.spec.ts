import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, waitForPageWithUrl, closeAndSaveVideo } from './helpers'

const URL = 'https://example.com/linked'
/** PDF space box of the link: over the first words of the line */
const LINK = { x1: 72, y1: 690, x2: 300, y2: 730 }

/** One Letter page with a line of text whose first words carry a web link */
function linkedPdf(): Buffer {
  const content = 'BT /F1 28 Tf 72 700 Td (Linked words then plain words) Tj ET'
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R/Annots[6 0 R]>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Type/Annot/Subtype/Link/Rect[${LINK.x1} ${LINK.y1} ${LINK.x2} ${LINK.y2}]/Border[0 0 0]/A<</S/URI/URI(${URL})>>>>`,
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

/** Screen point of PDF point (x, y) on the first page */
async function onPage(page: Page, x: number, y: number) {
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  const k = box.width / 612
  return { x: box.x + x * k, y: box.y + (792 - y) * k }
}

const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '')

test('text under a link selects by drag and the link still opens on a click (sheet row 247)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-pdf-link-select-'))
  const pdfPath = join(dir, 'linked.pdf')
  await writeFile(pdfPath, linkedPdf())

  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-link-text-select',
    openFile: pdfPath,
  })
  const { app } = launched
  try {
    // the browser is not started: the main process records what it would open
    await app.evaluate(({ shell: system }) => {
      const state = globalThis as unknown as { __opened: string[] }
      state.__opened = []
      system.openExternal = (async (url: string) => {
        state.__opened.push(url)
      }) as typeof system.openExternal
    })
    const opened = () =>
      app.evaluate(() => [...(globalThis as unknown as { __opened: string[] }).__opened])

    const pdf = await waitForPageWithUrl(app, '://pdf/')
    await expect(pdf.locator('.textLayer span').first()).toBeAttached()
    await expect(pdf.locator('.pdf-link')).toHaveCount(1)
    const inLink = await onPage(pdf, 110, 710)

    await test.step('the text, not the link, is under the pointer', async () => {
      const hit = await pdf.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('.textLayer, .pdf-link')?.className,
        inLink,
      )
      expect(hit).toBe('textLayer')
    })

    await test.step('hovering marks the link', async () => {
      await pdf.mouse.move(inLink.x, inLink.y)
      await expect(pdf.locator('.pdf-link')).toHaveClass(/is-hover/)
      await expect(pdf.locator('.pdf-page').first()).toHaveAttribute('data-link-hover', '')
      // the address still shows before anything opens
      await expect(pdf.locator('.ui-screentip-name')).toHaveText(URL)
    })

    await test.step('a drag that starts on the link selects its text and opens nothing', async () => {
      const end = await onPage(pdf, 400, 710)
      await pdf.mouse.move(inLink.x, inLink.y)
      await pdf.mouse.down()
      await pdf.mouse.move((inLink.x + end.x) / 2, end.y, { steps: 6 })
      await pdf.mouse.move(end.x, end.y, { steps: 6 })
      await pdf.mouse.up()
      const text = await selectedText(pdf)
      expect(text).toContain('words then')
      // no link look while the button was down
      expect(await opened()).toEqual([])
    })

    await test.step('a right-click on the selected link text reaches the text', async () => {
      // record where the menu event lands; the native menu itself is kept off the screen
      await pdf.evaluate(() => {
        const w = window as unknown as { __menuOn?: string }
        document.addEventListener(
          'contextmenu',
          (e) => {
            e.preventDefault()
            w.__menuOn = (e.target as Element).closest('.textLayer, .pdf-link')?.className ?? ''
          },
          { capture: true, once: true },
        )
      })
      await pdf.mouse.click(inLink.x, inLink.y, { button: 'right' })
      await expect
        .poll(() => pdf.evaluate(() => (window as unknown as { __menuOn?: string }).__menuOn))
        .toBe('textLayer')
      expect(await selectedText(pdf)).toContain('words then')
      expect(await opened()).toEqual([])
    })

    await test.step('a plain click on the link opens its address', async () => {
      await pdf.mouse.click(inLink.x, inLink.y)
      await expect.poll(opened).toEqual([URL])
    })

    await test.step('a double-click on the link picks a word and opens it once', async () => {
      await pdf.mouse.dblclick(inLink.x, inLink.y)
      await expect.poll(opened).toEqual([URL, URL])
      expect((await selectedText(pdf)).trim()).toBe('Linked')
      await pdf.waitForTimeout(300)
      expect(await opened()).toEqual([URL, URL])
    })

    await test.step('a plain click off the link opens nothing more', async () => {
      const off = await onPage(pdf, 450, 710)
      await pdf.mouse.click(off.x, off.y)
      await pdf.waitForTimeout(300)
      expect(await opened()).toEqual([URL, URL])
    })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-link-text-select')
  }
})

const LINK_A = 'https://example.com/A'
const LINK_B = 'https://example.com/B'

/** Two Letter pages of text lines; the first carries link A on its top line and B four lines down */
function scrollingPdf(): Buffer {
  const lines = [700, 600, 500, 400, 300, 200, 100]
    .map((y) => `BT /F1 28 Tf 72 ${y} Td (Line at ${y} words words words) Tj ET`)
    .join(' ')
  const link = (y1: number, uri: string) =>
    `<</Type/Annot/Subtype/Link/Rect[72 ${y1} 300 ${y1 + 40}]/Border[0 0 0]/A<</S/URI/URI(${uri})>>>>`
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 7 0 R>>>>/Contents 4 0 R/Annots[8 0 R 9 0 R]>>',
    `<</Length ${lines.length}>>\nstream\n${lines}\nendstream`,
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 7 0 R>>>>/Contents 6 0 R>>',
    `<</Length ${lines.length}>>\nstream\n${lines}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    link(690, LINK_A),
    link(290, LINK_B),
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

/** Open the two-page PDF with the system browser replaced by a recorder */
async function openScrolling(video: string) {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-pdf-link-scroll-'))
  const pdfPath = join(dir, 'scroll.pdf')
  await writeFile(pdfPath, scrollingPdf())
  const launched = await launchShell({ onboardingSeen: true, videoDir: video, openFile: pdfPath })
  const { app } = launched
  await app.evaluate(({ shell: system }) => {
    const state = globalThis as unknown as { __opened: string[] }
    state.__opened = []
    system.openExternal = (async (url: string) => {
      state.__opened.push(url)
    }) as typeof system.openExternal
  })
  const opened = () =>
    app.evaluate(() => [...(globalThis as unknown as { __opened: string[] }).__opened])
  const pdf = await waitForPageWithUrl(app, '://pdf/')
  await expect(pdf.locator('.textLayer span').first()).toBeAttached()
  await expect(pdf.locator('.pdf-link')).toHaveCount(2)
  const toTop = () =>
    pdf.locator('.pdf-scroll').evaluate((el) => {
      el.scrollTop = 0
    })
  return { launched, pdf, opened, toTop }
}

test('a wheel scroll with the button held opens no link on release', async () => {
  const { launched, pdf, opened, toTop } = await openScrolling('pdf-link-held-scroll')
  try {
    await test.step('pressed on link A, scrolled until B is under the pointer', async () => {
      const a = (await pdf.locator('.pdf-link').nth(0).boundingBox())!
      const b = (await pdf.locator('.pdf-link').nth(1).boundingBox())!
      const x = a.x + 40
      const y = a.y + a.height / 2
      await pdf.mouse.move(x, y)
      await pdf.mouse.down()
      await pdf.mouse.wheel(0, b.y - a.y)
      await pdf.waitForTimeout(300)
      await pdf.mouse.move(x + 1, y)
      await pdf.mouse.move(x, y)
      await pdf.mouse.up()
      await pdf.waitForTimeout(400)
      expect(await opened()).toEqual([])
    })

    await test.step('pressed on plain text, scrolled until B is under the pointer', async () => {
      await toTop()
      await pdf.evaluate(() => window.getSelection()?.removeAllRanges())
      const plain = await onPage(pdf, 110, 610)
      const k = (await pdf.locator('.pdf-page').first().boundingBox())!.width / 612
      await pdf.mouse.move(plain.x, plain.y)
      await pdf.mouse.down()
      await pdf.mouse.wheel(0, 300 * k)
      await pdf.waitForTimeout(300)
      await pdf.mouse.up()
      await pdf.waitForTimeout(400)
      expect(await opened()).toEqual([])
    })

    await test.step('without a scroll the same press and release opens the link', async () => {
      await toTop()
      await pdf.evaluate(() => window.getSelection()?.removeAllRanges())
      const a = (await pdf.locator('.pdf-link').nth(0).boundingBox())!
      await pdf.mouse.click(a.x + 40, a.y + a.height / 2)
      await expect.poll(opened).toEqual([LINK_A])
    })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-link-held-scroll')
  }
})

test('the link mark follows a wheel scroll under a resting pointer', async () => {
  const { launched, pdf } = await openScrolling('pdf-link-hover-scroll')
  try {
    const a = (await pdf.locator('.pdf-link').nth(0).boundingBox())!
    const x = a.x + 40
    const y = a.y + a.height / 2
    const cursor = () =>
      pdf.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)!).cursor, {
        x,
        y,
      })
    await pdf.mouse.move(x, y - 3)
    await pdf.mouse.move(x, y)
    await expect(pdf.locator('.pdf-link.is-hover')).toHaveCount(1)

    // scrolled away: the link left the pointer, so its mark and the hand cursor go
    await pdf.mouse.wheel(0, 400)
    await expect
      .poll(async () => (await pdf.locator('.pdf-link').nth(0).boundingBox())!.y)
      .toBeLessThan(y - 100)
    await expect(pdf.locator('.pdf-link.is-hover')).toHaveCount(0)
    await expect(pdf.locator('.pdf-page[data-link-hover]')).toHaveCount(0)
    expect(await cursor()).not.toBe('pointer')

    // scrolled back: the link comes under the resting pointer and is marked again
    await pdf.mouse.wheel(0, -400)
    await expect
      .poll(async () => (await pdf.locator('.pdf-link').nth(0).boundingBox())!.y)
      .toBe(a.y)
    await expect(pdf.locator('.pdf-link.is-hover')).toHaveCount(1)
    await expect(pdf.locator('.pdf-page[data-link-hover]')).toHaveCount(1)
    expect(await cursor()).toBe('pointer')
  } finally {
    await closeAndSaveVideo(launched, 'pdf-link-hover-scroll')
  }
})
