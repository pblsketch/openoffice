// @vitest-environment node
/**
 * Co-editing op stream (decision 0073): a transaction applied on one PC is
 * rewritten so another PC's executor applies it to the same slides and
 * elements. Two decks opened from the same bytes stand in for two PCs — the
 * parse-time ids differ between them as they would across processes.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createBlankPptx,
  elementCNvPrId,
  ensureBuiltinLayout,
  getSections,
  openPptx,
  slideDurableId,
  type OpenedPptx,
  type SlideElement,
  type TextElement,
} from '@genoffice/pptx-engine'
import { runTxn, type Op } from '@genoffice/pptx-ops'
import {
  createdCheck,
  fromWireOp,
  indexElements,
  isWireSafe,
  toWireOp,
} from '../src/main/collab-wire'
import { wireOpsCommute, type SlidesWireOp } from '../src/shared/collab'

let a: OpenedPptx
let b: OpenedPptx

const box = (x: number) => ({ x, y: 0, cx: 914400, cy: 457200 })
const rect = (slide: number, x: number): Op => ({
  op: 'addElement',
  target: { slide },
  kind: 'rect',
  offset: box(x),
  fill: '#336699',
})

/** apply on `deck` as its surface would, and return what goes on the wire */
function local(deck: OpenedPptx, ops: Op[]): SlidesWireOp | null {
  const pre = indexElements(deck)
  const r = runTxn(deck, { ops })
  expect(r.failures ?? []).toEqual([])
  return toWireOp(r.records ?? [], 'edit', pre, deck)
}

/** apply a peer's wire op; returns this deck's created-check */
function remote(deck: OpenedPptx, wire: SlidesWireOp): string {
  const ops = fromWireOp(wire, deck)
  expect(ops).not.toBeNull()
  const r = runTxn(deck, { ops: ops! })
  expect(r.failures ?? []).toEqual([])
  return createdCheck(r.records ?? [], deck)
}

const shapes = (deck: OpenedPptx, slide = 0) =>
  deck.deck.slides[slide]!.elements.map((el) => elementCNvPrId(el))

const textOf = (el: SlideElement | undefined) =>
  (el as TextElement | undefined)?.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))

beforeEach(async () => {
  const bytes = await createBlankPptx()
  a = await openPptx(bytes)
  b = await openPptx(bytes)
})

