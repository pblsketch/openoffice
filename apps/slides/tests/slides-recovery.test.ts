/**
 * PowerPoint crash recovery on the shared store (spec 1, 2, 5.4, 7, 10):
 * copies keep the legacy `slides-autosave` folder and sha1 naming, untitled
 * decks keep their copies in app data (never in the Documents folder), a
 * launch-list decision opens without the per-file prompt, the per-file prompt
 * names the deck and treats Esc as restore, deletions follow the reasons
 * (saved, don't save, clean close) and nothing is deleted by a close while
 * the app is ending, and a failed copy backs off instead of stopping.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  userDataDir: '',
  documentsDir: '',
  handlers: new Map<string, (...args: never[]) => unknown>(),
  /** runs once when the recent-files list is next read (a save's last steps) */
  beforeRecentRead: null as (() => Promise<void>) | null,
}))
const handlers = hoisted.handlers

// a seam inside a save: the recent-files update runs between writing the deck
// and the save's bookkeeping, so a recovery pass can be started right there
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    const hook = hoisted.beforeRecentRead
    if (hook && String(args[0]).endsWith('slides-recent.json')) {
      hoisted.beforeRecentRead = null
      await hook()
    }
    return actual.readFile(...args)
  }) as typeof actual.readFile
  return { ...actual, readFile, default: { ...actual, readFile } }
})

const showMessageBox = vi.fn(async (..._args: unknown[]) => ({ response: 0 }))
const showSaveDialog = vi.fn(async (..._args: unknown[]) => ({
  canceled: true,
  filePath: undefined as string | undefined,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData'
        ? hoisted.userDataDir
        : name === 'documents'
          ? hoisted.documentsDir
          : tmpdir(),
    getName: () => 'slides-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    getLocale: () => 'en-US',
    getSystemLocale: () => 'en-US',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) =>
      hoisted.handlers.set(channel, fn),
    on: (channel: string, fn: (...args: never[]) => unknown) => hoisted.handlers.set(channel, fn),
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static getFocusedWindow(): null {
      return null
    }
    static fromWebContents(): null {
      return null
    }
  },
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: {}, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: {},
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))

// The shaping chain loads a harfbuzz wasm that cannot resolve in the unit-test env.
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => false,
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

// pass-through spies: which serializer a recovery copy goes through
vi.mock('@genoffice/pptx-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genoffice/pptx-engine')>()
  return {
    ...actual,
    savePptx: vi.fn(actual.savePptx),
    savePptxToFile: vi.fn(actual.savePptxToFile),
  }
})

import { createBlankPptx, openPptx, savePptx, savePptxToFile } from '@genoffice/pptx-engine'
import {
  createRecoveryStore,
  markAppShuttingDown,
  recoveryEditor,
  resetAppShuttingDown,
  resumeDiscardedCopies,
  type RecoveryIdentity,
} from '@genoffice/electron-utils'
import {
  decryptOfficeFile,
  encryptOoxml,
  isEncryptedOoxml,
} from '@genoffice/electron-utils/office-encryption'
import {
  discardSlidesRecovery,
  registerSlidesIpc,
  releaseSlidesRecovery,
  requestSlidesClose,
  runSlidesRecoveryPass,
  saveSessionDeckTo,
  slidesIsDirty,
  slidesRecoveryIdentity,
} from '../src/main/slides-main'
import { markMetaDirty, sessions } from '../src/main/session-state'

const FIT = 1280

class FakeContents {
  sent: Array<[string, unknown]> = []
  destroyed = false
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  once(): void {}
  on(): void {}
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload])
  }
}

interface OpenResult {
  path: string
  slides: unknown[]
}

function call<T>(sender: FakeContents, channel: string, ...args: unknown[]): T {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return (fn as (...a: unknown[]) => T)({ sender }, ...args)
}

const store = () => createRecoveryStore({ userDataDir: hoisted.userDataDir })

let dir: string
let blankBytes: Uint8Array
let twoSlideBytes: Uint8Array

