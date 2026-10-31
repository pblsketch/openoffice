import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

// "한글 본문" encoded as EUC-KR (CP949) by hand, so the test needs no encoder package
const EUC_KR_HANGUL = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xba, 0xbb, 0xb9, 0xae])

async function bodyText(source: Buffer): Promise<string> {
  const dir = tempDir()
  const input = join(dir, 'page.html')
  const output = join(dir, 'page.docx')
  writeFileSync(input, source)
  const result = await run(['create', '--type', 'docx', '--from', input, '--out', output, '--json'])
  expect(result.code, result.stdout).toBe(0)
  const xml = await (
    await JSZip.loadAsync(readFileSync(output))
  )
    .file('word/document.xml')!
    .async('string')
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')
}

const html = (head: string, body: Buffer) =>
  Buffer.concat([
    Buffer.from(`<html><head>${head}</head><body><p>`),
    body,
    Buffer.from('</p></body></html>'),
  ])

describe('create --type docx --from <html> decodes the file by its declared charset', () => {
  it.each([
    ['meta charset', '<meta charset="euc-kr">'],
    ['uppercase and unquoted', '<META CHARSET=EUC-KR>'],
    [
      'http-equiv content type',
      '<meta http-equiv="Content-Type" content="text/html; charset=ks_c_5601-1987">',
    ],
  ])('reads an EUC-KR page (%s)', async (_name, head) => {
    expect(await bodyText(html(head, EUC_KR_HANGUL))).toBe('한글 본문')
  })

  it('reads a UTF-16 page by its byte order mark', async () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<p>한글</p>', 'utf16le')])
    expect(await bodyText(le)).toBe('한글')
    const swapped = Buffer.concat([
      Buffer.from([0xfe, 0xff]),
      Buffer.from(Buffer.from('<p>한글</p>', 'utf16le')).swap16(),
    ])
    expect(await bodyText(swapped)).toBe('한글')
  })

  it('still reads UTF-8 pages with or without a BOM and with an unknown charset name', async () => {
    const utf8 = Buffer.from('<p>한글 본문</p>')
    expect(await bodyText(utf8)).toBe('한글 본문')
    expect(await bodyText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]))).toBe('한글 본문')
    expect(await bodyText(html('<meta charset="utf-8">', Buffer.from('한글 본문')))).toBe(
      '한글 본문',
    )
    expect(await bodyText(html('<meta charset="no-such-charset">', Buffer.from('한글 본문')))).toBe(
      '한글 본문',
    )
  })
})
