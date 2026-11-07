/**
 * Hancom's "셀 너비를 같게"(W) and "셀 높이를 같게"(H) on part of a table (issue #299) in the
 * built app: only the block's cells come out equal, every other cell keeps the size it stores,
 * one undo step puts it back, and the sizes come back the same from HWP and HWPX. A block whose
 * rows draw taller than they store is left alone with the reason.
 *
 * Cells are told apart by their text, so a grid the block splits is still read cell by cell.
 * The whole-table case is in hwp-table.spec.ts ('H/W equalizes …').
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Frame, Page } from '@playwright/test'
import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ARTIFACTS_DIR, closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const STUDIO_IFRAME = '.hwp-editor-host iframe'
/** The cells' texts, row by row: a1 b1 c1 / a2 b2 c2 / a3 b3 c3. */
const LABELS = ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3']

interface Cell {
  text: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  width: number
  height: number
}

interface Table {
  cells: Cell[]
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
  range: { startRow: number; startCol: number; endRow: number; endCol: number } | null
}

/** The sizes each cell stores, by its text. */
type Sizes = Record<string, { width: number; height: number }>

const sizesOf = (table: Table): Sizes =>
  Object.fromEntries(
    table.cells.map((cell) => [cell.text, { width: cell.width, height: cell.height }]),
  )

interface TabsApiOnWindow {
  aiOfficeTabs: {
    list(): Promise<Array<{ id: string; kind: string }>>
    close(id: string): Promise<void>
  }
  aiOffice: { openPath(path: string): Promise<void> }
}

async function hwpPage(app: ElectronApplication): Promise<Page> {
  const hwp = await waitForPageWithUrl(app, '://hwp/')
  await hwp.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  await expect(hwp.frameLocator(STUDIO_IFRAME).locator('[data-cmd="ext:ieum-save"]')).toHaveCount(1)
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

/**
 * Test commands on the automation surface: read the table (the one the caret or block is in,
 * else the first in the body), and store new sizes for some cells in one snapshot.
 */
async function installTableProbe(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const scope = window as unknown as {
      rhwpStudio: StudioLike
      __e2eTableProbe?: boolean
      __e2eTable?: unknown
      __e2eResize?: { cellIdx: number; widthDelta?: number; heightDelta?: number }[]
    }
    if (scope.__e2eTableProbe) return
    const tableAt = (services: Services) => {
      const ih = services.getInputHandler()
      const ref = ih.getSelectedTableRef()
      const pos = ih.getCursorPosition()
      if (ref) return ref
      if (pos.parentParaIndex !== undefined && pos.controlIndex !== undefined) {
        return { sec: pos.sectionIndex, ppi: pos.parentParaIndex, ci: pos.controlIndex }
      }
      // the first paragraph also holds the section's own controls before the table
      for (let ppi = 0; ppi < 50; ppi += 1) {
        for (let ci = 0; ci < 8; ci += 1) {
          try {
            if (services.wasm.getTableDimensions(0, ppi, ci).cellCount > 0)
              return { sec: 0, ppi, ci }
          } catch {
            // no table at this control
          }
        }
      }
      throw new Error('no table')
    }
    scope.rhwpStudio.automation.registerCommand({
      id: 'ext:e2e-table-read',
      label: 'E2E table read',
      execute(services) {
        const ih = services.getInputHandler()
        const { sec, ppi, ci } = tableAt(services)
        const dims = services.wasm.getTableDimensions(sec, ppi, ci)
        const cells = []
        for (let i = 0; i < dims.cellCount; i += 1) {
          const info = services.wasm.getCellInfo(sec, ppi, ci, i)
          const props = services.wasm.getCellProperties(sec, ppi, ci, i)
          const paragraphs = []
          const count = services.wasm.getCellParagraphCount(sec, ppi, ci, i)
          for (let p = 0; p < count; p += 1) {
            const length = services.wasm.getCellParagraphLength(sec, ppi, ci, i, p)
            paragraphs.push(services.wasm.getTextInCell(sec, ppi, ci, i, p, 0, length))
          }
          cells.push({
            text: paragraphs.join('\n').trim(),
            row: info.row,
            col: info.col,
            rowSpan: info.rowSpan,
            colSpan: info.colSpan,
            width: props.width,
            height: props.height,
          })
        }
        scope.__e2eTable = {
          cells,
          bboxes: services.wasm.getTableCellBboxes(sec, ppi, ci),
          block: ih.cursor.isInCellSelectionMode?.() === true,
          range: ih.cursor.getSelectedCellRange?.() ?? null,
        }
      },
    })
    scope.rhwpStudio.automation.registerCommand({
      id: 'ext:e2e-table-resize',
      label: 'E2E table resize',
      execute(services) {
        const ih = services.getInputHandler()
        const { sec, ppi, ci } = tableAt(services)
        ih.executeOperation({
          kind: 'snapshot',
          operationType: 'e2eResizeCells',
          operation: (wasm) => {
            wasm.resizeTableCells(sec, ppi, ci, scope.__e2eResize!)
            return ih.getCursorPosition()
          },
        })
      },
    })
    scope.__e2eTableProbe = true
  })
}

