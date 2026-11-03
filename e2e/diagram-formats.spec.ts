import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  applyOps,
  clickMenu,
  closeTab,
  contentsIdOf,
  bridgeRequest,
  copyAsset,
  diagramTabs,
  drawioFrame,
  fileFormat,
  fileText,
  liveText,
  messageBoxes,
  openDiagramPage,
  openPath,
  scratchDir,
  statusText,
} from './diagram-lib'

/**
 * The four diagram file formats in the built app (spec 13): a file opened and
 * saved without a change is not written again (same bytes, same modification
 * time); a change saved stays in the file's own format and the file opened
 * again shows the same diagram.
 */

const FORMATS = [
  { file: 'sample.drawio', format: 'drawio' },
  { file: 'sample.dio', format: 'dio' },
  { file: 'sample.drawio.svg', format: 'drawio.svg' },
  { file: 'sample.drawio.png', format: 'drawio.png' },
] as const

/** long enough for a save request to reach the editor and, were it to write, the disk */
const SAVE_SETTLE_MS = 2_500

/** draw.io's page compression: raw deflate of the URI-encoded XML, in base64 */
const compressPage = (xml: string): string =>
  deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64')

const pageModel = (cells: string): string =>
  `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" pageWidth="827" pageHeight="1169"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`

const box = (id: string, label: string, x: number): string =>
  `<mxCell id="${id}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`

/**
 * Three compressed pages. The first has a shape with a web link, a shape
 * with a link to the second page, and a label holding a web link.
 */
const MULTI_PAGE_FILE =
  '<mxfile host="e2e">' +
  `<diagram id="pg1" name="첫 쪽">${compressPage(
    pageModel(
      '<UserObject label="Web link" link="https://example.com/e2e-link" id="web"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>' +
        '<UserObject label="Page link" link="data:page/id,pg2" id="tosecond"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>' +
        box(
          'label',
          '&lt;a href=&quot;https://example.org/label-link&quot;&gt;label link&lt;/a&gt;',
          360,
        ),
    ),
  )}</diagram>` +
  `<diagram id="pg2" name="둘째 쪽">${compressPage(pageModel(box('b', '둘째 쪽 도형', 40)))}</diagram>` +
  `<diagram id="pg3" name="Page 3">${compressPage(pageModel(box('c', 'Third page', 40)))}</diagram>` +
  '</mxfile>'

