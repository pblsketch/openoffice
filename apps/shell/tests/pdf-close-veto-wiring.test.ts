/**
 * A tab that answered "Don't Save" stops writing recovery copies (the shared
 * store blocks the document; the PDF editor also keeps its own flag); when
 * another tab then cancels the window close, the tab stays open with its
 * edits and must resume them (main window and detached windows alike).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

describe('PDF recovery resumes after a vetoed close', () => {
  it('the main window guard resumes every dirty PDF tab', () => {
    const index = source('src/main/index.ts')
    const veto = index.indexOf('onVetoed: () => {')
    expect(veto).toBeGreaterThan(-1)
    const body = index.slice(veto, index.indexOf('},', veto))
    expect(body).toContain('resetAppShuttingDown()')
    expect(body).toContain('resumeDiscardedCopies()')
    expect(body).toContain('pdfCloseCancelled(tab.webContents)')
  })

  it('a detached PDF window resumes when its close is denied', () => {
    const detached = source('src/main/detached-windows.ts')
    const denied = detached.indexOf('if (await confirmDetachedClose(rec)) tearDown()')
    expect(denied).toBeGreaterThan(-1)
    const branch = detached.slice(denied, detached.indexOf('} catch', denied))
    expect(branch).toContain('resumeDiscardedCopies()')
    expect(branch).toContain("if (rec.kind === 'pdf') pdfCloseCancelled(rec.view.webContents)")
  })

  it('a detached window whose close prompt failed resumes too', () => {
    const detached = source('src/main/detached-windows.ts')
    const failed = detached.indexOf("console.error('[shell] detached window close prompt failed:'")
    expect(failed).toBeGreaterThan(-1)
    const branch = detached.slice(failed, detached.indexOf('} finally', failed))
    expect(branch).toContain('resumeDiscardedCopies()')
  })
})
