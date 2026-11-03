import { readFile, stat } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  applyOps,
  clickMenu,
  closeTab,
  contentsIdOf,
  copyAsset,
  diagramTabs,
  fileFormat,
  fileText,
  liveText,
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
    } finally {
      await closeAndSaveVideo(launched, 'diagram-formats')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
