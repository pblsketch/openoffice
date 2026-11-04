import { test, expect } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl, screenshotPath } from './helpers'

// the preload exposes window.__genofficeDebug only under this env var; the
// spec reads cell data and merges through Univer's Facade
process.env.GENOFFICE_DEBUG_HOOKS = '1'

/**
 * Two reports from 2026-11-02, both of which the AI path already handled:
 *  - Merge & Center refused any selection that touched a merged cell, so a
 *    title row that was already merged could not be merged wider;
 *  - Bold pressed inside the cell editor bolded the whole cell instead of
 *    the selected characters.
 */

interface Area {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

interface CellProbe {
  text: string
  styleBold: number | null | undefined
  runs: Array<{ st: number; ed: number; bl: number | null | undefined }> | null
}

type DebugApi = {
  univerAPI: {
    getActiveWorkbook(): {
      getActiveSheet(): {
        getSheet(): { getMergeData(): Area[] }
        getRange(
          r: number,
          c: number,
        ): {
          getCellStyleData(): { bl?: number | null } | null
          getCellData(): {
            v?: unknown
            p?: {
              body?: {
                dataStream?: string
                textRuns?: Array<{ st: number; ed: number; ts?: { bl?: number | null } }>
              }
            }
          } | null
        }
      }
    }
  }
}

async function merges(sheets: Page): Promise<Area[]> {
  return sheets.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__genofficeDebug as DebugApi
    return debug.univerAPI
      .getActiveWorkbook()
      .getActiveSheet()
      .getSheet()
      .getMergeData()
      .map(({ startRow, startColumn, endRow, endColumn }) => ({
        startRow,
        startColumn,
        endRow,
        endColumn,
      }))
  })
}

async function probeCell(sheets: Page, row: number, col: number): Promise<CellProbe> {
  return sheets.evaluate(
    ({ row, col }) => {
      const debug = (window as unknown as Record<string, unknown>).__genofficeDebug as DebugApi
      const range = debug.univerAPI.getActiveWorkbook().getActiveSheet().getRange(row, col)
      const cell = range.getCellData()
      const runs = cell?.p?.body?.textRuns
      return {
        text: cell?.p?.body?.dataStream ?? String(cell?.v ?? ''),
        styleBold: range.getCellStyleData()?.bl,
        runs: runs ? runs.map((run) => ({ st: run.st, ed: run.ed, bl: run.ts?.bl })) : null,
      }
    },
    { row, col },
  )
}

async function openBlankWorkbook(videoDir: string) {
  const scratch = await mkdtemp(join(tmpdir(), `genoffice-${videoDir}-`))
  const launched = await launchShell({ onboardingSeen: true, videoDir })
  const { app, page } = launched
  await app.evaluate(({ app: electronApp }, dir) => {
    electronApp.setPath('documents', dir)
  }, scratch)
  await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
  await page.locator('.quick-card').nth(1).click()
  const sheets = await waitForPageWithUrl(app, '://sheets/')
  await sheets.waitForFunction(() => document.body.textContent?.includes('Sheet1'), null, {
    timeout: 30_000,
  })
  await sheets.waitForTimeout(1_500)
  // cell centers in page px, from Univer's own cell geometry
  const cell = async (row: number, col: number) =>
    sheets.evaluate(
      ({ row, col }) => {
        const debug = (window as unknown as Record<string, unknown>).__genofficeDebug as {
          univerAPI: {
            getActiveWorkbook(): {
              getActiveSheet(): {
                getRange(
                  r: number,
                  c: number,
                ): { getCellRect(): { x: number; y: number; width: number; height: number } }
              }
            }
          }
        }
        let canvas: HTMLCanvasElement | null = null
        for (const candidate of document.querySelectorAll('canvas')) {
          const box = candidate.getBoundingClientRect()
          if (box.width > 500 && box.height > 300) canvas = candidate
        }
        if (!canvas) throw new Error('worksheet canvas not found')
        const origin = canvas.getBoundingClientRect()
        const rect = debug.univerAPI
          .getActiveWorkbook()
          .getActiveSheet()
          .getRange(row, col)
          .getCellRect()
        return { x: origin.x + rect.x + rect.width / 2, y: origin.y + rect.y + rect.height / 2 }
      },
      { row, col },
    )
  return { launched, sheets, cell }
}

