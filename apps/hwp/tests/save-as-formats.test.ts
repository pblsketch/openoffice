// @vitest-environment node
/**
 * The Save As format list: the document's own format first, the other one,
 * then PDF; and what the dialog's answer means.
 */
import { describe, expect, it } from 'vitest'
import {
  saveAsDefaultPath,
  saveAsFilters,
  saveAsTarget,
  type SaveAsLabelKey,
} from '../src/main/save-as-formats'

const label = (key: SaveAsLabelKey): string => key

describe('the filters', () => {
  it('Save As lists the document format first, the other one, then PDF', () => {
    expect(saveAsFilters('hwp', true, label)).toEqual([
      { name: 'filterHwp', extensions: ['hwp'] },
      { name: 'filterHwpx', extensions: ['hwpx'] },
      { name: 'filterPdf', extensions: ['pdf'] },
    ])
    expect(saveAsFilters('hwpx', true, label).map((f) => f.extensions)).toEqual([
      ['hwpx'],
      ['hwp'],
      ['pdf'],
    ])
  })

  it('the first save of a new document offers only the two Hangul formats', () => {
    expect(saveAsFilters('hwpx', false, label).map((f) => f.extensions)).toEqual([
      ['hwpx'],
      ['hwp'],
    ])
  })
})

describe('the suggestion', () => {
  it('drops .hwp/.hwpx only when PDF is offered', () => {
    expect(saveAsDefaultPath('C:/d/Report.hwp', true)).toBe('C:/d/Report')
    expect(saveAsDefaultPath('C:/d/Report.HWPX', true)).toBe('C:/d/Report')
    expect(saveAsDefaultPath('C:/d/Report.hwpx', false)).toBe('C:/d/Report.hwpx')
  })
})

describe('the answer', () => {
  it('a .pdf name picks the PDF copy, as typed', () => {
    expect(saveAsTarget('C:/d/a.pdf', 'hwp', true)).toEqual({ path: 'C:/d/a.pdf', kind: 'pdf' })
    expect(saveAsTarget('C:/d/a.PDF', 'hwpx', true)).toEqual({
      path: 'C:/d/a.PDF',
      kind: 'pdf',
    })
  })

  it('a Hangul name keeps its format; a bare name takes the document format', () => {
    expect(saveAsTarget('C:/d/a.hwpx', 'hwp', true)).toEqual({
      path: 'C:/d/a.hwpx',
      kind: 'hwpx',
    })
    expect(saveAsTarget('C:/d/a', 'hwpx', true)).toEqual({ path: 'C:/d/a.hwpx', kind: 'hwpx' })
    expect(saveAsTarget('C:/d/a', 'hwp', true)).toEqual({ path: 'C:/d/a.hwp', kind: 'hwp' })
  })

  it('without PDF offered a .pdf name is saved as a Hangul document', () => {
    expect(saveAsTarget('C:/d/a.pdf', 'hwp', false)).toEqual({
      path: 'C:/d/a.pdf.hwp',
      kind: 'hwp',
    })
  })
})
