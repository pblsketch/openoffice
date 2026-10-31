// @vitest-environment node
/**
 * The main process: what it hands the renderer on open, what it agrees to
 * write, and which links it opens. A file that did not open as `ok` is never
 * written, whatever the renderer asks for.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const openExternal = vi.fn(async (_url: string) => {})
const showSaveDialog = vi.fn()
const showMessageBox = vi.fn()

interface FakeContents {
  id: number
  sent: Array<[string, ...unknown[]]>
  destroyed: boolean
  windowOpenHandler: ((details: { url: string }) => { action: string }) | null
  listeners: Map<string, (...args: unknown[]) => void>
  isDestroyed(): boolean
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void
  loadURL(url: string): Promise<void>
  getURL(): string
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
const loaded: string[] = []
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    sent: [],
    destroyed: false,
    windowOpenHandler: null,
    listeners: new Map(),
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: (handler) => {
      contents.windowOpenHandler = handler
    },
    loadURL: async (url) => {
      loaded.push(url)
    },
    getURL: () => loaded.at(-1) ?? '',
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
    getPath: (name: string) => join(tmpdir(), `mindmap-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
  shell: { openExternal: (url: string) => openExternal(url) },
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

import { createXmindDocument, openXmind } from '@genoffice/xmind-engine'
import {
  configureMindmapRuntime,
  createMindmapView,
  mindmapFilePath,
  mindmapIsDirty,
  mindmapSaveToPath,
  requestMindmapClose,
  requestMindmapSave,
  sendMindmapExportRequest,
  sendMindmapMenuCommand,
  sendMindmapPrintRequest,
} from '../src/main/mindmap-main'
import {
  generateRunStartedEvents,
  queueGenerateHandoff,
  resetGenerateHandoffsForTest,
  type GenerateHandoff,
} from '@genoffice/electron-utils/generate-handoff'
import { AI_CHANNELS, APP_CHANNELS, MINDMAP_CHANNELS } from '../src/shared/ipc'
import type { MindmapHandoff, OpenFileResult, SaveMindmapResult } from '../src/shared/ipc'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-mindmap-main-'))
  openExternal.mockClear()
  showSaveDialog.mockReset()
  showMessageBox.mockReset()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function mapBytes(rootTitle = 'Center'): Promise<Uint8Array> {
  const document = await createXmindDocument({ sheetTitle: 'Sheet 1', rootTitle })
  return document.save()
}

function view(openPath?: string | null): FakeContents {
  return createMindmapView(openPath).webContents as unknown as FakeContents
}

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

const open = (contents: FakeContents, path: string) =>
  call<Promise<OpenFileResult>>(MINDMAP_CHANNELS.openFile, contents, path)

const save = (contents: FakeContents, request: unknown) =>
  call<Promise<SaveMindmapResult>>(MINDMAP_CHANNELS.save, contents, request)

describe('channel names', () => {
  it('every channel of the editor starts with mindmap: and no name is used twice', () => {
    const names = Object.values(MINDMAP_CHANNELS)
    for (const name of names) expect(name).toMatch(/^mindmap:[a-z-]+$/)
    expect(new Set(names).size).toBe(names.length)
  })

  it('the editor registers none of the shared AI or subscription channels', () => {
    view(null)
    for (const channel of handlers.keys()) {
      expect(Object.values(AI_CHANNELS)).not.toContain(channel)
      expect(channel).not.toMatch(/^ai:/)
      // the language getter is the one shell channel every editor answers
      if (!channel.startsWith('mindmap:')) expect(channel).toBe(APP_CHANNELS.getLanguage)
    }
  })

  it('registers a handler for what is implemented, and none for what later work adds', () => {
    view(null)
    for (const name of [
      'consumePending',
      'openFile',
      'save',
      'saveIntoProject',
      'openLink',
      'exportPng',
      'exportPdf',
      'exportMarkdown',
      'print',
      'filesPick',
      'filesAdd',
      'filesAddPastedImage',
      'filesRead',
      'filesReadImage',
      'provisionalTitle',
      'handoffTake',
      'handoffRunStarted',
      'seedTake',
    ] as const) {
      expect(handlers.has(MINDMAP_CHANNELS[name])).toBe(true)
    }
    for (const name of ['outlineResult', 'bytesResult'] as const) {
      expect(handlers.has(MINDMAP_CHANNELS[name])).toBe(false)
    }
  })
})

describe('opening', () => {
  it('hands over the bytes of a file that opens', async () => {
    const path = join(dir, 'map.xmind')
    const bytes = await mapBytes()
    writeFileSync(path, bytes)
    const contents = view(path)
    expect(call(MINDMAP_CHANNELS.consumePending, contents)).toBe(path)
    const result = await open(contents, path)
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && Buffer.from(result.bytes).equals(Buffer.from(bytes))).toBe(
      true,
    )
    expect(mindmapFilePath(contents.id)).toBe(path)
  })

  it('a new map has nothing pending', () => {
    expect(call(MINDMAP_CHANNELS.consumePending, view(null))).toBeNull()
  })

  it('a path that was not granted to the view is not read', async () => {
    const path = join(dir, 'other.xmind')
    writeFileSync(path, await mapBytes())
    await expect(open(view(null), path)).rejects.toThrow(/not granted/)
  })

  it.each([
    ['unreadable', () => Buffer.from('this is not a zip archive')],
    ['unreadable', () => Buffer.alloc(0)],
  ])('a file that does not open gives %s and no bytes', async (status, make) => {
    const path = join(dir, 'broken.xmind')
    writeFileSync(path, make())
    const result = await open(view(path), path)
    expect(result).toEqual({ status })
    expect(result).not.toHaveProperty('bytes')
  })
})

describe('a file that did not open is never written', () => {
  it('refuses every save of that view and leaves the file as it was', async () => {
    const path = join(dir, 'broken.xmind')
    const original = Buffer.from('this is not a zip archive')
    writeFileSync(path, original)
    const contents = view(path)
    expect((await open(contents, path)).status).toBe('unreadable')
    expect(mindmapFilePath(contents.id)).toBeUndefined()

    const good = await mapBytes()
    for (const mode of ['save', 'saveAs'] as const) {
      const result = await save(contents, { bytes: good, mode })
      expect(result).toMatchObject({ ok: false })
    }
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(readFileSync(path).equals(original)).toBe(true)
    expect(readdirSync(dir)).toEqual(['broken.xmind'])
  })

  it('a menu save and a save to a given path are refused as well', async () => {
    const path = join(dir, 'broken.xmind')
    writeFileSync(path, 'x')
    const contents = view(path)
    await open(contents, path)
    expect(await requestMindmapSave(contents as never, 'save')).toBe(false)
    await expect(
      mindmapSaveToPath(contents as never, join(dir, 'elsewhere.xmind')),
    ).rejects.toThrow()
    expect(contents.sent).toEqual([])
    expect(readdirSync(dir)).toEqual(['broken.xmind'])
  })
})

describe('a path becomes a save target only once the main process has seen the file open', () => {
  /** A view on a file that is not a map, whose renderer never asked to open it. */
  function unopened(): { contents: FakeContents; path: string; original: Buffer } {
    const path = join(dir, 'not-a-map.xmind')
    const original = Buffer.from('this is not a zip archive')
    writeFileSync(path, original)
    return { contents: view(path), path, original }
  }
  const untouched = (path: string, original: Buffer): void => {
    expect(readFileSync(path).equals(original)).toBe(true)
    expect(readdirSync(dir)).toEqual(['not-a-map.xmind'])
  }

  it('save and save as are refused before any open', async () => {
    const { contents, path, original } = unopened()
    expect(mindmapFilePath(contents.id)).toBeUndefined()
    const good = await mapBytes()
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dir, 'elsewhere.xmind') })
    for (const mode of ['save', 'saveAs'] as const) {
      expect(await save(contents, { bytes: good, mode })).toMatchObject({ ok: false })
    }
    expect(showSaveDialog).not.toHaveBeenCalled()
    untouched(path, original)
  })

  it('the menu save, the close prompt and a save to a given path never reach the renderer', async () => {
    const { contents, path, original } = unopened()
    expect(await requestMindmapSave(contents as never, 'save')).toBe(false)
    expect(await requestMindmapSave(contents as never, 'saveAs')).toBe(false)
    await expect(mindmapSaveToPath(contents as never, path)).rejects.toThrow()
    await expect(mindmapSaveToPath(contents as never, join(dir, 'other.xmind'))).rejects.toThrow()
    // a renderer claiming unsaved changes for a file that never opened gets no "save?" question
    call(MINDMAP_CHANNELS.dirtyChanged, contents, true)
    expect(mindmapIsDirty(contents.id)).toBe(false)
    expect(await requestMindmapClose(contents as never)).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(contents.sent).toEqual([])
    // an automatic save is the same save call
    expect(await save(contents, { bytes: await mapBytes(), mode: 'save' })).toMatchObject({
      ok: false,
    })
    untouched(path, original)
  })

  it('a good file is no save target either until it was opened here, and is one afterwards', async () => {
    const path = join(dir, 'good.xmind')
    const bytes = await mapBytes()
    writeFileSync(path, bytes)
    const contents = view(path)
    const edited = await mapBytes('Edited')
    expect(await save(contents, { bytes: edited, mode: 'save' })).toMatchObject({ ok: false })
    expect(readFileSync(path).equals(Buffer.from(bytes))).toBe(true)

    expect((await open(contents, path)).status).toBe('ok')
    expect(await save(contents, { bytes: edited, mode: 'save' })).toEqual({ ok: true, path })
    expect(readFileSync(path).equals(Buffer.from(edited))).toBe(true)
  })

  it('a file that stops opening after a reload stops being a save target', async () => {
    const path = join(dir, 'changing.xmind')
    writeFileSync(path, await mapBytes())
    const contents = view(path)
    await open(contents, path)
    const broken = Buffer.from('replaced by something else')
    writeFileSync(path, broken)
    expect((await open(contents, path)).status).toBe('unreadable')
    expect(await save(contents, { bytes: await mapBytes(), mode: 'save' })).toMatchObject({
      ok: false,
    })
    expect(readFileSync(path).equals(broken)).toBe(true)
  })
})

