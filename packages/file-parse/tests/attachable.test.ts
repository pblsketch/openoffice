import { describe, expect, it } from 'vitest'
import {
  ATTACHABLE_EXTS,
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_IMAGE_MAX_BYTES,
  ATTACHABLE_MAX_BYTES,
  isAttachableExt,
} from '../src'

// The attachable set exactly as docs-main held it before the list moved here:
// plain-text extensions, the office/PDF formats, and the image set, plus the
// formats added since by decision (`epub`, spec §10 of the EPUB editor plan).
// Frozen on purpose — the list only widens, and every editor shares it.
const DOCS_MAIN_EXTS = [
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'log',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'go',
  'rs',
  'rb',
  'sh',
  'sql',
  'css',
  'doc',
  'docx',
  'odt',
  'pdf',
  'pptx',
  'ppt',
  'xlsx',
  'xlsm',
  'xls',
  'xmind',
  'hwp',
  'hwpx',
  'epub',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
]

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

describe('the one shared attachable-format list', () => {
  it('is exactly the set docs-main accepted before the move, plus the decided additions', () => {
    expect([...ATTACHABLE_EXTS].sort()).toEqual([...DOCS_MAIN_EXTS].sort())
    expect(ATTACHABLE_EXTS.size).toBe(DOCS_MAIN_EXTS.length)
  })

  it('carries the image set and the two size caps for every editor', () => {
    expect([...ATTACHABLE_IMAGE_EXTS].sort()).toEqual([...IMAGE_EXTS].sort())
    expect(ATTACHABLE_MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(ATTACHABLE_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
  })

  it('tells an attachable extension, including the human-decided additions', () => {
    expect(isAttachableExt('odt')).toBe(true)
    expect(isAttachableExt('xmind')).toBe(true)
    expect(isAttachableExt('hwp')).toBe(true)
    expect(isAttachableExt('hwpx')).toBe(true)
    expect(isAttachableExt('epub')).toBe(true)
    expect(isAttachableExt('exe')).toBe(false)
  })
})