beforeAll(async () => {
  registerSlidesIpc()
  blankBytes = await createBlankPptx()
  // a deck that differs from the blank one: two slides
  const tab = new FakeContents(900)
  sessions.set(tab.id, {
    path: '',
    opened: await openPptx(blankBytes),
    fitWidthPx: FIT,
    undoStack: [],
    redoStack: [],
  })
  call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
  twoSlideBytes = await savePptx(sessions.get(tab.id)!.opened)
  sessions.clear()
})

beforeEach(() => {
  sessions.clear()
  dir = mkdtempSync(join(tmpdir(), 'genoffice-slides-recovery-'))
  hoisted.userDataDir = mkdtempSync(join(tmpdir(), 'genoffice-slides-recovery-user-'))
  hoisted.documentsDir = mkdtempSync(join(tmpdir(), 'genoffice-slides-recovery-docs-'))
  showMessageBox.mockReset()
  showMessageBox.mockResolvedValue({ response: 0 })
  showSaveDialog.mockReset()
  showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
})

afterEach(() => {
  hoisted.beforeRecentRead = null
  resetAppShuttingDown()
  resumeDiscardedCopies()
  rmSync(dir, { recursive: true, force: true })
  rmSync(hoisted.userDataDir, { recursive: true, force: true })
  rmSync(hoisted.documentsDir, { recursive: true, force: true })
})

