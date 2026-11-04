// @vitest-environment node
/**
 * Save As › Word, ODT or page images in the Markdown editor: the main process
 * answers `exportAs` with an approved path, and the renderer must run the
 * export menu's code to that path instead of taking the answer for a save.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Save As › an export (renderer wiring)', () => {
  const app = read('src/renderer/App.tsx')

  it('treats an exportAs answer as an export and keeps the document as it is', () => {
    const branch = app.slice(app.indexOf('if (result.exportAs) {'))
    expect(branch.length).toBeLessThan(app.length)
    const body = branch.slice(0, branch.indexOf('}'))
    expect(body).toContain("setSaveState('idle')")
    expect(body).toContain('runExportRef.current(result.exportAs, undefined, result.path)')
    expect(body).toContain('return true')
    // the save path (setFilePath) comes after both export answers
    expect(app.indexOf('if (result.exportAs) {')).toBeLessThan(
      app.lastIndexOf('setFilePath(result.path)'),
    )
  })

  it('passes the approved path to the Word, ODT and page-image exports', () => {
    expect(app).toContain('runExportRef.current = runExport')
    expect(app.match(/\.\.\.\(saveAsTarget \? \{ saveAsTarget \} : \{\}\)/g)).toHaveLength(2)
    expect(read('src/renderer/export/imageExport.ts')).toContain(
      '...(saveAsTarget ? { saveAsTarget } : {})',
    )
  })
})
