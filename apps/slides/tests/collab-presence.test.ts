/**
 * Co-editing presence (decision 0073): a person's selection goes out as
 * fractions of the slide so every peer draws it at its own zoom, and what
 * arrives from a peer is checked before it is drawn.
 */
import { describe, expect, it } from 'vitest'
import type { RenderNode, RenderSlide } from '@genoffice/pptx-render'
import { presenceBoxes, presenceOf, samePresence } from '../src/renderer/collab-presence'

const node = (sourceId: string, x: number, y: number, w: number, h: number) =>
  ({ type: 'shape', sourceId, box: { x, y, w, h } }) as unknown as RenderNode

const slide = {
  partPath: 'ppt/slides/slide2.xml',
  widthPx: 1000,
  heightPx: 500,
  nodes: [
    node('a', 100, 50, 200, 100),
    {
      type: 'group',
      sourceId: 'g',
      box: { x: 500, y: 250, w: 400, h: 200 },
      children: [node('c', 10, 20, 100, 50)],
    } as unknown as RenderNode,
  ],
} as unknown as RenderSlide

describe('presence boxes', () => {
  it('selected boxes become fractions of the slide', () => {
    expect(presenceBoxes(slide, ['a'])).toEqual([{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }])
  })

  it('a group child is placed by its group', () => {
    expect(presenceBoxes(slide, ['c'])).toEqual([{ x: 0.51, y: 0.54, w: 0.1, h: 0.1 }])
  })

  it('nothing selected, nothing drawn', () => {
    expect(presenceBoxes(slide, [])).toEqual([])
    expect(presenceBoxes(slide, ['missing'])).toEqual([])
  })
})

describe('presence from a peer', () => {
  it('keeps well-formed values and drops broken boxes', () => {
    expect(
      presenceOf({
        slide: 's',
        boxes: [{ x: 0, y: 0, w: 1, h: 1 }, { x: 'no' }, null],
        editing: true,
      }),
    ).toEqual({ slide: 's', boxes: [{ x: 0, y: 0, w: 1, h: 1 }], editing: true })
  })

  it('ignores anything without a slide', () => {
    expect(presenceOf(null)).toBeNull()
    expect(presenceOf({ boxes: [] })).toBeNull()
    expect(presenceOf('slide')).toBeNull()
  })

  it('an unchanged presence is not sent again', () => {
    const a = { slide: 's', boxes: [{ x: 0, y: 0, w: 1, h: 1 }], editing: false }
    expect(samePresence(a, { ...a, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] })).toBe(true)
    expect(samePresence(a, { ...a, editing: true })).toBe(false)
    expect(samePresence(a, null)).toBe(false)
  })
})
