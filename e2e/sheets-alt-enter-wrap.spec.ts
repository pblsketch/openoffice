import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

/**
 * Alt+Enter inside a cell starts a new line and, like Excel, turns on Wrap
 * Text. The second test covers the other half: a cancelled edit must not leave
 * the wrap armed for the next edit of the same cell.
 */
test.describe('sheets: Alt+Enter turns on wrap', () => {
  test('the saved workbook carries the newline and wrapText', async () => {
    const { launched, app, sheets, workbook } = await createBlankWorkbook('sheets-alt-enter-wrap')
    try {
      await clickA1(sheets)

      await sheets.keyboard.type('first', { delay: 50 })
      await sheets.keyboard.press('Alt+Enter')
      await sheets.keyboard.type('second', { delay: 50 })
      await sheets.keyboard.press('Enter')

      const saved = await saveAndRead(app, workbook)
      expect(saved.wrapText).toBe(true)
      expect(saved.sheet).toContain('first')
      expect(saved.sheet).toContain('second')
    } finally {
      await closeAndSaveVideo(launched, 'sheets-alt-enter-wrap')
    }
  })

  test('an edit cancelled with Esc does not wrap a later edit of that cell', async () => {
    const { launched, app, sheets, workbook } = await createBlankWorkbook('sheets-alt-enter-cancel')
    try {
      await clickA1(sheets)

      await sheets.keyboard.type('cancelled', { delay: 50 })
      await sheets.keyboard.press('Alt+Enter')
      await sheets.keyboard.type('draft', { delay: 50 })
      await sheets.keyboard.press('Escape')

      await sheets.keyboard.type('plain', { delay: 50 })
      await sheets.keyboard.press('Enter')

      const saved = await saveAndRead(app, workbook)
      expect(saved.sheet).toContain('plain')
      expect(saved.wrapText).toBe(false)
    } finally {
      await closeAndSaveVideo(launched, 'sheets-alt-enter-cancel')
    }
  })
})

/** Quick-create an AI Sheets workbook with a stubbed Save As target. */
async function createBlankWorkbook(videoDir: string): Promise<{
  launched: Awaited<ReturnType<typeof launchShell>>
  app: ElectronApplication
  sheets: Page
  workbook: string
}> {
  const scratch = await mkdtemp(join(tmpdir(), `genoffice-${videoDir}-`))
  const workbook = join(scratch, 'alt-enter.xlsx')
  const launched = await launchShell({ onboardingSeen: true, videoDir })
  const { app, page } = launched
  await app.evaluate(({ app: electronApp }, dir) => {
    electronApp.setPath('documents', dir)
  }, scratch)
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
  }, workbook)

  await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
  await page.locator('.quick-card').nth(1).click()
  const sheets = await waitForPageWithUrl(app, '://sheets/')
  await sheets.waitForFunction(() => document.body.textContent?.includes('Sheet1'), null, {
    timeout: 30_000,
  })
  await sheets.waitForTimeout(1_500)
  return { launched, app, sheets, workbook }
}

async function clickA1(sheets: Page): Promise<void> {
  const grid = await sheets.evaluate(() => {
    for (const canvas of document.querySelectorAll('canvas')) {
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 500 && rect.height > 300) return { x: rect.x, y: rect.y }
    }
    return null
  })
  if (!grid) throw new Error('worksheet canvas not found')
  await sheets.mouse.click(grid.x + 46 + 43, grid.y + 24 + 12)
  await expect(sheets.locator('[data-u-comp="defined-name"] input')).toHaveValue('A1')
}

/** Saves through the shell menu and reads the written xlsx. */
async function saveAndRead(
  app: ElectronApplication,
  workbook: string,
): Promise<{ wrapText: boolean; sheet: string }> {
  await app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('://sheets/'))
    wc?.send('menu:action', 'save')
  })
  await expect
    .poll(
      async () => existsSync(workbook) && (await readSavedWorkbook(workbook)).sheet.length > 0,
      {
        timeout: 20_000,
      },
    )
    .toBe(true)
  return readSavedWorkbook(workbook)
}

/** The wrap style lands in styles.xml as `<alignment wrapText="1"/>`. */
async function readSavedWorkbook(path: string): Promise<{ wrapText: boolean; sheet: string }> {
  try {
    const zip = await JSZip.loadAsync(await readFile(path))
    const styles = await zip.file('xl/styles.xml')?.async('string')
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    return {
      wrapText: styles?.includes('wrapText="1"') ?? false,
      sheet: sheet ?? '',
    }
  } catch {
    return { wrapText: false, sheet: '' }
  }
}
