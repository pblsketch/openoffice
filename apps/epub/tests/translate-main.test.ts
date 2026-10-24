// @vitest-environment node
/**
 * The result book's save dialog channel the translation window uses
 * (`epub:pick-result-target`), with Electron replaced: a picked path is
 * granted and handed back; the book itself or a file open in a tab is refused
 * with the reason and not granted; a cancelled dialog answers null. The older
 * `epub:pick-result-path` keeps answering a path or null.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { configureEpubRuntime, createEpubView } from '../src/main/epub-main'
import { EPUB_CHANNELS } from '../src/shared/ipc'
import type { EpubOpenFileResult } from '../src/shared/ipc'
import { buildBook } from './helpers/book'

let dir: string
const openInTab = new Set<string>()

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-pick-'))
  userData.dir = join(dir, 'user-data')
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
