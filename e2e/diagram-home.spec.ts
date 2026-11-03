import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  answerSaveDialogs,
  applyOps,
  clickMenu,
  contentsIdOf,
  diagramRequests,
  diagramTabs,
  fileFormat,
  fileText,
  liveText,
  openDiagramPage,
  saveDialogCalls,
  scratchDir,
  statusText,
  watchDiagramRequests,
} from './diagram-lib'

/**
 * The Home screen's Diagram tile (spec 13): it opens an untitled one-page
 * diagram, and the first save of that diagram offers a `.drawio` file.
 */

test.describe('a new diagram from Home', () => {
  test('the Diagram tile opens an untitled diagram; its first save proposes .drawio', async () => {
    test.setTimeout(180_000)
    const dir = await scratchDir('home')
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'diagram-home',
      settings: { defaultSaveDir: dir },
    })
    const { app, page: shell } = launched
    try {
      await watchDiagramRequests(app)
      await answerMessageBoxes(app, 1)

      // ── the tile names the editor and the format it saves
      const card = shell.locator('.quick-card', {
        has: shell.locator('.quick-title', { hasText: /^Diagram$/ }),
      })
      await expect(card).toHaveCount(1)
      await expect(card.locator('.quick-sub')).toHaveText('.drawio')
      await expect(card.locator('img')).toBeVisible()
      const page = await openDiagramPage(app, () => card.click())

      // ── an untitled tab with one empty page
      const tab = shell.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(tab).toHaveCount(1)
      await expect(tab).toHaveClass(/active/)
      await expect(tab.locator('.tab-title')).toHaveText('Untitled Diagram')
      const [listed] = await diagramTabs(shell)
      expect(listed!.filePath).toBeUndefined()
      const empty = await liveText(page)
      expect(empty).toMatch(/^Pages: [^,\n]+$/m)
      expect(empty).toContain('Shapes (0)')
      expect(empty).toContain('Edges (0)')
      expect(await statusText(page)).toBe('')

      // ── something drawn, then the first save asks where, offering .drawio
      const edited = await applyOps(app, await contentsIdOf(app, page), [
        { op: 'add_shape', id: 'first', label: 'First shape', x: 80, y: 80 },
      ])
      expect(edited.result?.status, edited.error).toBe('ok')
      await expect.poll(() => statusText(page)).toBe('Unsaved changes')
      const target = join(dir, 'my first diagram.drawio')
      await answerSaveDialogs(app, [target])
      await clickMenu(app, 'File', '^Save$')
      await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
      const [dialog] = await saveDialogCalls(app)
      expect(dialog!.defaultPath).toBe(join(dir, 'Untitled Diagram.drawio'))
      expect(dialog!.filters![0]!.extensions).toEqual(['drawio'])

      // saved: a .drawio file with the drawing, and the tab is that file now
      await expect.poll(() => statusText(page)).toBe('Saved')
      expect(await fileFormat(target)).toBe('drawio')
      expect(await fileText(target)).toBe(await liveText(page))
      expect(await fileText(target)).toContain('First shape')
      await expect(tab.locator('.tab-title')).toHaveText('my first diagram.drawio')
      expect((await diagramTabs(shell))[0]!.filePath).toBe(target)
      expect(readdirSync(dir)).toEqual(['my first diagram.drawio'])
      await page.screenshot({ path: screenshotPath('diagram-home-new') })

      // a new diagram, too, asked nothing of anywhere else
      const requests = await diagramRequests(app)
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.filter((request) => request.refused)).toEqual([])
    } finally {
      await closeAndSaveVideo(launched, 'diagram-home')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
