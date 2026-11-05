import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

/** What Windows PowerShell 5's `>` and `Out-File` write: UTF-16 with a byte order mark. */
const utf16le = (text: string) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
const utf16be = (text: string) =>
  Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from(text, 'utf16le')).swap16()])

async function documentXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file))
  return zip.file('word/document.xml')!.async('string')
}

describe('Markdown files saved as UTF-16 with a byte order mark', () => {
  it.each([
    ['little-endian', utf16le],
    ['big-endian', utf16be],
  ])('convert to docx reads a %s file', async (_name, encode) => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.docx')
    writeFileSync(input, encode('# 제목\n\n본문 문장\n'))
    expect((await run(['convert', input, '--to', 'docx', '--out', output, '--json'])).code).toBe(0)
    const xml = await documentXml(output)
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(xml).toContain('제목')
    expect(xml).toContain('본문 문장')
  })

  it('create --type docx --from reads a UTF-16 file the same way', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.docx')
    writeFileSync(input, utf16le('# 제목\n\n본문 문장\n'))
    const r = await run(['create', '--type', 'docx', '--from', input, '--out', output, '--json'])
    expect(r.code, r.stdout).toBe(0)
    const xml = await documentXml(output)
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(xml).toContain('제목')
  })

  it('info counts the heading and does not treat the BOM as text', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    writeFileSync(input, utf16le('# 제목\n\n본문 문장\n'))
    const r = await run(['info', input, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.headings).toBe(1)
    expect(r.json().detail.characters).toBe('# 제목\n\n본문 문장\n'.length)
  })
})
