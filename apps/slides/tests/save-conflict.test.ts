/**
 * The split-view save guard for the slides main process: when the same deck is
 * open in another pane and the disk moved past what this deck last read or
 * wrote, a save the user asked for asks before overwriting (cancel keeps the
 * disk copy and the deck stays dirty), the AutoSave timer's own pass (`auto`)
 * defers silently, and a path open nowhere else is not interrupted. Deck files
 * are real (blank pptx bytes); only the overwrite dialog is a controllable
 * stub.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  userDataDir: '',
  handlers: new Map<string, (...args: never[]) => unknown>(),
}))
const handlers = hoisted.handlers

const showMessageBox = vi.fn(async (..._args: unknown[]) => ({ response: 0 }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? hoisted.userDataDir : tmpdir()),
    getName: () => 'slides-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    getLocale: () => 'en-US',
    getSystemLocale: () => 'en-US',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
  },
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBox(...args) },
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) =>
      hoisted.handlers.set(channel, fn),
    on: (channel: string, fn: (...args: never[]) => unknown) => hoisted.handlers.set(channel, fn),
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static getFocusedWindow(): null {
      return null
    }
  },
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

// The shaping chain loads a harfbuzz wasm that cannot resolve in the unit-test
// env; the save guard never measures text.
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx } from '@genoffice/pptx-engine'
import { setOpenPathProbe } from '@genoffice/electron-utils'
import { registerSlidesIpc } from '../src/main/slides-main'
import { sessions } from '../src/main/session-state'

const WC = 7
const FIT = 1280
const event = { sender: { id: WC } } as never

interface SaveResult {
  ok: boolean
  reason?: string
  path?: string
  error?: string
}

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return (fn as (...a: unknown[]) => unknown)(event, ...args)
}

let dir: string
let blankBytes: Uint8Array

const externalBytes = Buffer.from('a different program wrote here')

beforeAll(async () => {
  // registerSlidesIpc is guarded by a module-level flag, so it must run exactly once
  registerSlidesIpc()
  blankBytes = await createBlankPptx()
})

beforeEach(() => {
  sessions.clear()
  dir = mkdtempSync(join(tmpdir(), 'genoffice-slides-conflict-'))
  hoisted.userDataDir = mkdtempSync(join(tmpdir(), 'genoffice-slides-conflict-user-'))
  showMessageBox.mockReset()
  showMessageBox.mockResolvedValue({ response: 0 })
  // the AutoSave preference lives per webContents; every test starts with it off
  call('slides:autosave-pref', false)
})

afterEach(() => {
  setOpenPathProbe(null)
  rmSync(dir, { recursive: true, force: true })
  rmSync(hoisted.userDataDir, { recursive: true, force: true })
})

function makeDeckFile(name = 'deck.pptx'): string {
  const path = join(dir, name)
  writeFileSync(path, blankBytes)
  return path
}

async function openDeck(path: string): Promise<void> {
  expect(await call('slides:open-path', path, FIT)).not.toBeNull()
}

/** A save the renderer sends the way its paths do: false = the user's save, true = the AutoSave tick's pass */
async function saveDeck(auto = false): Promise<SaveResult> {
  return (await call('slides:save', auto)) as SaveResult
}

describe('split-view save guard (slides)', () => {
  it('asks before a manual save overwrites a sibling copy, and cancelling keeps the disk bytes', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe((p) => p === path)
    writeFileSync(path, externalBytes)

    showMessageBox.mockResolvedValue({ response: 1 })
    expect(await saveDeck()).toEqual({ ok: false, reason: 'external-modified' })
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(readFileSync(path)).toEqual(externalBytes)
  })

  it('writes after the user confirms the overwrite', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe((p) => p === path)
    writeFileSync(path, externalBytes)

    const result = await saveDeck()
    expect(result.ok).toBe(true)
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(readFileSync(path)).not.toEqual(externalBytes)
  })

  it('leaves a path open nowhere else alone: no dialog, the save simply writes', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe(() => false)

    // even a dialog answer that would cancel must never be consulted
    showMessageBox.mockResolvedValue({ response: 1 })
    expect((await saveDeck()).ok).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('defers a silent AutoSave save while a sibling copy changed the file', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe((p) => p === path)
    writeFileSync(path, externalBytes)
    call('slides:autosave-pref', true)

    // the answer that would overwrite must never be consulted
    showMessageBox.mockResolvedValue({ response: 0 })
    expect(await saveDeck(true)).toEqual({ ok: false, reason: 'external-modified' })
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(readFileSync(path)).toEqual(externalBytes)
  })

  it('still asks on the user save while AutoSave is on: the per-save flag decides, not the toggle', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe((p) => p === path)
    writeFileSync(path, externalBytes)
    call('slides:autosave-pref', true)

    // the hole this covers: the toggle alone used to route the manual save to
    // the silent path, so Ctrl+S overwrote a sibling copy without asking
    showMessageBox.mockResolvedValue({ response: 1 })
    expect(await saveDeck()).toEqual({ ok: false, reason: 'external-modified' })
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(readFileSync(path)).toEqual(externalBytes)
  })

  it('saves normally while AutoSave is on and no sibling copy holds the path', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    setOpenPathProbe(() => false)
    call('slides:autosave-pref', true)
    writeFileSync(path, externalBytes)

    expect((await saveDeck(true)).ok).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(readFileSync(path)).not.toEqual(externalBytes)
  })

  it('refreshes the recorded state after a successful save', async () => {
    const path = makeDeckFile()
    await openDeck(path)
    // make the save write different bytes than the file was opened with
    call('slides:add-blank-slide', { sourceIndex: 0, before: false, fitWidthPx: FIT })
    expect((await saveDeck()).ok).toBe(true)
    expect(readFileSync(path)).not.toEqual(blankBytes)

    setOpenPathProbe((p) => p === path)
    // the second save compares against the bytes the first save wrote
    expect((await saveDeck()).ok).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()

    // and once the disk moves again, the guard wakes back up
    writeFileSync(path, externalBytes)
    showMessageBox.mockResolvedValue({ response: 1 })
    expect(await saveDeck()).toEqual({ ok: false, reason: 'external-modified' })
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(readFileSync(path)).toEqual(externalBytes)
  })
})
