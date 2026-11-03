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
  setDiagramOpenFailedHook,
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
afterEach(() => {
  setDiagramOpenFailedHook(null)
  rmSync(dir, { recursive: true, force: true })
})

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

describe('a file that did not open after all (spec 3.1, 3.5)', () => {
  const visioView = async (): Promise<Contents> => {
    const source = join(dir, 'broken.vsdx')
    writeFileSync(source, readFileSync(join(fixtures, 'visio-shapes.vsdx')))
    const contents = view(source)
    await call(DIAGRAM_CHANNELS.openFile, contents, source)
    return contents
  }

  it('a failed Visio import asks the shell to close the tab and show the reason', async () => {
    const hook = vi.fn(() => true)
    setDiagramOpenFailedHook(hook)
    const contents = await visioView()
    const reason = 'This file cannot be imported: The Visio drawing has no pages.'
    expect(await call(DIAGRAM_CHANNELS.openFailed, contents, `  ${reason}  `)).toBe(true)
    expect(hook).toHaveBeenCalledWith(contents, reason)
    // nothing is written for it afterwards
    expect(
      await call<SaveTargetResult>(DIAGRAM_CHANNELS.saveTarget, contents, { mode: 'save' }),
    ).toMatchObject({ ok: false })
  })

  it('a file that did not open asks the same', async () => {
    const hook = vi.fn(() => true)
    setDiagramOpenFailedHook(hook)
    const path = join(dir, 'broken.drawio')
    writeFileSync(path, 'hello')
    const contents = view(path)
    expect(await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)).toEqual({
      status: 'not_xml',
    })
    expect(await call(DIAGRAM_CHANNELS.openFailed, contents, 'not XML')).toBe(true)
    expect(hook).toHaveBeenCalledWith(contents, 'not XML')
  })

  it('without the shell (the editor on its own) the editor keeps the reason in its tab', async () => {
    const contents = await visioView()
    expect(await call(DIAGRAM_CHANNELS.openFailed, contents, 'no pages')).toBe(false)
  })

  it('a diagram that opened cannot close itself this way, nor an empty reason', async () => {
    const hook = vi.fn(() => true)
    setDiagramOpenFailedHook(hook)
    const path = join(dir, 'good.drawio')
    writeFileSync(
      path,
      '<mxfile><diagram id="a" name="A"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>',
    )
    const contents = view(path)
    expect(await call<OpenFileResult>(DIAGRAM_CHANNELS.openFile, contents, path)).toMatchObject({
      status: 'ok',
    })
    expect(await call(DIAGRAM_CHANNELS.openFailed, contents, 'gone')).toBe(false)
    const imported = await visioView()
    expect(await call(DIAGRAM_CHANNELS.openFailed, imported, '   ')).toBe(false)
    expect(await call(DIAGRAM_CHANNELS.openFailed, imported, 42)).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })
})