async function readTable(frame: Frame): Promise<Table> {
  return frame.evaluate(() => {
    const scope = window as unknown as { rhwpStudio: StudioLike; __e2eTable?: Table }
    scope.rhwpStudio.automation.execute('ext:e2e-table-read')
    return scope.__e2eTable!
  })
}

/** Grows cells by these amounts (HWPUNIT), as stored sizes, in one undo step. */
async function resizeCells(
  frame: Frame,
  updates: { cellIdx: number; widthDelta?: number; heightDelta?: number }[],
): Promise<void> {
  await frame.evaluate((list) => {
    const scope = window as unknown as { rhwpStudio: StudioLike; __e2eResize?: unknown }
    scope.__e2eResize = list
    scope.rhwpStudio.automation.execute('ext:e2e-table-resize')
  }, updates)
}

/** A 3×3 table through the editor's Table menu, its cells written a1 … c3 with Tab. */
async function tableWithLabels(hwp: Page, frame: Frame): Promise<void> {
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  await canvas.waitFor({ timeout: 60_000 })
  await frame.evaluate(() => (document.querySelector('textarea') as HTMLTextAreaElement)?.focus())
  await frame.locator('#menu-bar .menu-item[data-menu="table"] .menu-title').click()
  await frame.locator('.md-item[data-cmd="table:create"]').click()
  const grid = frame.locator('div[data-row="2"][data-col="2"]')
  await grid.hover()
  await grid.click()
  await installTableProbe(frame)
  await expect.poll(async () => (await readTable(frame)).cells.length).toBe(9)
  for (const [i, label] of LABELS.entries()) {
    if (i > 0) await hwp.keyboard.press('Tab')
    await hwp.keyboard.type(label)
  }
  await expect
    .poll(async () => (await readTable(frame)).cells.map((cell) => cell.text))
    .toEqual(LABELS)
}

/**
 * Every cell stores at least the height it draws at. A table made with the editor's Table menu
 * stores rows far lower than their text draws them (282 HWPUNIT against about 1,283), and H on
 * part of such a table is refused, as a row held up by its text is; a table read from a file
 * often stores what it draws. 1,500 more makes every row draw at what it stores.
 */
async function rowsAsTallAsDrawn(frame: Frame): Promise<void> {
  await resizeCells(
    frame,
    LABELS.map((_, cellIdx) => ({ cellIdx, heightDelta: 1500 })),
  )
  await expect
    .poll(async () => {
      const table = await readTable(frame)
      return table.cells.every((cell, i) => {
        const box = table.bboxes.find((b) => b.cellIdx === i)!
        return Math.abs(box.h * 75 - cell.height) < 40
      })
    })
    .toBe(true)
}

/** The caret in the cell with this text, by a click on where the cell is drawn. */
async function clickCell(hwp: Page, frame: Frame, text: string): Promise<void> {
  const table = await readTable(frame)
  const index = table.cells.findIndex((cell) => cell.text === text)
  const box = table.bboxes.find((b) => b.cellIdx === index)
  if (!box) throw new Error(`no cell ${text}`)
  const canvas = hwp.frameLocator(STUDIO_IFRAME).locator('#scroll-content canvas').first()
  const origin = (await canvas.boundingBox())!
  await hwp.mouse.click(origin.x + box.x + box.w / 2, origin.y + box.y + box.h / 2)
}

