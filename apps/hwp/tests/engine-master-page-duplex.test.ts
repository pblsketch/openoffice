/**
 * Master pages of a facing-pages document in the patched rhwp engine
 * (vendor/rhwp-core, decision 0050). The two HWPX cases are synthetic two-page
 * documents with mirrored margins (left 26mm, right 40mm) whose master page
 * holds paper-anchored tables (left, right, centred), a page-anchored table, a
 * paper-anchored text box and picture, and a band as wide as the paper; page 2
 * also has a paper-anchored table in the body. One declares a single master
 * page for both sides, the other separate odd and even ones. The HWP case is
 * the odd-and-even variant saved by Hangul 2024 as .hwp (author removed).
 * Expected positions were measured on Hangul 2024 PDF prints, 96 dpi px.
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
  bbox?: { x: number; y: number; w: number; h: number }
  children?: Node[]
}

/** Tables, rectangles and pictures with whether they sit in the master page. */
function boxes(doc: HwpDocument, page: number) {
  const out: { master: boolean; x: number; y: number }[] = []
  const walk = (node: Node, master: boolean) => {
    const inMaster = master || node.type === 'MasterPage'
    if (['Table', 'Rect', 'Image'].includes(node.type) && node.bbox) {
      out.push({ master: inMaster, x: node.bbox.x, y: node.bbox.y })
      return
    }
    for (const child of node.children ?? []) walk(child, inMaster)
  }
  walk(JSON.parse(doc.getPageRenderTree(page)) as Node, false)
  return out
}

function open(name: string): HwpDocument {
  return new HwpDocument(new Uint8Array(readFileSync(join(__dirname, 'fixtures', name))))
}

function xAt(doc: HwpDocument, page: number, master: boolean, y: number): number {
  const box = boxes(doc, page).find((b) => b.master === master && Math.abs(b.y - y) < 1)
  if (!box) throw new Error(`no box at y=${y} on page ${page + 1}`)
  return box.x
}

// [what, top y, odd page x, even page x] as Hangul 2024 prints them
type Expected = [string, number, number, number]
const BOTH: Expected[] = [
  ['paper left table', 106.7, 98.1, 151.0],
  ['paper right table', 146.7, 566.9, 619.8],
  ['paper centred table', 186.7, 296.6, 349.6],
  ['page left table', 226.7, 111.4, 164.3],
  ['paper text box', 386.7, 40.0, 93.0],
  ['paper picture', 506.7, 66.7, 119.7],
  ['paper-wide band', 546.7, -0.2, 52.8],
]
// separate odd and even master pages do not move
const ODD_EVEN: Expected[] = BOTH.map(([what, y, odd, even]) => [
  what,
  y,
  odd,
  what.startsWith('page') ? even : odd,
])
const TOLERANCE = 0.6

describe('facing-pages master page', () => {
  it.each([
    ['master-page-duplex-both.hwpx', BOTH],
    ['master-page-duplex-odd-even.hwpx', ODD_EVEN],
  ] as const)('%s sits where Hangul draws it on odd and even pages', (name, expected) => {
    const doc = open(name)
    for (const [what, y, odd, even] of expected) {
      expect(Math.abs(xAt(doc, 0, true, y) - odd), `${what} p1`).toBeLessThanOrEqual(TOLERANCE)
      expect(Math.abs(xAt(doc, 1, true, y) - even), `${what} p2`).toBeLessThanOrEqual(TOLERANCE)
    }
    // a paper-anchored table in the body does not move on the even page
    expect(Math.abs(xAt(doc, 1, false, 933.3) - 98.1)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('reads the even master page of an .hwp saved with odd and even master pages', () => {
    // Hangul stores both, even and odd master pages in that order; reading the
    // second as the odd one made the even page's master the one for both
    // sides, and the even page moved by the margin difference.
    const doc = open('master-page-duplex-even-odd.hwp')
    expect(doc.pageCount()).toBe(2)
    for (const page of [0, 1]) {
      expect(Math.abs(xAt(doc, page, true, 106.7) - 98.1)).toBeLessThanOrEqual(TOLERANCE)
    }
  })
})
