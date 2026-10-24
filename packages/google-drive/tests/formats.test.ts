import { describe, expect, it } from 'vitest'
import { localFileName, officeCopyName, openPlan, uploadMime } from '../src/formats'

describe('openPlan', () => {
  it('exports Google documents to Office', () => {
    expect(openPlan({ name: '회의록', mimeType: 'application/vnd.google-apps.document' })).toEqual({
      kind: 'export',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
    })
    expect(
      openPlan({ name: 'x', mimeType: 'application/vnd.google-apps.spreadsheet' }),
    ).toMatchObject({ kind: 'export', extension: '.xlsx' })
  })

  it('downloads files an editor opens, by extension', () => {
    expect(openPlan({ name: 'a.PDF', mimeType: 'application/pdf' })).toEqual({
      kind: 'download',
      extension: '.pdf',
    })
    expect(openPlan({ name: '보고서.hwpx', mimeType: 'application/octet-stream' })).toEqual({
      kind: 'download',
      extension: '.hwpx',
    })
    expect(openPlan({ name: 'novel.epub', mimeType: 'application/epub+zip' })).toEqual({
      kind: 'download',
      extension: '.epub',
    })
  })

  it('opens nothing else', () => {
    expect(openPlan({ name: 'f', mimeType: 'application/vnd.google-apps.folder' }).kind).toBe(
      'none',
    )
    expect(openPlan({ name: 'form', mimeType: 'application/vnd.google-apps.form' }).kind).toBe(
      'none',
    )
    expect(openPlan({ name: 'movie.mp4', mimeType: 'video/mp4' }).kind).toBe('none')
  })
})

describe('localFileName', () => {
  it('keeps a Drive name that Windows accepts', () => {
    expect(localFileName('보고서.docx', '.docx')).toBe('보고서.docx')
  })

  it('adds the real extension to an exported Google document', () => {
    expect(localFileName('회의록', '.docx')).toBe('회의록.docx')
  })

  it('replaces characters and names Windows refuses', () => {
    expect(localFileName('a/b:c?.pdf', '.pdf')).toBe('a_b_c_.pdf')
    expect(localFileName('CON', '.docx')).toBe('_CON.docx')
    expect(localFileName('trailing. ', '.md')).toBe('trailing.md')
    expect(localFileName('', '.md')).toBe('document.md')
  })
})

describe('officeCopyName', () => {
  it('adds the Office extension once', () => {
    expect(officeCopyName('회의록', '.docx')).toBe('회의록.docx')
    expect(officeCopyName('plan.xlsx', '.xlsx')).toBe('plan.xlsx')
  })
})

describe('uploadMime', () => {
  it('names Office types and falls back to octet-stream', () => {
    expect(uploadMime('a.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
    expect(uploadMime('a.hwp')).toBe('application/octet-stream')
  })
})
