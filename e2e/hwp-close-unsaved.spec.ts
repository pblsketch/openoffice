import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

/** The blank document a new HWP tab starts from: one empty paragraph. */
const BLANK = join(__dirname, '..', 'apps', 'hwp', 'src', 'renderer', 'assets', 'blank.hwp')

interface TabsApi {
  list(): Promise<{ id: string }[]>
  close(id: string): Promise<void>
}

/** The view that holds the tab bar's API. */
async function tabsView(app: ElectronApplication): Promise<Page> {
  for (const candidate of app.windows()) {
    const has = await candidate
      .evaluate(() => typeof (window as { aiOfficeTabs?: unknown }).aiOfficeTabs === 'object')
      .catch(() => false)
    if (has) return candidate
  }
  throw new Error('no view with the tab bar API')
}

/** Close the HWP tab as its close button does, and wait for the outcome. */
async function closeHwpTab(app: ElectronApplication): Promise<void> {
  const view = await tabsView(app)
  await view.evaluate(async () => {
    const api = (window as unknown as { aiOfficeTabs: TabsApi }).aiOfficeTabs
    const tab = (await api.list()).find((t) => /\.hwp/i.test(JSON.stringify(t)))
    if (tab) await api.close(tab.id)
  })
}

async function hwpTabOpen(app: ElectronApplication): Promise<boolean> {
  const view = await tabsView(app)
  return view.evaluate(async () => {
    const api = (window as unknown as { aiOfficeTabs: TabsApi }).aiOfficeTabs
    return (await api.list()).some((t) => /\.hwp/i.test(JSON.stringify(t)))
  })
}

/** Count the close prompts and answer Cancel, so a prompted tab stays. */
async function countPrompts(app: ElectronApplication): Promise<() => Promise<number>> {
  await app.evaluate(({ dialog }) => {
    const scope = globalThis as { closePrompts?: number }
    scope.closePrompts = 0
    dialog.showMessageBox = (async () => {
      scope.closePrompts = (scope.closePrompts ?? 0) + 1
      return { response: 2, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  })
  return () => app.evaluate(() => (globalThis as { closePrompts?: number }).closePrompts ?? 0)
}

/** The HWP tab with the document open and the app's plugin up (its File menu items are in). */
async function openHwp(app: ElectronApplication): Promise<Page> {
  const hwp = await waitForPageWithUrl(app, '://hwp/')
  await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  await expect(
    hwp.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ieum-save"]'),
  ).toHaveCount(1)
  return hwp
}

async function blankCopy(name: string): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), 'genoffice-hwp-close-')), name)
  await copyFile(BLANK, file)
  return file
}

/**
 * The main process decides the close prompt from the unsaved state the tab reported. A key
 * typed just before closing must be in it: when the tab asked the editor 50ms after each key,
 * closing at once dropped the change without a word (decision 0054).
 */
test.describe('HWP tab close', () => {
  test('a key typed just before closing still asks to save', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: await blankCopy('typed.hwp'),
      videoDir: 'hwp-close-unsaved',
    })
    const { app } = launched
    try {
      const prompts = await countPrompts(app)
      const hwp = await openHwp(app)
      const box = (await hwp.locator('.hwp-editor-host iframe').boundingBox())!
      await hwp.mouse.click(box.x + box.width * 0.4, box.y + 300)
      await hwp.keyboard.press('x')
      // at once: no wait between the key and the close
      await closeHwpTab(app)
      expect(await prompts()).toBe(1)
      expect(await hwpTabOpen(app)).toBe(true)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-close-unsaved')
    }
  })

  test('an untouched document closes without asking', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      openFile: await blankCopy('untouched.hwp'),
      videoDir: 'hwp-close-untouched',
    })
    const { app } = launched
    try {
      const prompts = await countPrompts(app)
      await openHwp(app)
      await closeHwpTab(app)
      expect(await prompts()).toBe(0)
      expect(await hwpTabOpen(app)).toBe(false)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-close-untouched')
    }
  })
})
