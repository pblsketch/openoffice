import { describe, expect, it } from 'vitest'

import { parseCsv, resolveImportDelimiter } from '@genoffice/xlsx-gateway/gateway/csv-import'
import { importCsvText, type DataToolsContext } from '../src/renderer/data-tools-actions'

/// Data > From Text/CSV must split a file exactly the way opening it as a .csv
/// does (resolveImportDelimiter), including its prose guard and sep= lines.

function importInto(text: string): { values: (string | number)[][]; messages: string[] } {
  let values: { v: string | number }[][] = []
  const messages: string[] = []
  const worksheet = {
    getRange: () => ({
      setValues: (next: { v: string | number }[][]) => {
        values = next
      },
    }),
  }
  const workbook = {
    getActiveSheet: () => worksheet,
    getActiveRange: () => ({ getRow: () => 0, getColumn: () => 0 }),
  }
  const ctx = {
    univerRef: { current: { univerAPI: { getActiveWorkbook: () => workbook } } },
    setMessage: (message: string) => messages.push(message),
  } as unknown as DataToolsContext
  importCsvText(ctx, text)
  return { values: values.map((row) => row.map((cell) => cell.v)), messages }
}

/// What opening the same text as a .csv produces, padded to a rectangle the
/// way the import pads it.
function openedRows(text: string): string[][] {
  const rows = parseCsv(text, resolveImportDelimiter(text))
  const width = Math.max(0, ...rows.map((row) => row.length))
  return rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
}

describe('importCsvText delimiter', () => {
  it('keeps a one-column note file in one column even when semicolons outnumber commas', () => {
    const text = 'note\nalpha;beta\ngamma\n'
    const { values } = importInto(text)
    expect(values).toEqual([['note'], ['alpha;beta'], ['gamma']])
    expect(values).toEqual(openedRows(text))
  })

  it('splits a European semicolon file with decimal commas', () => {
    const { values } = importInto('Name;Wert\nA;1,5\n')
    expect(values).toEqual([
      ['Name', 'Wert'],
      ['A', '1,5'],
    ])
  })

  it('does not split on a comma inside quotes', () => {
    const text = 'name,note\n"Ada, L.",x\n'
    const { values } = importInto(text)
    expect(values).toEqual([
      ['name', 'note'],
      ['Ada, L.', 'x'],
    ])
    expect(values).toEqual(openedRows(text))
  })

  it('splits a tab-delimited file', () => {
    const text = 'a\tb\n1\t2\n'
    const { values } = importInto(text)
    expect(values).toEqual([
      ['a', 'b'],
      [1, 2],
    ])
  })

  it('reads a single-column file', () => {
    const { values } = importInto('only\none\ntwo\n')
    expect(values).toEqual([['only'], ['one'], ['two']])
  })

  it('obeys a sep= declaration', () => {
    const text = 'sep=;\na,b;c\n1;2\n'
    const { values } = importInto(text)
    expect(values).toEqual([
      ['a,b', 'c'],
      [1, 2],
    ])
    expect(values.map((row) => row.map(String))).toEqual(openedRows(text))
  })

  it('keeps a table whose first line is a title row', () => {
    const text = 'Sales 2026\na;b;c\n1;2;3\n4;5;6\n'
    const { values } = importInto(text)
    expect(values.map((row) => row.map(String))).toEqual(openedRows(text))
    expect(values[1]).toEqual(['a', 'b', 'c'])
  })
})
