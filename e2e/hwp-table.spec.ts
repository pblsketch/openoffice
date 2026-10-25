/**
 * HWP tables with Hancom Hangul's keys (docs/plans/hwp-table-parity.md, Phase 1A).
 *
 * Runs against the production build: the studio's own automation surface and the app's
 * `ieum-agent` plugin are used, never the DEV-only `window.__wasm`.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTIFACTS_DIR, closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

interface TableList {
  count: number
  tables: { table: number; rows: number; cols: number }[]
}

interface TableRead {
  ok: boolean
  table: number
  rows: number
  cols: number
  cells: { row: number; col: number; text: string }[]
}

interface Geometry {
  dims: { rowCount: number; colCount: number; cellCount: number }
  cells: { row: number; col: number; width: number; height: number }[]
  bboxes: { cellIdx: number; row: number; col: number; w: number; h: number }[]
}

const STUDIO_IFRAME = '.hwp-editor-host iframe'

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

/** The editor's canvas, so keys go to its hidden input. */
async function focusEditor(hwp: Page): Promise<void> {
  const studio = hwp.frameLocator(STUDIO_IFRAME)
  const canvas = studio.locator('#scroll-content canvas').first()
  await canvas.waitFor({ timeout: 60_000 })
  // the middle of the first table cell / first body line, below the table's top border
  await canvas.click({ position: { x: 160, y: 145 } })
}

/** Insert a table through the editor's Table menu, as a person would. */
async function insertTable(frame: Frame, rows: number, cols: number): Promise<void> {
  await frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
  await frame.locator('.md-item[data-cmd="table:create"]').click()
  const grid = frame.locator(`div[data-row="${rows - 1}"][data-col="${cols - 1}"]`)
  await grid.hover()
  await grid.click()
}

async function listTables(frame: Frame): Promise<TableList> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    return studio.plugins.invoke('ieum-agent', 'listTables', []) as TableList
  })
}

async function readTable(frame: Frame, table = 1): Promise<TableRead> {
  return frame.evaluate(async (number) => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    return studio.plugins.invoke('ieum-agent', 'readTable', [number]) as TableRead
  }, table)
}

/** A test command on the automation surface: records the table's cells, no document change. */
async function installGeometryProbe(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    if (studio.__geometryProbe) return
    studio.automation.registerCommand({
      id: 'ext:e2e-table-geometry',
      label: 'E2E table geometry',
      execute(services) {
        const ih = services.getInputHandler()
        const ref = ih.getSelectedTableRef()
        const pos = ih.getCursorPosition()
        const sec = ref?.sec ?? pos.sectionIndex
        const ppi = ref?.ppi ?? pos.parentParaIndex
        const ci = ref?.ci ?? pos.controlIndex
        const dims = services.wasm.getTableDimensions(sec, ppi, ci)
        const cells = []
        for (let i = 0; i < dims.cellCount; i += 1) {
          const info = services.wasm.getCellInfo(sec, ppi, ci, i)
          const props = services.wasm.getCellProperties(sec, ppi, ci, i)
          cells.push({
            row: info.row,
            col: info.col,
            width: props.width,
            height: props.height,
          })
        }
        ;(window as unknown as { __e2eTable?: unknown }).__e2eTable = {
          dims,
          cells,
          bboxes: services.wasm.getTableCellBboxes(sec, ppi, ci),
        }
      },
    })
    // make the first column wider than the second, so W has something to equalize
    studio.automation.registerCommand({
      id: 'ext:e2e-widen-first-column',
      label: 'E2E widen first column',
      execute(services) {
        const ih = services.getInputHandler()
        const pos = ih.getCursorPosition()
        ih.executeOperation({
          kind: 'snapshot',
          operationType: 'e2eWidenColumn',
          operation: (wasm) => {
            const dims = wasm.getTableDimensions(
              pos.sectionIndex,
              pos.parentParaIndex!,
              pos.controlIndex!,
            )
            const updates = []
            for (let row = 0; row < dims.rowCount; row += 1) {
              updates.push({ cellIdx: row * dims.colCount, widthDelta: 3000 })
            }
            wasm.resizeTableCells(
              pos.sectionIndex,
              pos.parentParaIndex!,
              pos.controlIndex!,
              updates,
            )
            return ih.getCursorPosition()
          },
        })
      },
    })
    studio.__geometryProbe = true
  })
}

async function geometry(frame: Frame): Promise<Geometry> {
  await frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    studio.automation.execute('ext:e2e-table-geometry')
  })
  return frame.evaluate(
    () => (window as unknown as { __e2eTable: Geometry }).__e2eTable,
  ) as Promise<Geometry>
}

