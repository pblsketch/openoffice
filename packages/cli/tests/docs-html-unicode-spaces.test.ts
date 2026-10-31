import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

/** The text runs of the body after inserting `html` into a blank document. */
async function insertedText(html: string): Promise<string> {
  const dir = tempDir()
  const input = join(dir, 'source.docx')
  const output = join(dir, 'result.docx')
  const ops = join(dir, 'ops.json')
  writeFileSync(input, Buffer.from(await buildBlankDocx()))
  writeFileSync(ops, JSON.stringify([{ op: 'insert_content', html, afterBlockIndex: -1 }]))
  const result = await run(['docs', 'apply', input, '--ops', ops, '--out', output, '--json'])
  expect(result.code, result.stdout).toBe(0)
  const zip = await JSZip.loadAsync(readFileSync(output))
  const xml = await zip.file('word/document.xml')!.async('string')
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')
}

describe('insert_content keeps non-HTML whitespace', () => {
  it.each([
    ['a&nbsp;&nbsp;b', 'a\u00a0\u00a0b'],
    ['a\u00a0\u00a0b', 'a\u00a0\u00a0b'],
    ['&nbsp;&nbsp;indent', '\u00a0\u00a0indent'],
    ['\u3000\u3000들여쓰기', '\u3000\u3000들여쓰기'],
    ['a\u2003\u2003b', 'a\u2003\u2003b'],
    ['end&nbsp;', 'end\u00a0'],
  ])('paragraph %j', async (source, expected) => {
    expect(await insertedText(`<p>${source}</p>`)).toBe(expected)
  })

  it('list items', async () => {
    expect(await insertedText('<ul><li>\u3000one</li></ul>')).toBe('\u3000one')
  })

  it('table cells', async () => {
    expect(
      await insertedText('<table><tr><td>a&nbsp;&nbsp;b</td><td>\u3000c</td></tr></table>'),
    ).toBe('a\u00a0\u00a0b|\u3000c')
  })

  it('still collapses ordinary HTML whitespace', async () => {
    expect(await insertedText('<p>a \n\t  b</p>')).toBe('a b')
    expect(await insertedText('<table><tr><td> a \n  b </td></tr></table>')).toBe('a b')
  })
})