test.describe('sheets: merge over merged cells, bold inside the editor', () => {
  test('Merge & Center widens an existing merge and toggles it off', async () => {
    const { launched, sheets, cell } = await openBlankWorkbook('sheets-merge-over-merged')
    try {
      const a1 = await cell(0, 0)
      await sheets.mouse.click(a1.x, a1.y)
      await sheets.keyboard.type('Title', { delay: 30 })
      await sheets.keyboard.press('Enter')

      const selectA1To = async (col: number) => {
        await sheets.mouse.click(a1.x, a1.y)
        const end = await cell(0, col)
        await sheets.keyboard.down('Shift')
        await sheets.mouse.click(end.x, end.y)
        await sheets.keyboard.up('Shift')
      }
      const pickMerge = async (option: string) => {
        await sheets.locator('button[aria-label="Merge cells"]').click()
        await sheets.getByRole('option', { name: option, exact: true }).click()
      }

      // A1:B1 merged first, like a title row that was merged earlier
      await selectA1To(1)
      await pickMerge('Merge Cells')
      await expect
        .poll(() => merges(sheets), { timeout: 5_000 })
        .toEqual([{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }])

      // A1:D1 over it: one merge across the whole row instead of a refusal
      await selectA1To(3)
      await pickMerge('Merge & Center')
      await expect
        .poll(() => merges(sheets), { timeout: 5_000 })
        .toEqual([{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 }])
      await expect(sheets.locator('.status-msg')).not.toContainText('overlap')
      await sheets.screenshot({ path: screenshotPath('sheets-merge-over-merged') })

      // Merge & Center on the merged cell itself unmerges it
      await sheets.mouse.click(a1.x, a1.y)
      await pickMerge('Merge & Center')
      await expect.poll(() => merges(sheets), { timeout: 5_000 }).toEqual([])
    } finally {
      await closeAndSaveVideo(launched, 'sheets-merge-over-merged')
    }
  })

  test('Bold in the cell editor bolds the selected characters only', async () => {
    const { launched, sheets, cell } = await openBlankWorkbook('sheets-inline-bold')
    try {
      const a1 = await cell(0, 0)
      await sheets.mouse.click(a1.x, a1.y)
      await sheets.keyboard.type('Heading body', { delay: 30 })
      await sheets.keyboard.press('Enter')

      // F2 puts the caret at the end; step back over " body", then select
      // "Heading" leftwards (the arrows, not Home, move inside the editor)
      await sheets.mouse.click(a1.x, a1.y)
      await sheets.keyboard.press('F2')
      await sheets.waitForTimeout(300)
      for (let i = 0; i < ' body'.length; i += 1) await sheets.keyboard.press('ArrowLeft')
      for (let i = 0; i < 'Heading'.length; i += 1) await sheets.keyboard.press('Shift+ArrowLeft')
      await sheets.locator('button[data-tip="Bold"]').click()
      await sheets.waitForTimeout(200)
      // the button did not take focus, so Enter commits the cell instead of
      // pressing Bold a second time
      expect(await sheets.evaluate(() => document.activeElement?.closest('button') ?? null)).toBe(
        null,
      )
      await sheets.keyboard.press('Enter')

      await expect
        .poll(async () => (await probeCell(sheets, 0, 0)).runs?.some((run) => run.bl === 1), {
          timeout: 5_000,
        })
        .toBe(true)
      const probe = await probeCell(sheets, 0, 0)
      await sheets.screenshot({ path: screenshotPath('sheets-inline-bold') })
      expect(probe.text.startsWith('Heading body')).toBe(true)
      const runs = probe.runs ?? []
      expect(runs.find((run) => run.bl === 1)).toEqual(expect.objectContaining({ st: 0, ed: 7 }))
      // " body" stays regular, and the cell itself was not bolded
      expect(runs.some((run) => run.ed > 7 && run.bl === 1)).toBe(false)
      expect(probe.styleBold ?? null).toBeNull()
    } finally {
      await closeAndSaveVideo(launched, 'sheets-inline-bold')
    }
  })
})
