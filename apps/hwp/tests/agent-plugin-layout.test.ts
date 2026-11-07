/**
 * The plugin's checkLayout against the real rhwp engine: the table cells whose text is cut
 * off on the page. fixtures/format-copy-table.hwp is a 2×2 table made in Hancom Hangul whose
 * rows are exactly one line high. A row the file keeps shorter than its text is made by
 * handing the plugin the cell boxes with one cell shortened, as a file with a stale row
 * height lays out; everything else comes from the engine.
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

const TABLE = readFileSync(join(__dirname, 'fixtures', 'format-copy-table.hwp'))

interface CellBox {
  cellIdx: number
  h: number
}

/**
 * The plugin over the document, with `shrink` (cell index → CSS px) taken off the height
 * of those cells' boxes.
 */
function open(bytes: Uint8Array, shrink: Record<number, number> = {}) {
  const doc = new HwpDocument(new Uint8Array(bytes))
  doc.pageCount()
  const view = new Proxy(doc, {
    get(target, key) {
      if (key === 'getTableCellBboxesByPath') {
        return (...args: [number, number, string]) => {
          const boxes = JSON.parse(target.getTableCellBboxesByPath(...args)) as CellBox[]
          return JSON.stringify(boxes.map((b) => ({ ...b, h: b.h - (shrink[b.cellIdx] ?? 0) })))
        }
      }
      const value = Reflect.get(target, key, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const host = {
    read: (fn: (d: never) => unknown) => fn(view as never),
    transaction: () => {
      throw new Error('checking the layout changes nothing')
    },
    events: { on: () => 0 },
    automation: { registerCommand: () => {}, execute: () => null },
  } as unknown as AgentPluginHost
  return { plugin: agentPlugin.activate(host), doc }
}

/** A cell's text made long enough to take three lines. */
function withLongText(cell: number): Uint8Array {
  const doc = new HwpDocument(new Uint8Array(TABLE))
  const end = doc.getCellParagraphLength(0, 1, 0, cell, 0)
  doc.insertTextInCell(
    0,
    1,
    0,
    cell,
    0,
    end,
    ' 이 칸에는 칸의 폭보다 훨씬 긴 글을 넣어서 여러 줄로 접히게 만듭니다 마지막 줄',
  )
  doc.pageCount()
  const bytes = doc.exportHwp()
  doc.free()
  return bytes
}

describe('checkLayout', () => {
  it('reports nothing for text that only touches the border of a tight row', () => {
    const { plugin } = open(TABLE)
    expect(plugin.checkLayout()).toEqual({ count: 0, cells: [], measured: 4 })
  })

  it('reports nothing when the row grows with its text', () => {
    const { plugin } = open(withLongText(1))
    expect(plugin.checkLayout()).toMatchObject({ count: 0, measured: 4 })
  })

  it('lists a cell whose last line runs past the bottom of the row', () => {
    const bytes = withLongText(1)
    const { doc } = open(bytes)
    const full = JSON.parse(doc.getTableCellBboxes(0, 1, 0)) as CellBox[]
    // the row as the file would keep it: one line high, the two lines below cut off
    const { plugin } = open(bytes, { 1: full.find((b) => b.cellIdx === 1)!.h - 13.3 })
    const checked = plugin.checkLayout()
    expect(checked.count).toBe(1)
    expect(checked.cells).toHaveLength(1)
    const [cell] = checked.cells
    expect(cell).toMatchObject({ table: 1, row: 1, col: 2, page: 1 })
    expect(cell.over).toBeGreaterThan(10)
    expect(cell.text).toContain('일반 칸 1')
  })

  it('does not count the half of a line that stays inside the cell', () => {
    // the line already ends 1.9 px past the border: up to a fifth of its 13.3 px it reads
    // whole, half of it does not
    expect(open(TABLE, { 0: 0.5 }).plugin.checkLayout().count).toBe(0)
    expect(open(TABLE, { 0: 4.5 }).plugin.checkLayout().cells).toMatchObject([
      { table: 1, row: 1, col: 1 },
    ])
  })
})
