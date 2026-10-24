// @vitest-environment node
/**
 * PDF crash recovery (recovery spec 1-3, 5.4, 7): the main process keeps a
 * copy of what a save would write in the app data folder, never touching the
 * file; a save deletes it; a password or encrypted PDF gets none; opening the
 * file again asks before anything is read, and a restored tab shows the copy,
 * keeps the original path and leaves the original alone until it is saved.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

type IpcHandler = (event: { sender: unknown }, ...args: unknown[]) => unknown
const handlers = new Map<string, IpcHandler>()
const showMessageBox = vi.fn()
const showSaveDialog = vi.fn()

interface FakeWebContents {
  id: number
  listeners: Map<string, () => void>
  sent: string[]
  sentArgs: [string, ...unknown[]][]
  onSend: ((channel: string, ...args: unknown[]) => void) | null
  reloads: number
  destroyed: boolean
  once: (event: string, handler: () => void) => void
  on: (event: string, handler: () => void) => void
  setWindowOpenHandler: () => void
  loadURL: () => void
  isDestroyed: () => boolean
  reload: () => void
  send: (channel: string, ...args: unknown[]) => void
}

let nextWcId = 1

function makeFakeWebContents(): FakeWebContents {
  const listeners = new Map<string, () => void>()
  const wc: FakeWebContents = {
    id: nextWcId++,
    listeners,
    sent: [],
    sentArgs: [],
    onSend: null,
    reloads: 0,
    destroyed: false,
    once: (event, handler) => void listeners.set(event, handler),
    on: (event, handler) => void listeners.set(event, handler),
    setWindowOpenHandler: () => {},
    loadURL: () => {},
    isDestroyed: () => wc.destroyed,
    reload: () => {
      wc.reloads += 1
    },
    send: (channel, ...args) => {
      wc.sent.push(channel)
      wc.sentArgs.push([channel, ...args])
      wc.onSend?.(channel, ...args)
    },
  }
  return wc
}

vi.mock('electron', () => ({
  app: { on: vi.fn(), whenReady: vi.fn(() => new Promise(() => {})) },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  shell: {},
  webContents: { fromId: () => undefined },
  BrowserWindow: class {
    static fromWebContents() {
      return null
    }
  },
  WebContentsView: class {
    webContents = makeFakeWebContents()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
}))

import {
  createRecoveryStore,
  markAppShuttingDown,
  newUntitledRecoveryId,
  recoveryEditor,
  resetAppShuttingDown,
  type RecoveryStore,
} from '@genoffice/electron-utils'
import {
  configurePdfRuntime,
  createPdfView,
  markPdfUntitledCopy,
  pdfCloseCancelled,
  requestPdfClose,
  setPdfRecoveryStore,
} from '../src/main/pdf-main'
import { createPdfRecovery } from '../src/main/pdf-recovery'
import { pdfBytesWithEdits, savePdfToPath } from '../src/main/save-pdf'
import { PDF_CHANNELS } from '../src/shared/ipc'
import type { SavePdfRequest, SavePdfResult } from '../src/shared/ipc'

const tempDirs = new Set<string>()
let store: RecoveryStore

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.add(dir)
  return dir
}

/** a two-page document with stable bytes */
async function pdfBytes(): Promise<Buffer> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.addPage([300, 400])
  doc.addPage([300, 400])
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

async function makePdfFile(): Promise<string> {
  const path = join(makeDir('pdf-recovery-doc-'), 'document.pdf')
  writeFileSync(path, await pdfBytes())
  return path
}

const event = (wc: FakeWebContents) => ({ sender: wc })
const invoke = <T>(channel: string, wc: FakeWebContents, ...args: unknown[]) =>
  handlers.get(channel)!(event(wc), ...args) as Promise<T>

const consumePending = (wc: FakeWebContents) =>
  invoke<string | null>(PDF_CHANNELS.consumePending, wc)
const readView = async (wc: FakeWebContents, path: string) =>
  Buffer.from(await invoke<ArrayBuffer>(PDF_CHANNELS.readFile, wc, path))
const save = (wc: FakeWebContents, request: SavePdfRequest) =>
  invoke<SavePdfResult>(PDF_CHANNELS.save, wc, request)
const writeCopy = (wc: FakeWebContents, request: SavePdfRequest) =>
  invoke<string>(PDF_CHANNELS.recoveryWriteCopy, wc, request)
const recoveryState = (wc: FakeWebContents, path: string) =>
  invoke<{ unsaved: boolean }>(PDF_CHANNELS.recoveryState, wc, path)
