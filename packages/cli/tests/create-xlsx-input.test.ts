import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function create(data: string, extension = 'json', flags: string[] = []) {
  const dir = tempDir()
  const input = join(dir, `input.${extension}`)
  const output = join(dir, 'output.xlsx')
  writeFileSync(input, data)
  const result = await run([
    'create',
    '--type',
    'xlsx',
    '--from',
    input,
    '--out',
    output,
    '--json',
    ...flags,
  ])
  return { result, output }
}

describe('create xlsx input validation', () => {
  it('preserves scalar cells, formulas, blank cells and ragged rows', async () => {
    const { result, output } = await create(
      JSON.stringify([
        ['label', 42, true, false, null, '', '=B1+1'],
        [0, -2.5],
      ]),
    )
    expect(result.code).toBe(0)
    const zip = await JSZip.loadAsync(readFileSync(output))
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('label')
    expect(xml).toContain('<v>42</v>')
    expect(xml).toContain('<f>B1+1</f>')
    expect(xml).toContain('<v>-2.5</v>')
    expect(xml).not.toContain('[object Object]')
  })

  it('accepts empty rows and an empty table', async () => {
    for (const data of ['[]', '[[], [null]]']) {
      const { result, output } = await create(data)
      expect(result.code).toBe(0)
      expect(existsSync(output)).toBe(true)
    }
  })

  it('accepts multiple sheets', async () => {
    const { result } = await create(
      JSON.stringify({
        sheets: [
          { name: 'First', rows: [[1]] },
          { name: 'Second', rows: [['two']] },
        ],
      }),
    )
    expect(result.code).toBe(0)
    expect(result.json().detail.sheets).toBe(2)
  })

  for (const [label, data, message] of [
    ['object cell', '[[{"price":100}]]', 'cell A1'],
    ['array cell', '[[[1,2]]]', 'cell A1'],
    ['positive numeric overflow', '[[1e400]]', 'cell A1'],
    ['negative numeric overflow', '[[-1e400]]', 'cell A1'],
    ['numeric row', '[123]', 'row 1'],
    ['null row', '[null]', 'row 1'],
    ['object row', '[{}]', 'row 1'],
    ['null sheet', '{"sheets":[null]}', 'sheets[0]'],
    ['array sheet', '{"sheets":[[]]}', 'sheets[0]'],
    ['missing rows', '{"sheets":[{"name":"Data"}]}', 'sheets[0]'],
    ['non-array rows', '{"sheets":[{"name":"Data","rows":{}}]}', 'sheets[0]'],
    ['non-string name', '{"sheets":[{"name":1,"rows":[]}]}', 'sheets[0]'],
    [
      'invalid later sheet',
      '{"sheets":[{"name":"First","rows":[[1]]},{"name":"Second","rows":[[{}]]}]}',
      'sheets[1].rows',
    ],
  ]) {
    it(`rejects ${label} without creating a workbook`, async () => {
      const { result, output } = await create(data!)
      expect(result.code).toBe(1)
      expect(result.json().error).toBe('invalid_argument')
      expect(result.json().message).toContain(message)
      expect(existsSync(output)).toBe(false)
    })
  }

  for (const extension of ['json', 'csv']) {
    for (const columns of [16_384, 16_385]) {
      it(`checks the ${extension} column boundary at ${columns}`, async () => {
        const row = Array(columns).fill(null)
        row[columns - 1] = 'edge'
        const data = extension === 'json' ? JSON.stringify([row]) : row.join(',')
        const { result, output } = await create(data, extension)
        if (columns === 16_384) {
          expect(result.code).toBe(0)
          const zip = await JSZip.loadAsync(readFileSync(output))
          expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('r="XFD1"')
        } else {
          expect(result.code).toBe(1)
          expect(result.json().error).toBe('invalid_argument')
          expect(existsSync(output)).toBe(false)
        }
      })
    }
  }

  it('accepts the last row and refuses a row beyond it', async () => {
    for (const count of [1_048_576, 1_048_577]) {
      const data = '[' + '[],'.repeat(count - 1) + '[]]'
      const { result, output } = await create(data)
      expect(result.code).toBe(count === 1_048_576 ? 0 : 1)
      expect(existsSync(output)).toBe(count === 1_048_576)
      if (count > 1_048_576) expect(result.json().error).toBe('invalid_argument')
    }
  })

  it('validates before --force can replace an existing workbook', async () => {
    const dir = tempDir()
    const input = join(dir, 'input.json')
    const output = join(dir, 'output.xlsx')
    writeFileSync(input, '[[{}]]')
    writeFileSync(output, 'keep the existing file')
    const result = await run([
      'create',
      '--type',
      'xlsx',
      '--from',
      input,
      '--out',
      output,
      '--force',
      '--json',
    ])
    expect(result.code).toBe(1)
    expect(result.json().error).toBe('invalid_argument')
    expect(readFileSync(output, 'utf-8')).toBe('keep the existing file')
  })
})
