/**
 * Excel crash recovery on the shared recovery store: copies keep the old
 * folder and names, the old unsaved-new index becomes untitled "later" copies,
 * opening a file with a copy asks with the named prompt (or not at all when
 * the launch list already decided), a password workbook gets no copy but a
 * one-time notice, and nothing deletes a copy while the app is ending. The
 * spreadsheet engine and the archive writer are stubs; the files are real.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRecoveryStore,
  isAppShuttingDown,
  recoveryEditor,
  resetAppShuttingDown,
  type RecoveryCopyInfo,
  type RecoveryStore,
} from '@genoffice/electron-utils'
import { encryptOoxml } from '@genoffice/electron-utils/office-encryption'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'
import {
  LEGACY_UNSAVED_NEW_INDEX,
  legacyCopyName,
  migrateLegacyUnsavedNew,
} from '../src/main/recovery-policy'

type Handler = (event: { sender: FakeContents }, ...args: unknown[]) => unknown

interface FakeContents {
  id: number
  sent: { channel: string; payload: unknown }[]
  listeners: Map<string, ((...args: unknown[]) => void)[]>
  destroyed: boolean
  isDestroyed(): boolean
  isCrashed(): boolean
  send(channel: string, payload?: unknown): void
  on(event: string, fn: (...args: unknown[]) => void): void
  once(event: string, fn: (...args: unknown[]) => void): void
  removeListener(event: string, fn: (...args: unknown[]) => void): void
  setWindowOpenHandler(): void
  loadURL(): Promise<void>
}

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Handler>()
let nextContentsId = 900

function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: ++nextContentsId,
    sent: [],
    listeners: new Map(),
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    isCrashed: () => false,
    send(channel, payload) {
      contents.sent.push({ channel, payload })
    },
    on(event, fn) {
      contents.listeners.set(event, [...(contents.listeners.get(event) ?? []), fn])
    },
    once(event, fn) {
      contents.on(event, fn)
    },
    removeListener(event, fn) {
      contents.listeners.set(
        event,
        (contents.listeners.get(event) ?? []).filter((listener) => listener !== fn),
      )
    },
    setWindowOpenHandler: () => {},
    loadURL: () => Promise.resolve(),
  }
  return contents
}

/** the answer the fake message box gives (0 = restore, 1 = discard; 'throw' fails the box) */
const dialogAnswer: { value: number | 'throw' } = { value: 0 }
const messageBoxes: { message?: string; detail?: string; cancelId?: number }[] = []
/** where the fake Save As dialog saves, and the suggestions it was shown */
const saveDialogAnswer = { value: '' }
const saveDialogs: { defaultPath?: string }[] = []

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
    on: (channel: string, fn: Handler) => listeners.set(channel, fn),
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
    showMessageBox: async (...args: unknown[]) => {
      const options = args.at(-1) as { message?: string; detail?: string; cancelId?: number }
      messageBoxes.push(options)
      if (dialogAnswer.value === 'throw') throw new Error('message box failed')
      return { response: dialogAnswer.value }
    },
    showSaveDialog: async (...args: unknown[]) => {
      saveDialogs.push(args.at(-1) as { defaultPath?: string })
      return { canceled: false, filePath: saveDialogAnswer.value }
    },
  },
  net: {},
  screen: {},
  session: {},
  shell: {},
  systemPreferences: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

/** how each copy reached the store: as bytes in memory or streamed to its temp path */
const storeWrites = vi.hoisted(() => [] as ('bytes' | 'streamed')[])

vi.mock('@genoffice/electron-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genoffice/electron-utils')>()
  return {
    ...actual,
    createRecoveryStore: (options: Parameters<typeof actual.createRecoveryStore>[0]) => {
      const real = actual.createRecoveryStore(options)
      return {
        ...real,
        writeCopy: (...args: Parameters<typeof real.writeCopy>) => {
          storeWrites.push('bytes')
          return real.writeCopy(...args)
        },
        writeCopyStreamed: (...args: Parameters<typeof real.writeCopyStreamed>) => {
          storeWrites.push('streamed')
          return real.writeCopyStreamed(...args)
        },
      }
    },
  }
})