const setDirty = (wc: FakeWebContents, dirty: boolean) =>
  handlers.get(PDF_CHANNELS.dirtyChanged)!(event(wc), dirty)

const emptyRequest = (path: string): SavePdfRequest => ({
  path,
  markups: [],
  drawings: [],
  formValues: [],
  stamps: [],
})

/** edits on screen: a highlight and the second page deleted */
const editedRequest = (path: string): SavePdfRequest => ({
  ...emptyRequest(path),
  markups: [
    {
      pageIndex: 0,
      type: 'highlight',
      color: [1, 0.87, 0.35],
      quads: [[50, 120, 200, 120, 50, 100, 200, 100]],
    },
  ],
  deletedPages: [1],
})

/** a view the shell opened on `path` whose renderer asked for its file and read it */
async function openedView(path: string | null): Promise<FakeWebContents> {
  const view = createPdfView(path)
  const wc = view.webContents as unknown as FakeWebContents
  const pending = await consumePending(wc)
  if (pending) await readView(wc, pending)
  return wc
}

const fileIdentity = (path: string) => ({ kind: 'pdf' as const, filePath: path })

beforeEach(() => {
  store = createRecoveryStore({ userDataDir: makeDir('pdf-recovery-data-') })
  setPdfRecoveryStore(store)
  showMessageBox.mockReset()
  showSaveDialog.mockReset()
})

afterEach(() => {
  resetAppShuttingDown()
  setPdfRecoveryStore(undefined)
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.clear()
})

describe('copies of unsaved edits', () => {
  it('holds what a save would write, in the app data folder, and leaves the file alone', async () => {
    const path = await makePdfFile()
    const original = readFileSync(path)
    const wc = await openedView(path)

    expect(await writeCopy(wc, editedRequest(path))).toBe('written')

    const copy = await store.readCopy(fileIdentity(path))
    expect(copy).not.toBeNull()
    const expected = await pdfBytesWithEdits(path, editedRequest(path))
    expect(Buffer.from(copy!).equals(Buffer.from(expected))).toBe(true)
    expect((await PDFDocument.load(copy!)).getPageCount()).toBe(1)
    expect(store.copyPath(fileIdentity(path)).startsWith(dirname(path))).toBe(false)
    expect(readFileSync(path).equals(original)).toBe(true)
  })

  it('is deleted when the document is saved', async () => {
    const path = await makePdfFile()
    const wc = await openedView(path)
    await writeCopy(wc, editedRequest(path))
    expect(store.copyInfo(fileIdentity(path))).not.toBeNull()

    expect(await save(wc, editedRequest(path))).toMatchObject({ ok: true })
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
  })

  it('is not written for a password or encrypted PDF, which gets one notice per tab', async () => {
    const path = await makePdfFile()
    const wc = await openedView(path)

    const notice = await invoke<string | null>(PDF_CHANNELS.recoveryUnprotectable, wc, true)
    expect(typeof notice).toBe('string')
    expect(notice!.length).toBeGreaterThan(0)
    expect(await invoke(PDF_CHANNELS.recoveryUnprotectable, wc, true)).toBeNull()

    expect(await writeCopy(wc, editedRequest(path))).toBe('skipped')
    expect(store.copyInfo(fileIdentity(path))).toBeNull()

    configurePdfRuntime({ preloadPath: '' })
    expect(recoveryEditor('pdf')?.isUnprotectable(wc as never)).toBe(true)
  })

  it('is dropped by "Don\'t Save" and by closing a clean tab, but kept by a crash', async () => {
    const path = await makePdfFile()
    const wc = await openedView(path)
    await writeCopy(wc, editedRequest(path))
    setDirty(wc, true)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestPdfClose(wc as never)).toBe(true)
    expect(store.copyInfo(fileIdentity(path))).toBeNull()

    const clean = await openedView(path)
    await writeCopy(clean, editedRequest(path))
    clean.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).toBeNull()

    const crashed = await openedView(path)
    await writeCopy(crashed, editedRequest(path))
    setDirty(crashed, true)
    crashed.listeners.get('render-process-gone')!()
    crashed.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).not.toBeNull()
  })

  it('survives a clean close while the app is ending', async () => {
    const path = await makePdfFile()
    const wc = await openedView(path)
    await writeCopy(wc, editedRequest(path))
    markAppShuttingDown()
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).not.toBeNull()
  })
})