describe('wire ops', () => {
  it('names slides by durable id and new elements land with the same cNvPr id', () => {
    const wire = local(a, [rect(0, 0), rect(0, 1_000_000)])!
    expect(wire.ops.every((op) => op.target?.slide === 's_1')).toBe(true)
    expect(remote(b, wire)).toBe(wire.check)
    expect(wire.check).toMatch(/^s_1\/e_\d+,s_1\/e_\d+$/)
    expect(shapes(b)).toEqual(shapes(a))
    // parse-time ids differ: only the cNvPr form names the same element on both
    expect(a.deck.slides[0]!.elements[0]!.id).not.toBe(b.deck.slides[0]!.elements[0]!.id)
  })

  it('edits address elements by their cNvPr form, never the local parse-time id', () => {
    remote(b, local(a, [rect(0, 0)])!)
    const target = a.deck.slides[0]!.elements.at(-1)!
    const wire = local(a, [
      {
        op: 'setText',
        target: { slide: 0, el: target.id },
        paragraphs: [{ runs: [{ text: 'from A' }] }],
      },
    ])!
    expect(wire.ops[0]!.target?.el).toBe(elementCNvPrId(target))
    expect(wire.ops[0]!.target?.el).not.toBe(target.id)
    remote(b, wire)
    expect(textOf(b.deck.slides[0]!.elements.at(-1))).toEqual(['from A'])
  })

  it('a deleted element is still named: the index taken before the transaction holds it', () => {
    remote(b, local(a, [rect(0, 0), rect(0, 2_000_000)])!)
    const gone = a.deck.slides[0]!.elements.at(-2)!
    const wire = local(a, [{ op: 'deleteElement', target: { slide: 0, el: gone.id } }])!
    expect(wire.ops[0]!.target?.el).toBe(elementCNvPrId(gone))
    remote(b, wire)
    expect(shapes(b)).toEqual(shapes(a))
  })

  it('slides moved earlier in the same transaction stay the right slides', () => {
    remote(b, local(a, [{ op: 'addBlankSlide', target: { slide: 0 } }])!)
    const second = slideDurableId(a.deck.slides[1]!)
    const wire = local(a, [
      { op: 'moveSlide', target: { slide: 1 }, to: 0 },
      // index 1 is now what used to be the first slide
      { op: 'setBackground', target: { slide: 1 }, kind: 'solid', color: '#112233' },
    ])!
    remote(b, wire)
    expect(b.deck.slides.map(slideDurableId)).toEqual(a.deck.slides.map(slideDurableId))
    expect(slideDurableId(b.deck.slides[0]!)).toBe(second)
    expect(wire.ops[1]!.target?.slide).toBe(slideDurableId(a.deck.slides[1]!))
  })

  it('group children travel by their own cNvPr id under the group', () => {
    remote(b, local(a, [rect(0, 0), rect(0, 2_000_000)])!)
    const [one, two] = a.deck.slides[0]!.elements.slice(-2)
    remote(b, local(a, [{ op: 'groupElements', target: { slide: 0 }, els: [one!.id, two!.id] }])!)
    const group = a.deck.slides[0]!.elements.find((el) => el.type === 'group')!
    const child = (group as { children: SlideElement[] }).children[0]!
    const wire = local(a, [
      {
        op: 'setFill',
        target: { slide: 0, el: child.id },
        group: group.id,
        fill: '#ff0000',
      },
    ])!
    expect(wire.ops[0]!.group).toBe(elementCNvPrId(group))
    expect(wire.ops[0]!.target?.el).toBe(elementCNvPrId(child))
    remote(b, wire)
  })

  it('find and replace in one element carries that element by slide and cNvPr id', () => {
    remote(b, local(a, [rect(0, 0)])!)
    const el = a.deck.slides[0]!.elements.at(-1)!
    remote(
      b,
      local(a, [
        {
          op: 'setText',
          target: { slide: 0, el: el.id },
          paragraphs: [{ runs: [{ text: 'old' }] }],
        },
      ])!,
    )
    const wire = local(a, [{ op: 'findReplace', find: 'old', replace: 'new', elementId: el.id }])!
    expect(wire.ops[0]!.elementId).toBe(`s_1#${elementCNvPrId(el)}`)
    remote(b, wire)
    expect(textOf(b.deck.slides[0]!.elements.at(-1))).toEqual(['new'])
  })

  it('a built-in layout injected before the transaction is injected on the peer too', () => {
    const path = ensureBuiltinLayout(a.archive, a.deck.size, 'sectionHeader')!
    const pre = indexElements(a)
    const r = runTxn(a, {
      ops: [{ op: 'addSlideWithLayout', target: { slide: 0 }, layoutPath: path }],
    })
    const wire = toWireOp(r.records!, 'edit', pre, a, new Map([[path, 'sectionHeader']]))!
    expect(wire.layouts).toEqual([[path, 'sectionHeader']])
    expect(remote(b, wire)).toBe(wire.check)
    expect(b.deck.slides.length).toBe(2)
  })

  it('section ops cannot travel: their ids are random', () => {
    const pre = indexElements(a)
    const r = runTxn(a, { ops: [{ op: 'addSection', atSlideIndex: 0, name: 'Intro' }] })
    expect(getSections(a).length).toBe(1)
    expect(toWireOp(r.records!, 'edit', pre, a)).toBeNull()
  })

  it('a ref that would resolve to another element with the same cNvPr id is refused', () => {
    remote(b, local(a, [rect(0, 0), rect(0, 2_000_000)])!)
    const [first, second] = a.deck.slides[0]!.elements.slice(-2)
    const id = /\bid="(\d+)"/.exec(first!.anchor.originalXml)![1]!
    second!.anchor.originalXml = second!.anchor.originalXml.replace(
      /(<p:cNvPr\b[^>]*\bid=")\d+/,
      `$1${id}`,
    )
    const fill = (el: SlideElement): Op => ({
      op: 'setFill',
      target: { slide: 0, el: el.id },
      fill: '#00ff00',
    })
    expect(local(a, [fill(second!)])).toBeNull()
    expect(local(a, [fill(first!)])!.ops[0]!.target?.el).toBe(`e_${id}`)
  })

  it('a peer that numbers new elements differently is caught by the check', () => {
    // B still holds a deleted element's id in its slide bytes, A was saved since
    const wire = local(a, [rect(0, 0)])!
    b.deck.slides[0]!.originalXml = b.deck.slides[0]!.originalXml.replace(
      '</p:spTree>',
      '<p:sp><p:nvSpPr><p:cNvPr id="40" name="gone"/></p:nvSpPr></p:sp></p:spTree>',
    )
    expect(remote(b, wire)).not.toBe(wire.check)
  })

  it('only plain data goes on the wire', () => {
    expect(isWireSafe({ a: [1, 'x', null, undefined, new Uint8Array(2), { b: true }] })).toBe(true)
    expect(isWireSafe({ a: new Map() })).toBe(false)
    expect(isWireSafe([new Date()])).toBe(false)
  })
})

describe('which ops commute', () => {
  const op = (...keys: string[]): SlidesWireOp => ({ source: 'edit', ops: [], check: '', keys })

  it('edits to different elements commute, edits to one element do not', () => {
    expect(wireOpsCommute(op('e|s_1|e_2'), op('e|s_1|e_3'))).toBe(true)
    expect(wireOpsCommute(op('e|s_1|e_2'), op('e|s_1|e_2'))).toBe(false)
  })

  it('new elements on one slide do not commute (their numbers depend on order)', () => {
    expect(wireOpsCommute(op('s|s_1'), op('s|s_1'))).toBe(false)
    expect(wireOpsCommute(op('s|s_1'), op('s|s_2'))).toBe(true)
    expect(wireOpsCommute(op('s|s_1'), op('e|s_1|e_4'))).toBe(true)
  })

  it('slide-wide edits clash with anything on that slide, deck edits with everything', () => {
    expect(wireOpsCommute(op('b|s_1'), op('e|s_1|e_4'))).toBe(false)
    expect(wireOpsCommute(op('b|s_1'), op('e|s_2|e_4'))).toBe(true)
    expect(wireOpsCommute(op('deck'), op('n|s_9'))).toBe(false)
  })

  it('the keys a captured transaction carries', () => {
    remote(b, local(a, [rect(0, 0)])!)
    const el = a.deck.slides[0]!.elements.at(-1)!
    const ref = elementCNvPrId(el)
    expect(
      local(a, [{ op: 'setFill', target: { slide: 0, el: el.id }, fill: '#000000' }])!.keys,
    ).toEqual([`e|s_1|${ref}`])
    expect(local(a, [rect(0, 5)])!.keys).toEqual(['s|s_1'])
    expect(local(a, [{ op: 'setSlideSize', cx: 9144000, cy: 5143500 }])!.keys).toEqual(['deck'])
  })
})
