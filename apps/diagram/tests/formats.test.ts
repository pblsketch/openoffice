// @vitest-environment node
// What a save writes: the serialization per format, compression that follows
// the opened file, Save As names, and no write when nothing changed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDiagramFile, openDiagram } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import {
  SAVE_AS_FORMATS,
  diagramBaseName,
  exportKindOf,
  formatForSavePath,
  isCompressedFile,
  safeFileNameBase,
  saveWrites,
  withFormatExtension,
} from '../src/shared/formats'
import { pageFilePaths } from '../src/main/export-paths'

const fixtures = join(__dirname, '../../../packages/drawio-model/tests/fixtures')
const open = (name: string) => {
  const result = openDiagram(name, readFileSync(join(fixtures, name)), nodePageCodec)
  if (!result.ok) throw new Error(result.message)
  return result.file
}

describe('format → draw.io serialization', () => {
  it('writes .drawio and .dio as XML, the picture formats with the diagram inside', () => {
    expect(exportKindOf('drawio')).toBe('xml')
    expect(exportKindOf('dio')).toBe('xml')
    expect(exportKindOf('drawio.svg')).toBe('xmlsvg')
    expect(exportKindOf('drawio.png')).toBe('xmlpng')
  })

  it('offers .drawio first, then .dio, .drawio.svg, .drawio.png', () => {
    expect(SAVE_AS_FORMATS).toEqual(['drawio', 'dio', 'drawio.svg', 'drawio.png'])
  })
})

describe('compression follows the opened file', () => {
  it('keeps an uncompressed file uncompressed and a compressed one compressed', () => {
    expect(isCompressedFile(open('out.drawio'))).toBe(false)
    // the probe's .drawio.svg holds a compressed page
    expect(isCompressedFile(open('out.drawio.svg'))).toBe(true)
    expect(isCompressedFile(open('sample.drawio'))).toBe(false)
  })

  it('treats mxfile compressed="true" as compressed even without a compressed page', () => {
    expect(
      isCompressedFile({
        xml: '<mxfile compressed="true"><diagram id="a"><mxGraphModel/></diagram></mxfile>',
        root: 'mxfile',
        pages: [{ id: 'a', name: 'A', compressed: false }],
      }),
    ).toBe(true)
  })

  it('starts a new diagram uncompressed', () => {
    expect(isCompressedFile(createDiagramFile())).toBe(false)
  })
})

describe('no rewrite when unchanged', () => {
  it('writes nothing for a clean diagram that has its file', () => {
    expect(saveWrites({ mode: 'save', dirty: false, hasPath: true })).toBe(false)
  })

  it('writes a changed diagram, an untitled one, and every Save As', () => {
    expect(saveWrites({ mode: 'save', dirty: true, hasPath: true })).toBe(true)
    expect(saveWrites({ mode: 'save', dirty: false, hasPath: false })).toBe(true)
    expect(saveWrites({ mode: 'saveAs', dirty: false, hasPath: true })).toBe(true)
  })
})

describe('save names', () => {
  it('decides the format by the chosen name, then by the picked filter', () => {
    expect(formatForSavePath('C:/a/b.drawio.svg')).toBe('drawio.svg')
    expect(formatForSavePath('C:/a/b.DRAWIO.PNG')).toBe('drawio.png')
    expect(formatForSavePath('C:/a/b.dio')).toBe('dio')
    expect(formatForSavePath('C:/a/b', 'drawio.png')).toBe('drawio.png')
    expect(formatForSavePath('C:/a/b')).toBe('drawio')
    // another program's file is never a save target
    expect(formatForSavePath('C:/a/b.vsdx')).toBe('drawio')
  })

  it('adds the ending, turning a plain picture name into the diagram picture name', () => {
    expect(withFormatExtension('C:/a/b', 'drawio')).toBe('C:/a/b.drawio')
    expect(withFormatExtension('C:/a/b.drawio', 'drawio')).toBe('C:/a/b.drawio')
    expect(withFormatExtension('C:/a/b.svg', 'drawio.svg')).toBe('C:/a/b.drawio.svg')
    expect(withFormatExtension('C:/a/b.png', 'drawio.png')).toBe('C:/a/b.drawio.png')
    expect(withFormatExtension('C:/a/b.drawio.png', 'drawio.png')).toBe('C:/a/b.drawio.png')
  })

  it('shows the name without the diagram ending', () => {
    expect(diagramBaseName('C:\\x\\flow.drawio.svg')).toBe('flow')
    expect(diagramBaseName('/x/flow.dio')).toBe('flow')
    expect(diagramBaseName('/x/plan.vsdx')).toBe('plan')
    expect(diagramBaseName(null)).toBe('')
  })

  it('makes a name safe for every file system', () => {
    expect(safeFileNameBase('a/b:c*?"<>|')).toBe('a_b_c______')
  })
})

describe('picture export file names (spec 5, 9.3)', () => {
  it('writes the one page picked (the page on screen, --page) to the chosen name', () => {
    expect(pageFilePaths(join('d', 'flow.png'), 'png', [3], false)).toEqual([join('d', 'flow.png')])
  })

  it('writes every page next to it as <name>-p<n>', () => {
    expect(pageFilePaths(join('d', 'flow.svg'), 'svg', [1, 2], true)).toEqual([
      join('d', 'flow-p1.svg'),
      join('d', 'flow-p2.svg'),
    ])
  })

  it('names the one page of a one-page diagram the same way when every page is asked for', () => {
    expect(pageFilePaths(join('d', 'flow.png'), 'png', [1], true)).toEqual([
      join('d', 'flow-p1.png'),
    ])
  })
})