describe('opening a file that has a copy', () => {
  /** a tab that wrote a copy, then the app went away without saving */
  async function crashWithCopy(path: string): Promise<void> {
    const before = await openedView(path)
    expect(await writeCopy(before, editedRequest(path))).toBe('written')
    setDirty(before, true)
    before.listeners.get('render-process-gone')!()
    before.listeners.get('destroyed')!()
  }

  it('asks first; restoring shows the copy, keeps the original until a save writes it', async () => {
    const path = await makePdfFile()
    const original = readFileSync(path)
    // what a save before the crash would have written (to another file, for comparison)
    const preCrashTarget = join(makeDir('pdf-recovery-precrash-'), 'saved.pdf')
    await savePdfToPath(path, preCrashTarget, editedRequest(path))
    const preCrashSave = readFileSync(preCrashTarget)
    await crashWithCopy(path)

    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const view = createPdfView(path).webContents as unknown as FakeWebContents
    expect(await consumePending(view)).toBe(path)
    expect(showMessageBox).toHaveBeenCalledTimes(1)

    expect((await readView(view, path)).equals(preCrashSave)).toBe(true)
    expect(await recoveryState(view, path)).toEqual({ unsaved: true })
    expect(readFileSync(path).equals(original)).toBe(true)
    // a copy written now (nothing new on screen) still holds the restored content
    expect(await writeCopy(view, emptyRequest(path))).toBe('written')
    expect(readFileSync(path).equals(original)).toBe(true)

    expect(await save(view, emptyRequest(path))).toMatchObject({ ok: true })
    expect(readFileSync(path).equals(preCrashSave)).toBe(true)
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
    expect(await recoveryState(view, path)).toEqual({ unsaved: false })
    expect((await readView(view, path)).equals(preCrashSave)).toBe(true)
  })

  it('new edits on a restored tab are saved on top of the copy', async () => {
    const path = await makePdfFile()
    await crashWithCopy(path)
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const view = await openedView(path)

    const more: SavePdfRequest = {
      ...emptyRequest(path),
      rotations: [{ pageIndex: 0, delta: 90 }],
    }
    expect(await save(view, more)).toMatchObject({ ok: true })
    const saved = await PDFDocument.load(readFileSync(path))
    expect(saved.getPageCount()).toBe(1)
    expect(saved.getPage(0).getRotation().angle).toBe(90)
  })

  it('discarding opens the file as saved and deletes the copy', async () => {
    const path = await makePdfFile()
    const original = readFileSync(path)
    await crashWithCopy(path)

    showMessageBox.mockResolvedValueOnce({ response: 1 })
    const view = createPdfView(path).webContents as unknown as FakeWebContents
    await consumePending(view)
    expect((await readView(view, path)).equals(original)).toBe(true)
    expect(await recoveryState(view, path)).toEqual({ unsaved: false })
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
  })

  it('restores without asking when the launch list already chose restore', async () => {
    const path = await makePdfFile()
    await crashWithCopy(path)
    store.applyLaunchDecision(fileIdentity(path), 'restore')

    const view = createPdfView(path).webContents as unknown as FakeWebContents
    await consumePending(view)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(await recoveryState(view, path)).toEqual({ unsaved: true })
  })

  it("follows the shell's decision when it opens the file with one", async () => {
    const path = await makePdfFile()
    await crashWithCopy(path)
    configurePdfRuntime({ preloadPath: '' })
    const contract = recoveryEditor('pdf')!

    const view = createPdfView(path).webContents as unknown as FakeWebContents
    await contract.openFileWithDecision(view as never, { filePath: path, decision: 'restore' })
    await consumePending(view)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(await recoveryState(view, path)).toEqual({ unsaved: true })

    // a view that already read its file reads again with the decision
    await contract.openFileWithDecision(view as never, { filePath: path, decision: 'original' })
    expect(view.reloads).toBe(1)
    await consumePending(view)
    expect(await recoveryState(view, path)).toEqual({ unsaved: false })
  })
})

