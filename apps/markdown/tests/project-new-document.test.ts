// @vitest-environment node
/**
 * Project folders (spec 6) in the Markdown editor's main process: the AI's silent
 * first save of a never-saved note goes through the shell's project write when
 * the panel has a project, and an untitled note's save dialog opens in the
 * project folder. Without a project both behave exactly as before.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const webContents: FakeWebContents[] = []
const showSaveDialog = vi.fn((..._args: unknown[]) => ({ canceled: true }))
let nextWebContentsId = 1
let appDir = tmpdir()

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
    getPath: vi.fn(() => appDir),
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
    showMessageBox: vi.fn(),
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
  shell: { openExternal: vi.fn() },
  WebContentsView: class {
    webContents = makeWebContents()
  },
}))

import { configureMarkdownRuntime, createMarkdownView } from '../src/main/markdown-main'
import { MARKDOWN_CHANNELS } from '../src/shared/ipc'
import type { SaveMarkdownResult } from '../src/shared/ipc'

let base: string
let project: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'markdown-project-doc-'))
  appDir = join(base, 'app')
  project = join(base, 'Report')
  mkdirSync(appDir, { recursive: true })
  mkdirSync(project, { recursive: true })
})

afterEach(() => {
  configureMarkdownRuntime({ preloadPath: '' })
  showSaveDialog.mockClear()
  for (const contents of webContents.splice(0)) contents.listeners.get('destroyed')?.()
  rmSync(base, { recursive: true, force: true })
})

const save = (contents: FakeWebContents, request: unknown) =>
  handlers.get(MARKDOWN_CHANNELS.save)!(
    { sender: contents },
    request,
  ) as Promise<SaveMarkdownResult>

function untitledView(): FakeWebContents {
  return createMarkdownView(null).webContents as unknown as FakeWebContents
}

describe('the AI silent first save of a never-saved note', () => {
  it('goes through the project write when the panel has a project', async () => {
    const written: Array<[number, string, string]> = []
    configureMarkdownRuntime({
      preloadPath: '',
      writeNewDocument: async (id, fileName, bytes) => {
        const path = join(project, fileName)
        writeFileSync(path, Buffer.from(bytes))
        written.push([id, fileName, Buffer.from(bytes).toString('utf8')])
        return path
      },
    })
    const contents = untitledView()
    const result = await save(contents, {
      text: '# Plan',
      imageSources: [],
      mode: 'save',
      suggestedName: 'Q3/Plan',
    })
    expect(result).toMatchObject({ ok: true, path: join(project, 'Q3_Plan.md') })
    expect(written).toEqual([[contents.id, 'Q3_Plan.md', '# Plan']])
    expect(readFileSync(join(project, 'Q3_Plan.md'), 'utf8')).toBe('# Plan')
    expect(existsSync(join(appDir, 'IeumOffice', 'Q3_Plan.md'))).toBe(false)
  })

  it('lands in the default save folder as before without a project', async () => {
    const write = vi.fn(async () => null)
    configureMarkdownRuntime({ preloadPath: '', writeNewDocument: write })
    const contents = untitledView()
    const result = await save(contents, {
      text: '# Plan',
      imageSources: [],
      mode: 'save',
      suggestedName: 'Plan',
    })
    expect(write).toHaveBeenCalledOnce()
    expect(result.ok && 'path' in result && result.path).toMatch(/Plan\.md$/)
    const path = (result as { path: string }).path
    expect(path.startsWith(project)).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('# Plan')
  })

  it('reports a refused project write and writes nothing elsewhere', async () => {
    configureMarkdownRuntime({
      preloadPath: '',
      writeNewDocument: async () => {
        throw new Error('project folder write refused (missing-folder)')
      },
    })
    const result = await save(untitledView(), {
      text: '# Plan',
      imageSources: [],
      mode: 'save',
      suggestedName: 'Plan',
    })
    expect(result).toMatchObject({ ok: false })
    expect(existsSync(join(appDir, 'IeumOffice', 'Plan.md'))).toBe(false)
  })
})

describe('an untitled note save dialog', () => {
  it('opens in the project folder when the panel has one, else the default folder', async () => {
    configureMarkdownRuntime({ preloadPath: '', newDocumentDir: async () => project })
    await save(untitledView(), { text: 'x', imageSources: [], mode: 'saveAs' })
    const options = showSaveDialog.mock.calls.at(-1)?.at(-1) as { defaultPath: string }
    expect(options.defaultPath.startsWith(join(project, ''))).toBe(true)

    configureMarkdownRuntime({ preloadPath: '', newDocumentDir: async () => null })
    await save(untitledView(), { text: 'x', imageSources: [], mode: 'saveAs' })
    const plain = showSaveDialog.mock.calls.at(-1)?.at(-1) as { defaultPath: string }
    expect(plain.defaultPath.startsWith(project)).toBe(false)
  })
})
