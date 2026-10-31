/**
 * Two Hangul habits a user asked for (2026-10-30 feedback): a double click selects the word
 * under the mouse, and cells pasted onto a dragged cell block fill those cells instead of
 * landing in one. Real mouse events and a real clipboard against the production build.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const STUDIO_IFRAME = '.hwp-editor-host iframe'

interface Studio {
  plugins: {
    load(id: string): Promise<unknown>
    invoke(id: string, method: string, args: unknown[]): unknown
  }
}

interface CellBox {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
}

async function openHwp(app: ElectronApplication, page: Page): Promise<Page> {
  await page.locator('.quick-card').nth(6).click()
  const hwp = await waitForPageWithUrl(app, '://hwp/')
  await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  return hwp
}

async function studioFrame(hwp: Page): Promise<Frame> {
  const deadline = Date.now() + 60_000
  for (;;) {
    const frame = hwp.frames().find((f) => f.url().includes('/studio/'))
    if (frame) return frame
    if (Date.now() > deadline) throw new Error('studio frame never loaded')
    await hwp.waitForTimeout(100)
  }
}

async function canvasBox(hwp: Page) {
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  await canvas.waitFor({ timeout: 60_000 })
  return (await canvas.boundingBox())!
}

async function selectedText(frame: Frame): Promise<string> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: Studio }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    const read = (await studio.plugins.invoke('ieum-agent', 'selection', [])) as {
      segments?: { text: string }[]
    } | null
    return (read?.segments ?? []).map((segment) => segment.text).join('|')
  })
}

async function cellTexts(frame: Frame): Promise<string[]> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: Studio }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    const read = (await studio.plugins.invoke('ieum-agent', 'readTable', [1])) as {
      cells: { row: number; col: number; text: string }[]
    }
    return read.cells.map((cell) => cell.text)
  })
}

/** The first table's cell boxes in page coordinates, from the engine. */
async function cellBoxes(frame: Frame): Promise<CellBox[]> {
  return frame.evaluate(() => {
    const studio = (
      window as unknown as {
        rhwpStudio: {
          automation: {
            registerCommand(def: { id: string; label: string; execute(s: unknown): void }): void
            execute(id: string): void
          }
          __cellBoxes?: boolean
        }
      }
    ).rhwpStudio
    if (!studio.__cellBoxes) {
      studio.automation.registerCommand({
        id: 'ext:e2e-cell-boxes',
        label: 'E2E cell boxes',
        execute(services) {
          const s = services as {
            wasm: { getTableCellBboxes(sec: number, ppi: number, ci: number): unknown }
            getInputHandler(): {
              getCursorPosition(): {
                sectionIndex: number
                parentParaIndex?: number
                controlIndex?: number
              }
            }
          }
          const pos = s.getInputHandler().getCursorPosition()
          ;(window as unknown as { __boxes: unknown }).__boxes = s.wasm.getTableCellBboxes(
            pos.sectionIndex,
            pos.parentParaIndex!,
            pos.controlIndex!,
          )
        },
      })
      studio.__cellBoxes = true
    }
    studio.automation.execute('ext:e2e-cell-boxes')
    return (window as unknown as { __boxes: CellBox[] }).__boxes
  })
}

async function insertTable(frame: Frame, rows: number, cols: number): Promise<void> {
  await frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
  await frame.locator('.md-item[data-cmd="table:create"]').click()
  const grid = frame.locator(`div[data-row="${rows - 1}"][data-col="${cols - 1}"]`)
  await grid.hover()
  await grid.click()
}

test.describe('hwp: double click and cell paste', () => {
  test('double click selects a word; cells pasted onto a dragged block fill it', async () => {
    test.setTimeout(240_000)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'hwp-cell-paste' })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      const box = await canvasBox(hwp)

      // a body line, then a double click inside it: one whole word is selected
      await hwp.mouse.click(box.x + 160, box.y + 145)
      await hwp.keyboard.type('alpha bravo charlie delta echo foxtrot golf hotel india juliet')
      await hwp.mouse.dblclick(box.x + 160, box.y + 145)
      await expect
        .poll(() => selectedText(frame))
        .toMatch(/^(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliet)$/)

      // a 3×3 table on the next line
      await hwp.keyboard.press('End')
      await hwp.keyboard.press('Enter')
      await insertTable(frame, 3, 3)
      await hwp.keyboard.type('hello world')
      const cells = await cellBoxes(frame)
      const first = cells.find((cell) => cell.row === 0 && cell.col === 0)!
      const last = cells.find((cell) => cell.row === 2 && cell.col === 2)!

      // a double click on the first word of a cell selects that word only
      await hwp.mouse.dblclick(box.x + first.x + 14, box.y + first.y + first.h / 2)
      await expect.poll(() => selectedText(frame)).toBe('hello')

      // spreadsheet cells on the clipboard, the whole table dragged, Ctrl+V
      await app.evaluate(({ clipboard }) => {
        clipboard.write({
          text: '1\t2\t3\r\n4\t5\t6\r\n7\t8\t9\r\n',
          html:
            '<table><tr><td>1</td><td>2</td><td>3</td></tr>' +
            '<tr><td>4</td><td>5</td><td>6</td></tr>' +
            '<tr><td>7</td><td>8</td><td>9</td></tr></table>',
        })
      })
      await hwp.mouse.move(box.x + first.x + first.w / 2, box.y + first.y + first.h / 2)
      await hwp.mouse.down()
      await hwp.mouse.move(box.x + last.x + last.w / 2, box.y + last.y + last.h / 2, {
        steps: 10,
      })
      await hwp.mouse.up()
      await hwp.waitForTimeout(300)
      await hwp.keyboard.press('Control+v')
      await expect
        .poll(() => cellTexts(frame))
        .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])

      // one undo step brings the old cells back
      await hwp.keyboard.press('Control+z')
      await expect
        .poll(() => cellTexts(frame))
        .toEqual(['hello world', '', '', '', '', '', '', '', ''])
    } finally {
      await closeAndSaveVideo(launched, 'hwp-cell-paste')
    }
  })
})
