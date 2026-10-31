/**
 * A save is opened back before it replaces the user's file: when the sidecar
 * cannot open the saved output, the file on disk keeps its bytes and the tab
 * keeps a live session, so the next Save works instead of failing with
 * "Unknown workbook session." for good. The sidecar and the gateway save are
 * stubs; the files on disk are real.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
let lastContents: unknown

interface SaveResult {
  canceled: boolean
  file?: { sessionId: string }
}

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
    webContents = (lastContents = {
      id: 901,
      isDestroyed: () => false,
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    })
  },
  desktopCapturer: {},
  dialog: {},
  net: {},
  screen: {},
  session: {},
  shell: {},
  systemPreferences: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

/** the per-test userData folder the mocked app reads through getPath */
const userDataDirRef = { value: '' }

// no spreadsheet engine process: a tab only needs a client object to exist,
// and opening a workbook answers with canned metadata
let openCount = 0
function mockOpenResult(): unknown {
  return {
    sessionId: `00000000-0000-4000-8000-${String(++openCount).padStart(12, '0')}`,
    name: 'book.xlsx',
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

/** opens of a path for which this answers true fail, as an unreadable file would */
const openFails = { value: (_path: string): boolean => false }
const opened: string[] = []
const closed: string[] = []

vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
    async close(sessionId: string): Promise<void> {
      closed.push(sessionId)
    }
    async open(path: string): Promise<unknown> {
      // the engine names the broken part, and its message may carry the path
      if (openFails.value(path))
        throw new Error(`Invalid XML in xl/styles.xml: expected </fonts> (${path})`)
      const result = mockOpenResult() as { sessionId: string }
      opened.push(result.sessionId)
      return result
    }
  },
}))

// the save pipeline's archive writer is stubbed: it lands different bytes on
// the target (an edit is what a real save would carry) without touching the
// engine, which the xlsx-roundtrip tests cover.
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

import { createSheetsView } from '../src/main/sheets-main'

let dir: string

function call(channel: string, ...args: unknown[]): unknown {
  if (!lastContents) createSheetsView({ includeAiHandlers: false })
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return fn({ sender: lastContents as { id: number } }, ...args)
}

function writeWorkbook(name = 'book.xlsx', bytes = 'original-bytes'): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(bytes))
  return path
}

async function openWorkbook(path: string): Promise<{ sessionId: string }> {
  return (await call(IPC_CHANNELS.reopenWorkbook, path)) as { sessionId: string }
}

/** an in-place save with one real cell edit, the way the renderer sends it */
function saveRequest(sessionId: string): unknown {
  return {
    sessionId,
    mode: 'save',
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

async function saveWorkbook(sessionId: string): Promise<SaveResult> {
  return (await call(IPC_CHANNELS.saveWorkbook, saveRequest(sessionId))) as SaveResult
}

/** what the stubbed save writes: the bytes it read, marked */
function savedFrom(bytes: string): Buffer {
  return Buffer.from(`${bytes}-saved`)
}

/** a saved output is any file whose bytes carry the stub's mark */
function isSavedOutput(path: string): boolean {
  try {
    return readFileSync(path).toString().endsWith('-saved')
  } catch {
    return false
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-sheets-verify-'))
  userDataDirRef.value = mkdtempSync(join(tmpdir(), 'genoffice-sheets-verify-user-'))
  openFails.value = () => false
  opened.length = 0
  closed.length = 0
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(userDataDirRef.value, { recursive: true, force: true })
})

describe('save opens its output back before replacing the file', () => {
  it('leaves the file untouched when the saved output does not open', async () => {
    const path = writeWorkbook()
    const session = await openWorkbook(path)
    openFails.value = isSavedOutput

    // the tests run in the default UI language (zh): the message says the
    // original was left as is, not the engine's raw reason
    await expect(saveWorkbook(session.sessionId)).rejects.toThrow('因此没有覆盖原文件')
    expect(readFileSync(path).toString()).toBe('original-bytes')
    // nothing of the failed save is left beside the user's file
    expect(readdirSync(dir)).toEqual(['book.xlsx'])
  })

  it('keeps the reason, without the path, in the message and the data folder', async () => {
    const path = writeWorkbook()
    const session = await openWorkbook(path)
    openFails.value = isSavedOutput

    const reason = '[unreadable: Invalid XML in xl/styles.xml: expected </fonts> (<path>)]'
    await expect(saveWorkbook(session.sessionId)).rejects.toThrow(reason)
    const lines = readFileSync(join(userDataDirRef.value, 'sheets-save-failures.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(entry).toMatchObject({
      app: '0',
      source: 'xlsx',
      kind: 'unreadable',
      detail: 'Invalid XML in xl/styles.xml: expected </fonts> (<path>)',
    })
    expect(entry.bytes).toBe(savedFrom('original-bytes').length)
    // the staged output sat in the temp folder; no form of it is kept, raw or JSON-escaped
    expect(lines[0]).not.toContain(JSON.stringify(tmpdir()).slice(1, -1))
  })

  it('keeps the session alive, so the next Save still works', async () => {
    const path = writeWorkbook()
    const session = await openWorkbook(path)
    openFails.value = isSavedOutput
    await expect(saveWorkbook(session.sessionId)).rejects.toThrow()

    openFails.value = () => false
    const retried = await saveWorkbook(session.sessionId)
    expect(retried.canceled).toBe(false)
    expect(readFileSync(path)).toEqual(savedFrom('original-bytes'))
    // the old session was closed only once the new one took over
    expect(closed).toContain(session.sessionId)
    expect(retried.file?.sessionId).not.toBe(session.sessionId)
  })

  it('opens the saved output once and makes it the next session', async () => {
    const path = writeWorkbook()
    const session = await openWorkbook(path)
    const opensBefore = opened.length

    const saved = await saveWorkbook(session.sessionId)
    expect(saved.canceled).toBe(false)
    expect(opened.length - opensBefore).toBe(1)
    expect(saved.file?.sessionId).toBe(opened.at(-1))
    expect(readFileSync(path)).toEqual(savedFrom('original-bytes'))
    expect(readdirSync(dir)).toEqual(['book.xlsx'])

    // the next save builds on the saved bytes
    const again = await saveWorkbook(saved.file!.sessionId)
    expect(again.canceled).toBe(false)
    expect(readFileSync(path)).toEqual(savedFrom('original-bytes-saved'))
  })
})
