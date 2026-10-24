// @vitest-environment node
/**
 * Crash-recovery copies of HWP documents in the main process (main/recovery.ts):
 * where a copy goes and what it holds, when it goes away, and how a file with a
 * copy left over opens again. The renderer's side is played by the test with the
 * real engine; the Electron surface is faked.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import * as CFB from 'cfb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn(
  async (..._args: unknown[]): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true,
  }),
)
/** the answer every message box gets: the per-file recovery prompt and the close prompt */
const showMessageBox = vi.fn(async (..._args: unknown[]) => ({ response: 0 }))
let userData = ''

interface FakeContents {
  id: number
  destroyed: boolean
  sent: { channel: string; args: unknown[] }[]
  reloads: number
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  reload(): void
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
  emit(event: string): void
}

let nextId = 1
function fakeContents(): FakeContents {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const add = (event: string, listener: (...args: unknown[]) => void) =>
    listeners.set(event, [...(listeners.get(event) ?? []), listener])
  const contents: FakeContents = {
    id: nextId++,
    destroyed: false,
    sent: [],
    reloads: 0,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    reload: () => {
      contents.reloads += 1
    },
    send: (channel, ...args) => contents.sent.push({ channel, args }),
    on: add,
    once: add,
    emit: (event) => {
      if (event === 'destroyed') contents.destroyed = true
      for (const listener of listeners.get(event) ?? []) listener()
    },
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => (name === 'userData' ? userData : join(tmpdir(), `hwp-${name}`)),
    getLocale: () => 'en-US',
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  shell: { openExternal: vi.fn(async () => {}), showItemInFolder: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  net: {},
  ipcRenderer: {},
  webUtils: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  WebContentsView: class {
    webContents = fakeContents()
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

vi.mock('@genoffice/file-parse', () => ({
  hwpToText: vi.fn(async () => ''),
  parseFileToText: vi.fn(async () => ({ kind: 'text', text: '' })),
  ATTACHABLE_EXTS: new Set<string>(),
  ATTACHABLE_IMAGE_EXTS: new Set<string>(),
  ATTACHABLE_MAX_BYTES: 25 * 1024 * 1024,
  ATTACHABLE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
}))

import {
  createRecoveryStore,
  markAppShuttingDown,
  recoveryEditor,
  resetAppShuttingDown,
  resumeDiscardedCopies,
} from '@genoffice/electron-utils'
import type { RecoveryIdentity } from '@genoffice/electron-utils'
import {
  configureHwpRuntime,
  createHwpView,
  hwpFileRenamed,
  hwpRecoveryIdentity,
  requestHwpClose,
} from '../src/main/hwp-main'
import { fieldKindsOf } from '../src/main/field-kinds'
import { applySaveFixes } from '../src/main/save-fixes'
import { sectionTailsOf } from '../src/main/section-tails'
import { HWP_CHANNELS } from '../src/shared/ipc'
import type {
  BeginSaveResult,
  CommitSaveResult,
  RecoveryBeginResult,
  RecoveryOpenedResult,
  RecoveryWriteOutcome,
} from '../src/shared/ipc'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
  configureHwpRuntime({ preloadPath: '' })
})

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

/** the views a test opened: closed after it, so none lingers into the next */
const opened: FakeContents[] = []
function view(path?: string | null, options?: { untitledCopy?: boolean }): FakeContents {
  const contents = createHwpView(path, options).webContents as unknown as FakeContents
  opened.push(contents)
  return contents
}

// ---- documents: the engine's, with the lists Hangul keeps after a section's body ----

const PARA_HEADER = 66
const PARA_CHAR_SHAPE = 68
const PARA_LINE_SEG = 69
const LIST_HEADER = 72
const SECTION0 = '/BodyText/Section0'

function record(tag: number, level: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32LE((tag | (level << 10) | (payload.length << 20)) >>> 0)
  return Buffer.concat([head, payload])
}

function masterPage(kind: number): Buffer {
  const header = Buffer.alloc(34)
  header.writeUInt32LE(1, 0)
  header.writeUInt32LE(67180, 8)
  header.writeUInt32LE(51024, 12)
  header.writeUInt8(kind, 18)
  const para = Buffer.alloc(24)
  para.writeUInt32LE(0x80000001, 0)
  para.writeUInt16LE(1, 12)
  para.writeUInt16LE(1, 16)
  const line = Buffer.alloc(36)
  line.writeUInt32LE(1000, 8)
  line.writeUInt32LE(1000, 12)
  line.writeUInt32LE(850, 16)
  return Buffer.concat([
    record(LIST_HEADER, 1, header),
    record(PARA_HEADER, 1, para),
    record(PARA_CHAR_SHAPE, 2, Buffer.alloc(8)),
    record(PARA_LINE_SEG, 2, line),
  ])
}

/** an engine document with master pages after the body, as Hangul writes them */
function fileWithTails(...lines: string[]): Uint8Array {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  const bytes = doc.exportHwp()
  doc.free()
  const cfb = CFB.read(Buffer.from(bytes), { type: 'buffer' })
  const entry = CFB.find(cfb, SECTION0)!
  const body = inflateRawSync(Buffer.from(entry.content as Uint8Array))
  CFB.utils.cfb_add(
    cfb,
    SECTION0,
    deflateRawSync(Buffer.concat([body, masterPage(4), masterPage(5)])),
  )
  return new Uint8Array(CFB.write(cfb, { type: 'buffer' }) as Buffer)
}

/** what the editor exports after typing `text` at the start of the first paragraph */
function edited(file: Uint8Array, text: string, format: 'hwp' | 'hwpx' = 'hwp'): Uint8Array {
  const doc = new HwpDocument(file)
  doc.insertText(0, 0, 0, text)
  const bytes = format === 'hwp' ? doc.exportHwp() : doc.exportHwpx()
  doc.free()
  return bytes
}

/** each stream as it reads (inflated): two writes of one document may lay out the box apart */
function streamsOf(file: Uint8Array): Map<string, string> {
  const cfb = CFB.read(Buffer.from(file), { type: 'buffer' })
  const streams = new Map<string, string>()
  cfb.FullPaths.forEach((path, index) => {
    const entry = cfb.FileIndex[index]
    if (entry?.type !== 2) return
    const raw = Buffer.from(entry.content as Uint8Array)
    let data: Buffer
    try {
      data = inflateRawSync(raw)
    } catch {
      data = raw
    }
    streams.set(path, data.toString('hex'))
  })
  return streams
}

function textOf(file: Uint8Array): string {
  const doc = new HwpDocument(file)
  const text = doc.getTextFileText()
  doc.free()
  return text
}

/** the renderer's copy turn: begin, then hand over what the editor exported */
async function writeCopy(contents: FakeContents, bytes: Uint8Array): Promise<RecoveryWriteOutcome> {
  const begin = await call<Promise<RecoveryBeginResult>>(HWP_CHANNELS.recoveryBegin, contents)
  if (!begin.ok) return 'refused'
  return call<Promise<RecoveryWriteOutcome>>(
    HWP_CHANNELS.recoveryWrite,
    contents,
    bytes,
    begin.format,
    [],
  )
}

const store = () => createRecoveryStore({ userDataDir: userData })
const fileIdentity = (filePath: string): RecoveryIdentity => ({ kind: 'hwp', filePath })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-hwp-recovery-'))
  userData = join(dir, 'userData')
  showSaveDialog.mockReset()
  showSaveDialog.mockResolvedValue({ canceled: true })
  showMessageBox.mockReset()
  showMessageBox.mockResolvedValue({ response: 0 })
})
afterEach(() => {
  for (const contents of opened.splice(0)) if (!contents.destroyed) contents.emit('destroyed')
  resetAppShuttingDown()
  resumeDiscardedCopies()
  rmSync(dir, { recursive: true, force: true })
})

