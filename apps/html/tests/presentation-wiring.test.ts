import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F5 / Ctrl+F5 wiring for the HTML presenter. The key classification is tested
 * in `@genoffice/ui`; the existing Present menu already covers the view itself,
 * so this pins the keyboard entry points to the same two kinds.
 */
describe('HTML presentation wiring', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8')

  it('maps F5 to the fullscreen presenter and Ctrl/Shift+F5 to the in-view one', () => {
    expect(source).toContain('presentationKeyOf')
    expect(source).toContain("startPresent(action === 'present' ? 'fullscreen' : 'tab')")
    expect(source).toContain("if (action === 'exit') setCanvasMode('edit')")
  })
})
