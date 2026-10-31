/**
 * Highlight / letter spacing write-back on the in-place run patch, and the Selection
 * Pane edits on an element's own <p:cNvPr> (hidden, name).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseSlide } from '../src/parse'
import {
  materializeSlide,
  openPptx,
  patchSlideXml,
  patchTextElementXml,
  savePptx,
  setElementFont,
  setElementHidden,
  setElementName,
} from '../src/index'
import type { TextElement } from '../src/types'

const slideWith = (sp: string) =>
  '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld>' +
  `<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${sp}</p:spTree></p:cSld></p:sld>`
const spWith = (runs: string) =>
  '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>' +
  `<p:txBody><a:bodyPr/><a:p>${runs}</a:p></p:txBody></p:sp>`

const parseEl = (runs: string) => {
  const slide = parseSlide({
    path: 'ppt/slides/slide1.xml',
    slideXml: slideWith(spWith(runs)),
    ctx: {},
  })
  return { slide, el: slide.elements[0] as TextElement }
}

const fx = (name: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)))

describe('highlight and letter spacing on the in-place patch', () => {
  it('writes a highlight after the fill and before the font slots', () => {
    const { slide, el } = parseEl(
      '<a:r><a:rPr sz="1800"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>x</a:t></a:r>',
    )
    setElementFont(slide, el.id, { highlight: '#FFFF00' })
    const out = patchTextElementXml(el, el.anchor.originalXml)
    expect(out).toContain(
      '<a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:highlight><a:srgbClr val="FFFF00"/></a:highlight><a:latin typeface="Arial"/>',
    )
  })

  it('expands a self-closing rPr and removes the highlight again', () => {
    const { slide, el } = parseEl('<a:r><a:rPr sz="1800"/><a:t>x</a:t></a:r>')
    setElementFont(slide, el.id, { highlight: '#00FF00' })
    expect(patchTextElementXml(el, el.anchor.originalXml)).toContain(
      '<a:rPr sz="1800"><a:highlight><a:srgbClr val="00FF00"/></a:highlight></a:rPr>',
    )
    const { slide: s2, el: e2 } = parseEl(
      '<a:r><a:rPr><a:highlight><a:srgbClr val="FFFF00"/></a:highlight></a:rPr><a:t>x</a:t></a:r>',
    )
    setElementFont(s2, e2.id, { highlight: null })
    expect(patchTextElementXml(e2, e2.anchor.originalXml)).not.toContain('a:highlight')
  })

  it('keeps an untouched scheme-colored highlight byte for byte', () => {
    const { slide, el } = parseEl(
      '<a:r><a:rPr><a:highlight><a:schemeClr val="accent2"/></a:highlight></a:rPr><a:t>x</a:t></a:r>',
    )
    setElementFont(slide, el.id, { bold: true })
    expect(patchTextElementXml(el, el.anchor.originalXml)).toContain(
      '<a:highlight><a:schemeClr val="accent2"/></a:highlight>',
    )
  })

  it('writes, replaces and drops spc', () => {
    const { slide, el } = parseEl('<a:r><a:rPr sz="1800"/><a:t>x</a:t></a:r>')
    setElementFont(slide, el.id, { letterSpacingPt: 3 })
    expect(patchTextElementXml(el, el.anchor.originalXml)).toContain('spc="300"')
    const { slide: s2, el: e2 } = parseEl('<a:r><a:rPr spc="-150"/><a:t>x</a:t></a:r>')
    expect(e2.text!.paragraphs[0]!.runs[0]!.letterSpacing).toBe(-1.5)
    setElementFont(s2, e2.id, { letterSpacingPt: 0 })
    expect(patchTextElementXml(e2, e2.anchor.originalXml)).not.toContain('spc=')
  })

  it('leaves spc alone when spacing was not edited', () => {
    const { slide, el } = parseEl('<a:r><a:rPr spc="1234"/><a:t>x</a:t></a:r>')
    setElementFont(slide, el.id, { italic: true })
    expect(patchTextElementXml(el, el.anchor.originalXml)).toContain('spc="1234"')
  })

  it('injects a highlight into a run that had no rPr', () => {
    const { slide, el } = parseEl('<a:r><a:t>x</a:t></a:r>')
    setElementFont(slide, el.id, { highlight: '#ABCDEF' })
    expect(patchTextElementXml(el, el.anchor.originalXml)).toContain(
      '<a:highlight><a:srgbClr val="ABCDEF"/></a:highlight>',
    )
  })
})

describe('Selection Pane edits on <p:cNvPr>', () => {
  it('hides an element, reparses it as a silent passthrough and shows it again', async () => {
    const opened = await openPptx(fx('01_standard_business.pptx'))
    const visible = (e: { type: string }) => e.type === 'shape' || e.type === 'text'
    const index = opened.deck.slides.findIndex((s) => s.elements.some(visible))
    const slide = opened.deck.slides[index]!
    const pos = slide.elements.findIndex(visible)
    const type = slide.elements[pos]!.type
    const others = slide.elements.filter((_, i) => i !== pos).map((e) => e.anchor.originalXml)

    expect(setElementHidden(slide, slide.elements[pos]!.id, true)).toBe(true)
    expect(slide.elements[pos]!.anchor.originalXml).toMatch(/<p:cNvPr\b[^>]*\shidden="1"/)
    const hiddenSlide = materializeSlide(opened, index)!
    const hidden = hiddenSlide.elements[pos]!
    expect(hidden.type).toBe('passthrough')
    expect((hidden as { noChip?: boolean }).noChip).toBe(true)
    // every other element keeps its bytes
    expect(
      hiddenSlide.elements.filter((_, i) => i !== pos).map((e) => e.anchor.originalXml),
    ).toEqual(others)

    expect(setElementHidden(hiddenSlide, hidden.id, false)).toBe(true)
    const shown = materializeSlide(opened, index)!.elements[pos]!
    expect(shown.type).toBe(type)
    expect(shown.anchor.originalXml).not.toMatch(/\shidden="/)
  })

  it('renames an element and saves the new name', async () => {
    const opened = await openPptx(fx('01_standard_business.pptx'))
    const slide = opened.deck.slides[0]!
    const el = slide.elements.find((e) => e.anchor?.originalXml)!
    expect(setElementName(slide, el.id, 'Logo & "mark"')).toBe(true)
    expect(el.name).toBe('Logo & "mark"')
    expect(patchSlideXml(slide)).toContain('name="Logo &amp; &quot;mark&quot;"')
    const zip = await JSZip.loadAsync(await savePptx(opened))
    const xml = await zip.file(slide.path)!.async('string')
    expect(xml).toContain('name="Logo &amp; &quot;mark&quot;"')
  })

  it('is a no-op on bytes when nothing changes', async () => {
    const opened = await openPptx(fx('01_standard_business.pptx'))
    const slide = opened.deck.slides[0]!
    const el = slide.elements.find((e) => e.anchor?.originalXml)!
    expect(setElementHidden(slide, el.id, false)).toBe(true)
    expect(slide.structureDirty).toBeFalsy()
  })
})
