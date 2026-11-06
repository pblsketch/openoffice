import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { pptxToText } from '../src/pptx'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const P188 = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main'
const MODERN_COMMENTS_REL = 'http://schemas.microsoft.com/office/2018/10/relationships/comments'

function slideXml(text: string): string {
  return (
    `<p:sld xmlns:p="${P}" xmlns:a="${A}">` +
    `<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>` +
    `</p:sld>`
  )
}

function modernCommentsXml(): string {
  return (
    `<p188:cmLst xmlns:p188="${P188}" xmlns:a="${A}">` +
    `<p188:cm id="{62A8A96D-E5A8-4BFC-B993-A6EAE3907CAD}" authorId="{CD37207E-7903-4ED4-8AE8-017538D2DF7E}" created="2024-12-30T20:26:06.503">` +
    `<p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Needs more cowbell</a:t></a:r></a:p></p188:txBody>` +
    `<p188:replyLst>` +
    `<p188:reply id="{11111111-1111-1111-1111-111111111111}" authorId="{AAAAAAA1-AAAA-AAAA-AAAA-AAAAAAAAAAA1}" created="2024-12-30T21:00:00.000">` +
    `<p188:txBody><a:bodyPr/><a:p><a:r><a:t>And a second verse</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>with two lines</a:t></a:r></a:p></p188:txBody>` +
    `</p188:reply>` +
    `</p188:replyLst>` +
    `</p188:cm>` +
    `</p188:cmLst>`
  )
}

function authorsXml(): string {
  return (
    `<p188:authorLst xmlns:p188="${P188}">` +
    `<p188:author id="{CD37207E-7903-4ED4-8AE8-017538D2DF7E}" name="Alice"/>` +
    `<p188:author id="{AAAAAAA1-AAAA-AAAA-AAAA-AAAAAAAAAAA1}" name="Bob"/>` +
    `</p188:authorLst>`
  )
}

async function deckWithModernComments(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Target="slides/slide1.xml" Type="${R}/slide"/>` +
      `</Relationships>`,
  )
  zip.file('ppt/slides/slide1.xml', slideXml('Product intro'))
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId3" Target="../comments/comment1.xml" Type="${MODERN_COMMENTS_REL}"/>` +
      `</Relationships>`,
  )
  zip.file('ppt/comments/comment1.xml', modernCommentsXml())
  zip.file('ppt/authors.xml', authorsXml())
  return zip.generateAsync({ type: 'uint8array' })
}

describe('pptx modern comments', () => {
  it('extracts Office 365 comment threads and replies that use txBody instead of p:text', async () => {
    const text = await pptxToText(await deckWithModernComments())
    expect(text).toContain('## Slide 1\nProduct intro\n### Comments')
    expect(text).toContain('- Alice (2024-12-30T20:26:06.503): Needs more cowbell')
    expect(text).toContain('- Bob (2024-12-30T21:00:00.000): And a second verse\nwith two lines')
  })

  it('counts a modern comment as text on a picture-only slide', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:p="${P}"><p:cSld><p:spTree><p:pic/></p:spTree></p:cSld></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<Relationships xmlns="${PKG}">` +
        `<Relationship Id="rId3" Target="../comments/comment1.xml" Type="${MODERN_COMMENTS_REL}"/>` +
        `</Relationships>`,
    )
    zip.file(
      'ppt/comments/comment1.xml',
      `<p188:cmLst xmlns:p188="${P188}" xmlns:a="${A}">` +
        `<p188:cm authorId="missing" created="2024-01-01T00:00:00Z">` +
        `<p188:txBody><a:p><a:r><a:t>Check the chart</a:t></a:r></a:p></p188:txBody>` +
        `</p188:cm></p188:cmLst>`,
    )
    const text = await pptxToText(await zip.generateAsync({ type: 'uint8array' }))
    expect(text).toBe(
      '## Slide 1\n[picture-only slide: 1 image, no extractable text]\n### Comments\n- Unknown author (2024-01-01T00:00:00Z): Check the chart',
    )
    expect(text).not.toContain('No extractable text')
  })
})
