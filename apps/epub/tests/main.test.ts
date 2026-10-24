// @vitest-environment node
/**
 * The main process with Electron replaced: what a view may open, edit, save
 * and reach. A file that did not open is never written; edits are refused
 * while the tab's book translation runs; the store answers only this view's
 * document hashes; result books go only to dialog-picked paths that are not
 * the book itself; `epub-asset://` serves only the view's own book.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const protocolHandlers = new Map<string, (request: Request) => Promise<Response>>()
const openExternal = vi.fn(async (_url: string) => {})
const showSaveDialog = vi.fn()
const showMessageBox = vi.fn()
const userData = { dir: '' }

interface FakeContents {
  id: number
  sent: Array<[string, ...unknown[]]>
  destroyed: boolean
  listeners: Map<string, (...args: unknown[]) => void>
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  getURL(): string
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    sent: [],
    destroyed: false,
    listeners: new Map(),
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    getURL: () => '',
    send: (channel, ...args) => {
      contents.sent.push([channel, ...args])
    },
    on: (event, listener) => {
      contents.listeners.set(event, listener)
    },
    once: (event, listener) => {
      contents.listeners.set(event, listener)
    },
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => (name === 'userData' ? userData.dir : join(tmpdir(), name)),
    getLocale: () => 'en-US',
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showOpenDialog: vi.fn(),
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
  shell: { openExternal: (url: string) => openExternal(url) },
  protocol: {
    handle: (scheme: string, fn: (request: Request) => Promise<Response>) =>
      protocolHandlers.set(scheme, fn),
    registerSchemesAsPrivileged: vi.fn(),
  },
  net: {},
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

import { openEpub } from '@genoffice/epub-engine'
import { ResultStore } from '@genoffice/pdf-structure/store'
import {
  configureEpubRuntime,
  createEpubView,
  epubFilePath,
  epubIsDirty,
  epubReadText,
  epubSaveToPath,
  requestEpubClose,
  requestEpubSave,
  sendEpubMenuCommand,
} from '../src/main/epub-main'
import { epubAssetUrl } from '../src/shared/asset-url'
import { AI_CHANNELS, APP_CHANNELS, EPUB_CHANNELS } from '../src/shared/ipc'
import type {
  EpubChapterResult,
  EpubEditResult,
  EpubOpenFileResult,
  EpubSaveResult,
} from '../src/shared/ipc'
import { buildBook, entryText } from './helpers/book'

let dir: string
const openInTab = new Set<string>()
const migrateJobRecords = vi.fn(async () => 0)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-main-'))
  userData.dir = join(dir, 'user-data')
  openInTab.clear()
  migrateJobRecords.mockClear()
  showSaveDialog.mockReset()
  showMessageBox.mockReset()
  openExternal.mockClear()
  configureEpubRuntime({
    preloadPath: '',
    userDataDir: () => userData.dir,
    migrateJobRecords,
    isPathOpenInTab: (path) => openInTab.has(path),
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function view(openPath: string): FakeContents {
  return createEpubView(openPath).webContents as unknown as FakeContents
}

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

async function openBook(options: Parameters<typeof buildBook>[0] = {}, name = 'book.epub') {
  const path = join(dir, name)
  writeFileSync(path, await buildBook(options))
  const contents = view(path)
  const opened = await call<Promise<EpubOpenFileResult>>(EPUB_CHANNELS.openFile, contents, path)
  return { path, contents, opened }
}

async function firstBlock(contents: FakeContents) {
  const chapter = await call<Promise<EpubChapterResult>>(EPUB_CHANNELS.readChapter, contents, 0)
  if (!chapter.ok || chapter.broken) throw new Error('no chapter')
  return chapter.blocks.find((b) => b.kind === 'p')!
}

async function edit(contents: FakeContents, text: string): Promise<EpubEditResult> {
  const block = await firstBlock(contents)
  return call(EPUB_CHANNELS.applyEdits, contents, {
    spineIndex: 0,
    edits: [{ op: 'replace', blockId: block.id, text }],
  })
}

const save = (contents: FakeContents, request: unknown) =>
  call<Promise<EpubSaveResult>>(EPUB_CHANNELS.save, contents, request)

describe('channels', () => {
  it('every channel of the editor starts with epub: and no name is used twice', () => {
    const names = Object.values(EPUB_CHANNELS)
    for (const name of names) expect(name).toMatch(/^epub:[a-z-]+$/)
    expect(new Set(names).size).toBe(names.length)
  })

  it('registers every request channel and none of the shared AI channels', async () => {
    await openBook()
    for (const channel of handlers.keys()) {
      expect(Object.values(AI_CHANNELS)).not.toContain(channel)
      if (!channel.startsWith('epub:')) expect(channel).toBe(APP_CHANNELS.getLanguage)
    }
    const mainToRenderer = new Set<string>([
      EPUB_CHANNELS.saveRequest,
      EPUB_CHANNELS.closeSaveRequest,
      EPUB_CHANNELS.fileRenamed,
      EPUB_CHANNELS.menuCommand,
      EPUB_CHANNELS.viewPrefsChanged,
    ])
    for (const channel of Object.values(EPUB_CHANNELS)) {
      expect(handlers.has(channel), channel).toBe(!mainToRenderer.has(channel))
    }
  })
})

describe('opening', () => {
  it('opens a granted book and hands over its summary, asset base and document hash', async () => {
    const { path, contents, opened } = await openBook()
    expect(call(EPUB_CHANNELS.consumePending, contents)).toBe(path)
    expect(opened.status).toBe('ok')
    if (opened.status !== 'ok') return
    expect(opened.book.spine).toHaveLength(2)
    expect(opened.assetBase).toMatch(/^epub-asset:\/\/[0-9a-f]{32}\/$/)
    expect(opened.docHash).toMatch(/^[0-9a-f]{64}$/)
    expect(opened.readOnly).toBeNull()
    expect(epubFilePath(contents.id)).toBe(path)
  })

  it('refuses a path that is not granted to the view', async () => {
    const { contents } = await openBook()
    await expect(
      call<Promise<unknown>>(EPUB_CHANNELS.openFile, contents, join(dir, 'other.epub')),
    ).rejects.toThrow('not granted')
  })

  it('a file that does not open is refused, and nothing is ever written for it', async () => {
    const path = join(dir, 'bad.epub')
    writeFileSync(path, 'not a book')
    const contents = view(path)
    const opened = await call<Promise<EpubOpenFileResult>>(EPUB_CHANNELS.openFile, contents, path)
    expect(opened).toEqual({ status: 'refused', reason: 'damaged' })
    expect(await save(contents, { mode: 'save' })).toMatchObject({ ok: false })
    expect(readFileSync(path, 'utf8')).toBe('not a book')
    expect(await requestEpubSave(contents as never, 'save')).toBe(false)
    expect(await requestEpubClose(contents as never)).toBe(true)
  })
})

describe('epub-asset://', () => {
  it("serves the view's own book only, and nothing after the view is gone", async () => {
    const { contents, opened } = await openBook()
    if (opened.status !== 'ok') throw new Error('not open')
    const serve = protocolHandlers.get('epub-asset')!
    const css = epubAssetUrl(opened.assetBase, 'OEBPS/styles/book.css')
    const res = await serve(new Request(css))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'")
    const stranger = css.replace(/\/\/[0-9a-f]+\//, `//${'e'.repeat(32)}/`)
    expect((await serve(new Request(stranger))).status).toBe(404)
    contents.listeners.get('destroyed')!()
    expect((await serve(new Request(css))).status).toBe(404)
  })
})

describe('editing and saving', () => {
  it('saves only after an edit, writes the edit, and moves stored results and job records', async () => {
    const { path, contents, opened } = await openBook()
    if (opened.status !== 'ok') throw new Error('not open')
    const original = readFileSync(path)

    expect(await save(contents, { mode: 'save' })).toMatchObject({ ok: true, written: false })
    expect(readFileSync(path).equals(original)).toBe(true)

    // a stored translation of the opened bytes
    const store = new ResultStore(userData.dir)
    await store.writeTranslationMeta(opened.docHash, 'ko', { provider: 'claude', model: 'm' })

    const edited = await edit(contents, 'Changed.')
    expect(edited.ok).toBe(true)
    expect(epubIsDirty(contents.id)).toBe(true)
    const saved = await save(contents, { mode: 'save' })
    expect(saved).toMatchObject({ ok: true, written: true, path })
    if (!saved.ok || 'canceled' in saved) return
    expect(saved.docHash).not.toBe(opened.docHash)
    expect(await entryText(readFileSync(path), 'OEBPS/text/one.xhtml')).toContain('<p>Changed.</p>')
    expect(epubIsDirty(contents.id)).toBe(false)
    expect(migrateJobRecords).toHaveBeenCalledWith(expect.anything(), opened.docHash, saved.docHash)
    expect(await store.listTranslations(saved.docHash)).toEqual(['ko'])

    // the new hash is this view's now; another hash is not
    expect(await call(EPUB_CHANNELS.storeTranslations, contents, saved.docHash)).toEqual({
      ok: true,
      langs: ['ko'],
    })
    expect(await call(EPUB_CHANNELS.storeTranslations, contents, 'f'.repeat(64))).toMatchObject({
      ok: false,
      error: 'not-granted',
    })
  })

  it('runs one save at a time: a second save starts from the bytes the first wrote', async () => {
    const { contents } = await openBook()
    await edit(contents, 'Changed.')
    const [first, second] = await Promise.all([
      save(contents, { mode: 'save' }),
      save(contents, { mode: 'save', auto: true }),
    ])
    expect(first).toMatchObject({ ok: true, written: true })
    expect(second).toMatchObject({ ok: true, written: false })
    if (!first.ok || 'canceled' in first || !second.ok || 'canceled' in second) return
    expect(second.docHash).toBe(first.docHash)
  })

  it("refuses edits while the tab's book translation runs", async () => {
    const { contents } = await openBook()
    expect(await call(EPUB_CHANNELS.setTranslationLock, contents, true)).toBe(true)
    expect(await edit(contents, 'Nope.')).toMatchObject({ ok: false, error: 'locked' })
    expect(epubIsDirty(contents.id)).toBe(false)
    expect(await call(EPUB_CHANNELS.setTranslationLock, contents, false)).toBe(false)
    expect((await edit(contents, 'Now.')).ok).toBe(true)
  })

  it('refuses edits of a fixed-layout book', async () => {
    const { contents, opened } = await openBook({ fixedLayout: true })
    expect(opened.status === 'ok' && opened.readOnly).toBe('fixed-layout-book')
    expect(await edit(contents, 'Nope.')).toMatchObject({ ok: false, error: 'read-only' })
  })

  it('Save As goes through the dialog, keeps the .epub extension and tells the shell', async () => {
    const { contents } = await openBook()
    await edit(contents, 'Changed.')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(dir, 'copy') })
    const saved = await save(contents, { mode: 'saveAs' })
    expect(saved).toMatchObject({ ok: true, path: join(dir, 'copy.epub'), written: true })
    expect(epubFilePath(contents.id)).toBe(join(dir, 'copy.epub'))
  })

  it('the menu save waits for the renderer; a clean book answers at once', async () => {
    const { contents } = await openBook()
    expect(await requestEpubSave(contents as never, 'save')).toBe(true)
    await edit(contents, 'Changed.')
    const pending = requestEpubSave(contents as never, 'save')
    expect(contents.sent.at(-1)).toEqual([EPUB_CHANNELS.saveRequest, 'save'])
    await save(contents, { mode: 'save' })
    expect(await pending).toBe(true)
  })

  it("the renderer's unsent edits count for the close prompt", async () => {
    const { contents } = await openBook()
    expect(epubIsDirty(contents.id)).toBe(false)
    call(EPUB_CHANNELS.dirtyChanged, contents, true)
    expect(epubIsDirty(contents.id)).toBe(true)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestEpubClose(contents as never)).toBe(true)
  })
})

describe('in-app MCP helpers', () => {
  it('read gives the book text with unsaved edits; save asks the renderer to save to the path', async () => {
    const { path, contents } = await openBook()
    await edit(contents, 'Unsaved words.')
    const text = await epubReadText(contents as never)
    expect(text).toContain('# Chapter One')
    expect(text).toContain('Unsaved words.')
    const saving = epubSaveToPath(contents as never, path)
    expect(contents.sent.at(-1)).toEqual([EPUB_CHANNELS.saveRequest, 'save'])
    await save(contents, { mode: 'save' })
    await expect(saving).resolves.toBeUndefined()
  })

  it('menu commands go to the renderer', async () => {
    const { contents } = await openBook()
    sendEpubMenuCommand(contents as never, 'find')
    expect(contents.sent.at(-1)).toEqual([EPUB_CHANNELS.menuCommand, 'find'])
  })
})

describe('result books', () => {
  it('refuses the book itself and files open in a tab as result paths', async () => {
    const { path, contents } = await openBook()
    expect(await call(EPUB_CHANNELS.checkResultPath, contents, path)).toEqual({
      ok: false,
      reason: 'source',
    })
    const open = join(dir, 'open.epub')
    openInTab.add(open)
    expect(await call(EPUB_CHANNELS.checkResultPath, contents, open)).toEqual({
      ok: false,
      reason: 'open-in-tab',
    })
    // a dialog pick of either is refused
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path })
    expect(
      await call(EPUB_CHANNELS.pickResultPath, contents, { kind: 'translated', lang: 'ko' }),
    ).toBeNull()
  })

  it('suggests <name>.<lang>.epub next to the book', async () => {
    const { contents } = await openBook()
    showSaveDialog.mockResolvedValueOnce({ canceled: true })
    await call(EPUB_CHANNELS.pickResultPath, contents, { kind: 'bilingual', lang: 'ko' })
    const options = showSaveDialog.mock.calls[0]!.at(-1) as { defaultPath: string }
    expect(options.defaultPath).toBe(join(dir, 'book.ko.bilingual.epub'))
  })

  it('writes a result book only to a picked path, from the stored translation', async () => {
    const { contents, opened } = await openBook()
    if (opened.status !== 'ok') throw new Error('not open')
    const target = join(dir, 'book.ko.epub')
    const request = { kind: 'translated', lang: 'ko', path: target, docHash: opened.docHash }
    expect(await call(EPUB_CHANNELS.writeTranslated, contents, request)).toMatchObject({
      ok: false,
      error: 'not-granted',
    })
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(
      await call(EPUB_CHANNELS.pickResultPath, contents, { kind: 'translated', lang: 'ko' }),
    ).toBe(target)
    // a hash the view was never given is refused
    expect(
      await call(EPUB_CHANNELS.writeTranslated, contents, { ...request, docHash: 'f'.repeat(64) }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    const written = await call<Promise<{ ok: boolean; report?: { translatedBlocks: number } }>>(
      EPUB_CHANNELS.writeTranslated,
      contents,
      request,
    )
    expect(written).toMatchObject({ ok: true, path: target })
    expect((await openEpub(new Uint8Array(readFileSync(target)))).ok).toBe(true)
  })

  it('gives translation units of the saved bytes with their document hash', async () => {
    const { contents, opened } = await openBook()
    if (opened.status !== 'ok') throw new Error('not open')
    const result = await call<Promise<{ ok: boolean; docHash?: string; units?: unknown[] }>>(
      EPUB_CHANNELS.translationUnits,
      contents,
      { chapters: [0] },
    )
    expect(result).toMatchObject({ ok: true, docHash: opened.docHash })
    expect(result.units!.length).toBeGreaterThan(0)
    expect(await call(EPUB_CHANNELS.translationUnits, contents, { chapters: [5] })).toMatchObject({
      ok: false,
      error: 'invalid-request',
    })
  })
})

describe('reading position and view settings', () => {
  it("remembers this book's position and shares view settings with the other EPUB tabs", async () => {
    const a = await openBook({}, 'a.epub')
    const b = await openBook({}, 'b.epub')
    call(EPUB_CHANNELS.setReadPosition, a.contents, { spineIndex: 1, blockId: 'b2' })
    call(EPUB_CHANNELS.setReadPosition, a.contents, { spineIndex: 99, blockId: null })
    await vi.waitFor(
      async () => {
        expect(await call(EPUB_CHANNELS.getReadingState, a.contents)).toMatchObject({
          position: { spineIndex: 1, blockId: 'b2' },
        })
      },
      { timeout: 10_000 },
    )
    expect(await call(EPUB_CHANNELS.getReadingState, b.contents)).toMatchObject({ position: null })
    const prefs = await call(EPUB_CHANNELS.setViewPrefs, a.contents, { dark: true })
    expect(prefs).toMatchObject({ dark: true })
    expect(b.contents.sent.at(-1)).toEqual([EPUB_CHANNELS.viewPrefsChanged, prefs])
  })

  it('takes view settings from EPUB views only', async () => {
    const a = await openBook({}, 'a.epub')
    const stranger = fakeContents()
    const sent = a.contents.sent.length
    const before = await call<Promise<{ viewPrefs: { dark: boolean } }>>(
      EPUB_CHANNELS.getReadingState,
      a.contents,
    )
    await expect(
      Promise.resolve().then(() =>
        call(EPUB_CHANNELS.setViewPrefs, stranger, { dark: !before.viewPrefs.dark }),
      ),
    ).rejects.toThrow()
    expect(a.contents.sent).toHaveLength(sent)
    expect(await call(EPUB_CHANNELS.getReadingState, a.contents)).toEqual(before)
  })
})

describe('links', () => {
  it('opens safe outside addresses only', async () => {
    const { contents } = await openBook()
    expect(await call(EPUB_CHANNELS.openLink, contents, 'https://example.com/')).toBe(true)
    expect(await call(EPUB_CHANNELS.openLink, contents, 'file:///C:/Windows')).toBe(false)
    expect(await call(EPUB_CHANNELS.openLink, contents, 'javascript:alert(1)')).toBe(false)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('answers only EPUB views', async () => {
    await openBook()
    const stranger = fakeContents()
    expect(await call(EPUB_CHANNELS.openLink, stranger, 'https://example.com/')).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })
})
