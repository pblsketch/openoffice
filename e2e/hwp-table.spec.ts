/**
 * HWP tables with Hancom Hangul's keys (docs/plans/hwp-table-parity.md, Phase 1A–2B).
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
  cells: {
    row: number
    col: number
    width: number
    height: number
    rowSpan?: number
    colSpan?: number
    verticalAlign?: number
    indent?: number
    bold?: boolean
  }[]
  bboxes: {
    cellIdx: number
    row: number
    col: number
    x: number
    y: number
    w: number
    h: number
  }[]
  block: boolean
  object: boolean
  phase: number
  range: { startRow: number; startCol: number; endRow: number; endCol: number } | null
  cell: { row: number; col: number; rowSpan?: number; colSpan?: number; cellIndex?: number } | null
  wrap: string
  texts: string[]
}

const STUDIO_IFRAME = '.hwp-editor-host iframe'

async function openHwp(app: ElectronApplication, page: Page): Promise<Page> {
  await page.locator('.quick-card', { hasText: 'AI HWP' }).click()
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
        const texts = []
        for (let i = 0; i < dims.cellCount; i += 1) {
          const info = services.wasm.getCellInfo(sec, ppi, ci, i)
          const props = services.wasm.getCellProperties(sec, ppi, ci, i)
          cells.push({
            row: info.row,
            col: info.col,
            width: props.width,
            height: props.height,
            rowSpan: info.rowSpan,
            colSpan: info.colSpan,
            verticalAlign: props.verticalAlign,
            indent: services.wasm.getCellParaPropertiesAt(sec, ppi, ci, i, 0).indent,
            bold: services.wasm.getCellCharPropertiesAt(sec, ppi, ci, i, 0, 0).bold,
          })
          const paragraphs = []
          const count = services.wasm.getCellParagraphCount(sec, ppi, ci, i)
          for (let p = 0; p < count; p += 1) {
            const length = services.wasm.getCellParagraphLength(sec, ppi, ci, i, p)
            paragraphs.push(services.wasm.getTextInCell(sec, ppi, ci, i, p, 0, length))
          }
          texts.push(paragraphs.join('\n'))
        }
        ;(window as unknown as { __e2eTable?: unknown }).__e2eTable = {
          dims,
          cells,
          bboxes: services.wasm.getTableCellBboxes(sec, ppi, ci),
          block: ih.cursor.isInCellSelectionMode?.() === true,
          object: ih.cursor.isInTableObjectSelection?.() === true,
          phase: ih.cursor.getCellSelectionPhase?.() ?? 0,
          range: ih.cursor.getSelectedCellRange?.() ?? null,
          cell:
            pos.cellIndex === undefined
              ? null
              : (() => {
                  const info = services.wasm.getCellInfo(sec, ppi, ci, pos.cellIndex)
                  return {
                    row: info.row,
                    col: info.col,
                    rowSpan: info.rowSpan,
                    colSpan: info.colSpan,
                    cellIndex: pos.cellIndex,
                  }
                })(),
          wrap: services.wasm.getTableProperties(sec, ppi, ci).textWrap,
          texts,
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

/** The whole table's width, read from the drawn boxes of its first row. */
function tableWidth(state: Geometry): number {
  return state.bboxes.filter((box) => box.row === 0).reduce((sum, box) => sum + box.w, 0)
}

/** The whole table's height, read from the drawn boxes of its first column. */
function tableHeight(state: Geometry): number {
  return state.bboxes.filter((box) => box.col === 0).reduce((sum, box) => sum + box.h, 0)
}

/** A real OS-style key on the HWP page, so the main process sees it (Playwright keys do not). */
async function sendKey(
  app: ElectronApplication,
  keyCode: string,
  modifiers: string[] = [],
): Promise<void> {
  await app.evaluate(
    ({ webContents }, [key, mods]) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('://hwp/'))
      if (!wc) throw new Error('no hwp webContents')
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods })
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods })
    },
    [keyCode, modifiers],
  )
}

async function clipboardText(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText())
}

async function inTable(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    return studio.automation.getContext().inTable
  })
}

/** Put keyboard focus back on the editor's hidden input without moving the caret. */
async function focusInput(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const input = document.querySelector('textarea') as HTMLTextAreaElement | null
    input?.focus()
  })
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

/** Put the caret in one table cell, using the boxes the geometry probe drew. */
async function clickCell(hwp: Page, frame: Frame, row: number, col: number): Promise<void> {
  const table = await geometry(frame)
  const cell = table.bboxes.find((box) => box.row === row && box.col === col)
  if (!cell) throw new Error(`no cell at ${row},${col}`)
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  const box = (await canvas.boundingBox())!
  await hwp.mouse.click(box.x + cell.x + cell.w / 2, box.y + cell.y + cell.h / 2)
}

