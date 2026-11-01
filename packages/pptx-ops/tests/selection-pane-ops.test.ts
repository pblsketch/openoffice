/**
 * Selection Pane ops (setElementHidden / renameElement) and the editor's highlight /
 * letter-spacing round trip through setText and setFont.
 */
import { describe, it, expect } from 'vitest'
import { createBlankPptx, openPptx, patchSlideXml, type Paragraph } from '@genoffice/pptx-engine'
import { runTxn } from '../src/ops/executor'
import { applyEditParagraphs } from '../src/edit-text'
import '../src/ops/index'

async function deckWithBox() {
  const opened = await openPptx(await createBlankPptx())
  const r = runTxn(opened, {
    ops: [
      {
        op: 'addElement',
        target: { slide: 0 },
        kind: 'textbox',
        offset: { x: 914400, y: 914400, cx: 1828800, cy: 914400 },
        paragraphs: [{ runs: [{ text: 'Box' }] }],
      },
    ],
  })
  const id = r.records![0]!.created![0]!
  return { opened, id }
}

describe('setElementHidden / renameElement', () => {
  it('hides an element, then shows it again by its durable id', async () => {
    const { opened, id } = await deckWithBox()
    const count = opened.deck.slides[0]!.elements.length
    const hide = runTxn(opened, {
      ops: [{ op: 'setElementHidden', target: { slide: 0, el: id }, hidden: true }],
    })
    expect(hide.applied).toBe(true)
    const slide = opened.deck.slides[0]!
    expect(slide.elements).toHaveLength(count)
    expect(patchSlideXml(slide)).toMatch(/<p:cNvPr\b[^>]*\shidden="1"/)
    const hidden = slide.elements.find((e) => e.type === 'passthrough')!
    expect(hidden).toBeTruthy()
    const show = runTxn(opened, {
      ops: [{ op: 'setElementHidden', target: { slide: 0, el: hidden.id }, hidden: false }],
    })
    expect(show.applied).toBe(true)
    expect(opened.deck.slides[0]!.elements.some((e) => e.type === 'passthrough')).toBe(false)
  })

  it('renames an element', async () => {
    const { opened, id } = await deckWithBox()
    const r = runTxn(opened, {
      ops: [{ op: 'renameElement', target: { slide: 0, el: id }, name: 'Title box' }],
    })
    expect(r.applied).toBe(true)
    expect(patchSlideXml(opened.deck.slides[0]!)).toContain('name="Title box"')
  })

  it('rejects a missing flag or an empty name with guidance', async () => {
    const { opened, id } = await deckWithBox()
    const a = runTxn(opened, { ops: [{ op: 'setElementHidden', target: { slide: 0, el: id } }] })
    expect(a.applied).toBe(false)
    expect(a.failures?.[0]?.error).toContain('needs "hidden"')
    const b = runTxn(opened, {
      ops: [{ op: 'renameElement', target: { slide: 0, el: id }, name: '  ' }],
    })
    expect(b.applied).toBe(false)
  })
})

describe('highlight and letter spacing edits', () => {
  it('setFont validates and applies both', async () => {
    const { opened, id } = await deckWithBox()
    const bad = runTxn(opened, {
      ops: [{ op: 'setFont', target: { slide: 0, el: id }, font: { highlight: 'yellow' } }],
    })
    expect(bad.applied).toBe(false)
    const ok = runTxn(opened, {
      ops: [
        {
          op: 'setFont',
          target: { slide: 0, el: id },
          font: { highlight: '#FFFF00', letterSpacingPt: 1.5 },
        },
      ],
    })
    expect(ok.applied).toBe(true)
    const xml = patchSlideXml(opened.deck.slides[0]!)
    expect(xml).toContain('<a:highlight><a:srgbClr val="FFFF00"/></a:highlight>')
    expect(xml).toContain('spc="150"')
  })

  it('marks only real changes from the editor', () => {
    const old = [{ runs: [{ text: 'a', highlight: '#FFFF00', letterSpacing: 2 }] }] as Paragraph[]
    const same = applyEditParagraphs(old, [
      { runs: [{ text: 'a', srcRun: 0, highlight: '#ffff00', letterSpacing: 2.01 }] },
    ])
    expect(same[0]!.runs[0]!.highlightEdited).toBeUndefined()
    expect(same[0]!.runs[0]!.letterSpacingEdited).toBeUndefined()
    const changed = applyEditParagraphs(old, [
      { runs: [{ text: 'a', srcRun: 0, highlight: null, letterSpacing: 0 }] },
    ])
    expect(changed[0]!.runs[0]).toMatchObject({ highlightEdited: true, letterSpacingEdited: true })
    expect(changed[0]!.runs[0]!.highlight).toBeUndefined()
    expect(changed[0]!.runs[0]!.letterSpacing).toBeUndefined()
  })
})