/** the per-test userData folder the mocked app reads through getPath */
const userDataDirRef = { value: '' }

let openCount = 0
/** the bytes each sidecar open saw, in order */
const openedBytes: string[] = []

vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
    async close(): Promise<void> {}
    async open(path: string): Promise<unknown> {
      openedBytes.push(readFileSync(path).toString())
      return {
        sessionId: `00000000-0000-4000-8000-${String(++openCount).padStart(12, '0')}`,
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
  discardSheetsRecovery,
  listSheetsUntitledCopies,
  markSheetsShuttingDown,
  markSheetsUnsavedNew,
  pendingUnsavedNewRecoveries,
  queueWorkbookForView,
  requestSheetsClose,
  resetSheetsShuttingDown,
  setSheetsPasswordPrompt,
  sheetsPendingEditCount,
} from '../src/main/sheets-main'

let dir: string
let store: RecoveryStore

function newTab(): FakeContents {
  return createSheetsView({ includeAiHandlers: false }).webContents as unknown as FakeContents
}

function call(contents: FakeContents, channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return Promise.resolve(fn({ sender: contents }, ...args))
}

function emit(contents: FakeContents, channel: string, ...args: unknown[]): void {
  const fn = listeners.get(channel)
  if (!fn) throw new Error(`listener not registered: ${channel}`)
  fn({ sender: contents }, ...args)
}

function destroy(contents: FakeContents): void {
  contents.destroyed = true
  for (const fn of contents.listeners.get('destroyed') ?? []) fn()
}

function writeWorkbook(name = 'book.xlsx', bytes = 'original-bytes'): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(bytes))
  return path
}

interface Opened {
  sessionId: string
  path: string
  restoredFromRecovery?: boolean
  unsavedNew?: boolean
}

async function openWorkbook(contents: FakeContents, path: string): Promise<Opened> {
  return (await call(contents, IPC_CHANNELS.reopenWorkbook, path)) as Opened
}

/** the queued-workbook open a shell-created tab runs once its renderer is ready */
async function openQueued(contents: FakeContents): Promise<Opened> {
  return (await call(contents, IPC_CHANNELS.selectWorkbook)) as Opened
}

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

async function writeRecovery(contents: FakeContents, sessionId: string): Promise<boolean> {
  const result = (await call(
    contents,
    IPC_CHANNELS.writeWorkbookRecovery,
    saveRequest(sessionId),
  )) as { ok: boolean }
  return result.ok
}

const recoveryDir = () => join(userDataDirRef.value, 'sheets-autosave')
const fileCopyPath = (path: string) => join(recoveryDir(), legacyCopyName(path))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-sheets-recovery-'))
  userDataDirRef.value = mkdtempSync(join(tmpdir(), 'genoffice-sheets-recovery-user-'))
  store = createRecoveryStore({ userDataDir: userDataDirRef.value })
  dialogAnswer.value = 0
  messageBoxes.length = 0
  saveDialogs.length = 0
  saveDialogAnswer.value = ''
  openedBytes.length = 0
  resetSheetsShuttingDown()
  resetAppShuttingDown()
})

afterEach(() => {
  resetSheetsShuttingDown()
  resetAppShuttingDown()
  rmSync(dir, { recursive: true, force: true })
  rmSync(userDataDirRef.value, { recursive: true, force: true })
})

