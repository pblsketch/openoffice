import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function documentWithField(result: string, simple: boolean) {
  const dir = tempDir()
  const zip = await JSZip.loadAsync(await buildBlankDocx())
  const field = simple
    ? `<w:fldSimple w:instr=" SEQ Trial "><w:r>${result}</w:r></w:fldSimple>`
    : `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ Trial </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>${result}</w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`
  const xml = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      `<w:body><w:p><w:r><w:t>Before</w:t><w:tab/></w:r>${field}<w:r><w:br/><w:t>After</w:t></w:r></w:p><w:p/></w:body>`,
    ),
  )
  const input = join(dir, 'field.docx')
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  writeFileSync(input, bytes)
  return { input, bytes }
}

describe('protected Word field result whitespace', () => {
  it.each([
    [false, '<w:br/>', '\n'],
    [false, '<w:cr/>', '\n'],
    [false, '<w:tab/>', '\t'],
    [true, '<w:br/>', '\n'],
    [true, '<w:cr/>', '\n'],
    [true, '<w:tab/>', '\t'],
  ] as const)(
    'retains the cached result separator (simple: %s, %s)',
    async (simple, separator, expected) => {
      const { input, bytes } = await documentWithField(
        `<w:t>First</w:t>${separator}<w:t>Second</w:t>`,
        simple,
      )
      const r = await run(['docs', 'read', input, '--fields', '--json'])
      expect(r.code, r.stdout).toBe(0)
      expect(r.json().detail.fields).toEqual([
        expect.objectContaining({
          type: 'SEQ',
          instr: 'SEQ Trial',
          result: `First${expected}Second`,
          protected: true,
        }),
      ])
      expect(readFileSync(input)).toEqual(bytes)
    },
  )

  it.each([false, true])(
    'keeps a plain cached result free of text outside the field (simple: %s)',
    async (simple) => {
      const { input } = await documentWithField('<w:t>12</w:t>', simple)
      const r = await run(['docs', 'read', input, '--fields', '--json'])
      expect(r.code).toBe(0)
      expect(r.json().detail.fields).toEqual([
        expect.objectContaining({ instr: 'SEQ Trial', result: '12' }),
      ])
    },
  )
})