/** Merge a rectangle through the AI plugin's own table call, without an AI request. */
async function mergeCells(
  frame: Frame,
  from: { row: number; col: number },
  to: { row: number; col: number },
): Promise<unknown> {
  return frame.evaluate(
    async ([start, end]) => {
      const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
      await studio.plugins.load('ieum-agent')
      return studio.plugins.invoke('ieum-agent', 'mergeCells', [1, start, end])
    },
    [from, to],
  )
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
      inTable: boolean
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
    ): { width: number; height: number; verticalAlign?: number }
    getCellParaPropertiesAt(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
      para: number,
    ): { indent?: number }
    getCellCharPropertiesAt(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
      para: number,
      offset: number,
    ): { bold?: boolean }
    getTableCellBboxes(
      sec: number,
      ppi: number,
      ci: number,
    ): { cellIdx: number; row: number; col: number; w: number; h: number }[]
    getCellParagraphCount(sec: number, ppi: number, ci: number, cell: number): number
    getCellParagraphLength(sec: number, ppi: number, ci: number, cell: number, para: number): number
    getTextInCell(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
      para: number,
      start: number,
      end: number,
    ): string
    getTableProperties(sec: number, ppi: number, ci: number): { textWrap: string }
  }
  getInputHandler(): {
    getSelectedTableRef(): { sec: number; ppi: number; ci: number } | null
    getCursorPosition(): {
      sectionIndex: number
      parentParaIndex?: number
      controlIndex?: number
      cellIndex?: number
    }
    cursor: {
      isInCellSelectionMode(): boolean
      isInTableObjectSelection(): boolean
      getCellSelectionPhase(): number
      getSelectedCellRange(): {
        startRow: number
        startCol: number
        endRow: number
        endCol: number
      } | null
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

      // L/C: the table's own border and fill, on those tabs of Table/Cell Properties
      // (Hangul: 개체 속성의 테두리·채우기 탭)
      await hwp.keyboard.press('l')
      await expect(frame.locator('.modal-overlay .dialog-title')).toContainText(
        'Table/Cell Properties',
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

  test('Phase 1B cell keys: F7/F8, Alt+arrow, Ctrl+Tab, block copy and Shift+Esc', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-1b-cells',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)

      // X1 in A1, X2 in A2, X3 in A3
      await hwp.keyboard.type('X1')
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('X2')
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('X3')
      expect((await geometry(frame)).texts.filter((text) => text !== '')).toEqual([
        'X1',
        'X2',
        'X3',
      ])

      // F7: the column of the current cell
      await hwp.keyboard.press('F7')
      let state = await geometry(frame)
      expect(state.block).toBe(true)
      expect(state.range).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 })

      // Alt+arrow in the block: the column grows, its neighbor shrinks, table keeps its size
      const beforeResize = state
      await hwp.keyboard.press('Alt+ArrowRight')
      await expect
        .poll(async () => (await geometry(frame)).bboxes[0].w)
        .toBeGreaterThan(beforeResize.bboxes[0].w + 2)
      const afterResize = await geometry(frame)
      expect(afterResize.bboxes[1].w).toBeLessThan(beforeResize.bboxes[1].w - 2)
      expect(Math.round(afterResize.bboxes[0].w + afterResize.bboxes[1].w)).toBe(
        Math.round(beforeResize.bboxes[0].w + beforeResize.bboxes[1].w),
      )

      // F8: the whole row of the current cell
      await hwp.keyboard.press('F8')
      state = await geometry(frame)
      expect(state.range?.startRow).toBe(state.range?.endRow)
      expect(state.range).toMatchObject({ startCol: 0, endCol: 2 })
      // back to the column block for the copy tests
      await hwp.keyboard.press('F7')

      // Ctrl+C copies the cells as tab-separated rows
      await focusInput(frame)
      await sendKey(app, 'C', ['control'])
      await expect
        .poll(async () => (await clipboardText(app)).replace(/\r\n/g, '\n'))
        .toBe('X1\nX2\nX3')

      // Ctrl+E empties the block, one undo step puts it back
      await focusInput(frame)
      await sendKey(app, 'E', ['control'])
      await expect
        .poll(async () => (await geometry(frame)).texts.every((text) => text === ''))
        .toBe(true)
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).texts[0]).toBe('X1')

      // Ctrl+X copies and empties, one undo step puts it back
      await focusInput(frame)
      await sendKey(app, 'X', ['control'])
      await expect
        .poll(async () => (await geometry(frame)).texts.every((text) => text === ''))
        .toBe(true)
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).texts[6]).toBe('X3')

      // Alt+arrow outside a block moves one cell
      await focusInput(frame)
      await sendKey(app, 'Escape')
      await hwp.keyboard.press('Alt+ArrowUp')
      await expect.poll(async () => (await geometry(frame)).cell).toMatchObject({ row: 1, col: 0 })

      // Ctrl+Tab inserts a tab character in the cell
      await focusInput(frame)
      await sendKey(app, 'Tab', ['control'])
      await expect.poll(async () => (await geometry(frame)).texts[3]).toContain('\t')

      // Shift+Esc leaves the table
      await hwp.keyboard.press('Shift+Escape')
      await expect.poll(() => inTable(frame)).toBe(false)
      await screenshot(hwp, '05-cell-keys')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-1b-cells')
    }
  })

  test('Phase 1C cell block: Ctrl+arrow changes whole rows/columns and table size', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-1c-block-size',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)

      // F7: the current column. Ctrl+Right widens the whole column, and the table with it.
      await hwp.keyboard.press('F7')
      const beforeWidth = await geometry(frame)
      expect(beforeWidth.range).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 })
      const widthBefore = tableWidth(beforeWidth)
      await hwp.keyboard.press('Control+ArrowRight')
      await expect
        .poll(async () => tableWidth(await geometry(frame)))
        .toBeGreaterThan(widthBefore + 2)
      const afterWidth = await geometry(frame)
      expect(afterWidth.bboxes.find((box) => box.row === 0 && box.col === 0)!.w).toBeGreaterThan(
        beforeWidth.bboxes.find((box) => box.row === 0 && box.col === 0)!.w + 2,
      )
      // the other columns keep their own widths; the table, not the neighbor, takes the change
      expect(afterWidth.bboxes.find((box) => box.row === 0 && box.col === 1)!.w).toBeCloseTo(
        beforeWidth.bboxes.find((box) => box.row === 0 && box.col === 1)!.w,
        1,
      )

      // F8: the current row. Ctrl+Down makes the row taller and the table taller.
      await hwp.keyboard.press('F8')
      const beforeHeight = await geometry(frame)
      expect(beforeHeight.range).toMatchObject({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 })
      const heightBefore = tableHeight(beforeHeight)
      await hwp.keyboard.press('Control+ArrowDown')
      await expect
        .poll(async () => tableHeight(await geometry(frame)))
        .toBeGreaterThan(heightBefore + 2)

      // one snapshot per key: undo puts the last row height back
      await hwp.keyboard.press('Control+z')
      await expect
        .poll(async () => Math.round(tableHeight(await geometry(frame))))
        .toBe(Math.round(heightBefore))

      await screenshot(hwp, '06-ctrl-arrow-row-column')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-1c-block-size')
    }
  })

  test('Phase 2 single cell: Shift+arrow moves one boundary, keeps the table size', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-2a-cell-size',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)

      // F5 selects the current cell; Shift+Right moves its right boundary only.
      await hwp.keyboard.press('F5')
      const before = await geometry(frame)
      expect(before.block).toBe(true)
      expect(before.range).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
      const widthBefore = tableWidth(before)
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => (await geometry(frame)).bboxes.find((box) => box.cellIdx === 0)!.w)
        .toBeGreaterThan(before.bboxes.find((box) => box.cellIdx === 0)!.w + 2)
      const first = await geometry(frame)
      expect(first.bboxes.find((box) => box.cellIdx === 1)!.w).toBeLessThan(
        before.bboxes.find((box) => box.cellIdx === 1)!.w - 2,
      )
      expect(Math.abs(tableWidth(first) - widthBefore)).toBeLessThan(2)

      // a second press moves the same boundary again, not the newly split neighbor
      const firstWidth = first.bboxes.find((box) => box.cellIdx === 0)!.w
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => (await geometry(frame)).bboxes.find((box) => box.cellIdx === 0)!.w)
        .toBeGreaterThan(firstWidth + 2)
      expect(Math.abs(tableWidth(await geometry(frame)) - widthBefore)).toBeLessThan(2)

      // one snapshot per press: undo returns the first step
      await hwp.keyboard.press('Control+z')
      await expect
        .poll(async () => (await geometry(frame)).bboxes.find((box) => box.cellIdx === 0)!.w)
        .toBeCloseTo(firstWidth, 0)

      await screenshot(hwp, '07-single-cell-resize')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-2a-cell-size')
    }
  })

  test('Phase 2 merged cell: insert below the cell stays below the merge', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-2b-merged-row',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 6, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)
      const merged = await mergeCells(frame, { row: 3, col: 1 }, { row: 6, col: 2 })
      expect(merged).toMatchObject({ ok: true })
      await hwp.waitForTimeout(300)
      let state = await geometry(frame)
      expect(state.dims).toMatchObject({ rowCount: 6, colCount: 3 })
      expect(state.cells.find((cell) => cell.row === 2 && cell.col === 0)).toMatchObject({
        rowSpan: 4,
        colSpan: 2,
      })

      // Shift+Right on A1 above a cell merged across rows moves A1's boundary only, as Hangul
      // does (engine patch 0027 keeps the merged cell in its place); one undo puts it back
      await clickCell(hwp, frame, 0, 0)
      await hwp.keyboard.press('F5')
      const mergedTableBefore = await geometry(frame)
      expect(mergedTableBefore.block).toBe(true)
      const a1Width = (g: typeof mergedTableBefore) =>
        g.cells.find((cell) => cell.row === 0 && cell.col === 0)!.width
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => a1Width(await geometry(frame)))
        .toBeGreaterThan(a1Width(mergedTableBefore))
      const mergedTableAfter = await geometry(frame)
      // the boundary no longer lines up with the rows below: one more column line
      expect(mergedTableAfter.dims.colCount).toBe(mergedTableBefore.dims.colCount + 1)
      expect(mergedTableAfter.cells.find((cell) => cell.row === 2 && cell.col === 0)).toMatchObject(
        {
          rowSpan: 4,
        },
      )
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).dims).toEqual(mergedTableBefore.dims)
      await hwp.keyboard.press('Escape')

      // the merged cell itself puts the new row after its last row, not through it
      await clickCell(hwp, frame, 2, 0)
      state = await geometry(frame)
      expect(state.cell).toMatchObject({ row: 2, col: 0 })
      await hwp.keyboard.press('Control+Enter')
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(7)
      state = await geometry(frame)
      expect(state.cells.find((cell) => cell.row === 2 && cell.col === 0)?.rowSpan).toBe(4)
      expect(state.cells.find((cell) => cell.row === 6 && cell.col === 0)).toMatchObject({
        colSpan: 2,
      })
      expect(state.cells.some((cell) => cell.row === 6 && cell.col === 2)).toBe(true)

      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(6)

      // the menu command uses the same row and keeps the new row's left columns merged
      await clickCell(hwp, frame, 2, 0)
      await frame.evaluate(() => {
        const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
        studio.automation.execute('table:insert-row-below')
      })
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(7)
      state = await geometry(frame)
      expect(state.cells.find((cell) => cell.row === 6 && cell.col === 0)).toMatchObject({
        colSpan: 2,
      })
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(6)

      // a plain cell inside the merge's rows grows the merge, as Hangul does
      await clickCell(hwp, frame, 2, 2)
      await hwp.keyboard.press('Control+Enter')
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(7)
      state = await geometry(frame)
      expect(state.cells.find((cell) => cell.row === 2 && cell.col === 0)?.rowSpan).toBe(5)

      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await geometry(frame)).dims.rowCount).toBe(6)

      await screenshot(hwp, '08-merged-row-below')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-2b-merged-row')
    }
  })

  test('Phase 1B table object: F5 goes to the first cell', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-1b-object',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 2)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)
      await hwp.keyboard.type('A1')
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('B1')

      // Esc in a cell selects the table object
      await focusInput(frame)
      await sendKey(app, 'Escape')
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)

      // F5 goes to the first cell, in a cell block
      await hwp.keyboard.press('F5')
      const state = await geometry(frame)
      expect(state.block).toBe(true)
      expect(state.object).toBe(false)
      expect(state.range).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-1b-object')
    }
  })

  test('Phase 1B table object size, wrap and Shift+F5', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-1b-object-size',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 2)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)
      await hwp.keyboard.type('A1')
      await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('B1')

      // Esc in a cell selects the table object
      await focusInput(frame)
      await sendKey(app, 'Escape')
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)

      // Shift+arrow grows the table
      const beforeGrow = await geometry(frame)
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => (await geometry(frame)).bboxes[0].w)
        .toBeGreaterThan(beforeGrow.bboxes[0].w + 2)
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)

      // Shift+Home/End set the table in front of / behind the text
      await hwp.keyboard.press('Shift+Home')
      await expect.poll(async () => (await geometry(frame)).wrap).toBe('InFrontOfText')
      await hwp.keyboard.press('Shift+End')
      await expect.poll(async () => (await geometry(frame)).wrap).toBe('BehindText')

      // Shift+PageUp/Down are sent; a lone table has no other object to trade order with
      await hwp.keyboard.press('Shift+PageUp')
      await hwp.keyboard.press('Shift+PageDown')
      expect((await listTables(frame)).count).toBe(1)

      // Shift+F5 in a cell opens a block ready to grow
      await focusInput(frame)
      await sendKey(app, 'Escape')
      await expect.poll(() => inTable(frame)).toBe(false)
      const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
      const box = (await canvas.boundingBox())!
      for (let i = 0; i < 3; i += 1) {
        await hwp.mouse.click(box.x + 160, box.y + 145)
        await hwp.waitForTimeout(200)
        if (!(await geometry(frame)).object) break
        await focusInput(frame)
        await sendKey(app, 'Escape')
        await hwp.waitForTimeout(200)
      }
      await focusInput(frame)
      await sendKey(app, 'F5', ['shift'])
      await expect.poll(async () => (await geometry(frame)).block).toBe(true)
      const state = await geometry(frame)
      expect(state.phase).toBe(2)
      expect(state.range?.startRow).toBe(state.range?.endRow)
      await screenshot(hwp, '06-object-keys')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-1b-object-size')
    }
  })

  test("a cell block's Hancom keys: P/L/C/B/F/A, block formulas, Enter, F3, Ctrl+Shift+Tab", async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-block-letters',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)

      await insertTable(frame, 3, 3)
      await expect.poll(async () => (await listTables(frame)).count).toBe(1)
      await installGeometryProbe(frame)

      // 1 in A1, 3 in A2, A3 empty
      await hwp.keyboard.type('1')
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('Tab')
      await hwp.keyboard.type('3')
      const column = async () => {
        const { texts } = await geometry(frame)
        return [texts[0], texts[3], texts[6]]
      }
      expect(await column()).toEqual(['1', '3', ''])

      // F7: the first column. Ctrl+Shift+A writes the block average under it, block kept
      await hwp.keyboard.press('F7')
      await expect.poll(async () => (await geometry(frame)).block).toBe(true)
      await hwp.keyboard.press('Control+Shift+A')
      await expect.poll(column).toEqual(['1', '3', '2'])
      expect((await geometry(frame)).block).toBe(true)
      await hwp.keyboard.press('Control+z')
      await expect.poll(column).toEqual(['1', '3', ''])

      // A: 표 자동 채우기 goes on by the step, one undo step (the studio's undo of the block
      // calculation does not bring the block back, so take the column again)
      await hwp.keyboard.press('F7')
      await expect.poll(async () => (await geometry(frame)).block).toBe(true)
      await hwp.keyboard.press('a')
      await expect.poll(column).toEqual(['1', '3', '5'])
      await hwp.keyboard.press('Control+z')
      await expect.poll(column).toEqual(['1', '3', ''])
      await hwp.keyboard.press('a')
      await expect.poll(column).toEqual(['1', '3', '5'])
      expect((await geometry(frame)).block).toBe(true)

      // L/C/B/F: 셀 테두리/배경 each cell on its own and as one, on the border or shading tab
      for (const [letter, tab] of [
        ['l', 'Borders'],
        ['c', 'Shading'],
        ['b', 'Borders'],
        ['f', 'Shading'],
      ] as const) {
        await hwp.keyboard.press(letter)
        await expect(frame.locator('.modal-overlay .dialog-title'), letter).toContainText(
          'Cell Borders/Shading',
        )
        await expect(frame.locator('.modal-overlay .dialog-tab.active'), letter).toHaveText(tab)
        await hwp.keyboard.press('Escape')
        await expect(frame.locator('.modal-overlay')).toHaveCount(0)
        await focusInput(frame)
        await expect.poll(async () => (await geometry(frame)).block, letter).toBe(true)
      }
      expect(await column()).toEqual(['1', '3', '5'])

      // P: 표/셀 속성 on its cell tab; what is set there goes to every cell of the block
      const aligned = async () => (await geometry(frame)).cells.map((cell) => cell.verticalAlign)
      const alignedBefore = await aligned()
      expect(alignedBefore.includes(2)).toBe(false)
      await hwp.keyboard.press('p')
      await expect(frame.locator('.modal-overlay .dialog-title')).toContainText(
        'Table/Cell Properties',
      )
      await expect(frame.locator('.modal-overlay .dialog-tab.active')).toHaveText('Cell')
      // 세로 정렬: 아래쪽
      await frame
        .locator('.modal-overlay .dialog-tab-panel.active .dialog-btn-group button', {
          hasText: '아래쪽',
        })
        .first()
        .click()
      await frame.locator('.modal-overlay .dialog-btn-primary').click()
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)
      await expect.poll(aligned).toEqual(alignedBefore.map((value, i) => (i % 3 === 0 ? 2 : value)))
      expect(await column()).toEqual(['1', '3', '5'])
      await hwp.keyboard.press('Control+z')
      await expect.poll(aligned).toEqual(alignedBefore)

      // Alt+L opens 글자 모양 with the block kept, so it would format every cell (the studio's
      // undo of the properties does not bring the block back, so take the column again)
      await focusInput(frame)
      await hwp.keyboard.press('F7')
      await expect.poll(async () => (await geometry(frame)).block).toBe(true)
      const bolds = async () => (await geometry(frame)).cells.map((cell) => cell.bold === true)
      expect((await bolds()).some(Boolean)).toBe(false)
      await hwp.keyboard.press('Alt+l')
      await frame.locator('.modal-overlay button[title="Bold"]').click()
      await frame.locator('.modal-overlay .dialog-btn-primary').click()
      await expect(frame.locator('.modal-overlay')).toHaveCount(0)
      await expect.poll(bolds).toEqual([true, false, false, true, false, false, true, false, false])
      await focusInput(frame)
      expect((await geometry(frame)).block).toBe(true)

      // Enter goes back to editing the cell and puts no line break in it
      await hwp.keyboard.press('Enter')
      await expect.poll(async () => (await geometry(frame)).block).toBe(false)
      expect(await inTable(frame)).toBe(true)
      expect((await geometry(frame)).texts.join('')).not.toContain('\n')

      // F5 then F3: the block grows with the arrows (phase 2)
      await hwp.keyboard.press('F5')
      await expect.poll(async () => (await geometry(frame)).phase).toBe(1)
      await hwp.keyboard.press('F3')
      await expect.poll(async () => (await geometry(frame)).phase).toBe(2)
      await hwp.keyboard.press('Escape')
      await expect.poll(async () => (await geometry(frame)).block).toBe(false)

      // Ctrl+Shift+Tab in a cell: 빠른 내어쓰기 (the shell switches tabs only when the editor
      // does not take the key)
      await clickCell(hwp, frame, 1, 1)
      await hwp.keyboard.type('ab cd')
      await hwp.keyboard.press('Home')
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('ArrowRight')
      const caret = (await geometry(frame)).cell!.cellIndex!
      expect((await geometry(frame)).cells[caret].indent ?? 0).toBe(0)
      await focusInput(frame)
      await sendKey(app, 'Tab', ['control', 'shift'])
      await expect.poll(async () => (await geometry(frame)).cells[caret].indent ?? 0).not.toBe(0)
      await screenshot(hwp, '07-block-letters')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-block-letters')
    }
  })

  test('merged tables: Ctrl/Alt/Shift+arrow, H/W, the border drag and the table size keep a proper grid', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-table-merged-resize',
    })
    const { app, page } = launched
    try {
      const hwp = await openHwp(app, page)
      const frame = await studioFrame(hwp)
      await focusEditor(hwp)
      const toast = () =>
        frame.evaluate(
          () => document.getElementById('rhwp-toast-container')?.textContent?.trim() ?? '',
        )
      /** A fresh 3×3 table, merged as given (1-based, as the AI tool takes them). */
      const fresh = async (merges: [number, number, number, number][]) => {
        if ((await listTables(frame)).count > 0) {
          await frame.evaluate(async () => {
            const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
            await studio.plugins.load('ieum-agent')
            await studio.plugins.invoke('ieum-agent', 'deleteTable', [1])
          })
          await expect.poll(async () => (await listTables(frame)).count).toBe(0)
          await focusEditor(hwp)
        }
        await insertTable(frame, 3, 3)
        await expect.poll(async () => (await listTables(frame)).count).toBe(1)
        await installGeometryProbe(frame)
        for (const [r0, c0, r1, c1] of merges) {
          expect(await mergeCells(frame, { row: r0, col: c0 }, { row: r1, col: c1 })).toMatchObject(
            {
              ok: true,
            },
          )
        }
        await hwp.waitForTimeout(300)
      }
      /** Every cell starts and ends on the grid lines the cells beside it use. */
      const lines = async () => {
        const state = await geometry(frame)
        const cols: number[] = []
        const rows: number[] = []
        state.cells.forEach((cell, i) => {
          const box = state.bboxes.find((b) => b.cellIdx === i)!
          const marks: [number[], number, number][] = [
            [cols, cell.col, box.x],
            [cols, cell.col + (cell.colSpan ?? 1), box.x + box.w],
            [rows, cell.row, box.y],
            [rows, cell.row + (cell.rowSpan ?? 1), box.y + box.h],
          ]
          for (const [list, index, at] of marks) {
            if (list[index] === undefined) list[index] = at
            else expect(Math.abs(list[index] - at), `line ${index}`).toBeLessThan(0.6)
          }
        })
        return { cols, rows, state }
      }
      // across the top (A1:B1) and down the right (C2:C3)
      const merges: [number, number, number, number][] = [
        [1, 1, 1, 2],
        [2, 3, 3, 3],
      ]

      // Ctrl+Right on column A: the column and the merged cell over it widen with the table
      await fresh(merges)
      let before = await lines()
      await clickCell(hwp, frame, 2, 0)
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('Control+ArrowRight')
      await expect.poll(async () => (await lines()).cols[1]).toBeGreaterThan(before.cols[1] + 2)
      let after = await lines()
      expect(after.cols[3] - after.cols[0]).toBeGreaterThan(before.cols[3] - before.cols[0] + 2)
      expect(after.cols[2] - after.cols[1]).toBeCloseTo(before.cols[2] - before.cols[1], 0)
      expect(await toast()).not.toContain('merged')
      // Ctrl+Down on row 3 draws it taller at the first press, from the height it draws at
      await hwp.keyboard.press('Control+ArrowDown')
      await expect
        .poll(async () => {
          const now = await lines()
          return now.rows[3] - now.rows[2]
        })
        .toBeGreaterThan(before.rows[3] - before.rows[2] + 2)
      await lines()
      await hwp.keyboard.press('Escape')

      // Alt+Right moves the boundary after column A; the merged cell over it and the table
      // keep their width
      await fresh(merges)
      before = await lines()
      await clickCell(hwp, frame, 2, 0)
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('Alt+ArrowRight')
      await expect.poll(async () => (await lines()).cols[1]).toBeGreaterThan(before.cols[1] + 2)
      after = await lines()
      expect(after.cols[3] - after.cols[0]).toBeCloseTo(before.cols[3] - before.cols[0], 0)
      expect(after.cols[2]).toBeCloseTo(before.cols[2], 0)
      // one undo step puts it back
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => (await lines()).cols[1]).toBeCloseTo(before.cols[1], 0)
      await hwp.keyboard.press('Escape')

      // Shift+Right on one cell beside a cell merged down (C2:C3): A3 widens, B3 gives way, the
      // rows above keep their lines (the engine's patch 0027, as Hangul writes it)
      await clickCell(hwp, frame, 2, 0)
      await hwp.keyboard.press('F5')
      const a3 = () =>
        geometry(frame).then((g) => g.bboxes.find((b) => b.row === 2 && b.col === 0)!)
      const a3Before = await a3()
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect.poll(async () => (await a3()).w).toBeGreaterThan(a3Before.w + 2)
      after = await lines()
      expect(after.cols[after.cols.length - 1] - after.cols[0]).toBeCloseTo(
        before.cols[3] - before.cols[0],
        0,
      )
      await hwp.keyboard.press('Escape')

      // Shift+Down on C1 above the cell merged down: C1 draws taller from the height it draws at,
      // C2:C3 gives way, A1:B1 stays (the rows split, as in Hangul)
      await fresh(merges)
      before = await lines()
      const box = (row: number, col: number) =>
        geometry(frame).then((g) => g.bboxes.find((b) => b.row === row && b.col === col)!)
      const c1 = await box(0, 2)
      const top = await box(0, 0)
      await clickCell(hwp, frame, 0, 2)
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('Shift+ArrowDown')
      await expect.poll(async () => (await box(0, 2)).h).toBeGreaterThan(c1.h + 2)
      after = await lines()
      expect((await box(0, 0)).h).toBeCloseTo(top.h, 0)
      expect(after.rows[after.rows.length - 1] - after.rows[0]).toBeCloseTo(
        before.rows[3] - before.rows[0],
        0,
      )
      await hwp.keyboard.press('Escape')

      // a plain drag down on the border under A2 grows row 2 by the drag, and the table with it
      // (Hangul's help: 아래쪽으로 끌면 표의 크기가 늘어납니다); the studio's own stopped at 1 mm
      await fresh(merges)
      before = await lines()
      {
        const a2 = await box(1, 0)
        const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
        const origin = (await canvas.boundingBox())!
        const x = origin.x + a2.x + a2.w / 2
        const y = origin.y + a2.y + a2.h
        await hwp.mouse.move(x, y - 6)
        await hwp.mouse.move(x, y, { steps: 3 })
        await hwp.waitForTimeout(150)
        await hwp.mouse.down()
        await hwp.mouse.move(x, y + 30, { steps: 6 })
        await hwp.mouse.up()
      }
      await expect
        .poll(async () => {
          const now = await lines()
          return now.rows[2] - now.rows[1]
        })
        .toBeGreaterThan(before.rows[2] - before.rows[1] + 20)
      after = await lines()
      expect(after.rows[3] - after.rows[0]).toBeGreaterThan(before.rows[3] - before.rows[0] + 20)
      // the row below keeps its height
      expect(after.rows[3] - after.rows[2]).toBeCloseTo(before.rows[3] - before.rows[2], 0)

      // Alt+drag down on the border under A1:B1: the boundary moves as Alt+Down moves it; the
      // last row, which the boundary does not touch, keeps its height (the studio's own Alt drag
      // worked from the stored 282 and grew every row a little)
      before = await lines()
      {
        const a2 = await box(1, 0)
        const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
        const origin = (await canvas.boundingBox())!
        const x = origin.x + a2.x + a2.w / 2
        const y = origin.y + a2.y
        await hwp.mouse.move(x, y + 6)
        await hwp.mouse.move(x, y, { steps: 3 })
        await hwp.waitForTimeout(150)
        await hwp.keyboard.down('Alt')
        await hwp.mouse.down()
        await hwp.mouse.move(x, y + 8, { steps: 4 })
        await hwp.mouse.up()
        await hwp.keyboard.up('Alt')
      }
      await expect
        .poll(async () => {
          const now = await lines()
          return now.rows[1] - now.rows[0]
        })
        .toBeGreaterThan(before.rows[1] - before.rows[0] + 2)
      after = await lines()
      expect(after.rows[3] - after.rows[2]).toBeCloseTo(before.rows[3] - before.rows[2], 0)

      // H and W over the whole table, as Hangul writes them: the cells of each row (W) and of
      // each column (H) come out equally sized, so the grid splits where rows differ
      await fresh(merges)
      // column A wider first (the probe's widening command assumes a table without merges)
      await clickCell(hwp, frame, 2, 0)
      await hwp.keyboard.press('F5')
      for (let i = 0; i < 4; i += 1) await hwp.keyboard.press('Control+ArrowRight')
      await hwp.keyboard.press('Escape')
      // the whole table: F5 three times (a drag to the last listed cell would stop short of
      // the merged C2:C3)
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('F5')
      await expect.poll(() => wholeTableSelected(frame)).toBe(true)
      /** The largest spread of the sizes of the cells that share a row (or a column). */
      const spread = async (axis: 'row' | 'col', only?: number) => {
        const { state } = await lines()
        let worst = 0
        const count = Math.max(
          ...state.cells.map((c) =>
            axis === 'row' ? c.row + (c.rowSpan ?? 1) : c.col + (c.colSpan ?? 1),
          ),
        )
        for (let line = 0; line < count; line += 1) {
          if (only !== undefined && line !== only) continue
          const sizes = state.cells
            .map((c, i) => ({ c, b: state.bboxes.find((b) => b.cellIdx === i)! }))
            .filter(({ c }) =>
              axis === 'row'
                ? line >= c.row && line < c.row + (c.rowSpan ?? 1)
                : line >= c.col && line < c.col + (c.colSpan ?? 1),
            )
            .map(({ b }) => (axis === 'row' ? b.w : b.h))
          worst = Math.max(worst, Math.max(...sizes) - Math.min(...sizes))
        }
        return worst
      }
      const wideBefore = await lines()
      await hwp.keyboard.press('w')
      await expect.poll(() => spread('row')).toBeLessThan(1)
      let even = await lines()
      expect(even.cols[even.cols.length - 1] - even.cols[0]).toBeCloseTo(
        wideBefore.cols[wideBefore.cols.length - 1] - wideBefore.cols[0],
        0,
      )
      // the top row's two cells against the three below: four columns now
      expect(even.cols.length).toBe(5)
      await hwp.keyboard.press('Escape')
      await focusInput(frame)
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('F5')
      await expect.poll(() => wholeTableSelected(frame)).toBe(true)
      await hwp.keyboard.press('h')
      // after W split the columns, a column whose top cell an earlier column already placed
      // cannot share equally too; the first column always can
      await expect.poll(() => spread('col', 0)).toBeLessThan(1)
      even = await lines()
      await hwp.keyboard.press('Escape')
      await focusInput(frame)

      // Shift+Right on the selected table: every column wider, merged cells by what they span
      // (four columns since W split them: four steps)
      before = await lines()
      const tableWidth = (cols: number[]) => cols[cols.length - 1] - cols[0]
      await sendKey(app, 'Escape')
      await expect.poll(() => inTableObjectSelection(frame)).toBe(true)
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => tableWidth((await lines()).cols))
        .toBeGreaterThan(tableWidth(before.cols) + 6)
      await lines()
      await hwp.keyboard.press('Escape')

      // a table merged across columns only: Shift+Right moves one cell's boundary, as Hangul does
      await fresh([[1, 1, 1, 2]])
      before = await lines()
      await clickCell(hwp, frame, 2, 0)
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('Shift+ArrowRight')
      await expect
        .poll(async () => {
          const state = await geometry(frame)
          return state.bboxes.find((b) => b.row === 2 && b.col === 0)!.w
        })
        .toBeGreaterThan(before.state.bboxes.find((b) => b.row === 2 && b.col === 0)!.w + 2)
      const shifted = await geometry(frame)
      const width = (row: number) =>
        shifted.bboxes.filter((b) => b.row === row).reduce((sum, b) => sum + b.w, 0)
      expect(width(0)).toBeCloseTo(width(1), 0)
      expect(width(1)).toBeCloseTo(width(2), 0)
      await screenshot(hwp, '09-merged-resize')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-table-merged-resize')
    }
  })
})