describe('legacy unsaved-new index', () => {
  function legacyIndex(paths: string[], copies: Record<string, string>): void {
    mkdirSync(recoveryDir(), { recursive: true })
    writeFileSync(join(recoveryDir(), LEGACY_UNSAVED_NEW_INDEX), JSON.stringify(paths))
    for (const [path, bytes] of Object.entries(copies)) writeFileSync(fileCopyPath(path), bytes)
  }

  it('moves each listed copy into an untitled "later" copy and drops the index', () => {
    const wouldBe = join(dir, 'New Spreadsheet.xlsx')
    const gone = join(dir, 'Gone.xlsx')
    legacyIndex([wouldBe, gone], { [wouldBe]: 'unsaved-work' })

    const adopted = migrateLegacyUnsavedNew(store, recoveryDir())

    expect(adopted).toHaveLength(1)
    const [copy] = store.listCopies({ kinds: ['sheets'], untitled: true })
    expect(copy?.state).toBe('later')
    expect(copy?.title).toBe('New Spreadsheet.xlsx')
    expect(readFileSync(copy!.copyPath).toString()).toBe('unsaved-work')
    // the old file-keyed copy is gone (it would otherwise be offered for a file at that path)
    expect(existsSync(fileCopyPath(wouldBe))).toBe(false)
    expect(existsSync(join(recoveryDir(), LEGACY_UNSAVED_NEW_INDEX))).toBe(false)
    // a second run finds nothing to move
    expect(migrateLegacyUnsavedNew(store, recoveryDir())).toEqual([])
    expect(store.listCopies({ kinds: ['sheets'], untitled: true })).toHaveLength(1)
  })

  it('keeps an entry whose move failed for the next launch', () => {
    const wouldBe = join(dir, 'Budget.xlsx')
    legacyIndex([wouldBe], { [wouldBe]: 'unsaved-work' })

    expect(migrateLegacyUnsavedNew({ adoptUntitledCopy: () => null }, recoveryDir())).toEqual([])

    const index = join(recoveryDir(), LEGACY_UNSAVED_NEW_INDEX)
    expect(JSON.parse(readFileSync(index, 'utf8'))).toEqual([wouldBe])
    expect(existsSync(fileCopyPath(wouldBe))).toBe(true)
  })

  it('keeps an index it cannot read (an older version wrote it non-atomically)', () => {
    mkdirSync(recoveryDir(), { recursive: true })
    const index = join(recoveryDir(), LEGACY_UNSAVED_NEW_INDEX)
    writeFileSync(index, '["C:\\half-writ')

    expect(migrateLegacyUnsavedNew(store, recoveryDir())).toEqual([])

    expect(readFileSync(index, 'utf8')).toBe('["C:\\half-writ')
  })

  it('migrates at launch instead of reopening the workbooks in new tabs', () => {
    const wouldBe = join(dir, 'New Spreadsheet.xlsx')
    legacyIndex([wouldBe], { [wouldBe]: 'unsaved-work' })

    expect(pendingUnsavedNewRecoveries()).toEqual([])
    expect(listSheetsUntitledCopies().map((copy) => copy.title)).toEqual(['New Spreadsheet.xlsx'])
  })
})

