import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 / Ctrl+F5 wiring (presentation mode). The key classification itself is
 * tested in `@genoffice/ui`; this pins the viewer side: fullscreen, fit to the
 * page, and the chrome the show hides.
 */
describe('PDF presentation wiring', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')

  it('uses the shared F5 classifier, fullscreen and page fit', () => {
    expect(source).toContain('presentationKeyOf')
    expect(source).toContain('requestFullscreen')
    expect(source).toContain("fitModeRef.current = 'page'")
    expect(source).toContain('pdf-presenting')
  })

  it('starts at the first page for F5 and keeps the page for Ctrl+F5', () => {
    expect(source).toContain("enterPresent(action === 'present-windowed')")
    expect(source).toContain('scrollRef.current.scrollTop = 0')
  })

  it('hides the ribbon, sidebars and status bar while presenting', () => {
    expect(styles).toContain('.app.pdf-presenting > :not(.app-main)')
    expect(styles).toContain('.app.pdf-presenting .pdf-thumbs')
    expect(styles).toContain('.app.pdf-presenting .status-bar')
  })
})
