import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 wiring (presentation mode). The key classification itself is tested in
 * `@genoffice/ui` (`presentation-keys.test.ts`); this pins the editor side that
 * the unit test cannot reach without mounting the whole editor.
 */
describe('docs presentation wiring', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')

  it('uses the shared F5 classifier and enters Read Mode + fullscreen', () => {
    expect(source).toContain('presentationKeyOf')
    expect(source).toContain("zoomFit('page')")
    expect(source).toContain('requestFullscreen')
    expect(source).toContain('presentation-mode')
    expect(source).toContain("readMode ? 'read-mode' : ''")
  })

  it('hides the status bar while presenting', () => {
    expect(styles).toContain('.presentation-mode .status-bar')
  })
})