test.describe('diagram file formats', () => {
  test('open, save unchanged, change, save, open again: .drawio, .dio, .drawio.svg, .drawio.png', async () => {
    test.setTimeout(420_000)
    const dir = await scratchDir('formats')
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'diagram-formats' })
    const { app, page: shell } = launched
    try {
      await answerMessageBoxes(app, 1)
      for (const { file, format } of FORMATS) {
        await test.step(file, async () => {
          const path = await copyAsset(file, dir)
          const original = await readFile(path)
          const originalTime = (await stat(path)).mtimeMs
          expect(await fileFormat(path)).toBe(format)

          // ── opened and saved with no change: nothing is written
          const page = await openDiagramPage(app, () => openPath(shell, path))
          const opened = await liveText(page)
          expect(opened).toBe(await fileText(path))
          await clickMenu(app, 'File', '^Save$')
          await page.waitForTimeout(SAVE_SETTLE_MS)
          expect((await readFile(path)).equals(original), `${file} keeps its bytes`).toBe(true)
          expect((await stat(path)).mtimeMs, `${file} keeps its modification time`).toBe(
            originalTime,
          )
          expect(await statusText(page)).not.toContain('Unsaved')

          // ── a change, saved in the file's own format
          const contents = await contentsIdOf(app, page)
          const applied = await applyOps(app, contents, [
            { op: 'add_shape', id: 'e2e-one', label: 'Added in a test', x: 420, y: 200 },
            {
              op: 'add_shape',
              id: 'e2e-two',
              label: '둘째 도형',
              shape: 'ellipse',
              x: 620,
              y: 200,
            },
            { op: 'add_edge', id: 'e2e-link', source: 'e2e-one', target: 'e2e-two' },
          ])
          expect(applied.ok, applied.error).toBe(true)
          expect(applied.result?.status).toBe('ok')
          await expect.poll(() => statusText(page)).toBe('Unsaved changes')
          const changed = await liveText(page)
          expect(changed).toContain('Added in a test')
          expect(changed).toContain('e2e-link')

          await clickMenu(app, 'File', '^Save$')
          await expect
            .poll(async () => (await stat(path)).mtimeMs, { timeout: 30_000 })
            .not.toBe(originalTime)
          await expect.poll(() => statusText(page)).toBe('Saved')
          expect(await fileFormat(path), `${file} stays ${format}`).toBe(format)
          expect(await fileText(path)).toBe(changed)
          await page.screenshot({ path: screenshotPath(`diagram-format-${format}`) })

          // ── closed (clean: no question) and opened again: the same diagram
          const [tab] = await diagramTabs(shell)
          await closeTab(shell, tab!.id)
          await expect.poll(async () => (await diagramTabs(shell)).length).toBe(0)
          const savedBytes = await readFile(path)
          const reopened = await openDiagramPage(app, () => openPath(shell, path))
          expect(await liveText(reopened)).toBe(changed)
          // opening it again wrote nothing either
          expect((await readFile(path)).equals(savedBytes)).toBe(true)
          const [again] = await diagramTabs(shell)
          await closeTab(shell, again!.id)
          await expect.poll(async () => (await diagramTabs(shell)).length).toBe(0)
        })
      }
      expect(
        await app.evaluate(
          () => (globalThis as unknown as { __messageBoxes: string[] }).__messageBoxes,
        ),
        'no close prompt for a saved diagram',
      ).toEqual([])

      // ── a file that does not open gets no tab: the reason shows as an app warning
      await test.step('broken files', async () => {
        const broken = [
          {
            name: 'broken.drawio',
            bytes: 'not a diagram',
            reason: 'The file is not in the diagram format (XML). It may be damaged.',
          },
          {
            name: 'picture.drawio.svg',
            bytes: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
            reason: 'This picture has no diagram inside, so it cannot be opened as a diagram.',
          },
        ]
        for (const { name, bytes, reason } of broken) {
          const path = join(dir, name)
          await writeFile(path, bytes)
          const shown = (await messageBoxes(app)).length
          await openPath(shell, path)
          await expect.poll(async () => (await messageBoxes(app)).slice(shown)).toEqual([reason])
          expect(await diagramTabs(shell), `${name} opens no tab`).toEqual([])
          expect(
            app.windows().filter((page) => page.url().includes('://diagram/')),
            `${name} starts no editor`,
          ).toHaveLength(0)
        }
      })
    } finally {
      await closeAndSaveVideo(launched, 'diagram-formats')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('pages and links: showing another page is no change; a clicked web link opens in the browser', async () => {
    test.setTimeout(240_000)
    const dir = await scratchDir('pages-links')
    const path = join(dir, 'multi.drawio')
    await writeFile(path, MULTI_PAGE_FILE)
    const original = await readFile(path)
    const originalTime = (await stat(path)).mtimeMs
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'diagram-pages-links' })
    const { app, page: shell } = launched
    try {
      await answerMessageBoxes(app, 1)
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
      const currentPage = async (): Promise<string | null> =>
        (await bridgeRequest<{ currentPage: string | null }>(page, 'pageInfo', {})).currentPage

      const page = await openDiagramPage(app, () => openPath(shell, path))
      const frame = drawioFrame(page)

      await test.step('showing other pages', async () => {
        await frame.locator('.geTabContainer .geTab', { hasText: '둘째 쪽' }).click()
        await expect.poll(currentPage).toBe('pg2')
        await frame.locator('.geTabContainer .geTab', { hasText: 'Page 3' }).click()
        await expect.poll(currentPage).toBe('pg3')
        await frame.locator('.geTabContainer .geTab', { hasText: '첫 쪽' }).click()
        await expect.poll(currentPage).toBe('pg1')
        await page.waitForTimeout(500)
        expect(await statusText(page)).not.toContain('Unsaved')
        // a save with nothing changed writes nothing
        await clickMenu(app, 'File', '^Save$')
        await page.waitForTimeout(SAVE_SETTLE_MS)
        expect((await readFile(path)).equals(original)).toBe(true)
        expect((await stat(path)).mtimeMs).toBe(originalTime)
      })

      await test.step('clicking links', async () => {
        // the link under a selected shape
        const web = (await frame.locator('text=Web link').first().boundingBox())!
        await page.mouse.click(web.x + web.width / 2, web.y + web.height / 2)
        const hint = frame.locator('.geHint a', { hasText: 'https://example.com/e2e-link' })
        await expect(hint).toHaveCount(1)
        const at = (await hint.boundingBox())!
        await page.mouse.click(at.x + Math.min(30, at.width / 2), at.y + at.height / 2)
        await expect.poll(opened).toEqual(['https://example.com/e2e-link'])

        // a link inside a label
        const inLabel = (await frame.locator('a', { hasText: 'label link' }).first().boundingBox())!
        await page.mouse.click(inLabel.x + inLabel.width / 2, inLabel.y + inLabel.height / 2)
        await expect
          .poll(opened)
          .toEqual(['https://example.com/e2e-link', 'https://example.org/label-link'])

        // a page link moves to its page; nothing is opened, nothing changed
        const toSecond = (await frame.locator('text=Page link').first().boundingBox())!
        await page.mouse.click(toSecond.x + toSecond.width / 2, toSecond.y + toSecond.height / 2)
        const pageHint = frame.locator('.geHint a').first()
        await expect(pageHint).toHaveCount(1)
        const ph = (await pageHint.boundingBox())!
        await page.mouse.click(ph.x + Math.min(30, ph.width / 2), ph.y + ph.height / 2)
        await expect.poll(currentPage).toBe('pg2')
        expect(await opened()).toHaveLength(2)
        expect(app.windows().filter((w) => !/^(file:|genoffice-app:)/.test(w.url()))).toEqual([])
      })

      // closed without a question; the file's bytes are as they were
      await page.waitForTimeout(500)
      expect(await statusText(page)).not.toContain('Unsaved')
      const [tab] = await diagramTabs(shell)
      await closeTab(shell, tab!.id)
      await expect.poll(async () => (await diagramTabs(shell)).length).toBe(0)
      expect(await messageBoxes(app), 'no close prompt after only showing pages').toEqual([])
      expect((await readFile(path)).equals(original)).toBe(true)
      expect((await stat(path)).mtimeMs).toBe(originalTime)
    } finally {
      await closeAndSaveVideo(launched, 'diagram-pages-links')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
