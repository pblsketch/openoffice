import { describe, expect, it } from 'vitest'
import * as engine from '../src/index'

describe('public entry', () => {
  it('exports the opening API', () => {
    for (const name of [
      'openEpub',
      'EPUB_ZIP_LIMITS',
      'resolveHref',
      'normalizeZipPath',
      'obfuscateFont',
      'deobfuscateFont',
      'fontObfuscationKey',
      'decodeEntryText',
      'encodeEntryText',
      'cssDeclaresVerticalWriting',
      'isVerticalWritingMode',
    ]) {
      expect(engine).toHaveProperty(name)
    }
  })
})
