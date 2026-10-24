/**
 * Crash-recovery wiring in the renderer: the copy question is answered before
 * any content loads, a restored copy opens unsaved (the file is not read), and
 * the copy loop runs regardless of the AutoSave switch.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = process.cwd()
const source = (path: string): string => readFileSync(join(APP, path), 'utf8')

describe('recovery wiring', () => {
  it('exposes the recovery calls from the preload', () => {
    const preload = source('src/preload/index.ts')
    expect(preload).toContain('MARKDOWN_CHANNELS.recoveryOpen')
    expect(preload).toContain('MARKDOWN_CHANNELS.recoveryWrite')
    expect(preload).toContain('MARKDOWN_CHANNELS.recoveryFlushRequest')
  })

  it('asks about a copy before reading the file and opens a restored copy unsaved', () => {
    const app = source('src/renderer/App.tsx')
    const ask = app.indexOf('window.markdownApi.recoveryOpen?.()')
    const read = app.indexOf('recovered ? recovered.text : await window.markdownApi.readFile(path)')
    expect(ask).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(ask)
    expect(app).toContain('if (seed !== null || recovered) markDirty()')
  })

  it('opens an untitled restored copy in the format of the file it was of, still untitled', () => {
    const app = source('src/renderer/App.tsx')
    // no save target, but a .txt / .json original keeps its source mode
    expect(app).toContain('loadFromPath(null, recovered.text, recovered.originalPath)')
    expect(app).toContain('const mode = textModeForPath(modePath)')
  })

  it('runs the copy loop outside the AutoSave effect', () => {
    const app = source('src/renderer/App.tsx')
    const loop = app.indexOf('startRecoveryCopies({')
    expect(loop).toBeGreaterThan(-1)
    const effect = app.lastIndexOf('useEffect(', loop)
    expect(app.slice(effect, loop)).not.toContain('autoSave')
  })

  it('registers the recovery contract when the module loads, not with the first view', () => {
    const main = source('src/main/markdown-main.ts')
    const top = main.search(/^registerRecoveryEditor\(recovery\.contract\)$/m)
    expect(top).toBeGreaterThan(-1)
    const ipc = main.indexOf('function registerMarkdownIpc(')
    const ipcEnd = main.slice(ipc).search(/^\}$/m) + ipc
    expect(main.slice(ipc, ipcEnd)).not.toContain('registerRecoveryEditor(')
  })
})
