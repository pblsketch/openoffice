/**
 * The recovery-copy tick's "nothing changed" check: two serializations of the
 * same document a tick apart differ only in their time stamps (zip entry
 * times, docx dcterms:modified, the ODT dc:date), and any change to what a
 * part holds still counts as a change.
 */
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { sameRecoveryCopy } from '../src/renderer/recovery-copy-compare'

function coreXml(modified: string, title = 'Plan'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${title}</dc:title>` +
    '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>' +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${modified}</dcterms:modified>` +
    '<cp:revision>2</cp:revision></cp:coreProperties>'
  )
}

async function docx(opts: {
  at: string
  modified?: string
  title?: string
  body?: string
  extra?: boolean
}): Promise<Uint8Array> {
  const date = new Date(opts.at)
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>', { date })
  zip.file('word/document.xml', `<w:document>${opts.body ?? 'body'}</w:document>`, { date })
  zip.file(
    'docProps/core.xml',
    coreXml(opts.modified ?? opts.at.replace(/\.\d+Z$/, 'Z'), opts.title),
    {
      date,
    },
  )
  if (opts.extra) zip.file('customXml/item1.xml', '<root/>', { date })
  // folders get the generation moment, like the engine's output
  for (const name of Object.keys(zip.files)) if (zip.files[name].dir) zip.files[name].date = date
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

describe('sameRecoveryCopy', () => {
  it('two serializations a tick apart are the same document', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    const b = await docx({ at: '2026-11-06T10:00:31.000Z' })
    expect(a).not.toEqual(b)
    expect(await sameRecoveryCopy(a, b)).toBe(true)
  })

  it('identical bytes are the same', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    expect(await sameRecoveryCopy(a, a.slice())).toBe(true)
  })

  it('a changed part is a change', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    const b = await docx({ at: '2026-11-06T10:00:31.000Z', body: 'edited' })
    expect(await sameRecoveryCopy(a, b)).toBe(false)
  })

  it('a changed property other than the stamp is a change', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    const b = await docx({ at: '2026-11-06T10:00:31.000Z', title: 'Renamed' })
    expect(await sameRecoveryCopy(a, b)).toBe(false)
  })

  it('an added or removed part is a change', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    const b = await docx({ at: '2026-11-06T10:00:01.000Z', extra: true })
    expect(await sameRecoveryCopy(a, b)).toBe(false)
    expect(await sameRecoveryCopy(b, a)).toBe(false)
  })

  it('an ODT meta.xml that differs only in dc:date is the same', async () => {
    const odt = async (at: string) => {
      const zip = new JSZip()
      const date = new Date(at)
      zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { date })
      zip.file('content.xml', '<office:document-content/>', { date })
      zip.file(
        'meta.xml',
        `<office:meta><dc:title>Plan</dc:title><dc:date>${at}</dc:date></office:meta>`,
        {
          date,
        },
      )
      return zip.generateAsync({ type: 'uint8array' })
    }
    expect(
      await sameRecoveryCopy(
        await odt('2026-11-06T10:00:01.000Z'),
        await odt('2026-11-06T10:00:31.000Z'),
      ),
    ).toBe(true)
  })

  it('bytes that are not a readable zip are never the same as something else', async () => {
    const a = await docx({ at: '2026-11-06T10:00:01.000Z' })
    expect(await sameRecoveryCopy(a, a.subarray(0, a.length - 10))).toBe(false)
    expect(await sameRecoveryCopy(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })
})
