import { describe, expect, it } from 'vitest'
import { appForPath } from '../../src/main/app-routing'
import {
  capabilityReport,
  familyLabel,
  FORMAT_FAMILIES,
  formatFamily,
  withSaveExtension,
} from '../../src/main/mcp/tools/formats'

/**
 * The format registry is the MCP layer's single source of truth for what each
 * editor can open/save/export vs. what this server exposes. These tests pin the
 * matrix to the shell routing and the per-editor Save-As dialogs so a drift is
 * caught here rather than in a live session.
 */

describe('format registry', () => {
  it('mirrors the shell open routing for the mcp-driven families', () => {
    expect(formatFamily('docx').editorOpen).toEqual(['docx', 'odt'])
    expect(formatFamily('xlsx').editorOpen).toEqual(['xlsx', 'xlsm', 'xls', 'csv', 'tsv'])
    expect(formatFamily('pptx').editorOpen).toEqual(['pptx'])
  })

  it('opens every Word-family extension in the tab the shell routes it to', () => {
    for (const ext of formatFamily('docx').editorOpen) {
      expect(appForPath(`/x/a.${ext}`), `.${ext}`).toBe('docs')
    }
    // the Word editor's Save As writes both, but MCP saves stay docx for now
    expect(formatFamily('docx').editorSave).toEqual(['docx', 'odt'])
    expect(formatFamily('docx').mcp?.save).toEqual(['docx'])
  })

  it('keeps .tsv open-only: it converts on open and saves as .xlsx', () => {
    const sheet = formatFamily('xlsx')
    expect(sheet.editorOpen).toContain('tsv')
    expect(sheet.editorSave).not.toContain('tsv')
    expect(sheet.mcp?.save).not.toContain('tsv')
  })

  it('keeps the editor-only families (md/html/xmind) without an mcp block', () => {
    for (const family of ['md', 'html', 'xmind'] as const) {
      expect(formatFamily(family).mcp).toBeUndefined()
    }
    // the three edit-in-place families carry full mcp blocks; pdf and hwp are read-only
    expect(FORMAT_FAMILIES.filter((f) => f.mcp).map((f) => f.family)).toEqual([
      'docx',
      'xlsx',
      'pptx',
      'pdf',
      'hwp',
    ])
  })

  it('exposes hwp as read-only: the document is edited and saved in its editor', () => {
    expect(formatFamily('hwp').mcp).toEqual({ read: 'hwp' })
  })

  it('exposes pdf as read-only until MCP drives the editor', () => {
    const pdf = formatFamily('pdf')
    expect(pdf.mcp).toEqual({ read: 'pdf' })
    expect(pdf.mcp?.save).toBeUndefined()
    expect(pdf.mcp?.generate).toBeUndefined()
  })

  it('records the editor export capabilities even where mcp cannot reach them', () => {
    expect(formatFamily('docx').editorExport).toEqual(['pdf'])
    expect(formatFamily('md').editorExport).toEqual(['docx', 'odt', 'pdf'])
    expect(formatFamily('html').editorExport).toEqual(['docx', 'odt', 'pdf'])
    expect(formatFamily('pdf').editorExport).toEqual(['docx', 'xlsx', 'pptx'])
  })

  it('never advertises an mcp save format the editor cannot write', () => {
    for (const f of FORMAT_FAMILIES) {
      for (const ext of f.mcp?.save ?? []) {
        expect(f.editorSave).toContain(ext)
      }
    }
  })

  it('registers the mind map family: xmind opens and saves as xmind', () => {
    const map = formatFamily('xmind')
    expect(map.label).toBe('mind map')
    expect(map.editorOpen).toEqual(['xmind'])
    expect(map.editorSave).toEqual(['xmind'])
    expect(map.editorExport).toEqual(['png', 'pdf', 'md'])
    // no session, generator or file reader: maps are reached through open_documents
    expect(map.mcp).toBeUndefined()
  })

  it('reports labels for guided errors', () => {
    expect(familyLabel('docx')).toBe('Word document')
    expect(familyLabel('xlsx')).toBe('spreadsheet')
    expect(familyLabel('pptx')).toBe('presentation')
    expect(() => familyLabel('nope' as never)).toThrow(/unknown format family/)
  })
})

describe('withSaveExtension', () => {
  it('keeps a correct family extension, case-insensitively', () => {
    expect(withSaveExtension('docx', 'C:/x/Report.DOCX')).toBe('C:/x/Report.DOCX')
    expect(withSaveExtension('xlsx', '/tmp/books.xlsx')).toBe('/tmp/books.xlsx')
    expect(withSaveExtension('pptx', '/tmp/deck.pptx')).toBe('/tmp/deck.pptx')
  })

  it('appends the family extension when the path has none', () => {
    expect(withSaveExtension('docx', '/tmp/report')).toBe('/tmp/report.docx')
    expect(withSaveExtension('xlsx', '/tmp/books')).toBe('/tmp/books.xlsx')
    expect(withSaveExtension('pptx', '/tmp/deck')).toBe('/tmp/deck.pptx')
  })

  it('rejects a mismatched extension rather than silently rewriting it', () => {
    expect(() => withSaveExtension('xlsx', '/tmp/report.docx')).toThrow(
      /spreadsheet session must be saved as \.xlsx \(got "\.docx"\)/,
    )
    expect(() => withSaveExtension('pptx', '/tmp/deck.pdf')).toThrow(/must be saved as \.pptx/)
  })

  it('refuses a dialog-free format change to .odt and points at the CLI conversion', () => {
    expect(() => withSaveExtension('docx', '/tmp/report.odt')).toThrow(
      /must be saved as \.docx \(got "\.odt"\); save as \.docx, then convert it with `ieumoffice convert <file> --to odt`/,
    )
  })
})

describe('capabilityReport', () => {
  it('exposes editor truth alongside the mcp subset for every family', () => {
    const report = capabilityReport()
    expect(report.map((r) => r.family)).toEqual([
      'docx',
      'xlsx',
      'pptx',
      'md',
      'html',
      'pdf',
      'xmind',
      'hwp',
      'excalidraw',
    ])
    const docx = report.find((r) => r.family === 'docx')!
    expect(docx.editor.open).toEqual(['docx', 'odt'])
    expect(docx.editor.export).toEqual(['pdf'])
    expect(docx.mcp).toEqual({ generate: 'docx', save: ['docx'], read: 'docx' })
    // editor-only family carries no mcp key
    expect(report.find((r) => r.family === 'md')!.mcp).toBeUndefined()
    // pdf is the read-only family
    expect(report.find((r) => r.family === 'pdf')!.mcp).toEqual({ read: 'pdf' })
    // the mind map entry carries its editor formats and no mcp key
    expect(report.find((r) => r.family === 'xmind')).toEqual({
      family: 'xmind',
      label: 'mind map',
      editor: { open: ['xmind'], save: ['xmind'], export: ['png', 'pdf', 'md'] },
    })
  })
})
