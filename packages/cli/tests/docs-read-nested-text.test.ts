import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildBlankDocx, generateTableModelXml, type TableModel } from '@genoffice/docx-engine'
import { expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function fixture(deep = false, placeholders = false) {
  const dir = tempDir(),
    input = join(dir, 'nested.docx'),
    zip = await JSZip.loadAsync(await buildBlankDocx()),
    xml = await zip.file('word/document.xml')!.async('string')
  const inner: TableModel = {
    rows: [
      [
        {
          paras: [placeholders ? '{{inner}}' : 'Inner first'],
          ...(deep
            ? { nestedTables: [{ rows: [[{ paras: ['Deep text'] }]] }], nestedTableAnchors: [1] }
            : {}),
        },
      ],
      [{ paras: ['Inner second'] }],
    ],
  }
  const outer: TableModel = {
    rows: [
      [
        {
          paras: [placeholders ? '{{outer}}' : 'Before', 'After'],
          nestedTables: [inner],
          nestedTableAnchors: [1],
        },
      ],
    ],
  }
  zip.file(
    'word/document.xml',
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      '<w:body>' + generateTableModelXml(outer) + '<w:p/><w:sectPr/></w:body>',
    ),
  )
  writeFileSync(input, await zip.generateAsync({ type: 'nodebuffer' }))
  return { dir, input }
}
for (const deep of [false, true])
  it(`reads nested text in its paragraph order at depth ${deep ? 2 : 1}`, async () => {
    const { input } = await fixture(deep),
      r = await run(['docs', 'read', input, '--full', '--json'])
    expect(r.code, r.stdout).toBe(0)
    const text = r.json().detail.items[0].text as string
    for (const token of [
      'Before',
      'Inner first',
      'Inner second',
      'After',
      ...(deep ? ['Deep text'] : []),
    ])
      expect(text).toContain(token)
    expect(text.indexOf('Before')).toBeLessThan(text.indexOf('Inner first'))
    expect(text.indexOf('Inner second')).toBeLessThan(text.indexOf('After'))
  })
it('keeps the preview budget when nested text is present', async () => {
  const { input } = await fixture()
  const r = await run(['docs', 'read', input, '--max-chars', '8', '--json'])
  expect(r.json().detail.items[0].text).toMatch(/…\(\+\d+ chars\)$/)
})
it('does not treat read-only nested merge placeholders as editable or count them twice', async () => {
  const { dir, input } = await fixture(false, true),
    output = join(dir, 'result.docx')
  const r = await run([
    'merge',
    input,
    '--data',
    '{"outer":"Filled","inner":"Keep nested"}',
    '--out',
    output,
    '--json',
  ])
  expect(r.code, r.stdout).toBe(0)
  expect(r.json().detail.filled).toBe(1)
  expect(r.json().detail.unresolved_placeholders).toHaveLength(1)
  expect(r.json().detail.unresolved_placeholders[0]).toMatchObject({
    key: 'inner',
    reason: 'unreachable_nested',
  })
  const zip = await JSZip.loadAsync(readFileSync(output)),
    xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('{{inner}}')
  expect(xml.match(/<w:tbl[ >]/g)).toHaveLength(2)
})
