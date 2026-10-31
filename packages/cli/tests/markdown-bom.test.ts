import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

const BOM = '\ufeff'

async function documentXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file))
  return zip.file('word/document.xml')!.async('string')
}

describe('Markdown files saved as UTF-8 with a byte order mark', () => {
  const source = (eol: string) => `${BOM}# 제목${eol}${eol}본문 문장${eol}`

  it.each(['\n', '\r\n'])('convert to docx keeps the heading and no BOM (%j)', async (eol) => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.docx')
    writeFileSync(input, source(eol))
    expect((await run(['convert', input, '--to', 'docx', '--out', output, '--json'])).code).toBe(0)
    const xml = await documentXml(output)
    expect(xml).not.toContain(BOM)
    expect(xml).not.toContain('# 제목')
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(xml).toContain('제목')
  })

  it('create --type docx --from reads it the same way', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.docx')
    writeFileSync(input, source('\n'))
    const r = await run(['create', '--type', 'docx', '--from', input, '--out', output, '--json'])
    expect(r.code, r.stdout).toBe(0)
    const xml = await documentXml(output)
    expect(xml).not.toContain(BOM)
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
  })

  it('convert to html has an h1 and no BOM', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.html')
    writeFileSync(input, source('\n'))
    expect((await run(['convert', input, '--to', 'html', '--out', output, '--json'])).code).toBe(0)
    const html = readFileSync(output, 'utf-8')
    expect(html).toContain('<h1>제목</h1>')
    expect(html).not.toContain(BOM)
  })

  it('keeps a BOM-free file and a U+FEFF inside the text unchanged', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    const output = join(dir, 'note.docx')
    writeFileSync(input, `# 제목\n\n안${BOM}녕\n`)
    expect((await run(['convert', input, '--to', 'docx', '--out', output, '--json'])).code).toBe(0)
    const xml = await documentXml(output)
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/)
    expect(xml).toContain(`안${BOM}녕`)
  })
})
