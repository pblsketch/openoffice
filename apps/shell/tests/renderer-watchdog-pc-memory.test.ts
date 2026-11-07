import { basename } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const GB = 1024 ** 3
const inMemoryUserData = new Set<string>()
const showMessageBox = vi.fn<(...args: unknown[]) => Promise<{ response: number }>>()
let totalMemoryBytes = 8 * GB
let metrics: unknown[] = []
let allWebContents: unknown[] = []

vi.mock('electron', () => ({
  app: {
    getAppMetrics: () => metrics,
    getPath: () => 'userData',
  },
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBox(...args) },
  webContents: { getAllWebContents: () => allWebContents },
}))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  totalmem: () => totalMemoryBytes,
}))
vi.mock('node:fs/promises', () => ({
  writeFile: async (path: string) => void inMemoryUserData.add(basename(path)),
  readdir: async () => [...inMemoryUserData],
  rm: async (path: string) => void inMemoryUserData.delete(basename(path)),
}))

const { startRendererWatchdog } = await import('../src/main/renderer-watchdog')

function fakeWc(id: number, pid: number) {
  return {
    id,
    isDestroyed: () => false,
    getOSProcessId: () => pid,
    getURL: () => 'genoffice-app://docs/index.html',
    debugger: { isAttached: () => true },
  }
}

function tabMetric(pid: number, memMB: number) {
  return {
    type: 'Tab',
    pid,
    memory: { workingSetSize: memMB * 1024 },
    cpu: { cumulativeCPUUsage: 0 },
  }
}

function startWatchdog() {
  return startRendererWatchdog({
    describe: (wc) => ({ kind: 'docs', title: `book-${wc.id}.docx` }),
    parentWindow: () => null,
    closeDocument: vi.fn(),
    t: (key, params) => `${key} ${params?.title ?? ''}`,
    sampleMs: 1_000,
    hotSamplesBeforeReport: 2,
    reportCooldownMs: 5_000,
    profileMs: 0,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  showMessageBox.mockReset()
  showMessageBox.mockResolvedValue({ response: 0 })
  allWebContents = [fakeWc(1, 10)]
  inMemoryUserData.clear()
})

describe('memory question follows the PC', () => {
  it.each([
    { pcGB: 8, documentMB: 1_300, asked: false },
    { pcGB: 8, documentMB: 1_600, asked: true },
    { pcGB: 32, documentMB: 3_500, asked: false },
    { pcGB: 32, documentMB: 4_200, asked: true },
  ])(
    'a $documentMB MB document on a $pcGB GB PC asked: $asked',
    async ({ pcGB, documentMB, asked }) => {
      totalMemoryBytes = pcGB * GB
      metrics = [tabMetric(10, documentMB)]
      const stop = startWatchdog()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(showMessageBox).toHaveBeenCalledTimes(asked ? 1 : 0)
      stop()
    },
  )
})

describe('silencing one document', () => {
  it('still asks about another document that gets heavy', async () => {
    totalMemoryBytes = 8 * GB
    showMessageBox.mockResolvedValue({ response: 2 })
    metrics = [tabMetric(10, 2_000)]
    const stop = startWatchdog()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(showMessageBox).toHaveBeenCalledTimes(1)

    allWebContents = [fakeWc(1, 10), fakeWc(2, 20)]
    metrics = [tabMetric(10, 4_000), tabMetric(20, 2_000)]
    await vi.advanceTimersByTimeAsync(10_000)
    expect(showMessageBox).toHaveBeenCalledTimes(2)
    const detail = (showMessageBox.mock.calls[1]![0] as { detail: string }).detail
    expect(detail).toContain('book-2.docx')
    stop()
  })
})

describe('diagnostics under userData', () => {
  it('keeps the five newest reports and leaves other files alone', async () => {
    totalMemoryBytes = 8 * GB
    for (let stamp = 1_000; stamp < 1_007; stamp += 1) {
      inMemoryUserData.add(`renderer-watchdog-${stamp}.json`)
      inMemoryUserData.add(`renderer-watchdog-${stamp}.cpuprofile`)
    }
    inMemoryUserData.add('crash-log.jsonl')
    metrics = [tabMetric(10, 2_000)]
    const stop = startWatchdog()
    await vi.advanceTimersByTimeAsync(2_100)
    stop()

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const stamps = [...inMemoryUserData]
      .filter((name) => name.startsWith('renderer-watchdog-'))
      .map((name) => Number(name.split(/[-.]/)[2]))
    expect([...new Set(stamps)].sort((a, b) => a - b).slice(0, 4)).toEqual([
      1_003, 1_004, 1_005, 1_006,
    ])
    expect(new Set(stamps).size).toBe(5)
    expect(inMemoryUserData).toContain('crash-log.jsonl')
  })
})
