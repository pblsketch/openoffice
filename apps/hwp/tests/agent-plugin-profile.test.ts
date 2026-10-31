/**
 * `documentProfile` against the real rhwp engine: the facts the format checks run on.
 * It must read the same shapes the document holds, and it must not change the document.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

function activate(doc: HwpDocument) {
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) =>
      fn({ doc: () => doc, deferPagination: () => {} } as never),
    events: { on: () => {} },
    automation: { execute: () => null },
  } as unknown as AgentPluginHost
  return agentPlugin.activate(host)
}

/** 제목 / 첫째 문단입니다. / 둘째 문단입니다. / [2×2 표] / 끝 문단입니다. */
function bodyWithTable(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = ['제목', '첫째 문단입니다.', '둘째 문단입니다.', '']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  doc.pasteHtml(
    0,
    3,
    0,
    '<table><tr><td>구분</td><td>내용</td></tr><tr><td>대상</td><td>업체</td></tr></table>',
  )
  return doc
}

describe('documentProfile', () => {
  it('reports the paragraphs in reading order', () => {
    const profile = activate(bodyWithTable()).documentProfile()
    const texts = profile.paragraphs.map((paragraph) => paragraph.text)
    expect(texts).toContain('제목')
    expect(texts).toContain('둘째 문단입니다.')
    expect(profile.paragraphs[0]).toMatchObject({ index: 0, section: 0 })
    expect(profile.truncated).toBeUndefined()
  })

  it('reports the fonts of the shapes the document uses', () => {
    const profile = activate(bodyWithTable()).documentProfile()
    expect(profile.charShapes.length).toBeGreaterThan(0)
    const shape = profile.charShapes[0]
    expect(shape.uses).toBeGreaterThan(0)
    expect(shape.fonts.length).toBeGreaterThan(0)
    expect(shape.first).toBeDefined()
    // every reported font is a name, not an empty string or a placeholder
    for (const entry of profile.charShapes) {
      for (const font of entry.fonts) expect(font.trim()).not.toBe('')
    }
  })

  it('reports a table with its cells and the line above it', () => {
    const profile = activate(bodyWithTable()).documentProfile()
    expect(profile.tables).toHaveLength(1)
    const table = profile.tables[0]
    expect(table).toMatchObject({ rows: 2, cols: 2, nested: false })
    expect(table.cells).toHaveLength(4)
    expect(table.cells?.[0]).toMatchObject({ row: 0, col: 0 })
    // the title line above the table, not the empty paragraph the table sits in
    expect(table.titleAbove).toBe('둘째 문단입니다.')
  })

  it('reads the fonts inside table cells too', () => {
    const profile = activate(bodyWithTable()).documentProfile()
    expect(profile.tables[0].cells?.length).toBe(4)
    // the cell text of a 1×1 table is what the title-box check reports; here there are four
    expect(profile.charShapes.some((shape) => shape.uses > 1)).toBe(true)
  })

  it('marks a table inside a cell as nested, with no title of its own', () => {
    const bytes = readFileSync(join(__dirname, 'fixtures', 'nested-form.hwp'))
    const profile = activate(new HwpDocument(new Uint8Array(bytes))).documentProfile()
    const nested = profile.tables.filter((table) => table.nested)
    expect(nested.length).toBeGreaterThan(0)
    for (const table of nested) expect(table.titleAbove).toBe('')
  })

  it('leaves the document exactly as it was', () => {
    const doc = bodyWithTable()
    const before = doc.exportHwp()
    activate(doc).documentProfile()
    const after = doc.exportHwp()
    expect(after.length).toBe(before.length)
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true)
  })
})
