import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 wiring for the Markdown presenter. The key classification is in
 * `@genoffice/ui`; this pins the editor side: fullscreen, the source pane
 * stepping aside, and the chrome the show hides.
 */
describe('Markdown presentation wiring', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')

  it('uses the shared F5 classifier and restores the source pane', () => {
    expect(app).toContain('presentationKeyOf')
    expect(app).toContain('preSourceViewRef')
    expect(app).toContain('openSource()')
    expect(app).toContain('requestFullscreen')
    expect(app).toContain('editor?.setEditable(!presenting)')
    expect(app).toContain('md-presenting')
  })

  it('hides the ribbon, AI dock, panes and status bar', () => {
    expect(styles).toContain('.app.md-presenting .ribbon')
    expect(styles).toContain('.app.md-presenting .ai-dock')
    expect(styles).toContain('.app.md-presenting .status-bar')
  })
})
