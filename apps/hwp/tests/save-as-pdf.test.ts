// @vitest-environment node
/**
 * Save As lists PDF after the two Hangul formats. Picking it saves nothing: the
 * document keeps its file and unsaved state, and the PDF export writes exactly
 * the picked path, once, without asking again.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn(
  async (..._args: unknown[]): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true,
  }),
)

interface FakeContents {
  id: number
  destroyed: boolean
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    send: () => {},
    on: () => {},
    once: () => {},
  }
  return contents
}

const userData = { dir: '' }

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) =>
      name === 'userData' ? userData.dir : join(tmpdir(), `hwp-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
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
  attachableMaxBytes: () => 25 * 1024 * 1024,
  ATTACHABLE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
}))

vi.mock('../src/main/print-document', async (original) => ({
  ...(await original<typeof import('../src/main/print-document')>()),
  printJobToPdf: vi.fn(async () => Buffer.from('%PDF-1.7 test')),
}))

import { getUiLang, setUiLang } from '@genoffice/i18n'
import { createHwpView, hwpIsDirty, requestHwpSave } from '../src/main/hwp-main'
import { HWP_CHANNELS } from '../src/shared/ipc'
import type { BeginSaveResult, CommitSaveResult, PrintJob, PrintResult } from '../src/shared/ipc'

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

/** HWPX bytes enough for the container check (ZIP magic). */
const HWPX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x21, 0x22, 0x23])

const JOB: PrintJob = {
  mode: 'pdf',
  pages: [{ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', width: 794, height: 1123 }],
  images: [],
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-hwp-save-as-pdf-'))
  userData.dir = dir
  showSaveDialog.mockClear()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type DialogOptions = { defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }
const lastDialog = (): DialogOptions => showSaveDialog.mock.calls.at(-1)!.at(-1) as DialogOptions

async function openDocument(
  name = 'report.hwpx',
): Promise<{ contents: FakeContents; file: string }> {
  const file = join(dir, name)
  writeFileSync(file, HWPX)
  const contents = createHwpView(file).webContents as unknown as FakeContents
  await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, file)
  return { contents, file }
}

describe('Save As', () => {
  it('lists the document format, the other one, then PDF, with no extension in the suggestion', async () => {
    const { contents } = await openDocument()
    const lang = getUiLang()
    setUiLang('en')
    try {
      await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'saveAs')
    } finally {
      setUiLang(lang)
    }
    const options = lastDialog()
    expect(options.filters).toEqual([
      { name: 'HWP Documents (HWPX)', extensions: ['hwpx'] },
      { name: 'HWP Documents (HWP)', extensions: ['hwp'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
    ])
    expect(options.defaultPath).toBe(join(dir, 'report'))
  })

  it('a bare name still saves in the document format', async () => {
    const { contents } = await openDocument()
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(dir, 'copy') })
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'saveAs')
    expect(begin).toEqual({ ok: true, path: join(dir, 'copy.hwpx'), format: 'hwpx' })
  })

  it('PDF saves nothing: the document keeps its file and state, and the PDF export writes the picked path once', async () => {
    const { contents, file } = await openDocument()
    call(HWP_CHANNELS.dirtyChanged, contents, true)
    const target = join(dir, 'copy.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const saved = requestHwpSave(contents as never, 'saveAs')
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'saveAs')
    expect(begin).toEqual({ ok: true, path: target, export: 'pdf' })
    // the menu hears that nothing was saved
    expect(await saved).toBe(false)
    // there is no save to commit
    const commit = await call<Promise<CommitSaveResult>>(HWP_CHANNELS.commitSave, contents, HWPX)
    expect(commit.ok).toBe(false)
    expect(hwpIsDirty(contents.id)).toBe(true)
    expect(readFileSync(file)).toEqual(Buffer.from(HWPX))

    const print = (options?: unknown) =>
      call<Promise<PrintResult>>(HWP_CHANNELS.printPages, contents, JOB, options)
    expect(await print({ path: target })).toEqual({ ok: true, path: target })
    expect(readFileSync(target, 'utf8')).toBe('%PDF-1.7 test')
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    // once only
    expect((await print({ path: target })).ok).toBe(false)
    expect(readdirSync(dir).sort()).toEqual(['copy.pdf', 'report.hwpx'])

    // and the next Save still goes to the document's own file
    const next = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(next).toEqual({ ok: true, path: file, format: 'hwpx' })
  })

  it('a PDF path Save As did not pick is refused, and so is printing to it', async () => {
    const { contents } = await openDocument()
    const target = join(dir, 'copy.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'saveAs')
    const print = (job: PrintJob, path: string) =>
      call<Promise<PrintResult>>(HWP_CHANNELS.printPages, contents, job, { path })
    expect((await print(JOB, join(dir, 'other.pdf'))).ok).toBe(false)
    expect((await print({ ...JOB, mode: 'print' }, target)).ok).toBe(false)
    expect(existsSync(target)).toBe(false)
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
  })
})
