/**
 * Save As › PDF in the Markdown editor: the renderer suggests the document's
 * name without its .md extension, sends the print HTML with a Save As, and a
 * PDF answer must not be taken for a save (the document keeps its path and
 * unsaved edits).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExtensions } from '../src/renderer/editor/extensions'
import { exportBaseName } from '../src/renderer/App'

const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function editorWith(content: string): Editor {
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
      slashItems: () => [],
    }),
    content,
  })
  editors.push(editor)
  return editor
}

describe('exportBaseName', () => {
  it('drops the document extension from a saved document', () => {
    const editor = editorWith('<p>x</p>')
    expect(exportBaseName('C:\\docs\\My Note.md', editor)).toBe('My Note')
    expect(exportBaseName('/home/a/notes.markdown', editor)).toBe('notes')
  })

  it('derives a name for an untitled document, falling back to Untitled', () => {
    expect(exportBaseName(null, editorWith('<h1>Plan</h1><p>body</p>'))).toBe('Plan')
    expect(exportBaseName(null, editorWith('<p></p>'))).toBe('Untitled')
  })
})

describe('Save As › PDF wiring', () => {
  const app = readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8')

  it('sends the print HTML of the screen with a Save As', () => {
    expect(app).toContain(
      'buildPrintHtml(current.view.dom, exportBaseName(filePathRef.current, current))',
    )
    expect(app).toContain('...(pdfHtml !== undefined ? { pdfHtml } : {})')
  })

  it('treats a PDF answer as an export, not a save', () => {
    expect(app).toContain("if (result.exported === 'pdf') {")
    expect(app).toContain("setSaveState('idle')")
  })
})
