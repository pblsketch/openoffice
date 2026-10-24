import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Crash watch (src/main/crash-watch.ts): what gets recorded, and when the user
 * is told that an open document's renderer died. Electron's app is an event
 * emitter here; the message box answers the first button.
 */

const userData = mkdtempSync(join(tmpdir(), 'crash-watch-'))
const { fakeApp, showMessageBox } = vi.hoisted(() => ({
  fakeApp: {} as EventEmitter & {
    getPath: (name: string) => string
    getAppMetrics: () => Array<{ memory: { workingSetSize: number } }>
  },
  showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
}))

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  Object.setPrototypeOf(fakeApp, Emitter.prototype)
  Emitter.call(fakeApp)
  fakeApp.getPath = () => userData
  // working sets in KB, as Electron reports them
  fakeApp.getAppMetrics = () => [
    { memory: { workingSetSize: 300 * 1024 } },
    { memory: { workingSetSize: 212 * 1024 } },
  ]
  return { app: fakeApp, dialog: { showMessageBox } }
})

vi.mock('../src/main/renderer-disposal', () => ({
  wasReleasedRenderer: (id: number) => id === 99,
}))

import {
  isLowMemory,
  memoryFigures,
  shouldPromptForGoneRenderer,
  startCrashWatch,
  startLowMemoryWatch,
} from '../src/main/crash-watch'
import type { CrashedDocument } from '../src/main/crash-watch'
import type { CrashMemory } from '../src/main/crash-log'

const docs = new Map<number, CrashedDocument>()
/** untitled documents with a recovery copy, by webContents id */
const untitledCopies = new Map<number, { untitledId: string }>()
const closeDocument = vi.fn(() => true)
const reopen = vi.fn()
const reopenUntitled = vi.fn()
let memoryNow: CrashMemory = {}

startCrashWatch({
  memory: () => memoryNow,
  prompt: true,
  editorOf: (wc) => docs.get(wc.id)?.kind ?? 'other',
  documentOf: (wc) => docs.get(wc.id) ?? null,
  parentWindow: () => null,
  closeDocument,
  reopen,
  untitledCopyOf: (wc) => untitledCopies.get(wc.id) ?? null,
  reopenUntitled,
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
})

const logFile = join(userData, 'crash-log.jsonl')
const lines = () =>
  existsSync(logFile)
    ? readFileSync(logFile, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    : []

function fakeWc(id: number) {
  return { id, isDestroyed: () => false, reload: vi.fn() }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  rmSync(logFile, { force: true })
  docs.clear()
  untitledCopies.clear()
  memoryNow = {}
  vi.clearAllMocks()
})

afterAll(() => rmSync(userData, { recursive: true, force: true }))

