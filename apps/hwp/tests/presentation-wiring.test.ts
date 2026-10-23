import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 wiring for the HWP presenter. The key classification is in
 * `@genoffice/ui`; this pins the editor side: fullscreen, the rhwp chrome API,
 * and the dock the show hides.
 */
describe('HWP presentation wiring', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')

  it('uses the shared F5 classifier and the editor chrome API', () => {
    expect(app).toContain('presentationKeyOf')
    expect(app).toContain('editor.chrome.get()')
    expect(app).toContain('menu: false, toolbar: false, statusbar: false')
    expect(app).toContain('requestFullscreen')
  })

  it('marks the app while presenting and hides the dock and notices', () => {
    expect(app).toContain('hwp-presenting')
    expect(styles).toContain('.hwp-app.hwp-presenting .ai-dock')
    expect(styles).toContain('.hwp-app.hwp-presenting .hwp-notice')
  })
})