describe('untitled documents', () => {
  it('reopen from their copy as untitled, outside user folders, until a save picks a file', async () => {
    const bytes = await pdfBytes()
    const copy = { kind: 'pdf' as const, untitledId: newUntitledRecoveryId(), ext: '.pdf' }
    await store.writeCopy(copy, bytes, { title: 'Draft' })
    configurePdfRuntime({ preloadPath: '' })
    const contract = recoveryEditor('pdf')!

    const view = createPdfView(null).webContents as unknown as FakeWebContents
    expect(await consumePending(view)).toBeNull()
    const missing = join(makeDir('pdf-recovery-missing-'), 'gone.pdf')
    await contract.openUntitledCopy(view as never, {
      copy,
      title: 'Draft',
      saveAsDefaultPath: missing,
    })
    expect(view.reloads).toBe(1)

    const working = (await consumePending(view))!
    expect(working.startsWith(tmpdir())).toBe(true)
    expect((await readView(view, working)).equals(bytes)).toBe(true)
    expect(await recoveryState(view, working)).toEqual({ unsaved: true })
    expect(await invoke(PDF_CHANNELS.isUntitledCopy, view, working)).toBe(true)

    // new edits land in the untitled slot, not under the working file's path
    expect(await writeCopy(view, editedRequest(working))).toBe('written')
    expect(store.copyInfo(fileIdentity(working))).toBeNull()
    expect(store.copyInfo(copy)).not.toBeNull()

    // the first save writes the working file, then asks where (the missing original first)
    expect(await save(view, editedRequest(working))).toMatchObject({ ok: true })
    const target = join(makeDir('pdf-recovery-target-'), 'picked.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await invoke(PDF_CHANNELS.adoptUntitledCopy, view, working, 'Draft.pdf')).toBe(target)
    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({ defaultPath: missing })
    expect(existsSync(target)).toBe(true)
    expect(store.copyInfo(copy)).toBeNull()
  })

  it("a skill template's copy writes its copies to an untitled slot", async () => {
    const working = join(makeDir('pdf-recovery-template-'), 'template.pdf')
    writeFileSync(working, await pdfBytes())
    markPdfUntitledCopy(working)
    const view = await openedView(working)

    expect(await writeCopy(view, editedRequest(working))).toBe('written')
    expect(store.copyInfo(fileIdentity(working))).toBeNull()
    expect(store.listCopies({ untitled: true })).toHaveLength(1)
  })
})

describe('"Don\'t Save" while the window is still closing', () => {
  /** a dirty tab with a copy whose close prompt was answered "Don't Save" */
  async function droppedView(path: string): Promise<FakeWebContents> {
    const wc = await openedView(path)
    expect(await writeCopy(wc, editedRequest(path))).toBe('written')
    setDirty(wc, true)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestPdfClose(wc as never)).toBe(true)
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
    return wc
  }

  it('writes no new copy and drops a late one when the tab goes', async () => {
    const path = await makePdfFile()
    const wc = await droppedView(path)
    expect(wc.sentArgs).toContainEqual([PDF_CHANNELS.recoveryDropped, true])

    // the renderer's round lands while prompts for other tabs are still open
    expect(await writeCopy(wc, editedRequest(path))).toBe('superseded')
    expect(store.copyInfo(fileIdentity(path))).toBeNull()

    // a copy that slipped in anyway is deleted when the dirty tab goes
    await store.writeCopy(fileIdentity(path), await pdfBytes(), { title: 'document.pdf' })
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
  })

  it('drops the late copy even while the app is ending', async () => {
    const path = await makePdfFile()
    const wc = await droppedView(path)
    await store.writeCopy(fileIdentity(path), await pdfBytes(), { title: 'document.pdf' })
    markAppShuttingDown()
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
  })

  it('writes copies again once the user edits after a cancelled close', async () => {
    const path = await makePdfFile()
    const wc = await droppedView(path)
    await invoke(PDF_CHANNELS.recoveryResume, wc)
    expect(await writeCopy(wc, editedRequest(path))).toBe('written')
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).not.toBeNull()
  })

  it('writes copies again when the shell reports the close was cancelled', async () => {
    const path = await makePdfFile()
    const wc = await droppedView(path)
    pdfCloseCancelled(wc as never)
    expect(wc.sentArgs).toContainEqual([PDF_CHANNELS.recoveryDropped, false])
    expect(await writeCopy(wc, editedRequest(path))).toBe('written')
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(path))).not.toBeNull()
  })
})

