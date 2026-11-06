/** How the OS OCR helper is started. The helper itself never runs here: the spawn is faked. */
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnSync = vi.hoisted(() =>
  vi.fn(() => ({ status: 0, stdout: Buffer.from('{"lines":[],"paper":0}') })),
)
vi.mock('node:child_process', () => ({ spawnSync }))

import { createWindowsOcrEngine } from '../src/ocr-vision'

const realPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
  spawnSync.mockClear()
})

describe('createWindowsOcrEngine', () => {
  it('starts win-ocr.exe with its console hidden', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    // any existing file stands in for the helper
    const engine = createWindowsOcrEngine(process.execPath, ['ko-KR'])
    expect(engine).not.toBeNull()
    expect(engine!(new Uint8Array([1, 2, 3]), { widthPt: 612, heightPt: 792 })).toEqual({
      lines: [],
      paperShare: 0,
    })
    expect(spawnSync).toHaveBeenCalledTimes(1)
    const [file, args, options] = spawnSync.mock.calls[0] as unknown as [
      string,
      string[],
      { windowsHide?: boolean },
    ]
    expect(file).toBe(process.execPath)
    expect(args).toEqual(['ko-KR'])
    expect(options.windowsHide).toBe(true)
  })
})
