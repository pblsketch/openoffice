// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDrawingNoteFile } from '../src/main/drawing-note'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shell-drawing-note-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('isDrawingNoteFile', () => {
  it('knows a renamed Obsidian drawing by its front matter', () => {
    const path = join(dir, 'Board.md')
    writeFileSync(path, `---\n\nexcalidraw-plugin: parsed\n\n---\n${'x'.repeat(100_000)}`)
    expect(isDrawingNoteFile(path)).toBe(true)
  })

  it('leaves ordinary notes and missing files alone', () => {
    const note = join(dir, 'note.md')
    writeFileSync(note, '---\ntitle: Excalidraw tips\n---\n# excalidraw-plugin: no\n')
    expect(isDrawingNoteFile(note)).toBe(false)
    expect(isDrawingNoteFile(join(dir, 'missing.md'))).toBe(false)
  })
})
