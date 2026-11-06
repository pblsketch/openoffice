/**
 * Bridge core.xml timestamps must be true UTC. ODF meta dates often carry an
 * offset; stripping it and appending Z rewrote the wall clock as if it were UTC.
 */
import { describe, expect, it } from 'vitest'
import { coreXmlFor } from '../src/assemble/meta'
import type { OdtDocument } from '../src/core/open'

function coreFor(metaInner: string): string {
  const metaXml =
    '<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<office:meta><meta:initial-creator>A</meta:initial-creator>${metaInner}</office:meta></office:document-meta>`
  const xml = coreXmlFor({ metaXml } as OdtDocument, { creator: 'A', lastModifiedBy: null })
  if (xml === null) throw new Error('expected core.xml')
  return xml
}

describe('coreXmlFor timestamps', () => {
  it('converts an offset timestamp to true UTC', () => {
    const xml = coreFor('<meta:creation-date>2026-01-01T10:00:00+09:00</meta:creation-date>')
    expect(xml).toContain(
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T01:00:00Z</dcterms:created>',
    )
  })

  it('keeps an already-UTC Z timestamp', () => {
    const xml = coreFor('<meta:creation-date>2026-01-01T10:00:00Z</meta:creation-date>')
    expect(xml).toContain('>2026-01-01T10:00:00Z</dcterms:created>')
  })

  it('treats an offset-less timestamp as UTC wall-clock digits', () => {
    const xml = coreFor('<meta:creation-date>2026-01-01T10:00:00</meta:creation-date>')
    expect(xml).toContain('>2026-01-01T10:00:00Z</dcterms:created>')
  })

  it('converts a negative offset and a modified date the same way', () => {
    const xml = coreFor(
      '<meta:creation-date>2026-01-01T10:00:00-05:00</meta:creation-date>' +
        '<dc:date>2026-06-15T12:30:00+09:00</dc:date>',
    )
    expect(xml).toContain('>2026-01-01T15:00:00Z</dcterms:created>')
    expect(xml).toContain('>2026-06-15T03:30:00Z</dcterms:modified>')
  })
})
