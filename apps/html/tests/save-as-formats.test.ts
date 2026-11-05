// @vitest-environment node
/**
 * Save As lists every format a page can become: HTML first, then PDF, Word and
 * ODT. Picking an export writes a copy with the export menu's converters (the
 * page markup the save request carries); the open page keeps its path, unsaved
 * state, recovery identity and assets. The single-file HTML export shares the
 * .html extension, so it is not a separate entry.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const showItemInFolder = vi.fn()
const webContents: FakeWebContents[] = []
let nextWebContentsId = 1

const { convertHtmlToDocx, docxToOdt, printedHtml } = vi.hoisted(() => ({
  convertHtmlToDocx: vi.fn(),
  docxToOdt: vi.fn(),
  printedHtml: [] as string[],
}))
vi.mock('../../../packages/html2docx/src', () => ({ convertHtmlToDocx }))
vi.mock('../../../packages/html2docx/src/drivers/electron', () => ({
  ElectronBrowserDriver: {
    create: vi.fn(async () => ({
      close: vi.fn(async () => {}),
      destroyNow: vi.fn(),
      isWindowDestroyed: vi.fn(() => false),
    })),
  },
}))
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

vi.mock('electron', async () => {
  const { readFile } = await import('node:fs/promises')
  return {
    app: {
      getPath: vi.fn(() => tmpdir()),
      on: vi.fn(),
      quit: vi.fn(),
      whenReady: vi.fn(() => new Promise(() => {})),
    },
    // the hidden print window of the PDF export
    BrowserWindow: class {
      static fromWebContents() {
        return null
      }
      static getFocusedWindow() {
        return null
      }
      private loaded = ''
      loadFile = vi.fn(async (path: string) => {
        this.loaded = await readFile(path, 'utf8')
      })
      webContents = {
        printToPDF: vi.fn(async () => {
          printedHtml.push(this.loaded)
          return Buffer.from('%PDF-1.7 page')
        }),
      }
      destroy = vi.fn()
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
    protocol: {
      handle: vi.fn(),
      registerSchemesAsPrivileged: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
      showItemInFolder: (...args: unknown[]) => showItemInFolder(...args),
    },
    WebContentsView: class {
      webContents = makeWebContents()
    },
  }
})

import {
  createHtmlView,
  htmlFilePath,
  htmlIsDirty,
  htmlRecoveryIdentity,
} from '../src/main/html-main'
import { HTML_CHANNELS } from '../src/shared/ipc'
import type { SaveHtmlResult } from '../src/shared/ipc'

const temporaryDirectories: string[] = []
const ORIGINAL = '<p>Original</p>'

afterEach(() => {
  vi.clearAllMocks()
  printedHtml.length = 0
  for (const contents of webContents.splice(0)) contents.listeners.get('destroyed')?.()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const save = (contents: FakeWebContents, request: unknown) =>
  handlers.get(HTML_CHANNELS.save)!({ sender: contents }, request) as Promise<SaveHtmlResult>

async function openPage(): Promise<{
  directory: string
  path: string
  contents: FakeWebContents
}> {
  const directory = mkdtempSync(join(tmpdir(), 'html-save-as-formats-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'page.html')
  writeFileSync(path, ORIGINAL)
  const contents = createHtmlView(path).webContents as unknown as FakeWebContents
  expect(await handlers.get(HTML_CHANNELS.readFile)!({ sender: contents }, path)).toBe(ORIGINAL)
  // the open page has unsaved edits
  handlers.get(HTML_CHANNELS.dirtyChanged)!({ sender: contents }, true)
  return { directory, path, contents }
}

// what the renderer's serializeDocText sends for a CRLF file with a BOM
const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)
const EDITED_SAVE_TEXT = `${BOM}<h1>Edited</h1>${CRLF}<p>body</p>${CRLF}`
const saveAs = (contents: FakeWebContents) =>
  save(contents, { text: EDITED_SAVE_TEXT, imageSources: [], mode: 'saveAs' })

function expectUnchanged(contents: FakeWebContents, path: string, identity: unknown): void {
  expect(htmlFilePath(contents.id)).toBe(path)
  expect(htmlIsDirty(contents.id)).toBe(true)
  expect(htmlRecoveryIdentity(contents.id)).toEqual(identity)
  expect(readFileSync(path, 'utf8')).toBe(ORIGINAL)
}

describe('Save As format list', () => {
  it('offers HTML first, then PDF, Word and ODT, with no extension suggested', async () => {
    const { directory, contents } = await openPage()
    showSaveDialog.mockResolvedValue({ canceled: true })
    expect(await saveAs(contents)).toEqual({ ok: true, canceled: true })
    const options = showSaveDialog.mock.calls[0]![0] as {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
    }
    expect(options.filters.map((filter) => filter.extensions)).toEqual([
      ['html', 'htm'],
      ['pdf'],
      ['docx'],
      ['odt'],
    ])
    expect(options.filters.every((filter) => filter.name.length > 0)).toBe(true)
    expect(options.defaultPath).toBe(join(directory, 'page'))
  })

  it('keeps the dialog of a first plain save (close-save of an untitled page) HTML-only', async () => {
    const contents = createHtmlView().webContents as unknown as FakeWebContents
    showSaveDialog.mockResolvedValue({ canceled: true })
    await save(contents, { text: '<p>x</p>', imageSources: [], mode: 'save' })
    const options = showSaveDialog.mock.calls[0]![0] as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(options.filters.map((filter) => filter.extensions)).toEqual([['html', 'htm']])
    expect(options.defaultPath.endsWith('.html')).toBe(true)
  })
})

describe('Save As › an export writes a copy', () => {
  it('PDF: prints the page markup to the picked name', async () => {
    const { directory, path, contents } = await openPage()
    const identity = htmlRecoveryIdentity(contents.id)
    const target = join(directory, 'page.pdf')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })

    expect(await saveAs(contents)).toEqual({ ok: true, path: target, exported: 'pdf' })
    expect(readFileSync(target, 'utf8')).toBe('%PDF-1.7 page')
    // the markup the export menu sends: no BOM, LF line endings, no final newline
    expect(printedHtml).toHaveLength(1)
    expect(printedHtml[0]).toContain('<h1>Edited</h1>\n<p>body</p>')
    expect(printedHtml[0]).not.toContain(BOM)
    expect(showItemInFolder).toHaveBeenCalledWith(target)
    expectUnchanged(contents, path, identity)

    // the next plain save still writes the page, not a file named .pdf
    expect(
      await save(contents, { text: '<p>Next</p>', imageSources: [], mode: 'save' }),
    ).toMatchObject({ ok: true, path })
    expect(readFileSync(path, 'utf8')).toBe('<p>Next</p>')
  })

  it('Word: converts the page to the picked name', async () => {
    const { directory, path, contents } = await openPage()
    const identity = htmlRecoveryIdentity(contents.id)
    const target = join(directory, 'page.docx')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    convertHtmlToDocx.mockResolvedValue({ docx: new Uint8Array([80, 75]) })

    expect(await saveAs(contents)).toEqual({ ok: true, path: target, exported: 'docx' })
    expect(readFileSync(target, 'utf8')).toBe('PK')
    expect(convertHtmlToDocx).toHaveBeenCalledTimes(1)
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    expectUnchanged(contents, path, identity)
  })

  it('ODT: converts the Word bytes; a declined change report writes nothing', async () => {
    const { directory, path, contents } = await openPage()
    const identity = htmlRecoveryIdentity(contents.id)
    const target = join(directory, 'page.odt')
    convertHtmlToDocx.mockResolvedValue({ docx: new Uint8Array([80, 75]) })
    docxToOdt.mockResolvedValue({ odtBytes: new Uint8Array([79, 68, 84]), report: [] })

    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await saveAs(contents)).toEqual({ ok: true, path: target, exported: 'odt' })
    expect(readFileSync(target, 'utf8')).toBe('ODT')
    expectUnchanged(contents, path, identity)

    // the change report is confirmed as in the ODT export; Cancel keeps nothing
    rmSync(target)
    docxToOdt.mockResolvedValue({
      odtBytes: new Uint8Array([79, 68, 84]),
      report: [{ feature: 'chart', kind: 'dropped', count: 1 }],
    })
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await saveAs(contents)).toEqual({ ok: true, canceled: true })
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(existsSync(target)).toBe(false)
    expectUnchanged(contents, path, identity)
  })

  it('an HTML pick (or a bare name) still saves the page and moves it there', async () => {
    const { directory, contents } = await openPage()
    const bare = join(directory, 'copy')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: bare })
    expect(await saveAs(contents)).toMatchObject({ ok: true, path: `${bare}.html` })
    expect(readFileSync(`${bare}.html`, 'utf8')).toBe(EDITED_SAVE_TEXT)
    expect(htmlFilePath(contents.id)).toBe(`${bare}.html`)
    expect(htmlIsDirty(contents.id)).toBe(false)
  })
})
