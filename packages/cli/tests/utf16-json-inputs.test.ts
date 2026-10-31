import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { decodeText } from '../src/fs'
import { run, tempDir } from './helpers'

/** What Windows PowerShell 5's `>` and `Out-File` write: UTF-16 with a byte order mark. */
const utf16le = (text: string) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
const utf16be = (text: string) =>
  Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from(text, 'utf16le')).swap16()])

async function template(dir: string): Promise<string> {
  const file = join(dir, 'template.docx')
  const zip = await JSZip.loadAsync(await buildBlankDocx())
  const xml = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      '<w:body><w:p><w:r><w:t>{{name}}</w:t></w:r></w:p><w:sectPr/></w:body>',
    ),
  )
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  return file
}

async function bodyText(file: string): Promise<string> {
  const xml = await (
    await JSZip.loadAsync(readFileSync(file))
  )
    .file('word/document.xml')!
    .async('string')
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')
}

describe('JSON input files saved as UTF-16', () => {
  it.each([
    ['little-endian', utf16le],
    ['big-endian', utf16be],
  ])('merge --data reads a %s file', async (_name, encode) => {
    const dir = tempDir()
    const data = join(dir, 'data.json')
    const output = join(dir, 'result.docx')
    writeFileSync(data, encode('{"name":"홍길동"}'))
    const r = await run(['merge', await template(dir), '--data', data, '--out', output, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(await bodyText(output)).toBe('홍길동')
  })

  it('docs apply --ops reads a UTF-16 file', async () => {
    const dir = tempDir()
    const ops = join(dir, 'ops.json')
    const output = join(dir, 'result.docx')
    writeFileSync(
      ops,
      utf16le('[{"op":"insert_content","html":"<p>한글 문장</p>","afterBlockIndex":-1}]'),
    )
    const r = await run([
      'docs',
      'apply',
      await template(dir),
      '--ops',
      ops,
      '--out',
      output,
      '--json',
    ])
    expect(r.code, r.stdout).toBe(0)
    expect(await bodyText(output)).toContain('한글 문장')
  })

  it('create --type xlsx --from reads a UTF-16 file', async () => {
    const dir = tempDir()
    const source = join(dir, 'rows.json')
    const output = join(dir, 'rows.xlsx')
    writeFileSync(source, utf16le('[["이름","수량"],["사과",3]]'))
    const r = await run(['create', '--type', 'xlsx', '--from', source, '--out', output, '--json'])
    expect(r.code, r.stdout).toBe(0)
    const zip = await JSZip.loadAsync(readFileSync(output))
    const text = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(text).toContain('이름')
    expect(text).toContain('사과')
  })
})

describe('decodeText', () => {
  it('decodes UTF-16 by its byte order mark and drops that mark', () => {
    expect(decodeText(utf16le('한글'))).toBe('한글')
    expect(decodeText(utf16be('한글'))).toBe('한글')
  })

  it('leaves UTF-8 alone, including a UTF-8 BOM that stripBom removes later', () => {
    expect(decodeText(Buffer.from('한글'))).toBe('한글')
    expect(decodeText(Buffer.from('\ufeff{"a":1}'))).toBe('\ufeff{"a":1}')
    expect(decodeText(new Uint8Array())).toBe('')
  })
})