describe('opening a workbook that has a recovery copy', () => {
  async function leaveCopy(path: string, bytes = 'unsaved-work'): Promise<void> {
    await store.writeCopy({ kind: 'sheets', filePath: path }, Buffer.from(bytes))
  }

  it('keeps the folder and naming of earlier versions', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)

    const copy = createHash('sha1').update(path).digest('hex').slice(0, 16) + '.xlsx'
    expect(readFileSync(join(recoveryDir(), copy)).toString()).toBe('original-bytes-saved')
    expect(store.copyInfo({ kind: 'sheets', filePath: path })?.state).toBe('undecided')
    // the original is never touched by a copy
    expect(readFileSync(path).toString()).toBe('original-bytes')
  })

  it('asks with the document name and restores the copy, keeping the original path', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    const tab = newTab()

    const opened = await openWorkbook(tab, path)

    expect(messageBoxes).toHaveLength(1)
    expect(messageBoxes[0]?.message).toContain('book.xlsx')
    // Esc or closing the box restores
    expect(messageBoxes[0]?.cancelId).toBe(0)
    expect(openedBytes.at(-1)).toBe('unsaved-work')
    expect(opened.path).toBe(path)
    expect(opened.restoredFromRecovery).toBe(true)
    expect(readFileSync(path).toString()).toBe('original-bytes')
    // the restored tab counts as unsaved before any edit
    expect(sheetsPendingEditCount(tab.id)).toBeGreaterThan(0)
    // the copy stays until the document is saved or discarded
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).not.toBeNull()
  })

  it('a restored workbook keeps writing its copy and Save writes back to the original', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    const tab = newTab()
    const opened = await openWorkbook(tab, path)

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)
    expect(readFileSync(store.copyPath({ kind: 'sheets', filePath: path })).toString()).toBe(
      'unsaved-work-saved',
    )

    const saved = (await call(tab, IPC_CHANNELS.saveWorkbook, saveRequest(opened.sessionId))) as {
      canceled: boolean
    }
    expect(saved.canceled).toBe(false)
    expect(readFileSync(path).toString()).toBe('unsaved-work-saved')
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })

  it('discarding in the prompt deletes the copy and opens the file', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    dialogAnswer.value = 1
    const tab = newTab()

    const opened = await openWorkbook(tab, path)

    expect(openedBytes.at(-1)).toBe('original-bytes')
    expect(opened.restoredFromRecovery).toBeFalsy()
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })

  it('says so when the file changed after the copy, without deleting the copy', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    const later = new Date(Date.now() + 60_000)
    const { utimesSync } = await import('node:fs')
    utimesSync(path, later, later)
    const tab = newTab()

    await openWorkbook(tab, path)

    expect(messageBoxes).toHaveLength(1)
    expect(messageBoxes[0]?.detail).toMatch(/changed|修改|更改|변경/)
    expect(openedBytes.at(-1)).toBe('unsaved-work')
  })

  it('restores without asking when the launch list chose restore', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    store.applyLaunchDecision({ kind: 'sheets', filePath: path }, 'restore')
    const tab = newTab()

    const opened = await openWorkbook(tab, path)

    expect(messageBoxes).toHaveLength(0)
    expect(openedBytes.at(-1)).toBe('unsaved-work')
    expect(opened.restoredFromRecovery).toBe(true)
    // loaded: the copy is undecided again
    expect(store.copyInfo({ kind: 'sheets', filePath: path })?.state).toBe('undecided')
  })

  it('opens the decided file through the editor contract without asking', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    const contract = recoveryEditor('sheets')
    expect(contract).not.toBeNull()

    const kept = newTab()
    await contract!.openFileWithDecision(kept as never, { filePath: path, decision: 'original' })
    const original = await openQueued(kept)
    expect(original.path).toBe(path)
    expect(openedBytes.at(-1)).toBe('original-bytes')
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).not.toBeNull()

    const restored = newTab()
    await contract!.openFileWithDecision(restored as never, { filePath: path, decision: 'restore' })
    const reopened = await openQueued(restored)
    expect(reopened.path).toBe(path)
    expect(openedBytes.at(-1)).toBe('unsaved-work')
    expect(messageBoxes).toHaveLength(0)
  })
})

describe('opening a workbook whose copy cannot be prepared or is owned elsewhere', () => {
  async function leaveCopy(path: string, bytes = 'unsaved-work'): Promise<void> {
    await store.writeCopy({ kind: 'sheets', filePath: path }, Buffer.from(bytes))
  }

  it('opens the original, keeps the copy for later and does not overwrite it', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    dialogAnswer.value = 'throw'
    const tab = newTab()

    const opened = await openWorkbook(tab, path)

    expect(opened.path).toBe(path)
    expect(opened.restoredFromRecovery).toBeFalsy()
    expect(openedBytes.at(-1)).toBe('original-bytes')
    const identity = { kind: 'sheets' as const, filePath: path }
    expect(store.copyInfo(identity)?.state).toBe('later')
    // the unanswered copy is neither replaced by this tab's ticks nor removed by its save
    expect(await writeRecovery(tab, opened.sessionId)).toBe(false)
    await call(tab, IPC_CHANNELS.saveWorkbook, saveRequest(opened.sessionId))
    expect(readFileSync(store.copyPath(identity)).toString()).toBe('unsaved-work')
  })

  it('a second view of a file another tab keeps a copy for opens it without asking', async () => {
    const path = writeWorkbook()
    await leaveCopy(path)
    const owner = newTab()
    const restored = await openWorkbook(owner, path)
    expect(await writeRecovery(owner, restored.sessionId)).toBe(true)
    messageBoxes.length = 0
    dialogAnswer.value = 1

    const second = newTab()
    const opened = await openWorkbook(second, path)

    expect(messageBoxes).toHaveLength(0)
    expect(openedBytes.at(-1)).toBe('original-bytes')
    expect(opened.restoredFromRecovery).toBeFalsy()
    // the owner's copy is untouched by the second view's ticks
    const identity = { kind: 'sheets' as const, filePath: path }
    expect(await writeRecovery(second, opened.sessionId)).toBe(false)
    expect(readFileSync(store.copyPath(identity)).toString()).toBe('unsaved-work-saved')
  })
})

