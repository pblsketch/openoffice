// @vitest-environment node
/**
 * Save As › PDF (the reverse of the PDF editor's Save As › Markdown): the
 * picked .pdf name is written as a PDF of what is on screen — the same render
 * the File menu's PDF export uses — while the document keeps its Markdown path,
 * unsaved edits and assets. The next plain save still writes the .md file.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const showMessageBox = vi.fn()
const webContents: FakeWebContents[] = []
let nextWebContentsId = 1

const { printMarkdownPdf } = vi.hoisted(() => ({ printMarkdownPdf: vi.fn() }))
vi.mock('../src/main/print-pdf', () => ({ printMarkdownPdf }))

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
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
  WebContentsView: class {
    webContents = makeWebContents()
  },
}))

import { createMarkdownView } from '../src/main/markdown-main'
import { MARKDOWN_CHANNELS } from '../src/shared/ipc'
import type { SaveMarkdownResult } from '../src/shared/ipc'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const contents of webContents.splice(0)) contents.listeners.get('destroyed')?.()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const save = (contents: FakeWebContents, request: unknown) =>
  handlers.get(MARKDOWN_CHANNELS.save)!(
    { sender: contents },
    request,
  ) as Promise<SaveMarkdownResult>

const read = (contents: FakeWebContents, path: string) =>
  handlers.get(MARKDOWN_CHANNELS.readFile)!({ sender: contents }, path) as Promise<string>

async function openDocument(text = '# Note\n\nbody'): Promise<{
  directory: string
  mdPath: string
  contents: FakeWebContents
}> {
  const directory = mkdtempSync(join(tmpdir(), 'markdown-save-as-pdf-'))
  temporaryDirectories.push(directory)
  const mdPath = join(directory, 'note.md')
  writeFileSync(mdPath, text)
  const contents = createMarkdownView(mdPath).webContents as unknown as FakeWebContents
  expect(await read(contents, mdPath)).toBe(text)
  return { directory, mdPath, contents }
}

describe('Save As › PDF', () => {
  it('writes the rendered PDF to the picked name and keeps the document unsaved', async () => {
    const { directory, mdPath, contents } = await openDocument()
    const pdfPath = join(directory, 'note.pdf')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: pdfPath })
    printMarkdownPdf.mockResolvedValue(Buffer.from('%PDF-1.4 test'))

    const result = await save(contents, {
      text: '# Note\n\nbody2',
      imageSources: [],
      mode: 'saveAs',
      pdfHtml: '<html><body>Note</body></html>',
    })

    expect(result).toEqual({ ok: true, path: pdfPath, exported: 'pdf' })
    expect(printMarkdownPdf).toHaveBeenCalledWith('<html><body>Note</body></html>')
    expect(readFileSync(pdfPath, 'utf8')).toBe('%PDF-1.4 test')
    // the Markdown file was not written by the PDF choice
    expect(readFileSync(mdPath, 'utf8')).toBe('# Note\n\nbody')

    // ...and the next plain save still writes the .md, not a text file named .pdf
    const next = await save(contents, { text: '# Note\n\nbody3', imageSources: [], mode: 'save' })
    expect(next).toMatchObject({ ok: true, path: mdPath })
    expect(readFileSync(mdPath, 'utf8')).toBe('# Note\n\nbody3')
  })

  it('offers PDF in the Save As dialog only with a rendered document to write', async () => {
    const { directory, contents } = await openDocument()
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(directory, 'note.pdf') })
    printMarkdownPdf.mockResolvedValue(Buffer.from('%PDF-1.4'))

    await save(contents, {
      text: '# Note',
      imageSources: [],
      mode: 'saveAs',
      pdfHtml: '<html></html>',
    })
    const options = showSaveDialog.mock.calls[0]![0] as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(options.filters.map((filter) => filter.extensions)).toEqual([
      ['md', 'markdown', 'txt', 'json'],
      ['pdf'],
    ])
    expect(options.defaultPath).toBe(join(directory, 'note'))

    // a source-mode Save As (no rendered HTML) keeps the Markdown-only dialog
    showSaveDialog.mockResolvedValue({ canceled: true })
    await save(contents, { text: '# Note', imageSources: [], mode: 'saveAs' })
    const sourceOptions = showSaveDialog.mock.calls[1]![0] as {
      filters: Array<{ extensions: string[] }>
    }
    expect(sourceOptions.filters.map((filter) => filter.extensions)).toEqual([
      ['md', 'markdown', 'txt', 'json'],
    ])
  })
})
