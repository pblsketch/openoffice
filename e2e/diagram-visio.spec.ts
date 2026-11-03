import { existsSync, readdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  answerSaveDialogs,
  clickMenu,
  copyAsset,
  diagramRequests,
  diagramTabs,
  fileText,
  liveText,
  openDiagramPage,
  openPath,
  saveDialogCalls,
  scratchDir,
  statusText,
  watchDiagramRequests,
} from './diagram-lib'

/**
 * Visio drawings in the built app (spec 13): a `.vsdx` opens as a new diagram
 * made from it on this PC, the pictures draw.io could not convert are counted
 * in the notice bar, opening the same `.vsdx` again comes back to its tab,
 * the first save offers a `.drawio` beside it, and the `.vsdx` is never
 * written.
 */

test.describe('Visio import', () => {
  test('two drawings, the picture notice, the same file again, the first save', async () => {
    test.setTimeout(240_000)
    const dir = await scratchDir('visio')
    const shapes = await copyAsset('visio-shapes.vsdx', dir)
    const metafiles = await copyAsset('visio-metafiles.vsdx', dir)
    const shapesBytes = await readFile(shapes)
    const metafilesBytes = await readFile(metafiles)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'diagram-visio' })
    const { app, page: shell } = launched
    try {
      await watchDiagramRequests(app)
      await answerMessageBoxes(app, 1)

      // ── boxes, a connector, a picture, two pages; no picture left unconverted
      const plan = await openDiagramPage(app, () => openPath(shell, shapes))
      const planText = await liveText(plan)
      for (const label of ['Plan', 'Notes', 'Start', 'Finish']) expect(planText).toContain(label)
      expect(planText).toMatch(/Edges \([1-9]/)
      await expect(plan.locator('.dg-notice')).toHaveCount(0)
      let tabs = await diagramTabs(shell)
      expect(tabs).toHaveLength(1)
      expect(tabs[0]).toMatchObject({ title: 'visio-shapes', active: true })
      expect(tabs[0]!.filePath).toBeUndefined()
      await plan.screenshot({ path: screenshotPath('diagram-visio-shapes') })

      // ── WMF and a broken EMF are not drawn: the notice counts the two
      const pictures = await openDiagramPage(app, () => openPath(shell, metafiles))
      await expect(pictures.locator('.dg-notice')).toContainText(
        '2 Visio pictures could not be converted.',
      )
      expect(await liveText(pictures)).toContain('Pictures')
      await pictures.screenshot({ path: screenshotPath('diagram-visio-metafiles') })
      tabs = await diagramTabs(shell)
      expect(tabs.map((tab) => [tab.title, tab.active])).toEqual([
        ['visio-shapes', false],
        ['visio-metafiles', true],
      ])

      // ── the same .vsdx again: its tab comes to the front, no second tab
      await openPath(shell, shapes)
      await expect
        .poll(async () => (await diagramTabs(shell)).map((tab) => [tab.title, tab.active]))
        .toEqual([
          ['visio-shapes', true],
          ['visio-metafiles', false],
        ])
      expect(app.windows().filter((page) => page.url().includes('://diagram/'))).toHaveLength(2)

      // ── the first save offers a .drawio beside the .vsdx and the tab becomes that file
      const proposed = join(dir, 'visio-shapes.drawio')
      await answerSaveDialogs(app, [proposed])
      await clickMenu(app, 'File', '^Save$')
      await expect.poll(() => existsSync(proposed), { timeout: 30_000 }).toBe(true)
      expect((await saveDialogCalls(app))[0]!.defaultPath).toBe(proposed)
      await expect.poll(() => statusText(plan)).toBe('Saved')
      expect(await fileText(proposed)).toBe(planText)
      await expect
        .poll(async () => (await diagramTabs(shell)).find((tab) => tab.active)?.filePath)
        .toBe(proposed)

      // the Visio files were read, never written
      expect((await readFile(shapes)).equals(shapesBytes)).toBe(true)
      expect((await readFile(metafiles)).equals(metafilesBytes)).toBe(true)
      expect(readdirSync(dir).sort()).toEqual([
        'visio-metafiles.vsdx',
        'visio-shapes.drawio',
        'visio-shapes.vsdx',
      ])

      // the import ran on this PC: nothing was asked of anywhere else
      const requests = await diagramRequests(app)
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.filter((request) => request.refused)).toEqual([])
    } finally {
      await closeAndSaveVideo(launched, 'diagram-visio')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