describe('saving into a new file (redaction, signature)', () => {
  it('leaves no copy of the unredacted edits for the redacted file', async () => {
    const path = await makePdfFile()
    const wc = await openedView(path)
    // edits are copied, then undone: the view is clean again, the copy is stale
    expect(await writeCopy(wc, editedRequest(path))).toBe('written')
    setDirty(wc, false)

    const target = join(makeDir('pdf-recovery-redacted-'), 'document-redacted.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    wc.onSend = (channel, targetPath) => {
      if (channel !== PDF_CHANNELS.saveAsRequest) return
      void save(wc, {
        ...emptyRequest(path),
        targetPath: targetPath as string,
        redactions: [{ pageIndex: 0, rect: [10, 10, 120, 60] }],
      }).then((result) => handlers.get(PDF_CHANNELS.saveAsResult)!(event(wc), result.ok))
    }
    expect(await invoke(PDF_CHANNELS.requestRedactionCopy, wc, path)).toBe(true)
    expect(existsSync(target)).toBe(true)

    expect(store.copyInfo(fileIdentity(target))).toBeNull()
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
    expect(store.listCopies()).toHaveLength(0)
    // a crash now keeps nothing that could undo the redaction on restore
    wc.listeners.get('render-process-gone')!()
    wc.listeners.get('destroyed')!()
    expect(store.copyInfo(fileIdentity(target))).toBeNull()
  })

  it('moving to a new file deletes the old copy instead of carrying it', async () => {
    const path = await makePdfFile()
    const target = join(makeDir('pdf-recovery-signed-'), 'document-signed.pdf')
    const recovery = createPdfRecovery({
      store: () => store,
      dialog: { showMessageBox } as never,
      parentOf: () => null,
      lang: () => 'en',
      isUntitledCopyPath: () => false,
      workDir: () => makeDir('pdf-recovery-work-'),
    })
    const view = { id: 9001 }
    await recovery.resolveOnOpen(view, path)
    expect(await recovery.writeCopy(view.id, path, async () => pdfBytes())).toBe('written')

    recovery.movedToNewFile(view.id, path, target)
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
    expect(store.copyInfo(fileIdentity(target))).toBeNull()
    // the view's copies now follow the new file
    expect(await recovery.writeCopy(view.id, target, async () => pdfBytes())).toBe('written')
    expect(store.copyInfo(fileIdentity(target))).not.toBeNull()
  })
})

describe('password and encrypted PDFs, checked in the main process', () => {
  it('get no copy even before the renderer reports them', async () => {
    const plain = (await pdfBytes()).toString('latin1')
    const trailer = plain.lastIndexOf('trailer')
    const root = plain.indexOf('/Root', trailer)
    const encrypted = `${plain.slice(0, root)}/Encrypt 99 0 R\n${plain.slice(root)}`
    const path = join(makeDir('pdf-recovery-encrypted-'), 'locked.pdf')
    writeFileSync(path, Buffer.from(encrypted, 'latin1'))
    const wc = await openedView(path)

    expect(await writeCopy(wc, editedRequest(path))).toBe('skipped')
    expect(store.copyInfo(fileIdentity(path))).toBeNull()
    configurePdfRuntime({ preloadPath: '' })
    expect(recoveryEditor('pdf')?.isUnprotectable(wc as never)).toBe(true)
  })
})

describe('working files of restored untitled copies', () => {
  async function restoredUntitled(): Promise<{ view: FakeWebContents; working: string }> {
    const copy = { kind: 'pdf' as const, untitledId: newUntitledRecoveryId(), ext: '.pdf' }
    await store.writeCopy(copy, await pdfBytes(), { title: 'Draft' })
    configurePdfRuntime({ preloadPath: '' })
    const view = createPdfView(null).webContents as unknown as FakeWebContents
    await consumePending(view)
    await recoveryEditor('pdf')!.openUntitledCopy(view as never, {
      copy,
      title: 'Draft',
      saveAsDefaultPath: join(makeDir('pdf-recovery-default-'), 'Draft.pdf'),
    })
    const working = (await consumePending(view))!
    expect(existsSync(working)).toBe(true)
    return { view, working }
  }

  it('are removed when the tab closes', async () => {
    const { view, working } = await restoredUntitled()
    setDirty(view, true)
    view.listeners.get('destroyed')!()
    await vi.waitFor(() => expect(existsSync(working)).toBe(false))
  })

  it('are removed once the document is saved to a file the user picked', async () => {
    const { view, working } = await restoredUntitled()
    const target = join(makeDir('pdf-recovery-adopt-'), 'picked.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await invoke(PDF_CHANNELS.adoptUntitledCopy, view, working, 'Draft.pdf')).toBe(target)
    expect(existsSync(target)).toBe(true)
    await vi.waitFor(() => expect(existsSync(working)).toBe(false))
  })

  it('left over from an earlier run are swept after a day, and only in their folder', async () => {
    const dir = join(makeDir('pdf-recovery-sweep-'), 'work')
    mkdirSync(dir)
    const stale = join(dir, 'stale.pdf')
    const fresh = join(dir, 'fresh.pdf')
    const outside = join(dirname(dir), 'outside.pdf')
    for (const file of [stale, fresh, outside]) writeFileSync(file, 'x')
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    utimesSync(stale, twoDaysAgo, twoDaysAgo)
    utimesSync(outside, twoDaysAgo, twoDaysAgo)
    const recovery = createPdfRecovery({
      store: () => store,
      dialog: { showMessageBox } as never,
      parentOf: () => null,
      lang: () => 'en',
      isUntitledCopyPath: () => false,
      workDir: () => dir,
    })
    await recovery.sweepWorkFiles()
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  })
})
