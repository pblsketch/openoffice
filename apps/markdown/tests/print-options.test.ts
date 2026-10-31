import { describe, expect, it } from 'vitest'
import {
  MARKDOWN_PRINT_OPTIONS,
  normalizeMarkdownPrintOptions,
  parseMarkdownPageRange,
  printRangeLabel,
} from '../src/shared/print-options'

describe('the Markdown print options', () => {
  it('are the A4, 0.6 in page the PDF export already wrote', () => {
    expect(MARKDOWN_PRINT_OPTIONS).toEqual({
      pageSize: 'A4',
      marginIn: 0.6,
      landscape: false,
      printBackground: true,
    })
  })

  it('takes only the paper and orientation the dialog offers', () => {
    expect(normalizeMarkdownPrintOptions({ pageSize: 'Letter', landscape: true })).toEqual({
      pageSize: 'Letter',
      marginIn: 0.6,
      landscape: true,
      printBackground: true,
    })
    expect(normalizeMarkdownPrintOptions({ pageSize: 'B5', landscape: 'yes' })).toEqual(
      MARKDOWN_PRINT_OPTIONS,
    )
    expect(normalizeMarkdownPrintOptions(null)).toEqual(MARKDOWN_PRINT_OPTIONS)
  })
})

describe('the page range field', () => {
  it('takes one page or one range inside the document', () => {
    expect(parseMarkdownPageRange('3', 5)).toEqual({ from: 3, to: 3 })
    expect(parseMarkdownPageRange('2 - 4', 5)).toEqual({ from: 2, to: 4 })
    expect(parseMarkdownPageRange('1-5', 5)).toEqual({ from: 1, to: 5 })
  })

  it('treats an empty field as all pages', () => {
    expect(parseMarkdownPageRange('', 5)).toBeNull()
    expect(parseMarkdownPageRange('   ', 5)).toBeNull()
  })

  it('refuses what the document does not have', () => {
    for (const text of ['0', '6', '5-2', '2-6', 'abc', '1,2', '-3', '3-']) {
      expect(parseMarkdownPageRange(text, 5), text).toBeNull()
    }
  })

  it('reads back as the field wrote it', () => {
    expect(printRangeLabel({ from: 3, to: 3 })).toBe('3')
    expect(printRangeLabel({ from: 2, to: 4 })).toBe('2-4')
  })
})
