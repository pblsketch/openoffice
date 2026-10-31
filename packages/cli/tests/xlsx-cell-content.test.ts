import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { readBasicWorkbook } from '@genoffice/xlsx-gateway/gateway/xlsx-gateway'
import { cellEditsFromInputs, writeWorkbook } from '../src/formats/xlsx'
import { run, tempDir } from './helpers'

async function create(data: string, extension = 'json', existing?: string) {
  const dir = tempDir()
  const input = join(dir, `input.${extension}`)
  const output = join(dir, 'output.xlsx')
  writeFileSync(input, data)
  if (existing !== undefined) writeFileSync(output, existing)
  const result = await run([
    'create',
    '--type',
    'xlsx',
    '--from',
    input,
    '--out',
    output,
    '--json',
    ...(existing === undefined ? [] : ['--force']),
  ])
  return { result, output }
}

async function cells(output: string) {
  const workbook = await readBasicWorkbook(readFileSync(output))
  return workbook.snapshot.sheets[0]!.cells
}

describe('CLI workbook cell content', () => {
  it('preserves long text, a long formula and other scalar controls', async () => {
    const text = 'a'.repeat(32_767)
    const formula = '=10' + '+1'.repeat(4_094) + ' '
    expect(formula.length).toBe(8_192)
    const values = [text, formula, 9007199254740991, -9007199254740991, 1.25, true, null]
    const { result, output } = await create(JSON.stringify([values]))
    expect(result.code).toBe(0)
    const saved = await cells(output)
    expect(saved.A1?.value).toBe(text)
    expect(saved.B1?.formula).toBe(formula)
    expect(saved.C1?.value).toBe(9007199254740991)
    expect(saved.D1?.value).toBe(-9007199254740991)
    expect(saved.E1?.value).toBe(1.25)
    expect(saved.F1?.value).toBe(true)
  })

  it('preserves a large integer as text in JSON and CSV', async () => {
    for (const [data, extension] of [
      ['[["9007199254740993"]]', 'json'],
      ['9007199254740993', 'csv'],
    ]) {
      const { result, output } = await create(data!, extension!)
      expect(result.code).toBe(0)
      expect((await cells(output)).A1?.value).toBe('9007199254740993')
    }
  })

  for (const token of ['9007199254740993', '-9007199254740993', '1e20']) {
    it(`rejects unsafe JSON integer ${token} before writing`, async () => {
      const { result, output } = await create(`[[${token}]]`)
      expect(result.code).toBe(1)
      expect(result.json()).toMatchObject({
        error: 'invalid_argument',
        detail: { cell: 'A1', sheet: 'input' },
      })
      expect(result.json().suggestion).toContain('string')
      expect(existsSync(output)).toBe(false)
    })
  }

  it('preserves XML control characters in ordinary text using SpreadsheetML escapes', async () => {
    const text = 'before\u0000\u0001\u000b\u000c\u001f\ufffe\uffff\r\n\t_x0001_after'
    const { result, output } = await create(JSON.stringify([[text]]))
    expect(result.code).toBe(0)
    // The workbook reader deliberately normalizes CRLF; the XML retains CR.
    expect((await cells(output)).A1?.value).toBe(text.replace(/\r\n/g, '\n'))
    const zip = await JSZip.loadAsync(readFileSync(output))
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('_x0001_')
    expect(xml).toContain('_x000D_')
    expect(xml).not.toContain('\u0001')
  })

  for (const code of [0, 1, 0x0b, 0x0c, 0x1f, 0xfffe, 0xffff]) {
    it(`rejects XML-forbidden formula character U+${code.toString(16)}`, async () => {
      const formula = `="before${String.fromCharCode(code)}after"`
      const { result, output } = await create(JSON.stringify([[formula]]))
      expect(result.code).toBe(1)
      expect(result.json()).toMatchObject({ error: 'invalid_argument', detail: { cell: 'A1' } })
      expect(result.json().message).toContain('formula')
      expect(existsSync(output)).toBe(false)
    })
  }

  it('preserves well-formed Unicode, whitespace and literal escape-like formula text', async () => {
    const text = 'text \u{1f600} \u{1fffe} \ufffd'
    const formula = '="\u{1f600} _x0001_"\t\n'
    const { result, output } = await create(JSON.stringify([[text, formula]]))
    expect(result.code).toBe(0)
    expect((await cells(output)).A1?.value).toBe(text)
    expect((await cells(output)).B1?.formula).toBe(formula)
  })

  for (const [label, value] of [
    ['high surrogate in text', 'before\ud800after'],
    ['low surrogate in text', 'before\udfffafter'],
    ['high surrogate in a formula', '="\ud800"'],
  ] as const) {
    it(`rejects an unpaired ${label}`, async () => {
      const { result, output } = await create(JSON.stringify([[value]]))
      expect(result.code).toBe(1)
      expect(result.json().error).toBe('invalid_argument')
      expect(existsSync(output)).toBe(false)
    })
  }

  it('validates later sheets before --force can replace an existing file', async () => {
    for (const value of [9007199254740992, '=1+\u0001', '\ud800']) {
      const { result, output } = await create(
        JSON.stringify({
          sheets: [
            { name: 'Valid', rows: [[42]] },
            { name: 'Invalid', rows: [[null], [null, value]] },
          ],
        }),
        'json',
        'keep the existing file',
      )
      expect(result.code).toBe(1)
      expect(result.json()).toMatchObject({
        error: 'invalid_argument',
        detail: { cell: 'B2', sheet: 'Invalid' },
      })
      expect(readFileSync(output, 'utf-8')).toBe('keep the existing file')
    }
  })

  it('applies the same guards to explicit cell edit inputs', () => {
    for (const value of [9007199254740992, '\ud800']) {
      expect(() => cellEditsFromInputs([{ cell: 'B2', value }], 'Data')).toThrow('B2')
    }
    expect(() => cellEditsFromInputs([{ cell: 'C3', formula: '1+\u0001' }], 'Data')).toThrow('C3')
    expect(
      cellEditsFromInputs([{ cell: 'A1', style: { bold: true } }], 'Data')[0]?.writeValue,
    ).toBe(false)
    expect(cellEditsFromInputs([{ cell: 'A2', formula: '1+2' }], 'Data')[0]?.cell.formula).toBe(
      '=1+2',
    )
  })

  it('keeps untouched package entries byte-identical on no-op and edited saves', async () => {
    const text = 'a'.repeat(32_767)
    const { result, output } = await create(
      JSON.stringify({
        sheets: [
          { name: 'Data', rows: [[text, 'unchanged']] },
          { name: 'Other', rows: [['also unchanged']] },
        ],
      }),
    )
    expect(result.code).toBe(0)
    const source = readFileSync(output)
    const before = await JSZip.loadAsync(source)
    for (const edits of [
      [],
      cellEditsFromInputs([{ cell: 'C1', value: 'new\u0001text' }], 'Data'),
    ]) {
      await writeWorkbook(source, edits, output)
      const after = await JSZip.loadAsync(readFileSync(output))
      expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort())
      for (const [path, entry] of Object.entries(before.files)) {
        if (entry.dir || (edits.length && path === 'xl/worksheets/sheet1.xml')) continue
        expect(await after.file(path)!.async('nodebuffer')).toEqual(await entry.async('nodebuffer'))
      }
      expect((await cells(output)).A1?.value).toBe(text)
    }
  })
})
