// @vitest-environment node
/**
 * The main process: what it hands the renderer on open, what it agrees to
 * write and where, and what the shell reads about a tab. A file that did not
 * open is never written; a save with nothing changed writes nothing.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const openExternal = vi.fn(async (_url: string) => {})
const showSaveDialog = vi.fn()
const showMessageBox = vi.fn()
const sessionCalls: string[] = []

interface FakeContents {
  id: number
  sent: Array<[string, ...unknown[]]>
  destroyed: boolean
  windowOpenHandler: (() => { action: string }) | null
  listeners: Map<string, (...args: unknown[]) => void>
  isDestroyed(): boolean
  setWindowOpenHandler(handler: () => { action: string }): void
  loadURL(url: string): Promise<void>
  getURL(): string
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
  reload(): void
}

let nextId = 1
const viewPreferences: unknown[] = []
function fakeContents(): FakeContents {
  let url = ''
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
    loadURL: async (next) => {
      url = next
    },
    getURL: () => url,
    send: (channel, ...args) => {
      contents.sent.push([channel, ...args])
    },
    on: (event, listener) => {
      contents.listeners.set(event, listener)
    },
    once: (event, listener) => {
      contents.listeners.set(event, listener)
    },
    reload: () => {},
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `diagram-test-${name}`),
    getLocale: () => 'en-US',
    isPackaged: false,
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
  shell: { openExternal: (url: string) => openExternal(url) },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  session: {
    fromPartition: (name: string) => {
      sessionCalls.push(name)
      return {
        protocol: { handle: (scheme: string) => sessionCalls.push(`handle:${scheme}`) },
        webRequest: { onBeforeRequest: () => sessionCalls.push('onBeforeRequest') },
        setSpellCheckerEnabled: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      }
    },
  },
  nativeTheme: { themeSource: 'system' },
  net: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  WebContentsView: class {
    webContents = fakeContents()
    constructor(options: unknown) {
      viewPreferences.push(options)
    }
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

import {
  configureDiagramRuntime,
  createDiagramView,
  diagramFilePath,
  diagramIsDirty,
  diagramTabIdentity,
  requestDiagramSave,
  setDiagramProvisionalTitleHook,
} from '../src/main/diagram-main'
import { createRecoveryStore, setHeadlessMode } from '@genoffice/electron-utils'
import { writeViewCopy } from '../src/main/recovery-main'
import { DIAGRAM_CHANNELS } from '../src/shared/ipc'
import type { OpenFileResult, SaveDiagramResult, SaveTargetResult } from '../src/shared/ipc'

const fixtures = join(__dirname, '../../../packages/drawio-model/tests/fixtures')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-diagram-main-'))
  configureDiagramRuntime({
    preloadPath: join(dir, 'out', 'preload', 'index.js'),
    rendererFile: join(dir, 'out', 'renderer', 'index.html'),
    packaged: true,
  })
  showSaveDialog.mockReset()
  openExternal.mockClear()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const call = async <T>(channel: string, contents: FakeContents, ...args: unknown[]): Promise<T> =>
  (await handlers.get(channel)!({ sender: contents }, ...args)) as T
const send = (channel: string, contents: FakeContents, ...args: unknown[]) =>
  handlers.get(channel)!({ sender: contents }, ...args)

function copyFixture(name: string, as = name): string {
  const path = join(dir, as)
  writeFileSync(path, readFileSync(join(fixtures, name)))
  return path
}

function view(path?: string | null): FakeContents {
  return createDiagramView(path).webContents as unknown as FakeContents
}

describe('the view', () => {
  it('lives in the diagram partition with the app’s and draw.io’s schemes and the request refusal', () => {
    view()
    const prefs = viewPreferences.at(-1) as { webPreferences: Record<string, unknown> }
    expect(prefs.webPreferences).toMatchObject({
      partition: 'persist:ieum-diagram',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    })
    expect(sessionCalls).toContain('persist:ieum-diagram')
    expect(sessionCalls).toContain('handle:drawio-app')
    expect(sessionCalls).toContain('handle:genoffice-app')
    expect(sessionCalls).toContain('onBeforeRequest')
  })

  it('denies every window', () => {
    const contents = view()
    expect(contents.windowOpenHandler?.()).toEqual({ action: 'deny' })
  })
})

describe('open', () => {
  it('hands over the XML, the format and the compression of each format', async () => {
    for (const [name, format, compressed] of [
      ['out.drawio', 'drawio', false],
      ['out.drawio.svg', 'drawio.svg', true],
      ['out.drawio.png', 'drawio.png', false],
    ] as const) {
      const path = copyFixture(name)
      const contents = view(path)
      const result = await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)
      expect(result, name).toMatchObject({ status: 'ok', format, compressed })
      expect((result as { xml: string }).xml).toMatch(/^<mxfile/)
      expect(diagramFilePath(contents.id)).toBe(path)
    }
  })

  it('refuses a picture without a diagram inside and a broken file, and never writes for them', async () => {
    const svg = join(dir, 'plain.drawio.svg')
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const broken = join(dir, 'broken.drawio')
    writeFileSync(broken, 'not xml at all')
    for (const [path, status] of [
      [svg, 'no_original'],
      [broken, 'not_xml'],
    ] as const) {
      const contents = view(path)
      expect(await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)).toEqual({
        status,
      })
      const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
        mode: 'save',
      })
      expect(target.ok).toBe(false)
      expect(await requestDiagramSave(contents as never, 'save')).toBe(false)
    }
  })

  it('refuses a path that was not granted to the view', async () => {
    const contents = view()
    await expect(
      call(DIAGRAM_CHANNELS.openFile, contents, copyFixture('out.drawio')),
    ).rejects.toThrow(/not granted/)
  })

  it('hands a .vsdx to the importer as an untitled diagram named after the file', async () => {
    const path = join(dir, 'Network plan.vsdx')
    writeFileSync(path, Buffer.from('PK fake'))
    const contents = view(path)
    expect(diagramTabIdentity(contents.id)).toEqual({
      sourcePath: path,
      untitled: true,
      title: 'Network plan',
      imported: 'vsdx',
    })
    const result = await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)
    expect(result).toMatchObject({ status: 'import', importer: 'vsdx', title: 'Network plan' })
    expect(diagramFilePath(contents.id)).toBeUndefined()
  })
})

describe('save', () => {
  it('writes nothing for an unchanged diagram, whoever asks', async () => {
    const path = copyFixture('out.drawio')
    const contents = view(path)
    await call(DIAGRAM_CHANNELS.openFile, contents, path)
    const before = statSync(path).mtimeMs
    expect(await requestDiagramSave(contents as never, 'save')).toBe(true)
    expect(contents.sent.filter(([channel]) => channel === DIAGRAM_CHANNELS.saveRequest)).toEqual(
      [],
    )
    const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
      mode: 'save',
    })
    const token = (target as { token: string }).token
    const result = await call<SaveDiagramResult>(DIAGRAM_CHANNELS.save, contents, {
      token,
      bytes: new TextEncoder().encode(
        '<mxfile><diagram id="x"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>',
      ),
    })
    expect(result).toEqual({ ok: true, path })
    expect(statSync(path).mtimeMs).toBe(before)
    expect(readFileSync(path)).toEqual(readFileSync(join(fixtures, 'out.drawio')))
  })

  it('writes a changed diagram to its file, in its format, once per target', async () => {
    const path = copyFixture('out.drawio')
    const contents = view(path)
    await call(DIAGRAM_CHANNELS.openFile, contents, path)
    send(DIAGRAM_CHANNELS.dirtyChanged, contents, true)
    expect(diagramIsDirty(contents.id)).toBe(true)
    const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
      mode: 'save',
    })
    expect(target).toMatchObject({ ok: true, path, format: 'drawio' })
    const token = (target as { token: string }).token
    const xml = readFileSync(join(fixtures, 'sample.drawio'))
    expect(
      await call(DIAGRAM_CHANNELS.save, contents, { token, bytes: new Uint8Array(xml) }),
    ).toEqual({
      ok: true,
      path,
    })
    expect(readFileSync(path)).toEqual(xml)
    expect(diagramIsDirty(contents.id)).toBe(false)
    // the token is spent
    expect(
      await call(DIAGRAM_CHANNELS.save, contents, { token, bytes: new Uint8Array(xml) }),
    ).toMatchObject({
      ok: false,
    })
  })

  it('refuses bytes that would not open in the target’s format', async () => {
    const path = copyFixture('out.drawio.png')
    const contents = view(path)
    await call(DIAGRAM_CHANNELS.openFile, contents, path)
    send(DIAGRAM_CHANNELS.dirtyChanged, contents, true)
    const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
      mode: 'save',
    })
    const token = (target as { token: string }).token
    // XML is not a .drawio.png
    const result = await call<SaveDiagramResult>(DIAGRAM_CHANNELS.save, contents, {
      token,
      bytes: new Uint8Array(readFileSync(join(fixtures, 'sample.drawio'))),
    })
    expect(result).toMatchObject({ ok: false })
    expect(readFileSync(path)).toEqual(readFileSync(join(fixtures, 'out.drawio.png')))
  })

  it('asks where a new diagram goes, proposing .drawio first, and takes the format from the name', async () => {
    const contents = view()
    showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: join(dir, 'picked.drawio.svg'),
    })
    const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
      mode: 'save',
      defaultName: 'Flow',
    })
    const options = showSaveDialog.mock.calls[0]!.find(
      (arg: unknown) => typeof arg === 'object' && arg !== null && 'filters' in arg,
    ) as { defaultPath: string; filters: { extensions: string[] }[] }
    expect(options.defaultPath).toMatch(/Flow\.drawio$/)
    expect(options.filters.map((f) => f.extensions[0])).toEqual([
      'drawio',
      'dio',
      'drawio.svg',
      'drawio.png',
    ])
    expect(target).toMatchObject({
      ok: true,
      path: join(dir, 'picked.drawio.svg'),
      format: 'drawio.svg',
    })
  })

  it('offers an imported diagram’s first save beside the source file, never the source itself', async () => {
    const source = join(dir, 'plan.vsdx')
    writeFileSync(source, Buffer.from('PK fake'))
    const contents = view(source)
    await call(DIAGRAM_CHANNELS.openFile, contents, source)
    showSaveDialog.mockResolvedValueOnce({ canceled: true })
    await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, { mode: 'save' })
    const options = showSaveDialog.mock.calls[0]!.find(
      (arg: unknown) => typeof arg === 'object' && arg !== null && 'defaultPath' in arg,
    ) as { defaultPath: string }
    expect(options.defaultPath).toBe(join(dir, 'plan.drawio'))
  })
})

describe('links', () => {
  it('opens only web and mail links', async () => {
    const contents = view()
    expect(await call(DIAGRAM_CHANNELS.openLink, contents, 'https://example.com/')).toBe(true)
    expect(await call(DIAGRAM_CHANNELS.openLink, contents, 'file:///C:/x')).toBe(false)
    expect(await call(DIAGRAM_CHANNELS.openLink, contents, 'javascript:alert(1)')).toBe(false)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})

describe('tab identity', () => {
  it('names a new diagram untitled and a file by its name', async () => {
    expect(diagramTabIdentity(view().id)).toMatchObject({ sourcePath: null, untitled: true })
    const path = copyFixture('out.drawio.svg', 'Flow.drawio.svg')
    expect(diagramTabIdentity(view(path).id)).toEqual({
      sourcePath: path,
      untitled: false,
      title: 'Flow',
    })
    expect(diagramTabIdentity(99_999)).toBeNull()
  })
})

describe('the AI panel’s channels', () => {
  it('registers this editor’s attachment channels under diagram: and no shared one', () => {
    view()
    for (const channel of [
      DIAGRAM_CHANNELS.filesPick,
      DIAGRAM_CHANNELS.filesAdd,
      DIAGRAM_CHANNELS.filesAddPastedImage,
      DIAGRAM_CHANNELS.filesRead,
      DIAGRAM_CHANNELS.filesReadImage,
      DIAGRAM_CHANNELS.provisionalTitle,
    ]) {
      expect(handlers.has(channel), channel).toBe(true)
    }
    expect([...handlers.keys()].filter((name) => name.startsWith('ai:'))).toEqual([])
  })

  it('accepts a diagram file as an attachment and refuses what cannot be read', async () => {
    const contents = view()
    const path = copyFixture('out.drawio', 'Plan.drawio')
    const result = await call<{ accepted: Array<{ name: string }>; rejected: string[] }>(
      DIAGRAM_CHANNELS.filesAdd,
      contents,
      [path, join(dir, 'missing.drawio'), join(dir, 'tool.exe')],
    )
    expect(result.accepted.map((meta) => meta.name)).toEqual(['Plan.drawio'])
    expect(result.rejected).toHaveLength(2)
  })

  it('names only an untitled diagram’s tab from the first request', async () => {
    const named: string[] = []
    setDiagramProvisionalTitleHook((_wc, title) => named.push(title))
    send(DIAGRAM_CHANNELS.provisionalTitle, view(), '  A   release   flow  ')
    const opened = view(copyFixture('out.drawio', 'Kept.drawio'))
    await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, opened, join(dir, 'Kept.drawio'))
    send(DIAGRAM_CHANNELS.provisionalTitle, opened, 'something else')
    expect(named).toEqual(['A release flow'])
    setDiagramProvisionalTitleHook(null)
  })
})

describe('a headless export (--headless-export)', () => {
  const store = createRecoveryStore({ userDataDir: join(tmpdir(), 'diagram-test-userData') })

  afterEach(() => setHeadlessMode(false))

  it('opens the file as saved: a copy left for it is not asked about, used or settled', async () => {
    const path = copyFixture('out.drawio')
    const identity = { kind: 'diagram', filePath: path } as const
    const left = '<mxfile><diagram id="left" name="Left"><mxGraphModel/></diagram></mxfile>'
    await store.writeCopy(identity, Buffer.from(left))
    try {
      const before = store.copyInfo(identity)
      expect(before).not.toBeNull()
      showMessageBox.mockReset()
      // the prompt's Esc / close restores; no one is there to give another answer
      showMessageBox.mockResolvedValue({ response: 0 })
      setHeadlessMode(true)
      const contents = view(path)
      const result = await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)
      expect(showMessageBox).not.toHaveBeenCalled()
      expect((result as { xml: string }).xml).toBe(readFileSync(path, 'utf8'))
      expect(store.copyInfo(identity)).toEqual(before)
      // nor does the hidden view write a copy of its own over it
      expect(await writeViewCopy(contents.id, path, Buffer.from('<mxfile/>'), () => 'x')).toBe(
        'superseded',
      )
      expect(readFileSync(store.copyPath(identity), 'utf8')).toBe(left)
    } finally {
      store.deleteCopy(identity, 'discarded')
    }
  })
})
