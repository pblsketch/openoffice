/**
 * Project folders (spec 6) in the slides editor's main process: once the run
 * a create flow handed to a new deck ended well, the renderer asks for
 * `slides:save-into-project`. The deck's bytes go to the shell's project
 * writer (which decides the folder and a free name) and the deck becomes that
 * file like a first save. Without a project nothing is written and the deck
 * stays untitled; a refused write keeps it untitled and says why.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'slides-test',
    getVersion: () => '0',
    whenReady: () => Promise.resolve(),
  },
  dialog: {},
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: { handle: () => {} }, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: {},
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => false,
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx, openPptx } from '@genoffice/pptx-engine'
import { registerSlidesIpc } from '../src/main/slides-main'
import { configureSlidesRuntime, runtime, sessions } from '../src/main/session-state'
import { queueSlidesSeedFor } from '../src/main/seed-queue'

class FakeContents {
  sent: Array<[string, unknown]> = []
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload])
  }
}

type SaveIntoProject = {
  ok: boolean
  path?: string
  error?: string
  skipped?: boolean
  slides?: unknown[]
}

const handler = <T>(channel: string) =>
  handlers.get(channel) as unknown as (e: { sender: FakeContents }, ...args: unknown[]) => T

const saveIntoProject = (tab: FakeContents) =>
  handler<Promise<SaveIntoProject>>('slides:save-into-project')({ sender: tab })

let folder: string
const writer = vi.fn<(id: number, fileName: string, bytes: Uint8Array) => Promise<string | null>>()

async function openUntitled(id: number, suggestedName?: string): Promise<FakeContents> {
  const tab = new FakeContents(id)
  queueSlidesSeedFor(
    tab,
    await createBlankPptx(),
    suggestedName ? { askPathOnFirstSave: true, suggestedName } : undefined,
  )
  await handler<Promise<unknown>>('slides:consume-pending-open')({ sender: tab }, 1280)
  return tab
}

beforeAll(() => {
  registerSlidesIpc()
})

beforeEach(() => {
  sessions.clear()
  folder = mkdtempSync(join(tmpdir(), 'slides-project-'))
  writer.mockReset()
  writer.mockImplementation(async (_id, fileName, bytes) => {
    const path = join(folder, fileName)
    writeFileSync(path, bytes)
    return path
  })
  configureSlidesRuntime({ ...runtime, writeNewDocument: writer })
})

afterEach(() => {
  configureSlidesRuntime({ ...runtime, writeNewDocument: undefined })
  rmSync(folder, { recursive: true, force: true })
})

describe('slides:save-into-project', () => {
  it('hands the deck to the project writer and the deck becomes that file', async () => {
    const tab = await openUntitled(801, 'Field trip.pptx')
    const result = await saveIntoProject(tab)
    expect(result.ok).toBe(true)
    expect(result.path).toBe(join(folder, 'Field trip.pptx'))
    expect(result.slides?.length).toBeGreaterThan(0)
    // only the window and a bare file name go out: the shell decides the folder
    expect(writer).toHaveBeenCalledTimes(1)
    const [id, fileName, bytes] = writer.mock.calls[0]!
    expect(id).toBe(801)
    expect(fileName).toBe('Field trip.pptx')
    await expect(openPptx(bytes)).resolves.toBeTruthy()
    expect(readFileSync(result.path!).byteLength).toBe(bytes.byteLength)
    // a first save: the deck has its path and nothing is left unsaved
    const session = sessions.get(tab.id)!
    expect(session.path).toBe(result.path)
    expect(session.askPathOnFirstSave).toBe(false)
    expect(await handler<Promise<boolean>>('slides:is-dirty')({ sender: tab })).toBe(false)
  })

  it('names an unnamed deck with the untitled name and the .pptx extension', async () => {
    const tab = await openUntitled(802)
    await saveIntoProject(tab)
    const fileName = writer.mock.calls[0]![1]
    expect(fileName).toMatch(/\.pptx$/)
    expect(fileName).not.toMatch(/[\\/]/)
  })

  it('without a project writes nothing and the deck stays untitled', async () => {
    writer.mockResolvedValue(null)
    const tab = await openUntitled(803, 'Plan.pptx')
    expect(await saveIntoProject(tab)).toEqual({ ok: false, skipped: true })
    expect(sessions.get(tab.id)?.path).toBe('')
  })

  it('without the shell writer (a lone editor) does nothing', async () => {
    configureSlidesRuntime({ ...runtime, writeNewDocument: undefined })
    const tab = await openUntitled(804, 'Plan.pptx')
    expect(await saveIntoProject(tab)).toEqual({ ok: false, skipped: true })
    expect(sessions.get(tab.id)?.path).toBe('')
  })

  it('a refused write keeps the deck untitled and gives the reason', async () => {
    writer.mockRejectedValue(new Error('project folder write refused (missing-folder): x'))
    const tab = await openUntitled(805, 'Plan.pptx')
    const result = await saveIntoProject(tab)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('missing-folder')
    expect(sessions.get(tab.id)?.path).toBe('')
  })

  it('leaves a deck that already has a file alone', async () => {
    const tab = await openUntitled(806, 'Plan.pptx')
    sessions.get(tab.id)!.path = join(folder, 'Existing.pptx')
    expect(await saveIntoProject(tab)).toEqual({ ok: false, skipped: true })
    expect(writer).not.toHaveBeenCalled()
    expect(await saveIntoProject(new FakeContents(899))).toEqual({ ok: false, skipped: true })
  })
})