describe('a recovery copy of a file', () => {
  it('holds what a save would write, in the app data folder, and leaves the file alone', async () => {
    const path = join(dir, 'report.hwp')
    const original = fileWithTails('본문', '둘째 문단')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)

    const exported = edited(original, '고친 ')
    expect(await writeCopy(contents, exported)).toBe('written')

    const copy = store().copyInfo(fileIdentity(path))
    expect(copy).toMatchObject({ state: 'undecided', title: 'report.hwp' })
    expect(dirname(copy!.copyPath)).toBe(join(userData, 'hwp-autosave'))
    // the save-time corrections against the opened file are in: the master pages are back
    const bytes = new Uint8Array(readFileSync(copy!.copyPath))
    expect(sectionTailsOf(exported)).toBeNull()
    expect(sectionTailsOf(bytes)?.tails.get(0)).toHaveLength(2)
    const base = { tails: sectionTailsOf(original)!, kinds: fieldKindsOf(original) ?? undefined }
    expect(bytes).toEqual(applySaveFixes(exported, 'hwp', [], base).bytes)
    // nothing else was written: the user's folder holds the file alone, as it was
    expect(readdirSync(dir).sort()).toEqual(['report.hwp', 'userData'])
    expect(readFileSync(path)).toEqual(Buffer.from(original))
  })

  it('keeps an HWPX document as HWPX', async () => {
    const path = join(dir, 'note.hwpx')
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    const original = doc.exportHwpx()
    doc.free()
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    const begin = await call<Promise<RecoveryBeginResult>>(HWP_CHANNELS.recoveryBegin, contents)
    expect(begin).toEqual({ ok: true, format: 'hwpx' })
    // bytes of the other format are not taken
    const wrong = await call<Promise<RecoveryWriteOutcome>>(
      HWP_CHANNELS.recoveryWrite,
      contents,
      edited(fileWithTails('본문'), '고친 '),
      'hwp',
      [],
    )
    expect(wrong).toBe('refused')
    expect(await writeCopy(contents, edited(original, '고친 ', 'hwpx'))).toBe('written')
    expect(store().copyPath(fileIdentity(path)).endsWith('.hwpx')).toBe(true)
  })

  it('is removed when the document is saved', async () => {
    const path = join(dir, 'report.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    const exported = edited(original, '고친 ')
    await writeCopy(contents, exported)
    expect(store().copyInfo(fileIdentity(path))).not.toBeNull()

    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toMatchObject({ ok: true, path })
    const done = await call<Promise<CommitSaveResult>>(
      HWP_CHANNELS.commitSave,
      contents,
      exported,
      [],
    )
    expect(done).toMatchObject({ ok: true })
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
  })

  it('does not come back from a copy turn that began before the save landed', async () => {
    const path = join(dir, 'report.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    const exported = edited(original, '고친 ')
    const begin = await call<Promise<RecoveryBeginResult>>(HWP_CHANNELS.recoveryBegin, contents)
    expect(begin.ok).toBe(true)
    await call(HWP_CHANNELS.beginSave, contents, 'save')
    await call(HWP_CHANNELS.commitSave, contents, exported, [])
    const late = await call<Promise<RecoveryWriteOutcome>>(
      HWP_CHANNELS.recoveryWrite,
      contents,
      exported,
      'hwp',
      [],
    )
    expect(late).toBe('superseded')
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
  })

  it('is removed by "Don\'t Save", and none is taken while the tab closes', async () => {
    const path = join(dir, 'report.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    call(HWP_CHANNELS.dirtyChanged, contents, true)
    await writeCopy(contents, edited(original, '고친 '))
    // Save / Don't Save / Cancel
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestHwpClose(contents as never)).toBe(true)
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    expect(await writeCopy(contents, edited(original, '또 '))).toBe('refused')
    contents.emit('destroyed')
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
  })

  it('stays away after "Don\'t Save" while the window close asks other tabs, and comes back once it is cancelled', async () => {
    const path = join(dir, 'waiting.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    call(HWP_CHANNELS.dirtyChanged, contents, true)
    await writeCopy(contents, edited(original, '고친 '))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      showMessageBox.mockResolvedValueOnce({ response: 1 })
      expect(await requestHwpClose(contents as never)).toBe(true)
      // the user lingers on a later tab's prompt, well past the tab's own hold
      vi.advanceTimersByTime(60_000)
    } finally {
      vi.useRealTimers()
    }
    expect(await writeCopy(contents, edited(original, '고친 '))).toBe('superseded')
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    // that tab cancelled the window's close: this one stays open and copies again
    resumeDiscardedCopies()
    expect(await writeCopy(contents, edited(original, '고친 '))).toBe('written')
  })

  it('is removed when its tab closes with nothing unsaved, and kept otherwise', async () => {
    const original = fileWithTails('본문')
    const open = async (name: string) => {
      const path = join(dir, name)
      writeFileSync(path, original)
      const contents = view(path)
      await call(HWP_CHANNELS.readFile, contents, path)
      call(HWP_CHANNELS.dirtyChanged, contents, true)
      await writeCopy(contents, edited(original, '고친 '))
      return { path, contents }
    }
    // undone back to clean, then closed: the copy this tab wrote goes
    const clean = await open('clean.hwp')
    call(HWP_CHANNELS.dirtyChanged, clean.contents, false)
    clean.contents.emit('destroyed')
    expect(store().copyInfo(fileIdentity(clean.path))).toBeNull()
    // closed with unsaved changes (the app went away without asking): kept
    const dirty = await open('dirty.hwp')
    dirty.contents.emit('destroyed')
    expect(store().copyInfo(fileIdentity(dirty.path))).not.toBeNull()
    // the renderer crashed: kept for the reopened tab, whatever its last flag said
    const crashed = await open('crashed.hwp')
    call(HWP_CHANNELS.dirtyChanged, crashed.contents, false)
    crashed.contents.emit('render-process-gone')
    crashed.contents.emit('destroyed')
    expect(store().copyInfo(fileIdentity(crashed.path))).not.toBeNull()
    // the app is ending: the editor's teardown removes nothing
    const ending = await open('ending.hwp')
    call(HWP_CHANNELS.dirtyChanged, ending.contents, false)
    markAppShuttingDown()
    ending.contents.emit('destroyed')
    expect(store().copyInfo(fileIdentity(ending.path))).not.toBeNull()
  })
})

describe('a renamed file', () => {
  it('takes its copy along: the old name’s copy goes, and the new one goes with the save', async () => {
    const path = join(dir, 'report.hwp')
    const moved = join(dir, 'renamed.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    call(HWP_CHANNELS.dirtyChanged, contents, true)
    const exported = edited(original, '고친 ')
    expect(await writeCopy(contents, exported)).toBe('written')
    const before = readFileSync(store().copyPath(fileIdentity(path)))

    renameSync(path, moved)
    hwpFileRenamed(contents as never, path, moved)
    await vi.waitFor(() => expect(store().copyInfo(fileIdentity(path))).toBeNull())
    const copy = store().copyInfo(fileIdentity(moved))
    expect(copy).toMatchObject({ title: 'renamed.hwp' })
    expect(readFileSync(copy!.copyPath)).toEqual(before)

    await call(HWP_CHANNELS.beginSave, contents, 'save')
    await call(HWP_CHANNELS.commitSave, contents, exported, [])
    expect(existsSync(moved)).toBe(true)
    expect(store().listCopies()).toHaveLength(0)
  })

  it('leaves no copy behind when its tab closes clean after the rename', async () => {
    const path = join(dir, 'report.hwp')
    const moved = join(dir, 'renamed.hwp')
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    call(HWP_CHANNELS.dirtyChanged, contents, true)
    await writeCopy(contents, edited(original, '고친 '))
    renameSync(path, moved)
    hwpFileRenamed(contents as never, path, moved)
    await vi.waitFor(() => expect(store().copyInfo(fileIdentity(moved))).not.toBeNull())
    call(HWP_CHANNELS.dirtyChanged, contents, false)
    contents.emit('destroyed')
    expect(store().listCopies()).toHaveLength(0)
  })

  it('does not take a copy it never wrote', async () => {
    const path = join(dir, 'report.hwp')
    const moved = join(dir, 'renamed.hwp')
    writeFileSync(path, fileWithTails('본문'))
    // a copy left by another run
    await store().writeCopy(fileIdentity(path), Buffer.from(fileWithTails('남은')), {
      title: 'report.hwp',
    })
    const contents = view(path)
    // the launch list said to open the file as it is: the copy is not this tab's
    await recoveryEditor('hwp')!.openFileWithDecision(contents as never, {
      filePath: path,
      decision: 'original',
    })
    await call(HWP_CHANNELS.readFile, contents, path)
    renameSync(path, moved)
    hwpFileRenamed(contents as never, path, moved)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(store().copyInfo(fileIdentity(path))).not.toBeNull()
    expect(store().copyInfo(fileIdentity(moved))).toBeNull()
  })
})

describe('a file open in both panes of a split', () => {
  const resets = (contents: FakeContents) =>
    contents.sent.filter((message) => message.channel === HWP_CHANNELS.recoveryReset).length

  async function split(name: string) {
    const path = join(dir, name)
    const original = fileWithTails('본문')
    writeFileSync(path, original)
    const first = view(path)
    await call(HWP_CHANNELS.readFile, first, path)
    const second = view(path)
    await call(HWP_CHANNELS.readFile, second, path)
    return { path, original, first, second }
  }

  it('asks the other pane for a new copy when a save removes the shared one', async () => {
    const { path, original, first, second } = await split('report.hwp')
    call(HWP_CHANNELS.dirtyChanged, first, true)
    call(HWP_CHANNELS.dirtyChanged, second, true)
    expect(await writeCopy(second, edited(original, '둘째 '))).toBe('written')

    await call(HWP_CHANNELS.beginSave, first, 'save')
    await call(HWP_CHANNELS.commitSave, first, edited(original, '첫째 '), [])
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    expect(resets(second)).toBe(1)
    expect(resets(first)).toBe(0)

    // the other pane's next turn writes it again; the saved pane closing clean leaves it
    expect(await writeCopy(second, edited(original, '둘째 '))).toBe('written')
    first.emit('destroyed')
    expect(store().copyInfo(fileIdentity(path))).not.toBeNull()
  })

  it('asks the other pane for a new copy when a pane closes clean and removes the shared one', async () => {
    const { path, original, first, second } = await split('closing.hwp')
    call(HWP_CHANNELS.dirtyChanged, first, true)
    call(HWP_CHANNELS.dirtyChanged, second, true)
    await writeCopy(first, edited(original, '첫째 '))
    // undone back to clean, then closed
    call(HWP_CHANNELS.dirtyChanged, first, false)
    first.emit('destroyed')
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    expect(resets(second)).toBe(1)
  })

  it('lets the other pane copy again when one pane answers "Don\'t Save"', async () => {
    const { path, original, first, second } = await split('dropped.hwp')
    call(HWP_CHANNELS.dirtyChanged, first, true)
    call(HWP_CHANNELS.dirtyChanged, second, true)
    await writeCopy(first, edited(original, '첫째 '))
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestHwpClose(first as never)).toBe(true)
    first.emit('destroyed')
    expect(resets(second)).toBeGreaterThan(0)
    // the other pane's edits were not thrown away
    expect(await writeCopy(second, edited(original, '둘째 '))).toBe('written')
    expect(store().copyInfo(fileIdentity(path))).not.toBeNull()
  })
})

describe('a password document', () => {
  it('gets no copy, and its tab says so once', async () => {
    const path = join(dir, 'secret.hwp')
    writeFileSync(path, fileWithTails('본문'))
    const contents = view(path)
    await call(HWP_CHANNELS.readFile, contents, path)
    const first = await call<Promise<RecoveryOpenedResult>>(
      HWP_CHANNELS.recoveryOpened,
      contents,
      true,
    )
    expect(first.restored).toBe(false)
    expect(first.notice).toMatch(/\S/)
    const again = await call<Promise<RecoveryOpenedResult>>(
      HWP_CHANNELS.recoveryOpened,
      contents,
      true,
    )
    expect(again.notice).toBeNull()
    expect(await call(HWP_CHANNELS.recoveryBegin, contents)).toEqual({ ok: false })
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    expect(recoveryEditor('hwp')?.isUnprotectable(contents as never)).toBe(true)
  })
})

describe('opening a file with a copy left over', () => {
  /** before the crash: the file opened, edited and copied; the tab is gone without a save */
  async function crashed(name: string, original: Uint8Array) {
    const path = join(dir, name)
    writeFileSync(path, original)
    const before = view(path)
    await call(HWP_CHANNELS.readFile, before, path)
    call(HWP_CHANNELS.dirtyChanged, before, true)
    const exported = edited(original, '고친 ')
    await writeCopy(before, exported)
    before.emit('render-process-gone')
    before.emit('destroyed')
    // what a save at that moment would have written
    const base = { tails: sectionTailsOf(original)!, kinds: fieldKindsOf(original) ?? undefined }
    const preCrashSave = applySaveFixes(exported, 'hwp', [], base).bytes
    return { path, preCrashSave }
  }

  it('asks first, and on "Restore" shows the copy as unsaved; its save equals the save before the crash', async () => {
    const original = fileWithTails('본문', '둘째 문단')
    const { path, preCrashSave } = await crashed('report.hwp', original)

    const contents = view(path)
    // Esc / closing the box answers Restore
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, path)
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const prompt = showMessageBox.mock.calls[0]!.at(-1) as { message: string; cancelId: number }
    expect(prompt.message).toContain('report.hwp')
    expect(prompt.cancelId).toBe(0)
    expect(textOf(shown)).toContain('고친 본문')
    expect(readFileSync(path)).toEqual(Buffer.from(original))
    const opened = await call<Promise<RecoveryOpenedResult>>(
      HWP_CHANNELS.recoveryOpened,
      contents,
      false,
    )
    expect(opened.restored).toBe(true)
    // unsaved: closing asks
    showMessageBox.mockResolvedValueOnce({ response: 2 })
    expect(await requestHwpClose(contents as never)).toBe(false)

    // saved at once: the engine exports what it loaded, the save corrects against the file
    const doc = new HwpDocument(shown)
    const exported = doc.exportHwp()
    doc.free()
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toMatchObject({ ok: true, path, format: 'hwp' })
    const done = await call<Promise<CommitSaveResult>>(
      HWP_CHANNELS.commitSave,
      contents,
      exported,
      [],
    )
    expect(done).toMatchObject({ ok: true, path, backupPath: `${path}.bak` })
    const saved = new Uint8Array(readFileSync(path))
    expect(streamsOf(saved)).toEqual(streamsOf(preCrashSave))
    expect(textOf(saved)).toBe(textOf(preCrashSave))
    expect(sectionTailsOf(saved)?.tails.get(0)).toHaveLength(2)
    // the first overwrite kept the original, and the copy is gone
    expect(readFileSync(`${path}.bak`)).toEqual(Buffer.from(original))
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
  })

  it('keeps correcting against the file when the restored copy is edited and saved', async () => {
    const original = fileWithTails('본문', '둘째 문단')
    const { path } = await crashed('edited.hwp', original)
    const contents = view(path)
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, path)
    // the engine drops the lists of a section it rewrites: the save puts them back
    const exported = edited(shown, '더 ')
    expect(sectionTailsOf(exported)).toBeNull()
    await call(HWP_CHANNELS.beginSave, contents, 'save')
    await call(HWP_CHANNELS.commitSave, contents, exported, [])
    const saved = new Uint8Array(readFileSync(path))
    expect(sectionTailsOf(saved)?.tails.get(0)).toHaveLength(2)
    expect(textOf(saved)).toContain('더 고친 본문')
  })

  it('corrects against the file, not the copy: lists the copy lacks come back on save', async () => {
    const path = join(dir, 'lacking.hwp')
    const original = fileWithTails('본문', '둘째 문단')
    writeFileSync(path, original)
    // a copy without the lists (as when putting them back had to be skipped)
    const bare = edited(original, '고친 ')
    expect(sectionTailsOf(bare)).toBeNull()
    await store().writeCopy(fileIdentity(path), Buffer.from(bare), { title: 'lacking.hwp' })
    const contents = view(path)
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, path)
    expect(Buffer.from(shown)).toEqual(Buffer.from(bare))
    await call(HWP_CHANNELS.beginSave, contents, 'save')
    await call(HWP_CHANNELS.commitSave, contents, edited(shown, '더 '), [])
    expect(sectionTailsOf(new Uint8Array(readFileSync(path)))?.tails.get(0)).toHaveLength(2)
  })

  it('opens the file and drops the copy on "Discard"', async () => {
    const original = fileWithTails('본문')
    const { path } = await crashed('discard.hwp', original)
    const contents = view(path)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, path)
    expect(Buffer.from(shown)).toEqual(Buffer.from(original))
    expect(store().copyInfo(fileIdentity(path))).toBeNull()
    const opened = await call<Promise<RecoveryOpenedResult>>(
      HWP_CHANNELS.recoveryOpened,
      contents,
      false,
    )
    expect(opened.restored).toBe(false)
  })

  it('follows the launch list without asking', async () => {
    const original = fileWithTails('본문')
    const restore = await crashed('restore.hwp', original)
    const keep = await crashed('original.hwp', original)
    const contract = recoveryEditor('hwp')!

    const restoring = view(restore.path)
    await contract.openFileWithDecision(restoring as never, {
      filePath: restore.path,
      decision: 'restore',
    })
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, restoring, restore.path)
    expect(textOf(shown)).toContain('고친 본문')

    const plain = view(keep.path)
    await contract.openFileWithDecision(plain as never, {
      filePath: keep.path,
      decision: 'original',
    })
    const file = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, plain, keep.path)
    expect(Buffer.from(file)).toEqual(Buffer.from(original))
    expect(showMessageBox).not.toHaveBeenCalled()
    // a view that already took its path loads again with the decision
    expect(restoring.reloads).toBe(0)
    call(HWP_CHANNELS.consumePending, plain)
    await contract.openFileWithDecision(plain as never, {
      filePath: keep.path,
      decision: 'restore',
    })
    expect(plain.reloads).toBe(1)
  })
})