async function widenFirstColumn(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    studio.automation.execute('ext:e2e-widen-first-column')
  })
}

/** Hancom's cell block over the whole table, by dragging from its first cell to its last. */
async function selectAllCells(hwp: Page, frame: Frame): Promise<void> {
  const table = await geometry(frame)
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  const box = (await canvas.boundingBox())!
  const first = table.bboxes[0]
  const last = table.bboxes[table.bboxes.length - 1]
  const center = (cell: { x: number; y: number; w: number; h: number }) => ({
    x: box.x + cell.x + cell.w / 2,
    y: box.y + cell.y + cell.h / 2,
  })
  const start = center(first)
  const end = center(last)
  await hwp.mouse.move(start.x, start.y)
  await hwp.mouse.down()
  await hwp.mouse.move(end.x, end.y, { steps: 10 })
  await hwp.mouse.up()
  await hwp.waitForTimeout(300)
}

async function inTableObjectSelection(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    return studio.automation.getContext().inTableObjectSelection
  })
}

async function wholeTableSelected(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    const context = studio.automation.getContext()
    return context.inCellSelectionMode && context.hasMultiCellSelection
  })
}

async function screenshot(hwp: Page, name: string): Promise<void> {
  const dir = join(ARTIFACTS_DIR, 'hwp-table')
  await mkdir(dir, { recursive: true })
  await hwp.screenshot({ path: join(dir, `${name}.png`) })
}

/** The types the studio puts on its window; only what the spec uses. */
interface StudioLike {
  plugins: {
    load(id: string): Promise<unknown>
    invoke(id: string, method: string, args: unknown[]): unknown
  }
  automation: {
    execute(id: string): unknown
    getContext(): {
      inTableObjectSelection: boolean
      inCellSelectionMode: boolean
      hasMultiCellSelection: boolean
    }
    registerCommand(def: {
      id: string
      label: string
      execute(services: StudioServices): void
    }): void
  }
  __geometryProbe?: boolean
}

interface StudioServices {
  wasm: {
    getTableDimensions(
      sec: number,
      ppi: number,
      ci: number,
    ): {
      rowCount: number
      colCount: number
      cellCount: number
    }
    getCellInfo(sec: number, ppi: number, ci: number, cell: number): { row: number; col: number }
    getCellProperties(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
    ): { width: number; height: number }
    getTableCellBboxes(
      sec: number,
      ppi: number,
      ci: number,
    ): { cellIdx: number; row: number; col: number; w: number; h: number }[]
  }
  getInputHandler(): {
    getSelectedTableRef(): { sec: number; ppi: number; ci: number } | null
    getCursorPosition(): {
      sectionIndex: number
      parentParaIndex?: number
      controlIndex?: number
    }
    executeOperation(desc: {
      kind: 'snapshot'
      operationType: string
      operation: (
        wasm: StudioServices['wasm'] & {
          resizeTableCells(
            sec: number,
            ppi: number,
            ci: number,
            updates: { cellIdx: number; widthDelta?: number; heightDelta?: number }[],
          ): { ok: boolean }
        },
      ) => unknown
    }): void
  }
}

