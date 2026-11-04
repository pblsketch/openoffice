import { existsSync, readdirSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  answerSaveDialogs,
  clickMenu,
  copyAsset,
  diagramRequests,
  diagramTabs,
  diagramViewCount,
  fileText,
  liveText,
  messageBoxes,
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
        'Visio pictures that could not be converted: 2.',
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

      // ── a .vsdx that is no Visio drawing: no tab, the reason as an app warning
      const broken = await scratchDir('visio-broken')
      try {
        const tabsBefore = (await diagramTabs(shell)).length
        const viewsBefore = diagramViewCount(app)
        const notVisio = join(broken, 'not-visio.vsdx')
        await writeFile(notVisio, 'PK but not a drawing')
        let shown = (await messageBoxes(app)).length
        await openPath(shell, notVisio)
        await expect
          .poll(async () => (await messageBoxes(app)).slice(shown))
          .toEqual(['This file cannot be imported: The file is damaged or is not a Visio drawing.'])
        expect(await diagramTabs(shell)).toHaveLength(tabsBefore)
        expect(diagramViewCount(app)).toBe(viewsBefore)

        // ── a Visio drawing draw.io turns down once its tab is open (no pages):
        // the editor has the shell close that tab and show the reason
        const zip = await JSZip.loadAsync(shapesBytes)
        zip.file(
          'visio/pages/pages.xml',
          '<?xml version="1.0" encoding="utf-8"?><Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main"/>',
        )
        const pageless = join(broken, 'no-pages.vsdx')
        await writeFile(pageless, await zip.generateAsync({ type: 'nodebuffer' }))
        shown = (await messageBoxes(app)).length
        await openPath(shell, pageless)
        await expect
          .poll(async () => (await messageBoxes(app)).slice(shown), { timeout: 60_000 })
          .toEqual([expect.stringMatching(/^This file cannot be imported: /)])
        await expect.poll(async () => (await diagramTabs(shell)).length).toBe(tabsBefore)
        await expect.poll(() => diagramViewCount(app)).toBe(viewsBefore)
        // the tab that was there for a moment left nothing behind but its warning
        expect(readdirSync(broken).sort()).toEqual(['no-pages.vsdx', 'not-visio.vsdx'])
      } finally {
        rmSync(broken, { recursive: true, force: true })
      }

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