describe('an untitled document', () => {
  it('keeps its copy in the app data folder only, and reopens it as an untitled tab', async () => {
    // a new document: the blank one the renderer loads itself, never read from a file
    const contents = view(null)
    const blank = HwpDocument.createEmpty()
    blank.createBlankDocument()
    blank.insertText(0, 0, 0, '새 글')
    const exported = blank.exportHwp()
    blank.free()
    expect(await writeCopy(contents, exported)).toBe('written')
    const [copy] = store().listCopies({ untitled: true })
    expect(copy).toMatchObject({ kind: 'hwp', state: 'undecided', filePath: null })
    // the slot the shell keeps for the tab, to reopen it
    expect(hwpRecoveryIdentity(contents as never)).toEqual(copy!.identity)
    expect(copy!.copyPath.startsWith(join(userData, 'hwp-autosave', 'untitled'))).toBe(true)
    expect(readdirSync(dir)).toEqual(['userData'])
    // the renderer is gone with the app
    contents.emit('render-process-gone')
    contents.emit('destroyed')
    expect(store().listCopies({ untitled: true })).toHaveLength(1)

    // next run: the shell makes a tab and hands it the copy
    const reopened = view(null)
    const target = join(dir, 'saved.hwp')
    recoveryEditor('hwp')!.openUntitledCopy(reopened as never, {
      copy: copy!.identity,
      title: 'Untitled 1',
    })
    expect(call(HWP_CHANNELS.consumePending, reopened)).toBe(copy!.copyPath)
    expect(call(HWP_CHANNELS.untitledCopy, reopened)).toEqual({
      name: 'Untitled 1.hwp',
      format: 'hwp',
    })
    const shown = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, reopened, copy!.copyPath)
    expect(textOf(shown)).toContain('새 글')
    expect(
      (await call<Promise<RecoveryOpenedResult>>(HWP_CHANNELS.recoveryOpened, reopened, false))
        .restored,
    ).toBe(true)
    // its copies go on in the same slot
    expect(await writeCopy(reopened, edited(shown, '더 '))).toBe('written')
    expect(store().listCopies({ untitled: true })).toHaveLength(1)

    // the first save asks where; the copy goes once it is saved
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, reopened, 'save')
    expect(begin).toMatchObject({ ok: true, path: target })
    await call(HWP_CHANNELS.commitSave, reopened, edited(shown, '더 '), [])
    expect(existsSync(target)).toBe(true)
    expect(store().listCopies({ untitled: true })).toHaveLength(0)
    expect(existsSync(copy!.copyPath)).toBe(false)
  })

  it('offers the missing original’s place for the first save of a copy restored without it', async () => {
    const path = join(dir, 'gone', 'report.hwp')
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    const bytes = doc.exportHwp()
    doc.free()
    const identity = fileIdentity(path)
    await store().writeCopy(identity, Buffer.from(bytes), { title: 'report.hwp' })
    const contents = view(null)
    recoveryEditor('hwp')!.openUntitledCopy(contents as never, {
      copy: identity,
      title: 'report',
      saveAsDefaultPath: path,
    })
    await call(HWP_CHANNELS.readFile, contents, store().copyPath(identity))
    await call(HWP_CHANNELS.beginSave, contents, 'save')
    const options = showSaveDialog.mock.calls[0]!.at(-1) as { defaultPath: string }
    expect(options.defaultPath).toBe(path)
  })

  it('counts a skill template’s copy as untitled', async () => {
    const template = join(dir, 'Family letter.hwp')
    const original = fileWithTails('본문')
    writeFileSync(template, original)
    const contents = view(template, { untitledCopy: true })
    await call(HWP_CHANNELS.readFile, contents, template)
    expect(await writeCopy(contents, edited(original, '고친 '))).toBe('written')
    expect(store().copyInfo(fileIdentity(template))).toBeNull()
    const [copy] = store().listCopies({ untitled: true })
    expect(copy).toMatchObject({ title: 'Family letter' })
    // the template's own lists are kept in its copy too
    expect(sectionTailsOf(new Uint8Array(readFileSync(copy!.copyPath)))?.tails.get(0)).toHaveLength(
      2,
    )
    expect(basename(copy!.copyPath).endsWith('.hwp')).toBe(true)
  })
})

describe('the OS ending the session', () => {
  it('asks every tab with unsaved changes for a copy now, and waits for it', async () => {
    const path = join(dir, 'report.hwp')
    writeFileSync(path, fileWithTails('본문'))
    const dirty = view(path)
    await call(HWP_CHANNELS.readFile, dirty, path)
    call(HWP_CHANNELS.dirtyChanged, dirty, true)
    const clean = view(null)
    const done = recoveryEditor('hwp')!.writeCopiesNow()
    const flush = dirty.sent.find((message) => message.channel === HWP_CHANNELS.recoveryFlush)
    expect(flush).toBeDefined()
    expect(clean.sent.some((message) => message.channel === HWP_CHANNELS.recoveryFlush)).toBe(false)
    call(HWP_CHANNELS.recoveryFlushed, dirty, flush!.args[0])
    await expect(done).resolves.toBeUndefined()
  })
})
