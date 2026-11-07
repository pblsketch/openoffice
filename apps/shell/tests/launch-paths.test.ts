import { describe, expect, it } from 'vitest'

import { LAUNCHABLE_EXTS, collectLaunchPaths } from '../src/main/launch-paths'

describe('collectLaunchPaths', () => {
  it('collects supported argv files in order and removes duplicates', () => {
    expect(
      collectLaunchPaths(
        ['GenOffice.exe', 'first.docx', 'notes.rtf', 'second.xlsx', 'first.docx'],
        undefined,
        () => true,
      ),
    ).toEqual(['first.docx', 'second.xlsx'])
  })

  it('accepts an .odt from argv or the second-instance payload', () => {
    expect(
      collectLaunchPaths(['IeumOffice.exe', 'C:/a/report.odt'], undefined, () => true),
    ).toEqual(['C:/a/report.odt'])
    expect(
      collectLaunchPaths(['IeumOffice.exe'], { launchPaths: ['/a/REPORT.ODT'] }, () => true),
    ).toEqual(['/a/REPORT.ODT'])
    // an .odt next to an unsupported file is opened, not the fallback
    expect(collectLaunchPaths(['IeumOffice.exe', 'x.rtf', 'y.odt'], undefined, () => true)).toEqual(
      ['y.odt'],
    )
  })

  it('accepts a .tsv from argv or the second-instance payload', () => {
    expect(
      collectLaunchPaths(['GenOffice.app', '/data/variants.tsv'], undefined, () => true),
    ).toEqual(['/data/variants.tsv'])
  })

  /**
   * A `.txt` or `.json` is now a document the text app opens, so dropping one
   * from argv (or from a second-instance payload, or from a Finder open-file)
   * left the shell at Home with no explanation — the file had been accepted as
   * a path and then thrown away before it ever reached the open route.
   */
  it('accepts the text app extensions from argv', () => {
    expect(collectLaunchPaths(['GenOffice.app', '/notes.txt'], undefined, () => true)).toEqual([
      '/notes.txt',
    ])
    expect(collectLaunchPaths(['GenOffice.app', '/data.json'], undefined, () => true)).toEqual([
      '/data.json',
    ])
    expect(collectLaunchPaths(['GenOffice.app', '/NOTES.TXT'], undefined, () => true)).toEqual([
      '/NOTES.TXT',
    ])
    expect(collectLaunchPaths(['GenOffice.app', '/data.json.md'], undefined, () => true)).toEqual([
      '/data.json.md',
    ])
  })

  it('accepts the text app extensions from the second-instance payload', () => {
    expect(
      collectLaunchPaths(['GenOffice.exe'], { launchPaths: ['/notes.txt'] }, () => true),
    ).toEqual(['/notes.txt'])
  })

  it('accepts a mind map file from argv and from the second-instance payload', () => {
    expect(
      collectLaunchPaths(['GenOffice.exe', 'C:\\maps\\plan.xmind'], undefined, () => true),
    ).toEqual(['C:\\maps\\plan.xmind'])
    expect(collectLaunchPaths(['GenOffice.exe', '/PLAN.XMIND'], undefined, () => true)).toEqual([
      '/PLAN.XMIND',
    ])
    expect(
      collectLaunchPaths(['GenOffice.exe'], { launchPaths: ['/maps/plan.xmind'] }, () => true),
    ).toEqual(['/maps/plan.xmind'])
    // a path that is not on disk is not opened
    expect(collectLaunchPaths(['GenOffice.exe', '/plan.xmind'], undefined, () => false)).toEqual([])
  })

  it('accepts a book from argv and from the second-instance payload', () => {
    expect(
      collectLaunchPaths(['GenOffice.exe', 'C:\\books\\novel.epub'], undefined, () => true),
    ).toEqual(['C:\\books\\novel.epub'])
    expect(
      collectLaunchPaths(['GenOffice.exe'], { launchPaths: ['/books/NOVEL.EPUB'] }, () => true),
    ).toEqual(['/books/NOVEL.EPUB'])
    expect(collectLaunchPaths(['GenOffice.exe', '/novel.epub'], undefined, () => false)).toEqual([])
  })

  it('accepts diagrams, draw.io pictures and Visio drawings, not plain pictures', () => {
    const argv = [
      'GenOffice.exe',
      'C:\\maps\\flow.drawio',
      '/maps/flow.dio',
      '/maps/flow.drawio.svg',
      '/maps/FLOW.DRAWIO.PNG',
      '/maps/plan.vsdx',
      '/maps/photo.png',
    ]
    expect(collectLaunchPaths(argv, undefined, () => true)).toEqual(argv.slice(1, 6))
    expect(
      collectLaunchPaths(['GenOffice.exe'], { launchPaths: ['/maps/flow.drawio'] }, () => true),
    ).toEqual(['/maps/flow.drawio'])
  })

  it('accepts a FreeMind / Freeplane map, which no file association claims', () => {
    const argv = ['GenOffice.exe', 'C:\\maps\\plan.mm', '/maps/PLAN.MM', '/maps/plan.mmap']
    expect(collectLaunchPaths(argv, undefined, () => true)).toEqual(argv.slice(1, 3))
    expect(LAUNCHABLE_EXTS).not.toContain('mm')
  })

  it('still drops a path nothing opens', () => {
    // a file that exists but is not a document the shell can route
    expect(collectLaunchPaths(['GenOffice.app', '/photo.png'], undefined, () => true)).toEqual([])
    expect(collectLaunchPaths(['GenOffice.app', '/notes.txt'], undefined, () => false)).toEqual([])
  })

  it('collects argv and second-instance payload files without duplicates', () => {
    expect(
      collectLaunchPaths(
        ['GenOffice.exe', 'first.docx', 'second.pptx'],
        {
          launchPaths: ['first.docx', 'third.pdf', 42, ''],
          launchPath: 'legacy.md',
        },
        () => true,
      ),
    ).toEqual(['first.docx', 'second.pptx', 'third.pdf', 'legacy.md'])
  })

  it('accepts a legacy launchPath payload', () => {
    expect(
      collectLaunchPaths(['GenOffice.exe'], { launchPath: 'legacy.docx' }, () => true),
    ).toEqual(['legacy.docx'])
  })

  it('falls back to the first existing unsupported argv file', () => {
    expect(
      collectLaunchPaths(
        ['GenOffice.exe', 'missing.doc', 'legacy.rtf'],
        undefined,
        (path) => path === 'legacy.rtf',
      ),
    ).toEqual(['legacy.rtf'])
  })
})