describe('untitled workbooks', () => {
  async function newWorkbookTab(name = 'New Spreadsheet.xlsx'): Promise<{
    tab: FakeContents
    opened: Opened
    suggested: string
  }> {
    const tempDir = mkdtempSync(join(tmpdir(), 'genoffice-imports-test-'))
    const backing = join(tempDir, name)
    writeFileSync(backing, 'blank')
    const suggested = join(dir, name)
    markSheetsUnsavedNew(backing, suggested, tempDir)
    const tab = newTab()
    queueWorkbookForView(tab as never, backing)
    return { tab, opened: await openQueued(tab), suggested }
  }

  it('keeps an untitled copy in app data only, titled like the tab', async () => {
    const { tab, opened, suggested } = await newWorkbookTab()

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)

    const copies = listSheetsUntitledCopies()
    expect(copies).toHaveLength(1)
    expect(copies[0]?.title).toBe('New Spreadsheet.xlsx')
    expect(copies[0]?.copyPath.startsWith(recoveryDir())).toBe(true)
    // nothing appears in the folder the first save would offer
    expect(existsSync(suggested)).toBe(false)
  })

  it('reopens an untitled copy as an untitled tab that keeps writing the same copy', async () => {
    const first = await newWorkbookTab()
    await writeRecovery(first.tab, first.opened.sessionId)
    const [copy] = listSheetsUntitledCopies()

    const tab = newTab()
    await recoveryEditor('sheets')!.openUntitledCopy(tab as never, {
      copy: copy!.identity,
      title: copy!.title,
    })
    const reopened = await openQueued(tab)

    expect(messageBoxes).toHaveLength(0)
    expect(openedBytes.at(-1)).toBe('blank-saved')
    expect(reopened.unsavedNew).toBe(true)
    expect(sheetsPendingEditCount(tab.id)).toBeGreaterThan(0)
    await writeRecovery(tab, reopened.sessionId)
    expect(listSheetsUntitledCopies().map((c) => c.untitledId)).toEqual([copy!.untitledId])
    expect(readFileSync(copy!.copyPath).toString()).toBe('blank-saved-saved')
  })
})

