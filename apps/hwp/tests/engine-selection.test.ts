/**
 * Selection rectangles from the patched rhwp engine (vendor/rhwp-core,
 * decision 0050). The single-line-record-paragraph case is a long filler
 * paragraph the engine itself saved as HWPX, its line records then cut to the
 * first one, as other HWPX writers (and some Hangul versions) store a
 * paragraph: the engine still draws it on many lines, and a selection over it
 * must paint every drawn line, not just the first. The cell-line-break-form
 * case is rhwp's issue3587 c-form-labnote-001-stage11-filled.hwpx sample: a
 * table cell paragraph stored as one line record whose text breaks after its
 * first line.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)
const CORE = dirname(require.resolve('@rhwp/core'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(CORE, 'rhwp_bg.wasm')) })
})

interface Node {
  type: string
  pi?: number
  bbox?: { x: number; y: number; w: number; h: number }
  children?: Node[]
}

interface Rect {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

function open(name: string): HwpDocument {
  return new HwpDocument(new Uint8Array(readFileSync(join(__dirname, 'fixtures', name))))
}

/** The tops of the drawn lines of a body paragraph on one page. */
function lineTops(doc: HwpDocument, page: number, pi: number): number[] {
  const tops: number[] = []
  const walk = (node: Node) => {
    if (node.type === 'TextLine' && node.pi === pi && node.bbox) tops.push(node.bbox.y)
    else for (const child of node.children ?? []) walk(child)
  }
  walk(JSON.parse(doc.getPageRenderTree(page)) as Node)
  return tops
}

describe('selection rectangles', () => {
  it('cover every drawn line of a paragraph stored as one line record', () => {
    const doc = open('single-line-record-paragraph.hwpx')
    const tops = lineTops(doc, 0, 0)
    expect(tops.length).toBeGreaterThan(5)

    const length = doc.getParagraphLength(0, 0)
    const whole = JSON.parse(doc.getSelectionRects(0, 0, 0, 0, length)) as Rect[]
    expect(whole).toHaveLength(tops.length)
    whole.forEach((rect, i) => {
      expect(rect.y).toBeGreaterThanOrEqual(tops[i] - 0.5)
      expect(rect.y).toBeLessThan((tops[i + 1] ?? Infinity) - 0.5)
      expect(rect.width).toBeGreaterThan(0)
    })

    // the stored record still spans the whole paragraph
    expect(JSON.parse(doc.getLineInfo(0, 0, 0))).toMatchObject({ lineCount: 1, charEnd: length })
    // the filler draws 45 characters a line: 50..140 runs from inside the
    // second line to inside the fourth
    const part = JSON.parse(doc.getSelectionRects(0, 0, 50, 0, 140)) as Rect[]
    expect(part).toHaveLength(3)
    expect(part[0].x).toBeGreaterThan(whole[1].x)
    expect(part[1].y).toBeGreaterThan(part[0].y)
    expect(part[2].y).toBeGreaterThan(part[1].y)
  })

  it('covers both lines of a cell paragraph that breaks after its first line', () => {
    const doc = open('cell-line-break-form.hwpx')
    // section 0, paragraph 12, control 1, cell 5: "실물😀", a line break, "본문"
    expect(doc.getCellParagraphLength(0, 12, 1, 5, 0)).toBe(6)
    const first = JSON.parse(doc.getCursorRectInCell(0, 12, 1, 5, 0, 0)) as Rect
    const second = JSON.parse(doc.getCursorRectInCell(0, 12, 1, 5, 0, 4)) as Rect
    expect(second.y).toBeGreaterThan(first.y)

    const rects = JSON.parse(doc.getSelectionRectsInCell(0, 12, 1, 5, 0, 0, 0, 6)) as Rect[]
    expect(rects).toHaveLength(2)
    expect(Math.abs(rects[0].y - first.y)).toBeLessThan(1)
    expect(Math.abs(rects[1].y - second.y)).toBeLessThan(1)
    // each rectangle spans its own line's text, not the gap to the next line
    const lineEnd = JSON.parse(doc.getCursorRectInCell(0, 12, 1, 5, 0, 3)) as Rect
    expect(rects[0].x + rects[0].width).toBeCloseTo(lineEnd.x, 0)
    const paraEnd = JSON.parse(doc.getCursorRectInCell(0, 12, 1, 5, 0, 6)) as Rect
    expect(rects[1].x + rects[1].width).toBeCloseTo(paraEnd.x, 0)
  })
})