/** A cell block from the cell with `from`, grown with F5 twice and the arrow keys. */
async function blockFrom(
  hwp: Page,
  frame: Frame,
  from: string,
  arrows: ('ArrowRight' | 'ArrowDown')[],
): Promise<void> {
  await clickCell(hwp, frame, from)
  await hwp.keyboard.press('F5')
  await hwp.keyboard.press('F5')
  for (const arrow of arrows) await hwp.keyboard.press(arrow)
  await expect.poll(async () => (await readTable(frame)).block).toBe(true)
}

const toast = (frame: Frame) =>
  frame.evaluate(() => document.getElementById('rhwp-toast-container')?.textContent?.trim() ?? '')

/** How many edits the document has had that the AI did not make. */
async function edits(frame: Frame): Promise<number> {
  return frame.evaluate(async () => {
    const studio = (window as unknown as { rhwpStudio: StudioLike }).rhwpStudio
    await studio.plugins.load('ieum-agent')
    return studio.plugins.invoke('ieum-agent', 'foreignChanges', []) as number
  })
}

/** The page that holds the tab bar and the home API. */
async function shellPage(app: ElectronApplication): Promise<Page> {
  for (const candidate of app.windows()) {
    const has = await candidate
      .evaluate(() => typeof (window as { aiOfficeTabs?: unknown }).aiOfficeTabs === 'object')
      .catch(() => false)
    if (has) return candidate
  }
  throw new Error('no shell page')
}

async function hwpTabOpen(app: ElectronApplication): Promise<boolean> {
  const shell = await shellPage(app)
  return shell.evaluate(async () => {
    const api = (window as unknown as TabsApiOnWindow).aiOfficeTabs
    return (await api.list()).some((tab) => tab.kind === 'hwp')
  })
}

/** Save As through the editor's File menu command, the save dialog answered with `target`. */
async function saveAs(app: ElectronApplication, hwp: Page, target: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath,
    })) as unknown as typeof dialog.showSaveDialog
  }, target)
  await hwp.evaluate(() => {
    const frame = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement | null
    frame?.contentWindow?.dispatchEvent(new CustomEvent('ieum:file-command', { detail: 'saveAs' }))
  })
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
  // written whole: the size has stopped changing
  let last = -1
  await expect
    .poll(
      () => {
        const size = statSync(target).size
        const settled = size > 0 && size === last
        last = size
        return settled
      },
      { timeout: 30_000, intervals: [300] },
    )
    .toBe(true)
}

/** Closes the HWP tab and opens the file again, as the home screen's open does. */
async function reopen(app: ElectronApplication, file: string): Promise<Frame> {
  const shell = await shellPage(app)
  await shell.evaluate(async () => {
    const api = (window as unknown as TabsApiOnWindow).aiOfficeTabs
    const tab = (await api.list()).find((t) => t.kind === 'hwp')
    if (tab) await api.close(tab.id)
  })
  await expect.poll(() => hwpTabOpen(app), { timeout: 15_000 }).toBe(false)
  await shell.evaluate(
    (path) => (window as unknown as TabsApiOnWindow).aiOffice.openPath(path),
    file,
  )
  const hwp = await hwpPage(app)
  const frame = await studioFrame(hwp)
  await installTableProbe(frame)
  return frame
}

/** The sizes come back the same from HWP, and from HWPX written from that HWP. */
async function keptThroughFiles(
  app: ElectronApplication,
  hwp: Page,
  expected: Sizes,
  name: string,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'ieum-equal-cells-'))
  const asHwp = join(dir, `${name}.hwp`)
  await saveAs(app, hwp, asHwp)
  let frame = await reopen(app, asHwp)
  expect(sizesOf(await readTable(frame))).toEqual(expected)
  const asHwpx = join(dir, `${name}.hwpx`)
  await saveAs(app, await hwpPage(app), asHwpx)
  frame = await reopen(app, asHwpx)
  expect(sizesOf(await readTable(frame))).toEqual(expected)
}

async function screenshot(hwp: Page, name: string): Promise<void> {
  const dir = join(ARTIFACTS_DIR, 'hwp-equal-cells-partial')
  await mkdir(dir, { recursive: true })
  await hwp.screenshot({ path: join(dir, `${name}.png`) })
}

interface StudioLike {
  plugins: {
    load(id: string): Promise<unknown>
    invoke(id: string, method: string, args: unknown[]): unknown
  }
  automation: {
    execute(id: string): unknown
    registerCommand(def: { id: string; label: string; execute(services: Services): void }): void
  }
}

