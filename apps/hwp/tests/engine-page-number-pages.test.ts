/**
 * Which pages the patched rhwp engine (vendor/rhwp-core, decision 0050) draws
 * page numbers and footers on. The page-number-* cases are generated from
 * rhwp's issue2527_empty_linesegs.hwpx sample (no user text) and the expected
 * footers were read from Hangul 2024 prints of the same files: a page number
 * position applies from the page it sits on (a table cell's from the page of
 * its table), never to earlier pages; a new page number only changes the
 * value; when one page holds several hide controls, the last one counts.
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
  text?: string
  children?: Node[]
}

/** The text drawn in each page's footer area, page number included. */
function footers(name: string): string[] {
  const bytes = readFileSync(join(__dirname, 'fixtures', `page-number-${name}.hwpx`))
  const doc = new HwpDocument(new Uint8Array(bytes))
  const pages: string[] = []
  for (let page = 0; page < doc.pageCount(); page++) {
    const root = JSON.parse(doc.getPageRenderTree(page)) as Node
    let text = ''
    const walk = (node: Node) => {
      if (node.type === 'TextRun') text += node.text ?? ''
      for (const child of node.children ?? []) walk(child)
    }
    for (const area of root.children ?? []) if (area.type === 'Footer') walk(area)
    pages.push(text.split(/\s+/).filter(Boolean).join(' '))
  }
  return pages
}

describe('page numbers and footers', () => {
  it.each([
    // cover (position, hide) | header | contents (hide header, then page number) | contents | body (new number 1) | body
    ['pages', ['', '- 2 -', '', '- 4 -', '- 1 -', '- 2 -']],
    // the position and a new number 1 sit on page 3
    ['late-position', ['', '', '- 1 -', '- 2 -']],
    // the position sits on page 3, no new number
    ['late-position-no-new-number', ['', '', '- 3 -', '- 4 -']],
    // new number 1 on page 2, the position on page 4
    ['new-number-before-position', ['', '', '', '- 3 -', '- 4 -']],
    // the position sits in a table cell on page 1
    ['cell-position', ['- 1 -', '- 2 -', '- 3 -']],
    // hides per page: none | all, header | header, all | footer, header | none
    ['last-hide-wins', ['Footer', 'Footer', '', 'Footer', 'Footer']],
  ] as const)('%s matches Hangul 2024', (name, expected) => {
    expect(footers(name)).toEqual(expected)
  })
})
