/**
 * Footnotes of a document generator's HWPX (engine patch 0029): footnotes whose number is
 * typed text and has no automatic number, and no stored line layout anywhere. Hangul shows
 * such a note's typed number once and keeps the notes inside the body area, below the body
 * text. The fixture is described in agent-plugin-doc-settings.test.ts.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

interface Node {
  type: string
  text?: string
  bbox?: { x: number; y: number; w: number; h: number }
  children?: Node[]
}

/** The text lines of one top-level area of a page: their top, bottom and text. */
function linesOf(root: Node, type: string) {
  const lines: { top: number; bottom: number; text: string }[] = []
  const walk = (node: Node) => {
    if (node.type === 'TextLine' && node.bbox) {
      const parts: string[] = []
      const collect = (child: Node) => {
        if (child.text) parts.push(child.text)
        for (const next of child.children ?? []) collect(next)
      }
      collect(node)
      lines.push({ top: node.bbox.y, bottom: node.bbox.y + node.bbox.h, text: parts.join('') })
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const area of root.children?.filter((child) => child.type === type) ?? []) walk(area)
  return lines
}

const doc = () =>
  new HwpDocument(
    new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'footnote-typed-number.hwpx'))),
  )

describe('footnotes without an automatic number or stored lines', () => {
  it('shows the typed number once', () => {
    const document = doc()
    const notes = Array.from({ length: document.pageCount() }, (_, page) =>
      linesOf(JSON.parse(document.getPageRenderTree(page)) as Node, 'FootnoteArea'),
    ).flat()
    const firsts = notes.filter((line) => /^\d\)/.test(line.text))
    expect(firsts.map((line) => line.text.slice(0, 3))).toEqual(['1) ', '2) ', '3) '])
    for (const line of firsts) expect(line.text).not.toMatch(/^\d\) ?\d\)/)
  })

  it('keeps every page’s notes below its body text and inside the body area', () => {
    const document = doc()
    let pagesWithNotes = 0
    for (let page = 0; page < document.pageCount(); page++) {
      const root = JSON.parse(document.getPageRenderTree(page)) as Node
      const notes = linesOf(root, 'FootnoteArea')
      if (notes.length === 0) continue
      pagesWithNotes += 1
      const body = root.children?.find((child) => child.type === 'Body')?.bbox
      if (!body) throw new Error('no body area')
      const bodyLines = linesOf(root, 'Body')
      const lastBody = Math.max(...bodyLines.map((line) => line.bottom))
      const firstNote = Math.min(...notes.map((line) => line.top))
      const lastNote = Math.max(...notes.map((line) => line.bottom))
      expect(lastBody).toBeLessThanOrEqual(firstNote)
      expect(lastNote).toBeLessThanOrEqual(body.y + body.h + 0.5)
    }
    expect(pagesWithNotes).toBeGreaterThan(0)
  })
})