interface Services {
  wasm: {
    getTableDimensions(sec: number, ppi: number, ci: number): { cellCount: number }
    getCellInfo(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
    ): { row: number; col: number; rowSpan: number; colSpan: number }
    getCellProperties(
      sec: number,
      ppi: number,
      ci: number,
      cell: number,
    ): { width: number; height: number }
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
    getTableCellBboxes(sec: number, ppi: number, ci: number): Table['bboxes']
  }
  getInputHandler(): {
    getSelectedTableRef(): { sec: number; ppi: number; ci: number } | null
    getCursorPosition(): {
      sectionIndex: number
      parentParaIndex?: number
      controlIndex?: number
    }
    cursor: {
      isInCellSelectionMode?(): boolean
      getSelectedCellRange?(): Table['range']
    }
    executeOperation(desc: {
      kind: 'snapshot'
      operationType: string
      operation: (wasm: {
        resizeTableCells(
          sec: number,
          ppi: number,
          ci: number,
          updates: { cellIdx: number; widthDelta?: number; heightDelta?: number }[],
        ): unknown
      }) => unknown
    }): void
  }
}

/** Every cell but these keeps the size it stored before. */
function othersKept(before: Sizes, after: Sizes, changed: string[]): void {
  for (const label of LABELS) {
    if (changed.includes(label)) continue
    expect(after[label], label).toEqual(before[label])
  }
}

