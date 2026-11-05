/**
 * Save As lists every format the workbook can be copied to: the workbook's
 * own type first, then CSV and PDF (the active sheet). A copy pick writes no
 * workbook — the open session keeps its path, its pending edits and its
 * recovery copy — and the PDF export accepts the picked path once without a
 * second dialog. The spreadsheet engine, the archive writer and the PDF
 * renderer are stubs; the files are real.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'
import { workbookSaveResultSchema } from '../src/shared/desktop-api'
import { legacyCopyName } from '../src/main/recovery-policy'
import {
  resolveSheetsSaveAsPick,
  SaveAsExportTargets,
  sheetsSaveAsFilters,
  sheetsSaveAsSuggestion,
} from '../src/main/save-as-formats'

type Handler = (event: { sender: FakeContents }, ...args: unknown[]) => unknown

interface FakeContents {
  id: number
  listeners: Map<string, ((...args: unknown[]) => void)[]>
  destroyed: boolean
  isDestroyed(): boolean
  isCrashed(): boolean
  send(): void
  on(event: string, fn: (...args: unknown[]) => void): void
  once(event: string, fn: (...args: unknown[]) => void): void
  removeListener(): void
  setWindowOpenHandler(): void
  loadURL(): Promise<void>
}

const handlers = new Map<string, Handler>()
let nextContentsId = 1900

function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: ++nextContentsId,
    listeners: new Map(),
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    isCrashed: () => false,
    send: () => {},
    on(event, fn) {
      contents.listeners.set(event, [...(contents.listeners.get(event) ?? []), fn])
    },
    once(event, fn) {
      contents.on(event, fn)
    },
    removeListener: () => {},
    setWindowOpenHandler: () => {},
    loadURL: () => Promise.resolve(),
  }
  return contents
}

/** where the fake Save As dialog saves, and the options it was shown */
const saveDialogAnswer = { value: '' }
const saveDialogs: {
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}[] = []
const userDataDirRef = { value: '' }

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDirRef.value : tmpdir()),
    getName: () => 'sheets-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    getLocale: () => 'en-US',
    getSystemLocale: () => 'en-US',
    isPackaged: false,
    on: () => {},
    once: () => {},
    quit: () => {},
    whenReady: () => new Promise(() => {}),
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static fromWebContents(): null {
      return null
    }
  },
  WebContentsView: class {
    webContents = fakeContents()
  },
  desktopCapturer: {},
  dialog: {
    showMessageBox: async () => ({ response: 0 }),
    showSaveDialog: async (...args: unknown[]) => {
      saveDialogs.push(args.at(-1) as (typeof saveDialogs)[number])
      return { canceled: false, filePath: saveDialogAnswer.value }
    },
  },
  net: {},
  screen: {},
  session: {},
  shell: { showItemInFolder: () => {} },
  systemPreferences: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

/** the preset path each PDF export was handed (undefined = it would open its own dialog) */
const pdfExports = vi.hoisted(() => [] as (string | undefined)[])

vi.mock('../src/main/pdf-export', () => ({
  exportPdf: async (_event: unknown, _request: unknown, presetPath?: string) => {
    pdfExports.push(presetPath)
    return presetPath === undefined ? { canceled: true } : { canceled: false, path: presetPath }
  },
  printWorkbook: async () => ({ ok: false }),
}))

let openCount = 0

vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
    async close(): Promise<void> {}
    async open(path: string): Promise<unknown> {
      return {
        sessionId: `00000000-0000-4000-9000-${String(++openCount).padStart(12, '0')}`,
        name: basename(path),
        entryCount: 3,
        sheets: [
          {
            id: 'sheet-1',
            name: 'Data',
            rowCount: 20,
            columnCount: 10,
            columnWidths: [],
            defaultRowHeight: 15,
            defaultColumnWidth: 8.43,
            freeze: null,
            hidden: false,
            tabColor: null,
            showGridLines: true,
            tables: [],
            comments: [],
            pivotRanges: [],
          },
        ],
        activeTab: 0,
        styles: [],
        dxfStyles: [],
        visuals: [],
        definedNames: [],
      }
    }
  },
}))

// the archive writer is stubbed: it lands the bytes it read plus a mark
vi.mock('@genoffice/xlsx-gateway/gateway/xlsx-package-io', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveWorkbookViaSidecar: async (request: { sourcePath: string; targetPath: string }) => {
    const bytes = await readFile(request.sourcePath)
    await writeFile(request.targetPath, Buffer.concat([bytes, Buffer.from('-saved')]))
    return { touchedEntries: [], removedEntries: [], addedEntries: [] }
  },
}))

vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))

import {
  createSheetsView,
  markSheetsUnsavedNew,
  queueWorkbookForView,
  resetSheetsShuttingDown,
  sheetsPendingEditCount,
} from '../src/main/sheets-main'

let dir: string

function newTab(): FakeContents {
  return createSheetsView({ includeAiHandlers: false }).webContents as unknown as FakeContents
}

function call(contents: FakeContents, channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return Promise.resolve(fn({ sender: contents }, ...args))
}

function writeWorkbook(name: string, bytes = 'original-bytes'): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(bytes))
  return path
}

async function openWorkbook(
  contents: FakeContents,
  path: string,
): Promise<{ sessionId: string; path: string }> {
  return (await call(contents, IPC_CHANNELS.reopenWorkbook, path)) as {
    sessionId: string
    path: string
  }
}

function saveRequest(sessionId: string, mode: 'save' | 'save-as'): unknown {
  return {
    sessionId,
    mode,
    edits: [{ sheetId: 'sheet-1', row: 0, column: 0, writeValue: true, value: 'edited' }],
    structuralOps: [],
    chartEdits: [],
    visualEdits: [],
    visualAdditions: [],
    tableAdditions: [],
    pivotAdditions: [],
    sheetOps: [],
    sheetOrder: [],
    filterStates: [],
    hyperlinkEdits: [],
    cfStates: [],
    dvStates: [],
    pageSetupStates: [],
    noteStates: [],
    formulaValues: [],
    pivotCacheRefreshPaths: [],
    pivotRefreshUpdates: [],
    sheetProtections: [],
    sparklineAdditions: [],
    definedNamesState: null,
  }
}

function pdfRequest(saveAsPath?: string): unknown {
  return {
    fileName: 'book.pdf',
    html: '<html></html>',
    landscape: false,
    pageSize: 'A4',
    margins: { top: 0.75, bottom: 0.75, left: 0.7, right: 0.7 },
    scale: 1,
    ...(saveAsPath === undefined ? {} : { saveAsPath }),
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-sheets-save-as-'))
  userDataDirRef.value = mkdtempSync(join(tmpdir(), 'genoffice-sheets-save-as-user-'))
  saveDialogs.length = 0
  saveDialogAnswer.value = ''
  pdfExports.length = 0
  resetSheetsShuttingDown()
})

afterEach(() => {
  resetSheetsShuttingDown()
  rmSync(dir, { recursive: true, force: true })
  rmSync(userDataDirRef.value, { recursive: true, force: true })
})

