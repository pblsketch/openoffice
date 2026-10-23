import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 / Ctrl+F5 wiring for the sheet presenter. The key classification is in
 * `@genoffice/ui`; this pins the grid side: fullscreen, the A1 start, and the
 * chrome the show hides. Plain F5 stays Excel's Go To.
 */
describe('sheets presentation wiring', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const shell = readFileSync(resolve(process.cwd(), 'src/renderer/ExcelShell.tsx'), 'utf8')
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')

  it('uses the shared F5 classifier and starts Ctrl+F5 at A1', () => {
    expect(app).toContain('presentationKeyOf')
    expect(app).toContain("if (action === 'present') return")
    expect(app).toContain('scrollToCell(0, 0)')
    expect(app).toContain('requestFullscreen')
    expect(app).toContain('presenting={presenting}')
  })

  it('marks the shell while presenting and hides the custom chrome', () => {
    expect(shell).toContain('sheet-presenting')
    expect(styles).toContain('.app-shell.sheet-presenting .excel-header')
    expect(styles).toContain('.app-shell.sheet-presenting .status-bar')
  })
})