test.describe('HWP H/W on part of a table', () => {
  test.setTimeout(240_000)

  test('W on A1:B1 evens those two only, one undo step, the same from HWP and HWPX', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-equal-cells-width',
      recordVideo: false,
    })
    const { app, page } = launched
    try {
      await page.locator('.quick-card', { hasText: 'AI HWP' }).click()
      const hwp = await hwpPage(app)
      const frame = await studioFrame(hwp)
      await tableWithLabels(hwp, frame)
      // column A wider than B and C in every row
      await resizeCells(
        frame,
        [0, 3, 6].map((cellIdx) => ({ cellIdx, widthDelta: 3000 })),
      )
      await expect
        .poll(async () => sizesOf(await readTable(frame)).a1.width)
        .toBeGreaterThan(sizesOf(await readTable(frame)).b1.width + 2000)
      const before = sizesOf(await readTable(frame))
      const editsBefore = await edits(frame)

      await blockFrom(hwp, frame, 'a1', ['ArrowRight'])
      expect((await readTable(frame)).range).toEqual({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 1,
      })
      await hwp.keyboard.press('w')
      await expect
        .poll(async () => {
          const sizes = sizesOf(await readTable(frame))
          return Math.abs(sizes.a1.width - sizes.b1.width)
        })
        .toBeLessThanOrEqual(1)
      const after = sizesOf(await readTable(frame))
      // A1 and B1 share what they held together, and keep their heights
      expect(
        Math.abs(after.a1.width + after.b1.width - (before.a1.width + before.b1.width)),
      ).toBeLessThanOrEqual(1)
      expect(after.a1.height).toBe(before.a1.height)
      expect(after.b1.height).toBe(before.b1.height)
      // every other cell as it stored
      othersKept(before, after, ['a1', 'b1'])
      // no letter typed into a cell
      expect((await readTable(frame)).cells.map((cell) => cell.text)).toEqual(LABELS)
      expect(await toast(frame)).not.toContain('Not changed')
      await screenshot(hwp, '01-width-partial')

      // one undo step puts every cell back
      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => sizesOf(await readTable(frame))).toEqual(before)
      expect(await edits(frame)).toBeGreaterThan(editsBefore)

      // again, then the sizes through HWP and HWPX
      await hwp.keyboard.press('Escape')
      await blockFrom(hwp, frame, 'a1', ['ArrowRight'])
      await hwp.keyboard.press('w')
      await expect.poll(async () => sizesOf(await readTable(frame))).toEqual(after)
      await hwp.keyboard.press('Escape')
      await keptThroughFiles(app, hwp, after, 'width-partial')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-equal-cells-width')
    }
  })

  test('H on A1:A2 evens those two only, one undo step, the same from HWP and HWPX', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-equal-cells-height',
      recordVideo: false,
    })
    const { app, page } = launched
    try {
      await page.locator('.quick-card', { hasText: 'AI HWP' }).click()
      const hwp = await hwpPage(app)
      const frame = await studioFrame(hwp)
      await tableWithLabels(hwp, frame)
      await rowsAsTallAsDrawn(frame)
      // A1 stores two thousand more: B1 and C1 draw at its height but store their own
      await resizeCells(frame, [{ cellIdx: 0, heightDelta: 2000 }])
      await expect
        .poll(async () => sizesOf(await readTable(frame)).a1.height)
        .toBeGreaterThan(sizesOf(await readTable(frame)).a2.height + 1500)
      const before = sizesOf(await readTable(frame))

      await blockFrom(hwp, frame, 'a1', ['ArrowDown'])
      expect((await readTable(frame)).range).toEqual({
        startRow: 0,
        startCol: 0,
        endRow: 1,
        endCol: 0,
      })
      await hwp.keyboard.press('h')
      await expect
        .poll(async () => {
          const sizes = sizesOf(await readTable(frame))
          return Math.abs(sizes.a1.height - sizes.a2.height)
        })
        .toBeLessThanOrEqual(1)
      const after = sizesOf(await readTable(frame))
      expect(
        Math.abs(after.a1.height + after.a2.height - (before.a1.height + before.a2.height)),
      ).toBeLessThanOrEqual(1)
      expect(after.a1.width).toBe(before.a1.width)
      expect(after.a2.width).toBe(before.a2.width)
      othersKept(before, after, ['a1', 'a2'])
      expect((await readTable(frame)).cells.map((cell) => cell.text)).toEqual(LABELS)
      expect(await toast(frame)).not.toContain('Not changed')
      await screenshot(hwp, '02-height-partial')

      await hwp.keyboard.press('Control+z')
      await expect.poll(async () => sizesOf(await readTable(frame))).toEqual(before)

      await hwp.keyboard.press('Escape')
      await blockFrom(hwp, frame, 'a1', ['ArrowDown'])
      await hwp.keyboard.press('h')
      await expect.poll(async () => sizesOf(await readTable(frame))).toEqual(after)
      await hwp.keyboard.press('Escape')
      await keptThroughFiles(app, hwp, after, 'height-partial')
    } finally {
      await closeAndSaveVideo(launched, 'hwp-equal-cells-height')
    }
  })

  test('H on part of a table whose row draws taller than it stores says why and changes nothing', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'hwp-equal-cells-refused',
      recordVideo: false,
    })
    const { app, page } = launched
    try {
      await page.locator('.quick-card', { hasText: 'AI HWP' }).click()
      const hwp = await hwpPage(app)
      const frame = await studioFrame(hwp)
      await tableWithLabels(hwp, frame)
      await rowsAsTallAsDrawn(frame)
      // three more lines in B2: its row draws taller than its cells store
      await clickCell(hwp, frame, 'b2')
      await hwp.keyboard.press('End')
      for (let i = 0; i < 3; i += 1) await hwp.keyboard.press('Enter')
      await expect
        .poll(async () => {
          const table = await readTable(frame)
          const index = table.cells.findIndex((cell) => cell.text.startsWith('b2'))
          const box = table.bboxes.find((b) => b.cellIdx === index)!
          // drawn px against stored HWPUNIT (75 per px at 100 %)
          return box.h - table.cells[index].height / 75
        })
        .toBeGreaterThan(10)
      const table = await readTable(frame)
      const before = table.cells.map((cell) => `${cell.width}x${cell.height}`)
      const editsBefore = await edits(frame)

      // A2:A3, beside the tall row
      await clickCell(hwp, frame, 'a2')
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('F5')
      await hwp.keyboard.press('ArrowDown')
      await expect
        .poll(async () => (await readTable(frame)).range)
        .toEqual({
          startRow: 1,
          startCol: 0,
          endRow: 2,
          endCol: 0,
        })
      await hwp.keyboard.press('h')
      await expect
        .poll(() => toast(frame))
        .toContain('rows at or above the block draw taller than they store')
      await screenshot(hwp, '03-height-refused')
      expect((await readTable(frame)).cells.map((cell) => `${cell.width}x${cell.height}`)).toEqual(
        before,
      )
      expect(await edits(frame)).toBe(editsBefore)
    } finally {
      await closeAndSaveVideo(launched, 'hwp-equal-cells-refused')
    }
  })
})
