/**
 * PDF Save As lists every conversion after the PDF itself, suggests a name
 * without an extension, and routes the picked name by its extension.
 */
import { describe, expect, it } from 'vitest'
import { numberedExportPaths } from '@genoffice/electron-utils/numbered-export-paths'
import {
  pdfSaveAsDefaultPath,
  pdfSaveAsFilters,
  pdfSaveAsFormatOf,
  pdfSaveAsPickedPath,
} from '../src/main/pdf-save-as-formats'

describe('PDF Save As file types', () => {
  it('lists the PDF first, then every conversion, with translated names', () => {
    const filters = pdfSaveAsFilters((key) => `<${key}>`)
    expect(filters).toEqual([
      { name: '<filterPdf>', extensions: ['pdf'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: '<filterWord>', extensions: ['docx'] },
      { name: '<filterPpt>', extensions: ['pptx'] },
      { name: '<filterExcel>', extensions: ['xlsx'] },
      { name: '<filterEpub>', extensions: ['epub'] },
      { name: '<filterPdfPageImages>', extensions: ['png'] },
    ])
  })

  it('suggests the name without its extension', () => {
    expect(pdfSaveAsDefaultPath('C:\\docs\\report.pdf')).toBe('C:\\docs\\report')
    expect(pdfSaveAsDefaultPath('/home/a/Report.PDF')).toBe('/home/a/Report')
  })

  it('gives a bare name the PDF extension and keeps a typed one', () => {
    expect(pdfSaveAsPickedPath('C:\\docs\\copy')).toBe('C:\\docs\\copy.pdf')
    expect(pdfSaveAsPickedPath('/home/a.b/copy')).toBe('/home/a.b/copy.pdf')
    expect(pdfSaveAsPickedPath('C:\\docs\\copy.docx')).toBe('C:\\docs\\copy.docx')
    // a leading dot is a hidden file name, not an extension
    expect(pdfSaveAsPickedPath('/home/a/.copy')).toBe('/home/a/.copy.pdf')
  })

  it('routes each picked extension to its conversion', () => {
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.pdf')).toBe('pdf')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.md')).toBe('md')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.DOCX')).toBe('docx')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.pptx')).toBe('pptx')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.xlsx')).toBe('xlsx')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.epub')).toBe('epub')
    expect(pdfSaveAsFormatOf('C:\\docs\\scan.png')).toBe('png')
  })

  it('keeps any other name a plain PDF copy', () => {
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.txt')).toBe('pdf')
    expect(pdfSaveAsFormatOf('C:\\docs\\copy.jpg')).toBe('pdf')
    expect(pdfSaveAsFormatOf('C:\\docs.md\\copy')).toBe('pdf')
  })

  it('numbers page images beside the one typed name', () => {
    expect(numberedExportPaths('C:\\docs\\scan.png', 1)).toEqual(['C:\\docs\\scan.png'])
    expect(numberedExportPaths('C:\\docs\\scan.png', 3)).toEqual([
      'C:\\docs\\scan-01.png',
      'C:\\docs\\scan-02.png',
      'C:\\docs\\scan-03.png',
    ])
  })
})
