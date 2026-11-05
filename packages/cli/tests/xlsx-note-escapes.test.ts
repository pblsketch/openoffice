import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseLegacyComments } from '@genoffice/xlsx-gateway/gateway/xlsx-threaded-comments'
import { runWorkbookDsl } from '../src/formats/xlsx-dsl'
import { blankWorkbook, writeWorkbook } from '../src/formats/xlsx'
const tempDir = () => mkdtempSync(join(tmpdir(), 'ieumoffice-note-test-'))

async function sourceWithNote(author: string, text: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await blankWorkbook('Data'))
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/comments1.xml',
    '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<authors><author>${author}</author></authors><commentList><comment ref="A1" authorId="0"><text><t>${text}</t></text></comment></commentList></comments>`,
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('sheet note edits carry existing XLSX-escaped notes', () => {
  it.each([
    { name: 'line breaks', raw: 'first_x000A_second_x000D_third', text: 'first\nsecond\rthird' },
    { name: 'literal escape spelling', raw: '_x005F_x0041_', text: '_x0041_' },
    { name: 'control character', raw: 'A_x0001_B', text: 'A\u0001B' },
    {
      name: 'ordinary XML entities',
      raw: 'A &amp; B',
      text: 'A & B',
      author: 'Plain',
      expectedAuthor: 'Plain',
    },
    {
      name: 'literal surrogate escapes',
      raw: '_xD83D__xDE00_',
      text: '_xD83D__xDE00_',
      author: 'Plain',
      expectedAuthor: 'Plain',
    },
    { name: 'ordinary emoji', raw: '😀', text: '😀', author: 'Plain', expectedAuthor: 'Plain' },
  ])(
    'preserves $name when a different note is added',
    async ({ raw, text, author = 'Author_x000A_Name', expectedAuthor = 'Author\nName' }) => {
      const source = await sourceWithNote(author, raw)
      const result = await runWorkbookDsl(source, [
        { op: 'set_note', sheet: 'Data', address: 'B1', text: 'New note' },
      ])
      const prior = result.gateway.noteStates[0]!.notes.find((n) => n.column === 0)
      expect(prior).toMatchObject({ row: 0, column: 0, author: expectedAuthor, text })
      const out = join(tempDir(), 'notes.xlsx')
      await writeWorkbook(source, result.edits, out, { gateway: result.gateway })
      const saved = await JSZip.loadAsync(readFileSync(out))
      const xml = await saved.file('xl/comments1.xml')!.async('string')
      expect(parseLegacyComments(xml).get('A1')).toEqual({ author: expectedAuthor, text })
      expect(parseLegacyComments(xml).get('B1')?.text).toBe('New note')
    },
  )
})
