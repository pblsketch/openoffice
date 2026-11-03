// @vitest-environment node
/**
 * Visio files in the main process (spec 3.5): only `.vsdx` is imported (old
 * `.vsd`/`.vss` are not opened), the `.vsdx` is never written, and once the
 * imported diagram is saved the tab is that `.drawio`, so opening the `.vsdx`
 * again imports it again instead of finding this tab.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn()

let nextId = 1
function fakeContents() {
  const contents = {
    id: nextId++,
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    getURL: () => '',
    send: () => {},
    on: () => {},
    once: () => {},
    reload: () => {},
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `diagram-visio-test-${name}`),
    getLocale: () => 'en-US',
    isPackaged: false,
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showMessageBox: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  session: {
    fromPartition: () => ({
      protocol: { handle: vi.fn() },
      webRequest: { onBeforeRequest: vi.fn() },
      setSpellCheckerEnabled: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    }),
  },
  nativeTheme: { themeSource: 'system' },
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

import {
  configureDiagramRuntime,
  createDiagramView,
  diagramFilePath,
  diagramTabIdentity,
} from '../src/main/diagram-main'
import { DIAGRAM_CHANNELS } from '../src/shared/ipc'
import type { OpenFileResult, SaveTargetResult } from '../src/shared/ipc'

const fixtures = join(__dirname, 'fixtures')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-diagram-visio-'))
  configureDiagramRuntime({
    preloadPath: join(dir, 'out', 'preload', 'index.js'),
    rendererFile: join(dir, 'out', 'renderer', 'index.html'),
    packaged: true,
  })
  showSaveDialog.mockReset()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

type Contents = ReturnType<typeof fakeContents>
const call = async <T>(channel: string, contents: Contents, ...args: unknown[]): Promise<T> =>
  (await handlers.get(channel)!({ sender: contents }, ...args)) as T
const view = (path?: string | null): Contents =>
  createDiagramView(path).webContents as unknown as Contents

describe('Visio files', () => {
  it('hands the fixture’s bytes to the importer, unchanged', async () => {
    const source = join(dir, 'Network.vsdx')
    const original = readFileSync(join(fixtures, 'visio-shapes.vsdx'))
    writeFileSync(source, original)
    const contents = view(source)
    const result = await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, source)
    expect(result).toMatchObject({ status: 'import', importer: 'vsdx', title: 'Network' })
    expect(Buffer.from((result as { bytes: Uint8Array }).bytes)).toEqual(original)
  })

  it('does not open the old binary Visio formats', async () => {
    for (const name of ['old.vsd', 'shapes.vss', 'stencil.vssx', 'template.vstx']) {
      const path = join(dir, name)
      writeFileSync(path, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
      const contents = view(path)
      expect(await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path), name).toEqual({
        status: 'unsupported',
      })
    }
  })

  it('becomes the saved .drawio after the first save; the .vsdx stays as it was', async () => {
    const source = join(dir, 'plan.vsdx')
    const original = readFileSync(join(fixtures, 'visio-shapes.vsdx'))
    writeFileSync(source, original)
    const contents = view(source)
    await call(DIAGRAM_CHANNELS.openFile, contents, source)
    expect(diagramTabIdentity(contents.id)).toEqual({
      sourcePath: source,
      untitled: true,
      title: 'plan',
      imported: 'vsdx',
    })
    const saved = join(dir, 'plan.drawio')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: saved })
    const target = await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, {
      mode: 'save',
    })
    expect(target).toMatchObject({ ok: true, path: saved, format: 'drawio' })
    const xml =
      '<mxfile><diagram id="a" name="Plan"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>'
    expect(
      await call(DIAGRAM_CHANNELS.save, contents, {
        token: (target as { token: string }).token,
        bytes: new TextEncoder().encode(xml),
      }),
    ).toEqual({ ok: true, path: saved })
    expect(readFileSync(saved, 'utf8')).toBe(xml)
    expect(readFileSync(source)).toEqual(original)
    expect(diagramFilePath(contents.id)).toBe(saved)
    expect(diagramTabIdentity(contents.id)).toEqual({
      sourcePath: saved,
      untitled: false,
      title: 'plan',
    })
  })
})
