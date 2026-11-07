import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { docxToText } from '../src/docx'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

async function docx(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  )
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml)
  return zip.generateAsync({ type: 'uint8array' })
}

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`

describe('docxToText headers, footers and comments', () => {
  it('includes header, footer and comment text that lives outside the body', async () => {
    const bytes = await docx({
      'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>${p('body')}</w:body></w:document>`,
      'word/_rels/document.xml.rels':
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${RELS}/header" Target="header1.xml"/>` +
        `<Relationship Id="rId2" Type="${RELS}/footer" Target="footer1.xml"/>` +
        `<Relationship Id="rId3" Type="${RELS}/comments" Target="comments.xml"/>` +
        `</Relationships>`,
      'word/header1.xml': `<?xml version="1.0"?><w:hdr ${W}>${p('Confidential memo')}</w:hdr>`,
      'word/footer1.xml': `<?xml version="1.0"?><w:ftr ${W}>${p('Page footer note')}</w:ftr>`,
      'word/comments.xml': `<?xml version="1.0"?><w:comments ${W}><w:comment w:id="0">${p('Please verify the date')}</w:comment></w:comments>`,
    })
    const text = await docxToText(bytes)
    expect(text).toContain('body')
    expect(text).toContain('Confidential memo')
    expect(text).toContain('Page footer note')
    expect(text).toContain('Please verify the date')
  })
})
