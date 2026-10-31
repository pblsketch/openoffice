import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import init from '@rhwp/core'
import {
  ATTACHABLE_IMAGE_MAX_BYTES,
  ATTACHABLE_MAX_BYTES,
  attachableMaxBytes,
  parseFileToText,
  readZipTextParts,
} from '../src/index'
import { isTextPart } from '../src/zip-text-parts'
import {
  buildDocxFixture,
  buildPptxFixture,
  buildXlsxFixture,
  TINY_PNG_BASE64,
  writeFixture,
} from './helpers/fixtures'

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

/** every document past this is read for its text parts only */
const TEXT_PARTS_ONLY = { wholeZipMaxBytes: 0 }

describe('isTextPart', () => {
  it('keeps words and structure, drops pictures, media and fonts', () => {
    for (const name of [
      '[Content_Types].xml',
      'ppt/slides/_rels/slide1.xml.rels',
      'content.json',
      'Preview/PrvText.txt',
      'OEBPS/ch1.xhtml',
      'Contents/content.hpf',
      'mimetype',
    ]) {
      expect(isTextPart(name), name).toBe(true)
    }
    for (const name of [
      'ppt/media/image1.jpeg',
      'ppt/media/media1.mp4',
      'BinData/image1.PNG',
      'word/embeddings/oleObject1.bin',
      'OEBPS/fonts/a.otf',
    ]) {
      expect(isTextPart(name), name).toBe(false)
    }
  })
})

describe('readZipTextParts', () => {
  it('keeps every part by name and the content of text parts only', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/test', { compression: 'STORE' })
    zip.file('doc/content.xml', '<doc>안녕하세요</doc>'.repeat(100))
    zip.file('doc/media/photo.jpg', new Uint8Array(4 * 1024 * 1024).fill(7))
    const path = writeFixture(
      'mixed.zip',
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    )

    const slim = await readZipTextParts(path)
    expect(slim.byteLength).toBeLessThan(64 * 1024)
    const back = await JSZip.loadAsync(slim, { checkCRC32: true })
    expect(Object.keys(back.files).sort()).toEqual(
      ['doc/', 'doc/content.xml', 'doc/media/', 'doc/media/photo.jpg', 'mimetype'].filter(
        (name) => name in back.files,
      ),
    )
    expect(await back.file('mimetype')!.async('string')).toBe('application/test')
    expect(await back.file('doc/content.xml')!.async('string')).toBe(
      '<doc>안녕하세요</doc>'.repeat(100),
    )
    expect((await back.file('doc/media/photo.jpg')!.async('uint8array')).byteLength).toBe(0)
  })

  it('throws on a file that is not a zip', async () => {
    const path = writeFixture('not-a.zip', 'plain words, no archive here at all')
    await expect(readZipTextParts(path)).rejects.toThrow(/^zip:/)
  })
})

describe('parseFileToText: a large zip-based document reads its text parts', () => {
  const cases: [string, () => Promise<Uint8Array>][] = [
    ['deck.pptx', buildPptxFixture],
    ['report.docx', buildDocxFixture],
    ['book.xlsx', buildXlsxFixture],
  ]
  for (const [name, build] of cases) {
    it(`${name}: the same text as reading it whole`, async () => {
      const path = writeFixture(name, await build())
      const whole = await parseFileToText(path)
      const parts = await parseFileToText(path, TEXT_PARTS_ONLY)
      expect(whole.ok).toBe(true)
      expect(parts).toEqual(whole)
    })
  }

  it('a slide deck with a large picture', async () => {
    const zip = await JSZip.loadAsync(await buildPptxFixture())
    zip.file('ppt/media/huge.png', new Uint8Array(8 * 1024 * 1024).fill(1))
    zip.file('ppt/media/tiny.png', TINY_PNG_BASE64, { base64: true })
    const path = writeFixture('photos.pptx', await zip.generateAsync({ type: 'uint8array' }))
    const whole = await parseFileToText(path)
    const parts = await parseFileToText(path, TEXT_PARTS_ONLY)
    expect(parts).toEqual(whole)
  })

  it('an hwpx with a picture in its header', async () => {
    const fixture = fileURLToPath(
      new URL('../../../apps/hwp/tests/fixtures/header-picture-and-text.hwpx', import.meta.url),
    )
    const path = writeFixture('header-picture.hwpx', readFileSync(fixture))
    const whole = await parseFileToText(path)
    const parts = await parseFileToText(path, TEXT_PARTS_ONLY)
    expect(whole.ok).toBe(true)
    expect(parts).toEqual(whole)
  })
})

describe('attachableMaxBytes', () => {
  it('has no cap for formats whose size is pictures', () => {
    for (const ext of [
      'pptx',
      '.PPTX',
      'docx',
      'xlsx',
      'xlsm',
      'hwpx',
      'odt',
      'epub',
      'xmind',
      'pdf',
    ]) {
      expect(attachableMaxBytes(ext), ext).toBe(Number.POSITIVE_INFINITY)
    }
  })

  it('keeps the caps for pictures and formats read whole', () => {
    expect(attachableMaxBytes('png')).toBe(ATTACHABLE_IMAGE_MAX_BYTES)
    for (const ext of ['hwp', 'doc', 'ppt', 'xls', 'txt', 'md', 'csv']) {
      expect(attachableMaxBytes(ext), ext).toBe(ATTACHABLE_MAX_BYTES)
    }
  })
})
