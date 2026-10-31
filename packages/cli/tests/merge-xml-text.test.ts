import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function fixture() {
  const dir = tempDir(),
    input = join(dir, 'template.docx'),
    output = join(dir, 'result.docx'),
    zip = await JSZip.loadAsync(await buildBlankDocx()),
    xml = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      '<w:body><w:p><w:r><w:t>{{name}}</w:t></w:r></w:p><w:sectPr/></w:body>',
    ),
  )
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  writeFileSync(input, bytes)
  return { input, output, bytes }
}
for (const bad of [
  '\u0001',
  '\b',
  '\u000b',
  '\u000c',
  '\u001f',
  '\ud800',
  '\udc00',
  '\ufffe',
  '\uffff',
])
  it(`refuses XML-invalid U+${bad.charCodeAt(0).toString(16)} before losing replacement data`, async () => {
    const { input, output, bytes } = await fixture()
    writeFileSync(output, 'keep output')
    const r = await run([
      'merge',
      input,
      '--data',
      JSON.stringify({ name: 'Before' + bad + 'After' }),
      '--out',
      output,
      '--force',
      '--json',
    ])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('invalid_argument')
    expect(readFileSync(output, 'utf8')).toBe('keep output')
    expect(readFileSync(input)).toEqual(bytes)
  })
for (const value of ['Plain & <quoted> text', 'Emoji 😀 and rare Han 𠀀', 'Tab\tand\nline'])
  it('keeps XML-valid replacement text accepted', async () => {
    const { input, output } = await fixture()
    const r = await run([
      'merge',
      input,
      '--data',
      JSON.stringify({ name: value }),
      '--out',
      output,
      '--strict',
      '--json',
    ])
    expect(r.code, r.stdout).toBe(0)
    expect(existsSync(output)).toBe(true)
  })

it('preserves the documented NUL cleanup', async () => {
  const { input, output } = await fixture()
  const r = await run([
    'merge',
    input,
    '--data',
    JSON.stringify({ name: 'A\u0000B' }),
    '--out',
    output,
    '--strict',
    '--json',
  ])
  expect(r.code, r.stdout).toBe(0)
  const read = await run(['docs', 'read', output, '--full', '--json'])
  expect(read.json().detail.items[0].text).toBe('AB')
})