function makeDeckFile(name = 'deck.pptx', bytes: Uint8Array = blankBytes): string {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

const legacyCopyPath = (filePath: string) =>
  join(
    hoisted.userDataDir,
    'slides-autosave',
    `${createHash('sha1').update(filePath).digest('hex').slice(0, 16)}.pptx`,
  )

async function newUntitledDeck(tab: FakeContents): Promise<void> {
  await call<Promise<unknown>>(tab, 'slides:new-blank', FIT)
}

/** a deck file with a copy holding two slides, as an abnormal exit leaves it */
async function fileWithCopy(): Promise<string> {
  const path = makeDeckFile()
  const tab = new FakeContents(50)
  await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
  call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
  await runSlidesRecoveryPass()
  expect(existsSync(legacyCopyPath(path))).toBe(true)
  // the app died: the session is gone, nothing was cleaned up
  sessions.clear()
  return path
}

describe('writing copies', () => {
  it('keeps an untitled deck in app data and creates nothing in the Documents folder', async () => {
    // a draft an earlier version left in the Documents folder stays as it was
    const oldDrafts = join(hoisted.documentsDir, 'GenOffice')
    mkdirSync(oldDrafts, { recursive: true })
    const oldDraft = join(oldDrafts, 'Untitled Presentation-20261001-101010.pptx')
    writeFileSync(oldDraft, blankBytes)

    const tab = new FakeContents(11)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    await runSlidesRecoveryPass()

    expect(readdirSync(oldDrafts)).toEqual([basenameOf(oldDraft)])
    expect(readFileSync(oldDraft)).toEqual(Buffer.from(blankBytes))
    const copies = store().listCopies({ kinds: ['slides'] })
    expect(copies).toHaveLength(1)
    expect(copies[0]!.untitledId).not.toBeNull()
    expect(copies[0]!.copyPath.startsWith(join(hoisted.userDataDir, 'slides-autosave'))).toBe(true)
    expect(copies[0]!.title.length).toBeGreaterThan(0)
  })

  it("tells the shell an untitled deck's copy slot, and nothing for a deck with a file", async () => {
    const tab = new FakeContents(13)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    await runSlidesRecoveryPass()
    const [copy] = store().listCopies({ kinds: ['slides'], untitled: true })
    expect(slidesRecoveryIdentity(tab.id)).toEqual({
      kind: 'slides',
      untitledId: copy!.untitledId,
      ext: '.pptx',
    })

    const fileTab = new FakeContents(14)
    await call<Promise<unknown>>(fileTab, 'slides:open-path', makeDeckFile(), FIT)
    expect(slidesRecoveryIdentity(fileTab.id)).toBeNull()
    expect(slidesRecoveryIdentity(9999)).toBeNull()
  })

  it('only reports an untitled copy slot, and asking does not make one', async () => {
    const tab = new FakeContents(18)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    // no copy written yet: nothing to report, and nothing is reserved by asking
    expect(slidesRecoveryIdentity(tab.id)).toBeNull()
    expect(slidesRecoveryIdentity(tab.id)).toBeNull()
    expect(sessions.get(tab.id)!.recoveryId).toBeUndefined()
    await runSlidesRecoveryPass()
    const [copy] = store().listCopies({ kinds: ['slides'], untitled: true })
    expect(slidesRecoveryIdentity(tab.id)).toEqual({
      kind: 'slides',
      untitledId: copy!.untitledId,
      ext: '.pptx',
    })
  })

  it('writes a file deck under the legacy name and never touches the original', async () => {
    const path = makeDeckFile()
    const before = readFileSync(path)
    const tab = new FakeContents(12)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    expect(showMessageBox).not.toHaveBeenCalled()
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()

    const copy = legacyCopyPath(path)
    expect(existsSync(copy)).toBe(true)
    expect(readFileSync(path)).toEqual(before)
    expect(store().copyInfo({ kind: 'slides', filePath: path })?.state).toBe('undecided')

    // nothing changed since: the next pass leaves the copy alone
    const old = new Date(Date.now() - 60_000)
    utimesSync(copy, old, old)
    const mtime = statSync(copy).mtimeMs
    await runSlidesRecoveryPass()
    expect(statSync(copy).mtimeMs).toBe(mtime)
    // a new edit is copied again
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    expect(statSync(copy).mtimeMs).toBeGreaterThan(mtime)
  })

  it('streams a plain deck copy through a temp file in the copy folder, never one big buffer', async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(16)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    vi.mocked(savePptx).mockClear()
    vi.mocked(savePptxToFile).mockClear()
    await runSlidesRecoveryPass()

    expect(savePptx).not.toHaveBeenCalled()
    expect(savePptxToFile).toHaveBeenCalledTimes(1)
    const target = vi.mocked(savePptxToFile).mock.calls[0]![1]
    const copy = legacyCopyPath(path)
    expect(dirname(target)).toBe(dirname(copy))
    expect(basename(target)).toMatch(/^\.[0-9a-f]{16}\.pptx\.[0-9a-f]{12}\.tmp$/)
    expect(existsSync(target)).toBe(false)
    expect(store().copyInfo({ kind: 'slides', filePath: path })?.state).toBe('undecided')
    // the copy holds what the buffered copy held before: savePptx's package, part for part
    const buffered = await savePptx(sessions.get(tab.id)!.opened)
    expect(await zipParts(readFileSync(copy))).toEqual(await zipParts(buffered))
  })

  it('streams an untitled deck copy too', async () => {
    const tab = new FakeContents(17)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    vi.mocked(savePptx).mockClear()
    await runSlidesRecoveryPass()
    expect(savePptx).not.toHaveBeenCalled()
    const copies = store().listCopies({ kinds: ['slides'], untitled: true })
    expect(copies).toHaveLength(1)
    const reopened = await openPptx(new Uint8Array(readFileSync(copies[0]!.copyPath)))
    expect(reopened.deck.slides.length).toBeGreaterThan(0)
  })

  it('keeps a password deck encrypted in its copy', async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(13)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    sessions.get(tab.id)!.password = 'secret'
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    vi.mocked(savePptxToFile).mockClear()
    await runSlidesRecoveryPass()
    // its plaintext never touches the disk: assembled in memory and encrypted
    expect(savePptxToFile).not.toHaveBeenCalled()
    const bytes = readFileSync(legacyCopyPath(path))
    expect(isEncryptedOoxml(bytes)).toBe(true)
    const plain = await decryptOfficeFile(bytes, 'secret')
    expect((await openPptx(new Uint8Array(plain))).deck.slides).toHaveLength(2)
  })

  it('backs off ten passes after a failed copy, then retries; writing now ignores the backoff', async () => {
    const tab = new FakeContents(14)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    // a file where the copy folder should be: every write fails
    const blocker = join(hoisted.userDataDir, 'slides-autosave')
    writeFileSync(blocker, 'not a folder')
    await runSlidesRecoveryPass()
    rmSync(blocker)
    for (let i = 0; i < 10; i++) await runSlidesRecoveryPass()
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(0)
    await runSlidesRecoveryPass()
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(1)

    // a second deck that just failed is still written when the OS is ending
    const other = new FakeContents(15)
    await newUntitledDeck(other)
    markMetaDirty(sessions.get(other.id)!)
    rmSync(join(hoisted.userDataDir, 'slides-autosave'), { recursive: true, force: true })
    writeFileSync(blocker, 'not a folder')
    await runSlidesRecoveryPass()
    rmSync(blocker)
    await recoveryEditor('slides')!.writeCopiesNow()
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(2)
  })
})