describe('Save As format list', () => {
  const label = (key: string) => `<${key}>`

  it('offers the workbook first, then CSV and PDF of the active sheet', () => {
    expect(sheetsSaveAsFilters(false, true, label)).toEqual([
      { name: '<filterXlsx>', extensions: ['xlsx'] },
      { name: '<filterCsv>', extensions: ['csv'] },
      { name: '<filterPdfActiveSheet>', extensions: ['pdf'] },
    ])
  })

  it('keeps a macro workbook on .xlsm and adds PDF only', () => {
    expect(sheetsSaveAsFilters(true, true, label)).toEqual([
      { name: '<filterXlsm>', extensions: ['xlsm'] },
      { name: '<filterPdfActiveSheet>', extensions: ['pdf'] },
    ])
  })

  it('offers no PDF outside an explicit Save As (a first Save)', () => {
    expect(sheetsSaveAsFilters(false, false, label)).toEqual([
      { name: '<filterXlsx>', extensions: ['xlsx'] },
      { name: '<filterCsv>', extensions: ['csv'] },
    ])
    expect(sheetsSaveAsFilters(true, false, label)).toEqual([
      { name: '<filterXlsm>', extensions: ['xlsm'] },
    ])
  })

  it('suggests the name without its workbook extension', () => {
    expect(sheetsSaveAsSuggestion('/d/Budget.xlsx')).toBe('/d/Budget')
    expect(sheetsSaveAsSuggestion('/d/Macro.XLSM')).toBe('/d/Macro')
    expect(sheetsSaveAsSuggestion('/d/v1.2 notes')).toBe('/d/v1.2 notes')
  })

  it('reads the pick from the extension; a bare name is the workbook', () => {
    expect(resolveSheetsSaveAsPick('/d/a.pdf', false, true)).toEqual({
      kind: 'pdf',
      path: '/d/a.pdf',
    })
    expect(resolveSheetsSaveAsPick('/d/a.PDF', true, true)).toEqual({
      kind: 'pdf',
      path: '/d/a.PDF',
    })
    expect(resolveSheetsSaveAsPick('/d/a.csv', false, true)).toEqual({
      kind: 'csv',
      path: '/d/a.csv',
    })
    expect(resolveSheetsSaveAsPick('/d/a.xlsx', false, true)).toEqual({
      kind: 'workbook',
      path: '/d/a.xlsx',
    })
    expect(resolveSheetsSaveAsPick('/d/a', false, true)).toEqual({
      kind: 'workbook',
      path: '/d/a.xlsx',
    })
    expect(resolveSheetsSaveAsPick('/d/a', true, true)).toEqual({
      kind: 'workbook',
      path: '/d/a.xlsm',
    })
    // CSV is not offered for a macro workbook: the typed name stays a workbook name
    expect(resolveSheetsSaveAsPick('/d/a.csv', true, true)).toEqual({
      kind: 'workbook',
      path: '/d/a.csv.xlsm',
    })
    // nor is PDF on a first Save: a typed .pdf stays a workbook name, as before
    expect(resolveSheetsSaveAsPick('/d/a.pdf', false, false)).toEqual({
      kind: 'workbook',
      path: '/d/a.pdf.xlsx',
    })
  })

  it('accepts an authorized export target once, for its own tab only', () => {
    const targets = new SaveAsExportTargets()
    targets.authorize(1, '/d/a.pdf')
    expect(targets.take(2, '/d/a.pdf')).toBe(false)
    expect(targets.take(1, '/d/b.pdf')).toBe(false)
    expect(targets.take(1, '/d/a.pdf')).toBe(true)
    expect(targets.take(1, '/d/a.pdf')).toBe(false)
  })

  it('round-trips a PDF pick through the save result schema', () => {
    expect(
      workbookSaveResultSchema.parse({ canceled: true, pdfSaveAsPath: '/tmp/book.pdf' }),
    ).toEqual({ canceled: true, pdfSaveAsPath: '/tmp/book.pdf' })
  })
})