describe('saving', () => {
  it('writes the bytes it was given, byte for byte', async () => {
    const path = join(dir, 'map.xmind')
    const bytes = await mapBytes()
    writeFileSync(path, bytes)
    const contents = view(path)
    await open(contents, path)
    const edited = await mapBytes('Edited')
    expect(await save(contents, { bytes: edited, mode: 'save' })).toEqual({ ok: true, path })
    expect(readFileSync(path).equals(Buffer.from(edited))).toBe(true)
    // nothing is left beside the file: the temporary file was renamed over it
    expect(readdirSync(dir)).toEqual(['map.xmind'])
  })

  it('an untitled map asks where to save, as .xmind, and remembers the answer', async () => {
    const contents = view(null)
    const target = join(dir, 'chosen.xmind')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    const bytes = await mapBytes()
    expect(await save(contents, { bytes, mode: 'save', defaultName: 'My: map?' })).toEqual({
      ok: true,
      path: target,
    })
    const options = showSaveDialog.mock.calls[0]!.at(-1) as {
      defaultPath: string
      filters: { extensions: string[] }[]
    }
    expect(options.filters[0]!.extensions).toEqual(['xmind'])
    expect(options.defaultPath.endsWith('My_ map_.xmind')).toBe(true)
    expect(mindmapFilePath(contents.id)).toBe(target)

    // the second save goes to the same file without a dialog
    await save(contents, { bytes, mode: 'save' })
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
  })

  it('a path without the extension gets .xmind', async () => {
    const contents = view(null)
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dir, 'no-extension') })
    const result = await save(contents, { bytes: await mapBytes(), mode: 'save' })
    expect(result).toEqual({ ok: true, path: join(dir, 'no-extension.xmind') })
  })

  it('a cancelled dialog writes nothing', async () => {
    const contents = view(null)
    showSaveDialog.mockResolvedValue({ canceled: true })
    expect(await save(contents, { bytes: await mapBytes(), mode: 'save' })).toEqual({
      ok: true,
      canceled: true,
    })
    expect(readdirSync(dir)).toEqual([])
    expect(mindmapFilePath(contents.id)).toBeUndefined()
  })

  it('bytes that would not open as a map are not written over the file', async () => {
    const path = join(dir, 'map.xmind')
    const bytes = await mapBytes()
    writeFileSync(path, bytes)
    const contents = view(path)
    await open(contents, path)
    for (const bad of [new Uint8Array([1, 2, 3]), 'text', undefined, null]) {
      expect(await save(contents, { bytes: bad, mode: 'save' })).toMatchObject({ ok: false })
    }
    expect(readFileSync(path).equals(Buffer.from(bytes))).toBe(true)
  })

  it('the saved file opens again with the engine', async () => {
    const contents = view(null)
    const target = join(dir, 'round.xmind')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    await save(contents, { bytes: await mapBytes('Round trip'), mode: 'saveAs' })
    const reopened = await openXmind(readFileSync(target))
    expect(reopened.status).toBe('ok')
  })
})

