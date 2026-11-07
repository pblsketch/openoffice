import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBlankDocx } from '@genoffice/docx-engine'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { closeDocument, listFields, openDocumentFile } from '../src/formats/docx'
const tempDir = () => mkdtempSync(join(tmpdir(), 'ieumoffice-field-test-'))

const complex = (instruction: string, result: string) =>
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText>${instruction}</w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  `<w:r><w:t>${result}</w:t></w:r>` +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
const simple = (instruction: string, result: string) =>
  `<w:fldSimple w:instr="${instruction}"><w:r><w:t>${result}</w:t></w:r></w:fldSimple>`

describe('protected Word field reads decode XML references once', () => {
  for (const [kind, field] of [
    ['complex', complex],
    ['simple', simple],
  ] as const) {
    it.each([
      {
        name: 'decimal references',
        instr: 'SEQ&#32;Trial',
        result: '&#54620;&#44544;',
        expected: '한글',
        decoded: 'SEQ Trial',
      },
      {
        name: 'hex and supplementary references',
        instr: 'SEQ&#x20;Trial',
        result: '&#x1F600;',
        expected: '😀',
        decoded: 'SEQ Trial',
      },
      {
        name: 'amp-escaped literal reference',
        instr: 'SEQ Trial',
        result: '&amp;#32;',
        expected: '&#32;',
        decoded: 'SEQ Trial',
      },
      {
        name: 'numeric ampersand is decoded once',
        instr: 'SEQ Trial',
        result: '&#38;lt;',
        expected: '&lt;',
        decoded: 'SEQ Trial',
      },
      {
        name: 'ordinary named entities',
        instr: 'SEQ Trial',
        result: '&lt;&amp;&gt;',
        expected: '<&>',
        decoded: 'SEQ Trial',
      },
    ])(`${kind}: $name`, async ({ instr, result, expected, decoded }) => {
      const zip = await JSZip.loadAsync(await buildBlankDocx())
      const xml = await zip.file('word/document.xml')!.async('string')
      const block = `<w:p>${field(instr, result)}</w:p>`
      zip.file('word/document.xml', xml.replace('<w:sectPr', block + '<w:sectPr'))
      const file = join(tempDir(), 'fields.docx')
      writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
      const before = readFileSync(file)
      const doc = await openDocumentFile(file)
      try {
        expect(listFields(doc)).toContainEqual(
          expect.objectContaining({ instr: decoded, result: expected, protected: true }),
        )
      } finally {
        closeDocument(doc)
      }
      expect(readFileSync(file)).toEqual(before)
    })
  }
})