describe('Save As in the workbook tab', () => {
  it('shows every format with an extension-free suggestion', async () => {
    const path = writeWorkbook('Budget.xlsx')
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    saveDialogAnswer.value = join(dir, 'Budget.pdf')

    await call(tab, IPC_CHANNELS.saveWorkbook, saveRequest(opened.sessionId, 'save-as'))

    expect(saveDialogs.at(-1)?.defaultPath).toBe(join(dir, 'Budget'))
    expect(saveDialogs.at(-1)?.filters?.map((filter) => filter.extensions)).toEqual([
      ['xlsx'],
      ['csv'],
      ['pdf'],
    ])
    // a translated label that says only the active sheet is exported
    expect(saveDialogs.at(-1)?.filters?.at(-1)?.name).toMatch(/^PDF \(.+\)$/)
  })

  it('a PDF pick writes no workbook and leaves the session as it was', async () => {
    const path = writeWorkbook('Budget.xlsx')
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    const target = join(dir, 'Budget.pdf')
    saveDialogAnswer.value = target

    const result = await call(
      tab,
      IPC_CHANNELS.saveWorkbook,
      saveRequest(opened.sessionId, 'save-as'),
    )

    expect(result).toEqual({ canceled: true, pdfSaveAsPath: target })
    expect(existsSync(join(dir, 'Budget.xlsx.xlsx'))).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('original-bytes')
    // the recovery copy still belongs to the opened file
    const recovery = (await call(
      tab,
      IPC_CHANNELS.writeWorkbookRecovery,
      saveRequest(opened.sessionId, 'save'),
    )) as { ok: boolean }
    expect(recovery.ok).toBe(true)
    expect(existsSync(join(userDataDirRef.value, 'sheets-autosave', legacyCopyName(path)))).toBe(
      true,
    )

    // the export writes the picked path without its own dialog, once
    const dialogsBefore = saveDialogs.length
    expect(await call(tab, IPC_CHANNELS.exportPdf, pdfRequest(target))).toEqual({
      canceled: false,
      path: target,
    })
    expect(pdfExports).toEqual([target])
    expect(saveDialogs.length).toBe(dialogsBefore)
    await expect(call(tab, IPC_CHANNELS.exportPdf, pdfRequest(target))).rejects.toThrow(
      'export target was not authorized',
    )

    // the session still saves to its own file
    const saved = (await call(
      tab,
      IPC_CHANNELS.saveWorkbook,
      saveRequest(opened.sessionId, 'save'),
    )) as { canceled: boolean; file?: { path: string } }
    expect(saved.canceled).toBe(false)
    expect(saved.file?.path).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe('original-bytes-saved')
  })

  it('refuses a PDF path no Save As dialog returned for this tab', async () => {
    const path = writeWorkbook('Budget.xlsx')
    const tab = newTab()
    const other = newTab()
    const opened = await openWorkbook(tab, path)
    await openWorkbook(other, writeWorkbook('Other.xlsx'))
    const target = join(dir, 'Budget.pdf')
    saveDialogAnswer.value = target
    await call(tab, IPC_CHANNELS.saveWorkbook, saveRequest(opened.sessionId, 'save-as'))

    await expect(call(other, IPC_CHANNELS.exportPdf, pdfRequest(target))).rejects.toThrow(
      'export target was not authorized',
    )
    await expect(
      call(tab, IPC_CHANNELS.exportPdf, pdfRequest(join(dir, 'elsewhere.pdf'))),
    ).rejects.toThrow('export target was not authorized')
    expect(pdfExports).toEqual([])
  })

  it('the workbook pick still saves and moves the session to the new file', async () => {
    const path = writeWorkbook('Budget.xlsx')
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    // a bare name (some Linux dialogs) becomes the workbook type
    saveDialogAnswer.value = join(dir, 'Copy')

    const saved = (await call(
      tab,
      IPC_CHANNELS.saveWorkbook,
      saveRequest(opened.sessionId, 'save-as'),
    )) as { canceled: boolean; file?: { path: string } }

    expect(saved.canceled).toBe(false)
    expect(saved.file?.path).toBe(join(dir, 'Copy.xlsx'))
    expect(readFileSync(join(dir, 'Copy.xlsx'), 'utf8')).toBe('original-bytes-saved')
    expect(readFileSync(path, 'utf8')).toBe('original-bytes')
    expect(sheetsPendingEditCount(tab.id)).toBe(0)
  })

  it('offers .xlsm and PDF for a macro workbook', async () => {
    const path = writeWorkbook('Macro.xlsm')
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    saveDialogAnswer.value = join(dir, 'Macro.pdf')

    const result = await call(
      tab,
      IPC_CHANNELS.saveWorkbook,
      saveRequest(opened.sessionId, 'save-as'),
    )

    expect(saveDialogs.at(-1)?.defaultPath).toBe(join(dir, 'Macro'))
    expect(saveDialogs.at(-1)?.filters?.map((filter) => filter.extensions)).toEqual([
      ['xlsm'],
      ['pdf'],
    ])
    expect(result).toEqual({ canceled: true, pdfSaveAsPath: join(dir, 'Macro.pdf') })
  })

  it('the first Save of a new workbook offers no PDF and keeps its suggestion', async () => {
    // a new workbook runs from a backing file in a temp folder until its first Save
    const tempDir = mkdtempSync(join(tmpdir(), 'genoffice-sheets-save-as-new-'))
    try {
      const backing = join(tempDir, 'New Spreadsheet.xlsx')
      writeFileSync(backing, 'blank')
      const suggested = join(dir, 'New Spreadsheet.xlsx')
      markSheetsUnsavedNew(backing, suggested, tempDir)
      const tab = newTab()
      queueWorkbookForView(tab as never, backing)
      const opened = (await call(tab, IPC_CHANNELS.selectWorkbook)) as { sessionId: string }
      saveDialogAnswer.value = suggested

      const saved = (await call(
        tab,
        IPC_CHANNELS.saveWorkbook,
        saveRequest(opened.sessionId, 'save'),
      )) as { canceled: boolean }

      expect(saveDialogs.at(-1)?.defaultPath).toBe(suggested)
      expect(saveDialogs.at(-1)?.filters?.map((filter) => filter.extensions)).toEqual([
        ['xlsx'],
        ['csv'],
      ])
      expect(saved.canceled).toBe(false)
      expect(existsSync(suggested)).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