describe('CSV and converted workbooks', () => {
  const CSV_TEXT = 'a,b\n1,2\n'
  const TSV_TEXT = 'a\tb\n'

  function writeDelimited(name = 'data.csv', text = CSV_TEXT): string {
    const path = join(dir, name)
    writeFileSync(path, text)
    return path
  }

  it('a CSV edit keeps an untitled .xlsx copy named like the file; the CSV is untouched', async () => {
    const path = writeDelimited()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)

    const copies = listSheetsUntitledCopies()
    expect(copies).toHaveLength(1)
    expect(copies[0]?.title).toBe('data.csv')
    expect(copies[0]?.originalPath).toBe(path)
    expect(copies[0]?.identity).toMatchObject({ kind: 'sheets', ext: '.xlsx' })
    expect(copies[0]?.copyPath.startsWith(recoveryDir())).toBe(true)
    // no copy keyed by the CSV's path, and nothing new beside it
    expect(existsSync(fileCopyPath(path))).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(CSV_TEXT)
    expect(readdirSync(dir)).toEqual(['data.csv'])

    // the next tick replaces the same copy
    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)
    expect(listSheetsUntitledCopies().map((c) => c.untitledId)).toEqual([copies[0]?.untitledId])
  })

  it('a converted .tsv gets the same kind of copy', async () => {
    const path = writeDelimited('table.tsv', TSV_TEXT)
    const tab = newTab()
    const opened = await openWorkbook(tab, path)

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)

    const [copy] = listSheetsUntitledCopies()
    expect(copy?.title).toBe('table.tsv')
    expect(copy?.originalPath).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe(TSV_TEXT)
  })

  it('saving the CSV in place removes the copy', async () => {
    const path = writeDelimited()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    expect(listSheetsUntitledCopies()).toHaveLength(1)

    const saved = (await call(tab, IPC_CHANNELS.saveWorkbook, {
      ...(saveRequest(opened.sessionId) as object),
      csvContent: 'edited,b\n1,2\n',
    })) as { canceled: boolean }

    expect(saved.canceled).toBe(false)
    expect(listSheetsUntitledCopies()).toEqual([])
  })

  async function leaveCsvCopy(): Promise<{ path: string; copy: RecoveryCopyInfo }> {
    const path = writeDelimited()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    const [copy] = listSheetsUntitledCopies()
    return { path, copy: copy! }
  }

  for (const route of ['launch list', 'crashed tab'] as const) {
    it(`restoring (${route}) opens it untitled; the first save suggests the original's folder and name`, async () => {
      const { path, copy } = await leaveCsvCopy()
      const tab = newTab()
      await recoveryEditor('sheets')!.openUntitledCopy(tab as never, {
        copy: copy.identity,
        title: copy.title,
        // the launch list passes the original path; a crashed tab's reopen does not
        ...(route === 'launch list' ? { saveAsDefaultPath: path } : {}),
      })
      const reopened = await openQueued(tab)

      expect(messageBoxes).toHaveLength(0)
      expect(reopened.unsavedNew).toBe(true)
      expect(sheetsPendingEditCount(tab.id)).toBeGreaterThan(0)
      // its copy keeps the file's name and path while it is unsaved
      await writeRecovery(tab, reopened.sessionId)
      const [again] = listSheetsUntitledCopies()
      expect(again?.untitledId).toBe(copy.untitledId)
      expect(again?.title).toBe('data.csv')
      expect(again?.originalPath).toBe(path)

      const target = join(dir, 'data.xlsx')
      saveDialogAnswer.value = target
      const saved = (await call(
        tab,
        IPC_CHANNELS.saveWorkbook,
        saveRequest(reopened.sessionId),
      )) as {
        canceled: boolean
      }

      expect(saved.canceled).toBe(false)
      // the suggestion the CSV session itself would have made
      expect(saveDialogs.at(-1)?.defaultPath).toBe(target)
      expect(existsSync(target)).toBe(true)
      expect(listSheetsUntitledCopies()).toEqual([])
      expect(readFileSync(path, 'utf8')).toBe(CSV_TEXT)
    })
  }
})

describe('password workbooks', () => {
  it('get no copy and one notice per tab', async () => {
    const path = join(dir, 'secret.xlsx')
    // encryption treats the package as opaque bytes: a zip-looking buffer will do
    const plain = Buffer.concat([Buffer.from('PK'), Buffer.from('secret-bytes')])
    writeFileSync(path, encryptOoxml(plain, 'pw'))
    // one answer per prompt; a retry (wrong password) cancels instead of looping
    setSheetsPasswordPrompt(() => ({
      ask: async (retry) => (retry ? null : 'pw'),
      close: () => {},
    }))
    try {
      const tab = newTab()
      const opened = await openWorkbook(tab, path)
      expect(await writeRecovery(tab, opened.sessionId)).toBe(false)
      expect(existsSync(fileCopyPath(path))).toBe(false)
      await openWorkbook(tab, path)

      const notices = tab.sent.filter((m) => m.channel === IPC_CHANNELS.recoveryNotice)
      expect(notices).toHaveLength(1)
      expect(typeof notices[0]?.payload).toBe('string')
      expect(recoveryEditor('sheets')!.isUnprotectable(tab as never)).toBe(true)

      // another tab gets its own notice
      const other = newTab()
      await openWorkbook(other, path)
      expect(other.sent.filter((m) => m.channel === IPC_CHANNELS.recoveryNotice)).toHaveLength(1)
    } finally {
      setSheetsPasswordPrompt(null)
    }
    // three password unlocks: the key derivation is deliberately slow
  }, 60_000)
})