describe('crash watch', () => {
  it('records a crashed document renderer with its editor, and offers to reopen it', async () => {
    const wc = fakeWc(1)
    docs.set(1, { kind: 'docs', title: 'plan.docx', filePath: 'C:\\Users\\me\\plan.docx' })
    fakeApp.emit('render-process-gone', {}, wc, { reason: 'oom', exitCode: -536870904 })
    await flush()
    expect(lines()).toEqual([
      expect.objectContaining({
        kind: 'renderer',
        reason: 'oom',
        exitCode: -536870904,
        editor: 'docs',
      }),
    ])
    // the title is shown to the user, but never written to the log
    expect(readFileSync(logFile, 'utf8')).not.toContain('plan')
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(closeDocument).toHaveBeenCalledWith(wc)
    expect(reopen).toHaveBeenCalledWith('C:\\Users\\me\\plan.docx')
  })

  it('reloads a slides renderer (the deck lives in the main process)', async () => {
    const wc = fakeWc(2)
    docs.set(2, { kind: 'slides', title: 'deck.pptx', filePath: 'C:\\deck.pptx' })
    fakeApp.emit('render-process-gone', {}, wc, { reason: 'crashed', exitCode: 2 })
    await flush()
    expect(wc.reload).toHaveBeenCalledTimes(1)
    expect(closeDocument).not.toHaveBeenCalled()
  })

  it('only closes an untitled document', async () => {
    const wc = fakeWc(3)
    docs.set(3, { kind: 'markdown', title: 'Untitled' })
    fakeApp.emit('render-process-gone', {}, wc, { reason: 'crashed', exitCode: 2 })
    await flush()
    expect(closeDocument).toHaveBeenCalledWith(wc)
    expect(reopen).not.toHaveBeenCalled()
  })

  it('reopens an untitled document from its recovery copy, read while the renderer was gone', async () => {
    const wc = fakeWc(8)
    docs.set(8, { kind: 'hwp', title: 'Draft' })
    untitledCopies.set(8, { untitledId: 'u-1' })
    fakeApp.emit('render-process-gone', {}, wc, { reason: 'crashed', exitCode: 2 })
    // the identity is taken at once: the tab may be gone by the time the user answers
    untitledCopies.clear()
    await flush()
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: ['crashReopen', 'crashLater'] }),
    )
    expect(closeDocument).toHaveBeenCalledWith(wc)
    expect(reopenUntitled).toHaveBeenCalledWith(
      { kind: 'hwp', title: 'Draft' },
      { untitledId: 'u-1' },
    )
    expect(reopen).not.toHaveBeenCalled()
  })

  it('reopens a working-file untitled document (a PDF template copy) from its copy, not the file', async () => {
    const wc = fakeWc(9)
    docs.set(9, { kind: 'pdf', title: 'Form', filePath: 'C:\\Temp\\form.pdf' })
    untitledCopies.set(9, { untitledId: 'u-2' })
    fakeApp.emit('render-process-gone', {}, wc, { reason: 'crashed', exitCode: 2 })
    await flush()
    expect(reopenUntitled).toHaveBeenCalledTimes(1)
    expect(reopen).not.toHaveBeenCalled()
  })

  it('records but does not prompt for Home or for a renderer the app killed', async () => {
    fakeApp.emit('render-process-gone', {}, fakeWc(4), { reason: 'crashed', exitCode: 2 })
    docs.set(5, { kind: 'slides', title: 'deck.pptx' })
    fakeApp.emit('render-process-gone', {}, fakeWc(5), { reason: 'killed', exitCode: 1 })
    await flush()
    expect(lines().map((l) => l.reason)).toEqual(['crashed', 'killed'])
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('ignores clean exits and the closed tabs the shell ended itself', async () => {
    docs.set(6, { kind: 'docs', title: 'a.docx' })
    fakeApp.emit('render-process-gone', {}, fakeWc(6), { reason: 'clean-exit', exitCode: 0 })
    fakeApp.emit('render-process-gone', {}, fakeWc(99), { reason: 'killed', exitCode: 1 })
    await flush()
    expect(lines()).toEqual([])
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('records a GPU process crash, but not the utility processes the app ends', () => {
    fakeApp.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 3 })
    fakeApp.emit('child-process-gone', {}, { type: 'Utility', reason: 'killed', exitCode: 1 })
    fakeApp.emit('child-process-gone', {}, { type: 'Utility', reason: 'clean-exit', exitCode: 0 })
    expect(lines()).toEqual([
      expect.objectContaining({ kind: 'child-process', process: 'GPU', reason: 'crashed' }),
    ])
  })

  it('records an unhandled rejection by its class only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.emit(
      'unhandledRejection',
      new RangeError('C:\\Users\\me\\secret.docx'),
      Promise.resolve(),
    )
    expect(lines()).toEqual([
      expect.objectContaining({ kind: 'main-rejection', reason: 'RangeError' }),
    ])
    expect(readFileSync(logFile, 'utf8')).not.toContain('secret')
    warn.mockRestore()
  })

  it('prompts for real failures only', () => {
    expect(shouldPromptForGoneRenderer('crashed')).toBe(true)
    expect(shouldPromptForGoneRenderer('oom')).toBe(true)
    expect(shouldPromptForGoneRenderer('killed')).toBe(false)
    expect(shouldPromptForGoneRenderer('clean-exit')).toBe(false)
  })

  it('writes the memory figures of the moment with each entry', async () => {
    memoryNow = { appMB: 2400, freeMB: 310, totalMB: 7900, aiStreams: 1, cliChildren: 2 }
    fakeApp.emit('render-process-gone', {}, fakeWc(7), { reason: 'oom', exitCode: 1 })
    await flush()
    expect(lines()).toEqual([
      expect.objectContaining({
        kind: 'renderer',
        reason: 'oom',
        appMB: 2400,
        freeMB: 310,
        totalMB: 7900,
        aiStreams: 1,
        cliChildren: 2,
      }),
    ])
  })
})

describe('memory figures', () => {
  it('sums the app processes and reads the counts', () => {
    const figures = memoryFigures({ aiStreams: () => 2, cliChildren: () => 1 })
    expect(figures).toMatchObject({ appMB: 512, aiStreams: 2, cliChildren: 1 })
    expect(figures.totalMB).toBeGreaterThan(0)
    expect(figures.freeMB).toBeGreaterThanOrEqual(0)
  })

  it('counts a PC as short of memory below 512 MB or 8% of its memory', () => {
    expect(isLowMemory(400, 8000)).toBe(true)
    expect(isLowMemory(600, 8000)).toBe(true)
    expect(isLowMemory(700, 8000)).toBe(false)
    expect(isLowMemory(1200, 16000)).toBe(true)
    expect(isLowMemory(1400, 16000)).toBe(false)
  })
})

describe('low-memory watch', () => {
  afterEach(() => vi.useRealTimers())

  it('records only while an AI request runs, at most once per cooldown', () => {
    vi.useFakeTimers()
    let streams = 0
    let clock = 0
    const stop = startLowMemoryWatch({
      aiStreams: () => streams,
      memory: () => ({ appMB: 3000, freeMB: 200, totalMB: 8000, aiStreams: streams }),
      sampleMs: 1000,
      cooldownMs: 60_000,
      now: () => clock,
    })
    vi.advanceTimersByTime(1000)
    expect(lines()).toEqual([])
    streams = 1
    clock = 1000
    vi.advanceTimersByTime(1000)
    expect(lines()).toEqual([
      expect.objectContaining({ kind: 'low-memory', freeMB: 200, totalMB: 8000, aiStreams: 1 }),
    ])
    clock = 30_000
    vi.advanceTimersByTime(1000)
    expect(lines()).toHaveLength(1)
    clock = 62_000
    vi.advanceTimersByTime(1000)
    expect(lines()).toHaveLength(2)
    stop()
  })

  it('stays quiet while the PC has memory to spare', () => {
    vi.useFakeTimers()
    const stop = startLowMemoryWatch({
      aiStreams: () => 1,
      memory: () => ({ freeMB: 4000, totalMB: 8000 }),
      sampleMs: 1000,
    })
    vi.advanceTimersByTime(5000)
    expect(lines()).toEqual([])
    stop()
  })
})
