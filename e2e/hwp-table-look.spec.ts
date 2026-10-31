/**
 * The table's border and fill tabs of 표/셀 속성 from a cell, and the cell row that has to
 * hold its first paragraph's space (decision 0086, vendor/rhwp-core patch 0021), on the
 * public reproduction of a worksheet a document tool wrote: a black table (the table and
 * its three cells filled black) and a 1×1 box whose three lines Hangul draws inside it.
 */
import { test, expect } from '@playwright/test'
import type { Frame } from '@playwright/test'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const FORM = join(__dirname, '..', 'apps', 'hwp', 'tests', 'fixtures', 'generated-form-tables.hwpx')

interface Look {
  black: { table: string; cells: string[] }
  header: { table: string; cells: string[] }
  box: { height: number }
}

function studioFrame(frames: Frame[]): Frame {
  const frame = frames.find((f) => f.url().includes('/studio/'))
  if (!frame) throw new Error('no studio frame')
  return frame
}

/** Test commands on the automation surface: put the caret in a cell, read the tables. */
async function installProbe(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const studio = (window as any).rhwpStudio
    studio.automation.registerCommand({
      id: 'ext:e2e-black-cell',
      label: 'E2E caret into the black table',
      execute(services: any) {
        const ih = services.getInputHandler()
        ih.cursor.moveTo({
          sectionIndex: 0,
          paragraphIndex: 0,
          charOffset: 0,
          parentParaIndex: 10,
          controlIndex: 0,
          cellIndex: 1,
          cellParaIndex: 0,
        })
        ih.updateCaret?.()
      },
    })
    studio.automation.registerCommand({
      id: 'ext:e2e-table-look',
      label: 'E2E table look',
      execute(services: any) {
        const w = services.wasm
        const look = (ppi: number, ci: number) => {
          const table = w.getTableProperties(0, ppi, ci)
          const count = w.getTableDimensions(0, ppi, ci).cellCount
          const cells = []
          for (let i = 0; i < count; i += 1) {
            const cell = w.getCellProperties(0, ppi, ci, i)
            cells.push(`${cell.fillType}:${cell.fillColor}:${cell.borderTop.type}`)
          }
          return { table: `${table.fillType}:${table.fillColor}`, cells }
        }
        const box = w.getTableCellBboxes(0, 12, 0)[0]
        ;(window as any).__e2eLook = {
          black: look(10, 0),
          header: look(0, 4),
          box: { height: box.h },
        }
      },
    })
  })
}

async function look(frame: Frame): Promise<Look> {
  return frame.evaluate(() => {
    ;(window as any).rhwpStudio.automation.execute('ext:e2e-table-look')
    return (window as any).__e2eLook
  })
}

async function openTableProps(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const studio = (window as any).rhwpStudio
    studio.automation.execute('ext:e2e-black-cell')
    studio.automation.execute('table:cell-props', undefined, { allowDialog: true })
  })
  await frame.waitForSelector('.tcp-dialog')
}

test('a black table turns clear from a cell, and the box holds its three lines', async () => {
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: FORM,
    videoDir: 'hwp-table-look',
    recordVideo: false,
  })
  try {
    const hwp = await waitForPageWithUrl(launched.app, '://hwp/')
    await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
    const frame = studioFrame(hwp.frames())
    await frame.waitForFunction(
      () => (window as any).rhwpStudio?.automation?.getContext().hasDocument,
    )
    await installProbe(frame)

    const before = await look(frame)
    expect(before.black.cells).toEqual(['solid:#000000:1', 'solid:#000000:1', 'solid:#000000:1'])
    expect(before.black.table).toBe('solid:#000000')
    // Hangul 2024 prints the box 71.4px high
    expect(before.box.height).toBeCloseTo(71.4, 0)

    // from a cell, the dialog has the table's border and fill tabs
    await openTableProps(frame)
    const tabs = await frame.$$eval('.tcp-dialog .dialog-tab', (els) =>
      els.map((el) => el.textContent),
    )
    expect(tabs).toEqual(expect.arrayContaining(['테두리', '배경']))

    // an OK that changed nothing leaves every table as it was
    await frame.click('.tcp-dialog .dialog-btn-primary')
    await expect(frame.locator('.tcp-dialog')).toHaveCount(0)
    expect(await look(frame)).toEqual(before)

    // 배경 → none clears the table and the cells that showed its fill, keeps their lines
    await openTableProps(frame)
    await frame.click('.tcp-dialog .dialog-tab[data-tab="background"]')
    await frame.locator('.tcp-dialog input[name="bgFill"]').first().check()
    await frame.click('.tcp-dialog .dialog-btn-primary')
    await expect(frame.locator('.tcp-dialog')).toHaveCount(0)
    const after = await look(frame)
    expect(after.black.table).toBe('none:#ffffff')
    expect(after.black.cells).toEqual(['none:#ffffff:1', 'none:#ffffff:1', 'none:#ffffff:1'])
    expect(after.header).toEqual(before.header)

    // one undo step brings the black back
    await frame.evaluate(() => (window as any).rhwpStudio.automation.execute('edit:undo'))
    expect((await look(frame)).black).toEqual(before.black)
  } finally {
    await closeAndSaveVideo(launched, 'hwp-table-look')
  }
})