describe('opening a deck with a copy', () => {
  it('opens a copy chosen in the launch list without asking, unsaved, on the original path', async () => {
    const path = await fileWithCopy()
    const before = readFileSync(path)
    store().applyLaunchDecision({ kind: 'slides', filePath: path }, 'restore')
    const tab = new FakeContents(21)
    const result = await call<Promise<OpenResult>>(tab, 'slides:open-path', path, FIT)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(result.path).toBe(path)
    expect(result.slides).toHaveLength(2)
    expect(slidesIsDirty(tab.id)).toBe(true)
    expect(readFileSync(path)).toEqual(before)
    // loaded: the copy is undecided again, so a new crash lists it
    expect(store().copyInfo({ kind: 'slides', filePath: path })?.state).toBe('undecided')
  })

  it('asks with the deck name for an undecided copy; Esc restores', async () => {
    const path = await fileWithCopy()
    const tab = new FakeContents(22)
    const result = await call<Promise<OpenResult>>(tab, 'slides:open-path', path, FIT)
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const box = showMessageBox.mock.calls[0]!.at(-1) as { message: string; cancelId: number }
    expect(box.message).toContain('deck.pptx')
    expect(box.cancelId).toBe(0)
    expect(result.slides).toHaveLength(2)
    expect(slidesIsDirty(tab.id)).toBe(true)
  })

  it('leaves the copy for later when a chosen copy cannot be opened and the saved file opens', async () => {
    // a copy locked with a password the plain original does not have
    const path = makeDeckFile()
    const identity: RecoveryIdentity = { kind: 'slides', filePath: path }
    const locked = encryptOoxml(Buffer.from(twoSlideBytes), 'secret')
    await store().writeCopy(identity, locked)
    store().applyLaunchDecision(identity, 'restore')
    const tab = new FakeContents(28)
    const result = await call<Promise<OpenResult>>(tab, 'slides:open-path', path, FIT)
    expect(result.slides).toHaveLength(1)
    expect(slidesIsDirty(tab.id)).toBe(false)
    // nobody holds the copy: it is not left undecided (that would make every
    // later quit look abnormal), and it stays on disk for the launch list
    expect(store().copyInfo(identity)?.state).toBe('later')
    expect(store().hasUnresolvedCopies()).toBe(false)
    expect(isEncryptedOoxml(readFileSync(store().copyPath(identity)))).toBe(true)

    // the same through the per-file prompt and through the shell's decision
    sessions.clear()
    store().setCopyState(identity, 'undecided')
    const asked = new FakeContents(29)
    const r2 = await call<Promise<OpenResult>>(asked, 'slides:open-path', path, FIT)
    expect(r2.slides).toHaveLength(1)
    expect(store().copyInfo(identity)?.state).toBe('later')

    sessions.clear()
    const decided = new FakeContents(30)
    await recoveryEditor('slides')!.openFileWithDecision(decided as never, {
      filePath: path,
      decision: 'restore',
    })
    const r3 = await call<Promise<OpenResult>>(decided, 'slides:consume-pending-open', FIT)
    expect(r3.slides).toHaveLength(1)
    expect(store().copyInfo(identity)?.state).toBe('later')
  })

  it('leaves an unreadable chosen copy for later when its open fails', async () => {
    const path = makeDeckFile()
    const identity: RecoveryIdentity = { kind: 'slides', filePath: path }
    await store().writeCopy(identity, Buffer.from('not a deck'))
    store().applyLaunchDecision(identity, 'restore')
    const tab = new FakeContents(39)
    await expect(call<Promise<OpenResult>>(tab, 'slides:open-path', path, FIT)).rejects.toThrow()
    expect(store().copyInfo(identity)?.state).toBe('later')
  })

  it('opens the saved file and deletes the copy when the prompt is answered Discard', async () => {
    const path = await fileWithCopy()
    showMessageBox.mockResolvedValue({ response: 1 })
    const tab = new FakeContents(23)
    const result = await call<Promise<OpenResult>>(tab, 'slides:open-path', path, FIT)
    expect(result.slides).toHaveLength(1)
    expect(existsSync(legacyCopyPath(path))).toBe(false)
  })

  it('follows the decision the shell passes for a restored tab, without asking', async () => {
    const path = await fileWithCopy()
    const contract = recoveryEditor('slides')!
    const original = new FakeContents(24)
    await contract.openFileWithDecision(original as never, { filePath: path, decision: 'original' })
    const r1 = await call<Promise<OpenResult>>(original, 'slides:consume-pending-open', FIT)
    expect(r1.slides).toHaveLength(1)
    expect(showMessageBox).not.toHaveBeenCalled()
    // 'original' leaves the copy where it is
    expect(existsSync(legacyCopyPath(path))).toBe(true)

    sessions.clear()
    const restored = new FakeContents(25)
    await contract.openFileWithDecision(restored as never, { filePath: path, decision: 'restore' })
    const r2 = await call<Promise<OpenResult>>(restored, 'slides:consume-pending-open', FIT)
    expect(r2.slides).toHaveLength(2)
    expect(r2.path).toBe(path)
    expect(slidesIsDirty(restored.id)).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('opens an untitled copy as an untitled deck that asks where on its first save', async () => {
    const identity: RecoveryIdentity = { kind: 'slides', untitledId: 'deck-1', ext: '.pptx' }
    await store().writeCopy(identity, Buffer.from(twoSlideBytes), { title: 'Plan' })
    const tab = new FakeContents(26)
    // not awaited: the renderer may ask for its pending open before the copy is read
    void recoveryEditor('slides')!.openUntitledCopy(tab as never, { copy: identity, title: 'Plan' })
    const result = await call<Promise<OpenResult>>(tab, 'slides:consume-pending-open', FIT)
    expect(result.path).toBe('')
    expect(result.slides).toHaveLength(2)
    const session = sessions.get(tab.id)!
    expect(session.askPathOnFirstSave).toBe(true)
    expect(session.firstSaveName).toBe('Plan.pptx')
    expect(slidesIsDirty(tab.id)).toBe(true)

    // later copies go to the same slot
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    const copies = store().listCopies({ kinds: ['slides'] })
    expect(copies.map((c) => c.untitledId)).toEqual(['deck-1'])

    // the first save asks where and removes the copy
    const target = join(dir, 'Plan.pptx')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    const saved = await call<Promise<{ ok: boolean }>>(tab, 'slides:save', false)
    expect(saved.ok).toBe(true)
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    expect(existsSync(target)).toBe(true)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(0)
    expect(filesIn(hoisted.documentsDir)).toEqual([])
  })

  it('suggests the original path when a copy whose file went missing opens untitled', async () => {
    const missing = join(dir, 'gone', 'Report.pptx')
    const identity: RecoveryIdentity = { kind: 'slides', filePath: missing }
    await store().writeCopy(identity, Buffer.from(twoSlideBytes))
    const tab = new FakeContents(27)
    await recoveryEditor('slides')!.openUntitledCopy(tab as never, {
      copy: identity,
      title: 'Report.pptx',
      saveAsDefaultPath: missing,
    })
    const result = await call<Promise<OpenResult>>(tab, 'slides:consume-pending-open', FIT)
    expect(result.path).toBe('')
    expect(sessions.get(tab.id)!.firstSaveName).toBe(missing)
    // the copy now belongs to this untitled deck: the shell sees an untitled
    // slot, and the copy keeps the original path for a later crash
    expect(store().copyInfo(identity)).toBeNull()
    const own = slidesRecoveryIdentity(tab.id)
    expect(own).toMatchObject({ kind: 'slides', ext: '.pptx' })
    expect(own && 'untitledId' in own).toBe(true)
    const untitled = store().listCopies({ kinds: ['slides'], untitled: true })
    expect(untitled).toHaveLength(1)
    expect(untitled[0]!.untitledId).toBe((own as { untitledId: string }).untitledId)
    expect(untitled[0]!.originalPath).toBe(missing)
    expect(untitled[0]!.state).toBe('undecided')
    // later copies go to that slot
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    expect(store().copyInfo(identity)).toBeNull()
    expect(
      store()
        .listCopies({ kinds: ['slides'] })
        .map((c) => c.untitledId),
    ).toEqual([untitled[0]!.untitledId])
    const target = join(dir, 'Report.pptx')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    await call<Promise<unknown>>(tab, 'slides:save', false)
    expect(store().copyInfo(identity)).toBeNull()
  })
})

describe('deleting copies', () => {
  it('deletes the copy when the deck is saved', async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(31)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    expect(existsSync(legacyCopyPath(path))).toBe(true)
    const saved = await call<Promise<{ ok: boolean }>>(tab, 'slides:save', false)
    expect(saved.ok).toBe(true)
    expect(existsSync(legacyCopyPath(path))).toBe(false)
  })

  it("deletes the copy on Don't Save in the close prompt", async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(32)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    showMessageBox.mockResolvedValue({ response: 1 })
    markAppShuttingDown()
    expect(await requestSlidesClose(tab as never)).toBe(true)
    expect(existsSync(legacyCopyPath(path))).toBe(false)
  })

  it('deletes the copy on an MCP close without saving, even while the app is ending', async () => {
    const tab = new FakeContents(33)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    await runSlidesRecoveryPass()
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(1)
    markAppShuttingDown()
    discardSlidesRecovery(tab as never)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(0)
  })

  it('keeps copies when tabs close while the app is ending; a clean close otherwise removes its copy', async () => {
    const tab = new FakeContents(34)
    await newUntitledDeck(tab)
    const session = sessions.get(tab.id)!
    markMetaDirty(session)
    await runSlidesRecoveryPass()
    // back to clean (undo), then the app ends and closes the tab
    session.metaDirty = false
    markAppShuttingDown()
    releaseSlidesRecovery(tab.id)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(1)

    // the same clean close while the app keeps running removes it
    resetAppShuttingDown()
    releaseSlidesRecovery(tab.id)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(0)
  })

  it("writes no copy for a deck discarded with Don't Save while another deck's copy is being written", async () => {
    const heavyPath = makeDeckFile('heavy.pptx')
    const laterPath = makeDeckFile('later.pptx')
    const heavy = new FakeContents(41)
    const later = new FakeContents(42)
    for (const tab of [heavy, later]) {
      await call<Promise<unknown>>(
        tab,
        'slides:open-path',
        tab === heavy ? heavyPath : laterPath,
        FIT,
      )
      call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    }
    const release = holdNextDeckWrite()
    const pass = runSlidesRecoveryPass()
    await vi.waitFor(() => expect(savePptxToFile).toHaveBeenCalled())
    // the heavy deck is still being written: the later one is closed, Don't Save
    showMessageBox.mockResolvedValue({ response: 1 })
    expect(await requestSlidesClose(later as never)).toBe(true)
    release()
    await pass
    expect(existsSync(legacyCopyPath(heavyPath))).toBe(true)
    expect(existsSync(legacyCopyPath(laterPath))).toBe(false)
    // its view is gone: the clean-close cleanup does not bring it back either
    releaseSlidesRecovery(later.id)
    sessions.delete(later.id)
    await runSlidesRecoveryPass()
    expect(existsSync(legacyCopyPath(laterPath))).toBe(false)
  })

  it('writes no copy for a deck an MCP close discarded and whose view went away mid-pass', async () => {
    const heavy = new FakeContents(43)
    const later = new FakeContents(44)
    await newUntitledDeck(heavy)
    await newUntitledDeck(later)
    markMetaDirty(sessions.get(heavy.id)!)
    markMetaDirty(sessions.get(later.id)!)
    const release = holdNextDeckWrite()
    const pass = runSlidesRecoveryPass()
    await vi.waitFor(() => expect(savePptxToFile).toHaveBeenCalled())
    discardSlidesRecovery(later as never)
    releaseSlidesRecovery(later.id)
    sessions.delete(later.id)
    release()
    await pass
    const copies = store().listCopies({ kinds: ['slides'] })
    expect(copies).toHaveLength(1)
    expect(copies[0]!.identity).toEqual(slidesRecoveryIdentity(heavy.id))
  })

  it("copies a deck again, without a new edit, once the close after its Don't Save is cancelled", async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(45)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    await runSlidesRecoveryPass()
    showMessageBox.mockResolvedValue({ response: 1 })
    expect(await requestSlidesClose(tab as never)).toBe(true)
    // the window close still asks the other tabs: this deck is not serialized again
    vi.mocked(savePptxToFile).mockClear()
    await runSlidesRecoveryPass()
    expect(savePptxToFile).not.toHaveBeenCalled()
    expect(existsSync(legacyCopyPath(path))).toBe(false)
    // another tab cancelled the close: the tab stays open and the safety net is back
    resumeDiscardedCopies()
    await runSlidesRecoveryPass()
    expect(existsSync(legacyCopyPath(path))).toBe(true)
  })

  it('leaves no copy of a deck just saved with Save As when a pass runs during the save', async () => {
    const path = makeDeckFile()
    const tab = new FakeContents(46)
    await call<Promise<unknown>>(tab, 'slides:open-path', path, FIT)
    call(tab, 'slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    const target = join(dir, 'Copy.pptx')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    hoisted.beforeRecentRead = () => runSlidesRecoveryPass()
    markAppShuttingDown()
    const saved = await call<Promise<{ ok: boolean }>>(tab, 'slides:save-as', 'Copy.pptx')
    expect(saved.ok).toBe(true)
    expect(hoisted.beforeRecentRead).toBeNull()
    expect(slidesIsDirty(tab.id)).toBe(false)
    expect(store().copyInfo({ kind: 'slides', filePath: target })).toBeNull()
    expect(store().copyInfo({ kind: 'slides', filePath: path })).toBeNull()
    expect(store().hasUnresolvedCopies()).toBe(false)
  })

  it('leaves no copy of a deck an MCP save wrote when a pass runs during the save', async () => {
    const tab = new FakeContents(47)
    await newUntitledDeck(tab)
    const session = sessions.get(tab.id)!
    markMetaDirty(session)
    await runSlidesRecoveryPass()
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(1)
    const target = join(dir, 'mcp', 'Saved.pptx')
    hoisted.beforeRecentRead = () => runSlidesRecoveryPass()
    markAppShuttingDown()
    await saveSessionDeckTo(session, target)
    expect(hoisted.beforeRecentRead).toBeNull()
    expect(existsSync(target)).toBe(true)
    expect(slidesIsDirty(tab.id)).toBe(false)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(0)
    expect(store().copyInfo({ kind: 'slides', filePath: target })).toBeNull()
    expect(store().hasUnresolvedCopies()).toBe(false)
  })

  it('keeps the copy of a deck that closes with unsaved changes', async () => {
    const tab = new FakeContents(35)
    await newUntitledDeck(tab)
    markMetaDirty(sessions.get(tab.id)!)
    await runSlidesRecoveryPass()
    releaseSlidesRecovery(tab.id)
    expect(store().listCopies({ kinds: ['slides'] })).toHaveLength(1)
    expect(filesIn(hoisted.documentsDir)).toEqual([])
  })
})

/**
 * Hold the next deck serialization (a heavy deck's copy taking its time)
 * until the returned function is called.
 */
function holdNextDeckWrite(): () => void {
  const write = vi.mocked(savePptxToFile)
  const real = write.getMockImplementation()!
  write.mockClear()
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  write.mockImplementationOnce(async (...args) => {
    await gate
    return real(...args)
  })
  return release
}

/** every part of a zip package with its bytes, by name */
async function zipParts(bytes: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(bytes)
  const parts: Record<string, string> = {}
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir) parts[entry.name] = Buffer.from(await entry.async('uint8array')).toString('hex')
  }
  return parts
}

function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop()!
}

/** every file under `root` (the Save dialog's default folder may exist, empty) */
function filesIn(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
}