describe('copies survive the app ending', () => {
  it('quits without asking and nothing deletes the copy, closing the tab included', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 1)

    markSheetsShuttingDown()
    expect(isAppShuttingDown()).toBe(true)
    expect(await requestSheetsClose(tab as never)).toBe(true)
    expect(messageBoxes).toHaveLength(0)
    await call(tab, IPC_CHANNELS.closeWorkbook, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 0)
    destroy(tab)

    expect(store.copyInfo({ kind: 'sheets', filePath: path })).not.toBeNull()
  })

  it('keeps an unsaved new workbook copy when its tab unmounts during shutdown', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'genoffice-imports-test-'))
    const backing = join(tempDir, 'New Spreadsheet.xlsx')
    writeFileSync(backing, 'blank')
    markSheetsUnsavedNew(backing, join(dir, 'New Spreadsheet.xlsx'), tempDir)
    const tab = newTab()
    queueWorkbookForView(tab as never, backing)
    const opened = await openQueued(tab)
    await writeRecovery(tab, opened.sessionId)

    markSheetsShuttingDown()
    await call(tab, IPC_CHANNELS.closeWorkbook, opened.sessionId)
    destroy(tab)

    expect(listSheetsUntitledCopies()).toHaveLength(1)
  })

  it('a vetoed quit lowers the shared latch again', () => {
    markSheetsShuttingDown()
    resetSheetsShuttingDown()
    expect(isAppShuttingDown()).toBe(false)
  })
})

describe('deleting copies outside shutdown', () => {
  it("Don't Save deletes the tab's copy", async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 1)
    dialogAnswer.value = 1

    expect(await requestSheetsClose(tab as never)).toBe(true)

    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
    // a late tick from the closing tab does not bring it back
    expect(await writeRecovery(tab, opened.sessionId)).toBe(false)
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })

  it("a close vetoed after Don't Save writes copies again", async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 1)
    dialogAnswer.value = 1
    expect(await requestSheetsClose(tab as never)).toBe(true)

    // another tab's prompt was cancelled: the window (and this tab) stays open
    resetSheetsShuttingDown()

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).not.toBeNull()
  })

  it('an MCP close without saving deletes the copy, and a late tick does not bring it back', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 1)

    discardSheetsRecovery(tab as never)

    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
    expect(await writeRecovery(tab, opened.sessionId)).toBe(false)
    destroy(tab)
    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })

  it('streams the copy to the store instead of reading the workbook into memory', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    storeWrites.length = 0

    expect(await writeRecovery(tab, opened.sessionId)).toBe(true)

    expect(storeWrites).toEqual(['streamed'])
    expect(readFileSync(store.copyPath({ kind: 'sheets', filePath: path })).toString()).toBe(
      'original-bytes-saved',
    )
    // nothing but the copy and its metadata is left in the recovery folder
    expect(readdirSync(recoveryDir()).filter((name) => name.startsWith('.'))).toEqual([])
  })

  it('a saved workbook has no copy left', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)

    await call(tab, IPC_CHANNELS.saveWorkbook, saveRequest(opened.sessionId))

    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })

  it('a tab closed clean removes the copy it wrote', async () => {
    const path = writeWorkbook()
    const tab = newTab()
    const opened = await openWorkbook(tab, path)
    await writeRecovery(tab, opened.sessionId)
    emit(tab, IPC_CHANNELS.pendingEditsChanged, 0)

    await call(tab, IPC_CHANNELS.closeWorkbook, opened.sessionId)
    destroy(tab)

    expect(store.copyInfo({ kind: 'sheets', filePath: path })).toBeNull()
  })
})
