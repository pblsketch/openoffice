// @vitest-environment node
/**
 * Save As lists every format a rendered Markdown document can become: Markdown
 * first, then PDF, Word, ODT and page images. Picking an export writes a copy
 * with the export menu's code; the open document keeps its path, its unsaved
 * state and its recovery identity. Word, ODT and page images are built by the
 * renderer, so Save As only approves the path and the export then writes there
 * without a second dialog.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: { sender: FakeWebContents }, ...args: unknown[]) => unknown

interface FakeWebContents {
  id: number
  listeners: Map<string, () => void>
  isDestroyed: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  setWindowOpenHandler: ReturnType<typeof vi.fn>
}

const handlers = new Map<string, IpcHandler>()
const showSaveDialog = vi.fn()
const showOpenDialog = vi.fn()
const showMessageBox = vi.fn()
const showItemInFolder = vi.fn()
const webContents: FakeWebContents[] = []
let nextWebContentsId = 1

const { printMarkdownPdf, docxToOdt } = vi.hoisted(() => ({
  printMarkdownPdf: vi.fn(),
  docxToOdt: vi.fn(),
}))
vi.mock('../src/main/print-pdf', () => ({ printMarkdownPdf }))
vi.mock('@genoffice/odt-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/odt-engine')>()),
  docxToOdt,
}))

function makeWebContents(): FakeWebContents {
  const listeners = new Map<string, () => void>()
  const contents: FakeWebContents = {
    id: nextWebContentsId++,
    listeners,
    isDestroyed: vi.fn(() => false),
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  }
  webContents.push(contents)
  return contents
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
  },
  BrowserWindow: class {
    static fromWebContents() {
      return null
    }
    static getFocusedWindow() {
      return null
    }
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: (...args: unknown[]) => showItemInFolder(...args),
  },
  WebContentsView: class {
    webContents = makeWebContents()
  },
}))

import {
  createMarkdownView,
  markdownFilePath,
  markdownIsDirty,
  markdownRecoveryIdentity,
} from '../src/main/markdown-main'
import { MARKDOWN_CHANNELS } from '../src/shared/ipc'
import type { ExportResult, ImageExportPreparation, SaveMarkdownResult } from '../src/shared/ipc'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const contents of webContents.splice(0)) contents.listeners.get('destroyed')?.()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const invoke = <T>(channel: string, contents: FakeWebContents, ...args: unknown[]) =>
  handlers.get(channel)!({ sender: contents }, ...args) as Promise<T>

const save = (contents: FakeWebContents, request: unknown) =>
  invoke<SaveMarkdownResult>(MARKDOWN_CHANNELS.save, contents, request)

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
).toString('base64')
const DOCX = Buffer.from('PK docx bytes').toString('base64')

async function openDocument(text = '# Note\n\nbody'): Promise<{
  directory: string
  mdPath: string
  contents: FakeWebContents
}> {
  const directory = mkdtempSync(join(tmpdir(), 'markdown-save-as-formats-'))
  temporaryDirectories.push(directory)
  const mdPath = join(directory, 'note.md')
  writeFileSync(mdPath, text)
  const contents = createMarkdownView(mdPath).webContents as unknown as FakeWebContents
  expect(await invoke(MARKDOWN_CHANNELS.readFile, contents, mdPath)).toBe(text)
  // the open document has unsaved edits
  handlers.get(MARKDOWN_CHANNELS.dirtyChanged)!({ sender: contents }, true)
  return { directory, mdPath, contents }
}

const saveAsRendered = (contents: FakeWebContents) =>
  save(contents, {
    text: '# Note\n\nedited',
    imageSources: [],
    mode: 'saveAs',
    pdfHtml: '<html><body>Note</body></html>',
  })

function expectUnchanged(contents: FakeWebContents, mdPath: string, identity: unknown): void {
  expect(markdownFilePath(contents.id)).toBe(mdPath)
  expect(markdownIsDirty(contents.id)).toBe(true)
  expect(markdownRecoveryIdentity(contents.id)).toEqual(identity)
  expect(readFileSync(mdPath, 'utf8')).toBe('# Note\n\nbody')
}

describe('Save As format list', () => {
  it('offers Markdown first, then PDF, Word, ODT and page images, with no extension suggested', async () => {
    const { directory, contents } = await openDocument()
    showSaveDialog.mockResolvedValue({ canceled: true })
    await saveAsRendered(contents)
    const options = showSaveDialog.mock.calls[0]![0] as {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
    }
    expect(options.filters.map((filter) => filter.extensions)).toEqual([
      ['md', 'markdown', 'txt', 'json'],
      ['pdf'],
      ['docx'],
      ['odt'],
      ['png'],
    ])
    expect(options.filters.every((filter) => filter.name.length > 0)).toBe(true)
    expect(options.defaultPath).toBe(join(directory, 'note'))
  })

  it('keeps the plain Save As (source mode, close-save) Markdown-only', async () => {
    const { directory, contents } = await openDocument()
    showSaveDialog.mockResolvedValue({ canceled: true })
    await save(contents, { text: '# Note', imageSources: [], mode: 'saveAs' })
    const options = showSaveDialog.mock.calls[0]![0] as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(options.filters.map((filter) => filter.extensions)).toEqual([
      ['md', 'markdown', 'txt', 'json'],
    ])
    expect(options.defaultPath).toBe(join(directory, 'note.md'))
  })
})

describe('Save As › an export', () => {
  it('Word: approves the path without writing, then the export writes there with no dialog', async () => {
    const { directory, mdPath, contents } = await openDocument()
    const identity = markdownRecoveryIdentity(contents.id)
    const target = join(directory, 'note.docx')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })

    expect(await saveAsRendered(contents)).toEqual({ ok: true, path: target, exportAs: 'docx' })
    expect(existsSync(target)).toBe(false)
    expectUnchanged(contents, mdPath, identity)

    const result = await invoke<ExportResult>(MARKDOWN_CHANNELS.exportDocx, contents, {
      base64: DOCX,
      suggestedName: 'note',
      mode: 'dialog',
      saveAsTarget: target,
    })
    expect(result).toEqual({ ok: true, path: target })
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    expect(readFileSync(target, 'utf8')).toBe('PK docx bytes')
    expectUnchanged(contents, mdPath, identity)

    // the approval is used once: a replay is refused
    const replay = await invoke<ExportResult>(MARKDOWN_CHANNELS.exportDocx, contents, {
      base64: DOCX,
      suggestedName: 'note',
      mode: 'dialog',
      saveAsTarget: target,
    })
    expect(replay).toMatchObject({ ok: false })
  })

  it('refuses a Save As target the dialog did not approve', async () => {
    const { directory, contents } = await openDocument()
    const elsewhere = join(directory, 'other.docx')
    const result = await invoke<ExportResult>(MARKDOWN_CHANNELS.exportDocx, contents, {
      base64: DOCX,
      suggestedName: 'note',
      mode: 'dialog',
      saveAsTarget: elsewhere,
    })
    expect(result).toMatchObject({ ok: false })
    expect(existsSync(elsewhere)).toBe(false)
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('ODT: converts the Word bytes to the approved path with no dialog', async () => {
    const { directory, mdPath, contents } = await openDocument()
    const identity = markdownRecoveryIdentity(contents.id)
    const target = join(directory, 'note.odt')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    docxToOdt.mockResolvedValue({ odtBytes: new Uint8Array([79, 68, 84]), report: [] })

    expect(await saveAsRendered(contents)).toEqual({ ok: true, path: target, exportAs: 'odt' })
    const result = await invoke<ExportResult>(MARKDOWN_CHANNELS.exportOdt, contents, {
      base64: DOCX,
      suggestedName: 'note',
      saveAsTarget: target,
    })
    expect(result).toEqual({ ok: true, path: target })
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    expect(readFileSync(target, 'utf8')).toBe('ODT')
    expectUnchanged(contents, mdPath, identity)
  })

  it('page images: one page keeps the typed name, more pages are numbered beside it', async () => {
    const { directory, mdPath, contents } = await openDocument()
    const identity = markdownRecoveryIdentity(contents.id)
    printMarkdownPdf.mockResolvedValue(Buffer.from('%PDF-1.4'))

    const exportPages = async (name: string, pages: number) => {
      const target = join(directory, name)
      showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
      expect(await saveAsRendered(contents)).toEqual({ ok: true, path: target, exportAs: 'png' })
      const prepared = await invoke<ImageExportPreparation>(
        MARKDOWN_CHANNELS.prepareImageExport,
        contents,
        { html: '<html></html>', suggestedName: 'note', saveAsTarget: target },
      )
      expect(prepared).toMatchObject({ ok: true })
      const id = (prepared as { id: string }).id
      for (let page = 1; page <= pages; page++) {
        expect(await invoke(MARKDOWN_CHANNELS.writeExportImage, contents, id, page, PNG)).toEqual({
          ok: true,
        })
      }
      return invoke<ExportResult>(MARKDOWN_CHANNELS.finishImageExport, contents, id, true)
    }

    expect(await exportPages('single.png', 1)).toEqual({ ok: true, path: directory })
    expect(showItemInFolder).toHaveBeenLastCalledWith(join(directory, 'single.png'))

    expect(await exportPages('report.png', 3)).toEqual({ ok: true, path: directory })
    expect(showItemInFolder).toHaveBeenLastCalledWith(join(directory, 'report-01.png'))
    expect(readdirSync(directory).sort()).toEqual([
      'note.md',
      'report-01.png',
      'report-02.png',
      'report-03.png',
      'single.png',
    ])
    expect(readFileSync(join(directory, 'report-02.png')).toString('base64')).toBe(PNG)
    // no folder picker: the Save As name decided where the pages go
    expect(showOpenDialog).not.toHaveBeenCalled()
    expectUnchanged(contents, mdPath, identity)
  })

  it('a Markdown pick (or a bare name) still saves the document and moves it there', async () => {
    const { directory, contents } = await openDocument()
    const bare = join(directory, 'copy')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: bare })
    expect(await saveAsRendered(contents)).toMatchObject({ ok: true, path: `${bare}.md` })
    expect(readFileSync(`${bare}.md`, 'utf8')).toBe('# Note\n\nedited')
    expect(markdownFilePath(contents.id)).toBe(`${bare}.md`)
    expect(markdownIsDirty(contents.id)).toBe(false)
  })
})
