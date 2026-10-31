import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Ctrl+E is the only binding (the VS Code Ctrl+Shift+V chord stays free for
 * paste without formatting). This pins the pieces the user can see: the
 * testable classifier, the ribbon ScreenTip and the help topics.
 */
const APP = process.cwd()
const source = (path: string): string => readFileSync(resolve(APP, path), 'utf8')

describe('source view wiring', () => {
  it('routes the chord through the classifier and guards the view swap', () => {
    const app = source('src/renderer/App.tsx')
    expect(app).toContain("import { isSourceViewKey } from './source-view-key'")
    expect(app).toContain('isSourceViewKey(event)')
    expect(app).toContain('if (sourceMode || presenting) return')
  })

  it('names the shortcut in the ribbon tip without changing the accessible name', () => {
    const ribbon = source('src/renderer/components/Ribbon.tsx')
    expect(ribbon).toContain('shortcut={SOURCE_VIEW_SHORTCUT}')
    expect(ribbon).toContain('data-tip={shortcut ?')
    expect(ribbon).toContain('aria-label={title}')
  })

  it('documents the shortcut in the Korean and English help topics', () => {
    expect(source('../shell/src/renderer/src/i18n/help/topics/markdown.ko.md')).toContain('Ctrl+E')
    expect(source('../shell/src/renderer/src/i18n/help/topics/markdown.en.md')).toContain('Ctrl+E')
  })
})