describe('saving a new map into the project (spec 6)', () => {
  const saveIntoProject = (contents: FakeContents, request: unknown) =>
    call<Promise<SaveMindmapResult | { ok: false; skipped: true }>>(
      MINDMAP_CHANNELS.saveIntoProject,
      contents,
      request,
    )
  const writer =
    vi.fn<(id: number, fileName: string, bytes: Uint8Array) => Promise<string | null>>()

  beforeEach(() => {
    writer.mockReset()
    writer.mockImplementation(async (_id, fileName, bytes) => {
      const path = join(dir, fileName)
      writeFileSync(path, bytes)
      return path
    })
    configureMindmapRuntime({ preloadPath: '', writeNewDocument: writer })
  })
  afterEach(() => configureMindmapRuntime({ preloadPath: '' }))

  it('hands a bare name and the bytes to the project writer; the map becomes that file', async () => {
    const contents = view(null)
    const bytes = await mapBytes()
    const result = await saveIntoProject(contents, { bytes, defaultName: 'Trip: plan?' })
    expect(result).toEqual({ ok: true, path: join(dir, 'Trip_ plan_.xmind') })
    expect(writer).toHaveBeenCalledTimes(1)
    const [id, fileName, written] = writer.mock.calls[0]!
    expect(id).toBe(contents.id)
    expect(fileName).toBe('Trip_ plan_.xmind')
    expect(Buffer.from(written).equals(Buffer.from(bytes))).toBe(true)
    expect(showSaveDialog).not.toHaveBeenCalled()
    // later saves go to that file without a dialog
    expect(mindmapFilePath(contents.id)).toBe(join(dir, 'Trip_ plan_.xmind'))
    await save(contents, { bytes, mode: 'save' })
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('an unnamed map gets the untitled name with .xmind', async () => {
    const contents = view(null)
    await saveIntoProject(contents, { bytes: await mapBytes() })
    expect(writer.mock.calls[0]![1]).toMatch(/^[^\\/]+\.xmind$/)
  })

  it('without a project nothing is written and the map stays untitled', async () => {
    writer.mockResolvedValue(null)
    const contents = view(null)
    expect(await saveIntoProject(contents, { bytes: await mapBytes() })).toEqual({
      ok: false,
      skipped: true,
    })
    expect(mindmapFilePath(contents.id)).toBeUndefined()
    configureMindmapRuntime({ preloadPath: '' })
    expect(await saveIntoProject(contents, { bytes: await mapBytes() })).toEqual({
      ok: false,
      skipped: true,
    })
  })

  it('a refused write keeps the map untitled and gives the reason', async () => {
    writer.mockRejectedValue(new Error('project folder write refused (exists): x'))
    const contents = view(null)
    const result = await saveIntoProject(contents, { bytes: await mapBytes() })
    expect(result).toMatchObject({ ok: false })
    expect((result as { error: string }).error).toContain('exists')
    expect(mindmapFilePath(contents.id)).toBeUndefined()
  })

  it('a map with a file, a file that did not open and bytes that are no map are left alone', async () => {
    const path = join(dir, 'map.xmind')
    writeFileSync(path, await mapBytes())
    const opened = view(path)
    await open(opened, path)
    expect(await saveIntoProject(opened, { bytes: await mapBytes() })).toEqual({
      ok: false,
      skipped: true,
    })
    const fresh = view(null)
    expect(await saveIntoProject(fresh, { bytes: new Uint8Array([1, 2, 3]) })).toMatchObject({
      ok: false,
    })
    expect(writer).not.toHaveBeenCalled()
  })
})

describe('the menu and closing', () => {
  it('a menu save of a clean, saved map is done at once; a dirty one asks the renderer', async () => {
    const path = join(dir, 'map.xmind')
    const bytes = await mapBytes()
    writeFileSync(path, bytes)
    const contents = view(path)
    await open(contents, path)
    expect(await requestMindmapSave(contents as never, 'save')).toBe(true)
    expect(contents.sent).toEqual([])

    call(MINDMAP_CHANNELS.dirtyChanged, contents, true)
    expect(mindmapIsDirty(contents.id)).toBe(true)
    const pending = requestMindmapSave(contents as never, 'save')
    expect(contents.sent).toEqual([[MINDMAP_CHANNELS.saveRequest, 'save']])
    await save(contents, { bytes, mode: 'save' })
    expect(await pending).toBe(true)
    expect(mindmapIsDirty(contents.id)).toBe(false)
  })

  it('a save to a given path runs the normal save without a dialog and moves the map there', async () => {
    const contents = view(null)
    const target = join(dir, 'given.xmind')
    const saving = mindmapSaveToPath(contents as never, target)
    expect(contents.sent).toEqual([[MINDMAP_CHANNELS.saveRequest, 'save']])
    await save(contents, { bytes: await mapBytes(), mode: 'save' })
    await saving
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(mindmapFilePath(contents.id)).toBe(target)
    expect((await openXmind(readFileSync(target))).status).toBe('ok')
  })

  it('a clean map closes without a question', async () => {
    const contents = view(null)
    expect(await requestMindmapClose(contents as never)).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('a dirty map asks: cancel keeps it open, "do not save" closes, "save" waits for the renderer', async () => {
    const contents = view(null)
    call(MINDMAP_CHANNELS.dirtyChanged, contents, true)

    showMessageBox.mockResolvedValueOnce({ response: 2 })
    expect(await requestMindmapClose(contents as never)).toBe(false)

    showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect(await requestMindmapClose(contents as never)).toBe(true)

    showMessageBox.mockResolvedValueOnce({ response: 0 })
    const closing = requestMindmapClose(contents as never)
    await vi.waitFor(() =>
      expect(contents.sent).toContainEqual([MINDMAP_CHANNELS.closeSaveRequest]),
    )
    call(MINDMAP_CHANNELS.closeSaveResult, contents, true)
    expect(await closing).toBe(true)
  })

  it('menu commands, export and print requests go to the renderer under their own channels', () => {
    const contents = view(null)
    sendMindmapMenuCommand(contents as never, 'undo')
    sendMindmapExportRequest(contents as never, 'png')
    sendMindmapPrintRequest(contents as never)
    expect(contents.sent).toEqual([
      [MINDMAP_CHANNELS.menuCommand, 'undo'],
      [MINDMAP_CHANNELS.exportRequest, 'png'],
      [MINDMAP_CHANNELS.printRequest],
    ])
  })
})

describe('links', () => {
  const openLink = (url: unknown) =>
    call<Promise<boolean>>(MINDMAP_CHANNELS.openLink, view(null), url)

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'file:///C:/Windows/System32/calc.exe',
    'file://server/share/x.bat',
    'xmind:#topic',
    'xap:attachments/a.pdf',
    'ms-settings:privacy',
    'data:text/html,<script>alert(1)</script>',
    'not a url',
    '',
    42,
    null,
  ])('%j is not opened', async (url) => {
    expect(await openLink(url)).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('an https link is opened exactly once, through the main process', async () => {
    expect(await openLink('  https://example.com/page?x=1  ')).toBe(true)
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/page?x=1')
  })

  it('the view itself opens no window, whatever asks for one', () => {
    const contents = view(null)
    for (const url of ['https://example.com/', 'javascript:alert(1)', 'file:///c:/x']) {
      expect(contents.windowOpenHandler!({ url })).toEqual({ action: 'deny' })
    }
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('the view does not navigate away from the editor', () => {
    const contents = view(null)
    const navigate = contents.listeners.get('will-navigate')!
    const event = { preventDefault: vi.fn() }
    navigate(event, 'https://example.com/elsewhere')
    expect(event.preventDefault).toHaveBeenCalled()
  })
})

describe('a request handed over by the shell (8.5)', () => {
  beforeEach(() => resetGenerateHandoffsForTest())

  const handoff = (patch: Partial<GenerateHandoff> = {}): GenerateHandoff => ({
    id: 'h-1',
    mode: 'ai',
    target: 'mindmap',
    materials: [
      { path: join('C:', 'notes', 'plan.docx'), name: 'plan.docx' },
      { path: join('C:', 'notes', 'old.xmind'), name: 'old.xmind' },
    ],
    text: 'Make a mind map from these notes',
    defaultText: false,
    createdAt: 1,
    ...patch,
  })
  const take = (contents: FakeContents) =>
    call<MindmapHandoff | null>(MINDMAP_CHANNELS.handoffTake, contents)
  const report = (contents: FakeContents, payload: unknown) =>
    call<void>(MINDMAP_CHANNELS.handoffRunStarted, contents, payload)
  const plan = join('C:', 'notes', 'plan.docx')
  const old = join('C:', 'notes', 'old.xmind')

  it('the new tab takes it once, in the shape of the contract', () => {
    const contents = view(null)
    queueGenerateHandoff(contents.id, handoff())
    expect(take(contents)).toEqual({
      id: 'h-1',
      sourcePaths: [plan, old],
      prompt: 'Make a mind map from these notes',
    })
    // a second take (a reload) gets nothing
    expect(take(contents)).toBeNull()
  })

  it('another tab, or a request made for another kind, gets nothing', () => {
    const mine = view(null)
    const other = view(null)
    queueGenerateHandoff(mine.id, handoff())
    expect(take(other)).toBeNull()
    queueGenerateHandoff(other.id, handoff({ id: 'h-2', target: 'slides' }))
    expect(take(other)).toBeNull()
    expect(take(mine)?.id).toBe('h-1')
  })

  it('a view made for a file never takes, and leaves the request where it is', async () => {
    const path = join(dir, 'map.xmind')
    writeFileSync(path, await mapBytes())
    const contents = view(path)
    queueGenerateHandoff(contents.id, handoff())
    expect(take(contents)).toBeNull()
    expect(take(contents)).toBeNull()
  })

  it('records the first run with handed-over files attached, with just those files', () => {
    const contents = view(null)
    queueGenerateHandoff(contents.id, handoff())
    take(contents)
    report(contents, {
      id: 'h-1',
      attachedSources: 1,
      attachedPaths: [old, join('C:', 'elsewhere', 'mine.txt')],
    })
    expect(generateRunStartedEvents()).toEqual([
      expect.objectContaining({
        webContentsId: contents.id,
        target: 'mindmap',
        mode: 'ai',
        sources: [old],
        handoffId: 'h-1',
      }),
    ])
    // later runs of the same tab are not new starts
    report(contents, { id: 'h-1', attachedSources: 2, attachedPaths: [plan, old] })
    expect(generateRunStartedEvents()).toHaveLength(1)
  })

  it('a run with every handed-over file removed is not recorded; a later one with them is', () => {
    const contents = view(null)
    queueGenerateHandoff(contents.id, handoff())
    take(contents)
    report(contents, { id: 'h-1', attachedSources: 0, attachedPaths: [] })
    report(contents, {
      id: 'h-1',
      attachedSources: 1,
      attachedPaths: [join('C:', 'elsewhere', 'mine.txt')],
    })
    expect(generateRunStartedEvents()).toEqual([])
    report(contents, { id: 'h-1', attachedSources: 1, attachedPaths: [plan] })
    expect(generateRunStartedEvents().map((e) => e.sources)).toEqual([[plan]])
  })

  it('ignores reports that are malformed, name another request, or come from a tab that took nothing', () => {
    const contents = view(null)
    const stranger = view(null)
    queueGenerateHandoff(contents.id, handoff())
    for (const payload of [
      null,
      'h-1',
      42,
      { id: 'h-1' },
      { id: 'h-1', attachedPaths: plan },
      { id: 'h-1', attachedPaths: [42, null, ''] },
      { id: 7, attachedPaths: [plan] },
    ]) {
      report(contents, payload)
    }
    // not taken yet: nothing to report against
    report(contents, { id: 'h-1', attachedSources: 1, attachedPaths: [plan] })
    take(contents)
    report(contents, { id: 'someone-else', attachedSources: 1, attachedPaths: [plan] })
    report(stranger, { id: 'h-1', attachedSources: 1, attachedPaths: [plan] })
    expect(generateRunStartedEvents()).toEqual([])
  })
})

describe('"make another document from this one" (T18)', () => {
  it('hands the asking view to the shell, and does nothing without one', async () => {
    const { setMindmapMakeFromDocumentHook } = await import('../src/main/mindmap-main')
    const contents = view(null)
    expect(() => call(MINDMAP_CHANNELS.makeFromDocument, contents)).not.toThrow()
    const asked: number[] = []
    setMindmapMakeFromDocumentHook((wc) => asked.push(wc.id))
    call(MINDMAP_CHANNELS.makeFromDocument, contents)
    expect(asked).toEqual([contents.id])
    setMindmapMakeFromDocumentHook(null)
  })
})
