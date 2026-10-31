/**
 * The picture-understanding channel is wired end to end: the preload has the call the
 * panel makes, and the HWP main registers `hwp:analyze-media` beside its other picture
 * channels. The type-level wiring is checked by the typecheck.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('picture understanding wiring', () => {
  it('exposes analyzeMedia to the panel', () => {
    const preload = read('src/preload/index.ts')
    expect(preload).toContain(
      'analyzeMedia: (op) => ipcRenderer.invoke(HWP_CHANNELS.analyzeMedia, op)',
    )
  })

  it('registers the handler with the picture channels', () => {
    const main = read('src/main/ai-image.ts')
    expect(main).toContain('HWP_CHANNELS.analyzeMedia')
    expect(main).toContain('analyzeMediaTool(')
    expect(main).toContain('withMediaCallSignal(')
  })
})