test.describe('HWP table keys', () => {
  test.setTimeout(180_000)

  test('creates a 3×3 table, enters text and keeps Hancom’s row keys', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-rows',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      expect((await listTables(frame)).tables[0]).toMatchObject({ rows: 3, cols: 3 })
      await screenshot(hwp, '01-created-3x3')

      // A1 → Tab → B1 → Tab → C1
      await hwp.keyboard.type('A1')
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('B1')
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('C1')
      let table = await readTable(frame)
      expect(table.cells.filter((c) => c.row === 1).map((c) => c.text)).toEqual(['A1', 'B1', 'C1'])

      // Ctrl+N,K on a cell opens Table/Cell Properties
      await hwp.keyboard.press('Control+n')
      await hwp.keyboard.press('k')
      await expect(frame.locator('.modal-overlay .dialog-title')).toContainText(
        'Table/Cell Properties',
      )
      await hwp.keyboard.press('Escape')
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)
      // opening a dialog may leave focus outside the editor; put the caret back in A1
      await focusEditor(hwp)
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.press('Tab')

      // a table inside a cell is still blocked (Phase 2): the count must not grow
      await hwp.keyboard.press('Control+n')
      await hwp.keyboard.press('t')
      await hwp.waitForTimeout(500)
      expect((await listTables(frame)).count).toBe(1)
      expect((await listTables(frame)).tables[0]).toMatchObject({ rows: 3, cols: 3 })

      // C1 → … → C3 (the table's last cell): six Tab presses, then one more adds a row
      for (let i = 0; i < 6; i += 1) await hwp.keyboard.press('Tab')
      await hwp.keyboard.press('Tab')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(4)

      // Ctrl+Enter adds a row below, in one undo step
      await hwp.keyboard.press('Control+Enter')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(5)
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(4)
      await hwp.keyboard.press('Control+Enter')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(5)

      // Ctrl+Backspace deletes the current row, not the word before, in one undo step
      await hwp.keyboard.press('Control+Backspace')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(4)
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(5)
      await hwp.keyboard.press('Control+Backspace')
      await expect.poll(async () => (await listTables(frame)).tables[0].rows).toBe(4)

      table = await readTable(frame)
      expect(table.cells.filter((c) => c.row === 1).map((c) => c.text)).toEqual(['A1', 'B1', 'C1'])
      await screenshot(hwp, '02-rows-after-keys')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-rows')
    }
  })

  test('H/W equalizes, and the table-object keys act instead of typing', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-object',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 2)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)

      // A1, then two more lines in B1 so the first row is taller than the others
      await hwp.keyboard.type('A1')
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('B1')
      await hwp.keyboard.press('Enter')
      await hwp.keyboard.press('Enter')

      await installGeometryProbe(frame)
      await widenFirstColumn(frame)
      await hwp.waitForTimeout(400)
      const before = await geometry(frame)
      expect(before.dims).toMatchObject({ rowCount: 3, colCount: 2 })

      // a cell block over the whole table, as Hancom's F5 ×3 would select it
      await selectAllCells(hwp, frame)
      await expect.poll(() => wholeTableSelected(frame)).toBe(true)

      // H: all row heights equal, and no letter lands in a cell
      await hwp.keyboard.press('h')
      await expect
        .poll(
          async () => {
            const table = await geometry(frame)
            return new Set(table.bboxes.map((b) => Math.round(b.h))).size
          },
          { timeout: 10_000 },
        )
        .toBe(1)
      const afterH = await geometry(frame)
      expect(afterH.dims).toMatchObject({ rowCount: 3, colCount: 2 })
      // W: all column widths equal
      await hwp.keyboard.press('w')
      await expect
        .poll(
          async () => {
            const table = await geometry(frame)
            return new Set(table.bboxes.map((b) => Math.round(b.w))).size
          },
          { timeout: 10_000 },
        )
        .toBe(1)
      const afterW = await geometry(frame)
      expect(afterW.dims).toMatchObject({ rowCount: 3, colCount: 2 })
      const text = await readTable(frame)
      expect(text.cells.map((c) => c.text).join('')).not.toMatch(/[hw]/i)
      await screenshot(hwp, '03-equal-cells')

      // leave the cell block, then Esc in a cell selects the table object
      await hwp.keyboard.press('Escape')
      await hwp.keyboard.press('Escape')
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)

      // P: Table/Cell Properties
      await hwp.keyboard.press('p')
      await expect(frame.locator('.modal-overlay .dialog-title')).toContainText(
        'Table/Cell Properties',
      )
      await hwp.keyboard.press('Escape')
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)

      // L/C: the border and shading tabs of the studio's dialog
      await hwp.keyboard.press('l')
      await expect(frame.locator('.modal-overlay .dialog-title')).toContainText(
        'Cell Borders/Shading',
      )
      await expect(frame.locator('.modal-overlay .dialog-tab.active')).toHaveText('Borders')
      await hwp.keyboard.press('Escape')
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)

      await hwp.keyboard.press('c')
      await expect(frame.locator('.modal-overlay .dialog-tab.active')).toHaveText('Shading')
      await hwp.keyboard.press('Escape')
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)

      // T: flip the table in place; the text moves with its cells
      await hwp.keyboard.press('t')
      await hwp.waitForTimeout(500)
      await expect.poll(async () => (await readTable(frame)).rows).toBe(2)
      const flipped = await readTable(frame)
      expect(flipped.cols).toBe(3)
      expect(flipped.cells.find((c) => c.row === 1 && c.col === 1)?.text.trim()).toBe('A1')
      expect(flipped.cells.find((c) => c.row === 2 && c.col === 1)?.text.trim()).toBe('B1')
      await screenshot(hwp, '04-flipped')

      // Ctrl+E deletes the selected table
      await hwp.keyboard.press('Control+e')
      await expect.poll(async () => (await listTables(frame)).count).toBe(0)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-object')
    }
  })
})
