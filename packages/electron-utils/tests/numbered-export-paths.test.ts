import { describe, expect, it } from 'vitest'
import { numberedExportPaths } from '../src/numbered-export-paths'

describe('numberedExportPaths', () => {
  it('keeps the typed name for a single page', () => {
    expect(numberedExportPaths('C:\\docs\\report.png', 1)).toEqual(['C:\\docs\\report.png'])
  })

  it('numbers every page beside the typed name', () => {
    expect(numberedExportPaths('/home/a/report.png', 3)).toEqual([
      '/home/a/report-01.png',
      '/home/a/report-02.png',
      '/home/a/report-03.png',
    ])
  })

  it('widens the number so 100+ pages still sort in order', () => {
    const paths = numberedExportPaths('C:\\x\\deck.png', 120)
    expect(paths[0]).toBe('C:\\x\\deck-001.png')
    expect(paths[119]).toBe('C:\\x\\deck-120.png')
  })

  it('only treats a dot in the file name as the extension', () => {
    expect(numberedExportPaths('C:\\my.folder\\notes', 2)).toEqual([
      'C:\\my.folder\\notes-01',
      'C:\\my.folder\\notes-02',
    ])
    expect(numberedExportPaths('/a/.hidden', 2)).toEqual(['/a/.hidden-01', '/a/.hidden-02'])
  })

  it('returns nothing for zero pages', () => {
    expect(numberedExportPaths('/a/b.png', 0)).toEqual([])
  })
})
