// @vitest-environment node
/**
 * The result book's save dialog channel the translation window uses
 * (`epub:pick-result-target`), with Electron replaced: a picked path is
 * granted and handed back; the book itself or a file open in a tab is refused
 * with the reason and not granted; a cancelled dialog answers null. The older
 * `epub:pick-result-path` keeps answering a path or null. The result book of
 * an easy explanation (`mode: 'easy'`) is built from the easy results and
 * marked as one; a request without a mode is a translation, as before.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn()
const userData = { dir: '' }

let nextId = 1
function fakeContents() {
  return {
    id: nextId++,
    isDestroyed: () => false,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    getURL: () => '',
    send: () => {},
    on: () => {},
    once: () => {},
  }
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
    showMessageBox: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
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

import { epubTranslationUnits, openEpub } from '@genoffice/epub-engine'
import { ResultStore } from '@genoffice/pdf-structure/store'
import { configureEpubRuntime, createEpubView } from '../src/main/epub-main'
import { EPUB_CHANNELS } from '../src/shared/ipc'
import type { EpubOpenFileResult } from '../src/shared/ipc'
import { buildBook } from './helpers/book'

let dir: string
const openInTab = new Set<string>()
// the main process opens its result store once, under the first user data folder it is given
const userDataRoot = mkdtempSync(join(tmpdir(), 'genoffice-epub-user-data-'))
afterAll(() => rmSync(userDataRoot, { recursive: true, force: true }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-pick-'))
  userData.dir = userDataRoot
  openInTab.clear()
  showSaveDialog.mockReset()
  configureEpubRuntime({
    preloadPath: '',
    userDataDir: () => userData.dir,
    migrateJobRecords: vi.fn(async () => 0),
    isPathOpenInTab: (path) => openInTab.has(path),
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const call = <T>(channel: string, contents: unknown, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

async function openBook() {
  const path = join(dir, 'book.epub')
  writeFileSync(path, await buildBook())
  const contents = createEpubView(path).webContents
  const opened = await call<Promise<EpubOpenFileResult>>(EPUB_CHANNELS.openFile, contents, path)
  if (opened.status !== 'ok') throw new Error('not opened')
  return { path, contents, docHash: opened.docHash }
}

describe('picking a result book', () => {
  it('grants a picked path and refuses the book itself or an open file, saying why', async () => {
    const { path, contents, docHash } = await openBook()
    const request = { kind: 'translated', lang: 'ko' }

    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path })
    expect(await call(EPUB_CHANNELS.pickResultTarget, contents, request)).toEqual({
      ok: false,
      path,
      reason: 'source',
    })

    const open = join(dir, 'open.epub')
    openInTab.add(open)
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: open })
    expect(await call(EPUB_CHANNELS.pickResultTarget, contents, request)).toEqual({
      ok: false,
      path: open,
      reason: 'open-in-tab',
    })
    // a refused pick is not granted
    expect(
      await call(EPUB_CHANNELS.writeTranslated, contents, { ...request, path: open, docHash }),
    ).toMatchObject({ ok: false, error: 'not-granted' })

    showSaveDialog.mockResolvedValueOnce({ canceled: true })
    expect(await call(EPUB_CHANNELS.pickResultTarget, contents, request)).toBeNull()

    const target = join(dir, 'book.ko')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await call(EPUB_CHANNELS.pickResultTarget, contents, request)).toEqual({
      ok: true,
      path: `${target}.epub`,
    })
    expect(
      await call(EPUB_CHANNELS.writeTranslated, contents, {
        ...request,
        path: `${target}.epub`,
        docHash,
      }),
    ).toMatchObject({ ok: true, path: `${target}.epub` })
  })

  it('keeps the older channel answering a path or null', async () => {
    const { path, contents } = await openBook()
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path })
    expect(
      await call(EPUB_CHANNELS.pickResultPath, contents, { kind: 'translated', lang: 'ko' }),
    ).toBeNull()
    const target = join(dir, 'out.epub')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(
      await call(EPUB_CHANNELS.pickResultPath, contents, { kind: 'bilingual', lang: 'ko' }),
    ).toBe(target)
  })
})

describe('writing the result book of an easy explanation', () => {
  /** pick `name` in the save dialog and answer the granted path */
  async function picked(contents: unknown, name: string, defaultName?: string) {
    const target = join(dir, name)
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const out = await call<Promise<{ ok: boolean; path: string }>>(
      EPUB_CHANNELS.pickResultTarget,
      contents,
      { kind: 'translated', lang: 'ko', ...(defaultName ? { defaultName } : {}) },
    )
    expect(out.ok).toBe(true)
    return out.path
  }

  async function titleOf(path: string): Promise<string> {
    const opened = await openEpub(new Uint8Array(readFileSync(path)))
    if (!opened.ok) throw new Error('the result did not open')
    return opened.book.metadata.titles[0]!
  }

  it('builds it from the easy results and marks its title; a plain one is unchanged', async () => {
    const { path, contents, docHash } = await openBook()
    // the easy explanation of every unit, kept where the main process keeps its store
    const opened = await openEpub(new Uint8Array(readFileSync(path)))
    if (!opened.ok) throw new Error('not opened')
    const { units } = await epubTranslationUnits(opened.book)
    await new ResultStore(userData.dir).writeTranslationBlocks(
      docHash,
      'ko',
      units.map((u) => ({ key: u.key, status: 'translated' as const, text: `EASY ${u.text}` })),
      'easy',
    )

    // the window suggests the easy name; the dialog opens on it
    const easyPath = await picked(contents, 'book.ko.쉬운 풀이.epub', 'book.ko.쉬운 풀이.epub')
    expect(showSaveDialog.mock.calls.at(-1)!.at(-1)).toMatchObject({
      defaultPath: join(dir, 'book.ko.쉬운 풀이.epub'),
    })
    const easy = await call<Promise<{ ok: boolean }>>(EPUB_CHANNELS.writeTranslated, contents, {
      kind: 'translated',
      lang: 'ko',
      mode: 'easy',
      path: easyPath,
      docHash,
    })
    expect(easy).toMatchObject({ ok: true, path: easyPath })
    expect(await titleOf(easyPath)).toBe('EASY A Small Book (쉬운 풀이)')

    // no mode: the translation's results (none here), no marker
    const plainPath = await picked(contents, 'book.ko.epub')
    expect(showSaveDialog.mock.calls.at(-1)!.at(-1)).toMatchObject({
      defaultPath: join(dir, 'book.ko.epub'),
    })
    const plain = await call<Promise<{ ok: boolean }>>(EPUB_CHANNELS.writeTranslated, contents, {
      kind: 'translated',
      lang: 'ko',
      path: plainPath,
      docHash,
    })
    expect(plain).toMatchObject({ ok: true })
    expect(await titleOf(plainPath)).toBe('A Small Book')
  })

  it('refuses a mode that is not one', async () => {
    const { contents, docHash } = await openBook()
    const target = await picked(contents, 'out.epub')
    expect(
      await call(EPUB_CHANNELS.writeTranslated, contents, {
        kind: 'translated',
        lang: 'ko',
        mode: 'summary',
        path: target,
        docHash,
      }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
  })
})
