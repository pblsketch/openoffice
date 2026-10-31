import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionCtx } from '../src/renderer/action-context'
import type { BrushFormat } from '../src/renderer/format-brush'
import { pasteFormat } from '../src/renderer/clipboard-actions'
import { alignSelected } from '../src/renderer/arrange-actions'
import { onChangeCase, onElementTextColor } from '../src/renderer/style-actions'
import { repeatLast, rememberRepeat } from '../src/renderer/repeat-action'

vi.mock('../src/renderer/selection-image', () => ({ renderSelectionToPngBase64: vi.fn() }))
vi.mock('../src/renderer/export-render', () => ({ renderSlidesToPngBase64: vi.fn() }))
vi.mock('../src/renderer/i18n/locale', () => ({ t: (key: string) => key }))

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rotationDeg: 0 })

function setup(nodes: Record<string, unknown>[], selectedIds: string[]) {
  const calls: string[] = []
  const slide = { nodes: [], widthPx: 1280, heightPx: 720, scale: 1 }
  const ok = (name: string) =>
    vi.fn(async (_op: Record<string, unknown>) => {
      calls.push(name)
      return slide
    })
  const api = {
    beginHistoryBatch: vi.fn(async () => {
      calls.push('begin')
      return true
    }),
    endHistoryBatch: vi.fn(async () => {
      calls.push('end')
      return 1
    }),
    editFill: ok('editFill'),
    editStroke: ok('editStroke'),
    setEffects: ok('setEffects'),
    setElementFont: ok('setElementFont'),
    setElementParagraphFormat: ok('setElementParagraphFormat'),
    editText: ok('editText'),
    batchEditTransform: ok('batchEditTransform'),
  }
  vi.stubGlobal('window', { slidesApi: api })
  const byId = new Map(nodes.map((n) => [n.sourceId as string, n]))
  const ctx = {
    current: 2,
    selectedIds,
    slide: { ...slide, nodes },
    editing: null,
    editingCell: null,
    brushFormat: null as BrushFormat | null,
    findNodeCtx: (id: string) => (byId.has(id) ? { node: byId.get(id) } : null),
    groupIdOf: () => undefined,
    applySlide: vi.fn(),
    setDirty: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as ActionCtx & { brushFormat: BrushFormat | null }
  return { api, ctx, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('format painter paste', () => {
  it('paints every selected element inside one undo step', async () => {
    const shape = (id: string) => ({
      sourceId: id,
      type: 'shape',
      box: box(0, 0, 10, 10),
      fill: { kind: 'none' },
      text: { fontScale: 1, lines: [{ paraStart: true, runs: [{ text: 'x', fontSizePx: 16 }] }] },
    })
    const { api, ctx, calls } = setup([shape('a'), shape('b')], ['a', 'b'])
    ctx.brushFormat = {
      sourceType: 'shape',
      fill: '#FF0000',
      stroke: null,
      effects: { shadow: null, glow: null, reflection: null, softEdge: null },
      run: { fontSize: 18, bold: true, italic: false, underline: false, strike: false },
      align: 'center',
    }
    await pasteFormat(ctx)
    expect(calls[0]).toBe('begin')
    expect(calls[calls.length - 1]).toBe('end')
    expect(api.editFill).toHaveBeenCalledTimes(2)
    expect(api.editStroke).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'a', stroke: null }),
    )
    expect(api.setElementFont).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIds: ['b'], fontSizePt: 18, bold: true, strike: false }),
    )
    expect(api.setElementFont.mock.calls[0]![0]).not.toHaveProperty('fontFamily')
    expect(api.setElementParagraphFormat).toHaveBeenCalledWith(
      expect.objectContaining({ align: 'center' }),
    )
    // no text rewrite: the old painter rebuilt runs and could drop wrap spaces and links
    expect(api.editText).not.toHaveBeenCalled()
    expect(ctx.applySlide).toHaveBeenCalledTimes(1)
  })
})

describe('same width / height', () => {
  it('matches the first selected element and keeps each top-left corner', async () => {
    const { api, ctx } = setup(
      [
        { sourceId: 'a', type: 'shape', box: box(10, 20, 100, 40) },
        { sourceId: 'b', type: 'shape', box: box(200, 50, 30, 90) },
      ],
      ['a', 'b'],
    )
    await alignSelected(ctx, 'same-w')
    expect(api.batchEditTransform.mock.calls[0]![0]).toMatchObject({
      items: [
        { sourceId: 'a', xPx: 10, yPx: 20, wPx: 100, hPx: 40 },
        { sourceId: 'b', xPx: 200, yPx: 50, wPx: 100, hPx: 90 },
      ],
    })
    await alignSelected(ctx, 'same-size')
    expect((api.batchEditTransform.mock.calls[1]![0].items as unknown[])[1]).toMatchObject({
      wPx: 100,
      hPx: 40,
    })
  })

  it('needs two elements', async () => {
    const { api, ctx } = setup([{ sourceId: 'a', type: 'shape', box: box(0, 0, 1, 1) }], ['a'])
    await alignSelected(ctx, 'same-h')
    expect(api.batchEditTransform).not.toHaveBeenCalled()
  })
})

describe('change case on selected boxes', () => {
  it('rewrites only the text, run by run, as one undo step', async () => {
    const { api, ctx, calls } = setup(
      [
        {
          sourceId: 'a',
          type: 'shape',
          box: box(0, 0, 1, 1),
          text: { lines: [{ paraStart: true, runs: [{ text: 'hello', srcRunIdx: 0 }] }] },
        },
        { sourceId: 'p', type: 'picture', box: box(0, 0, 1, 1) },
      ],
      ['a', 'p'],
    )
    onChangeCase(ctx, 'upper')
    await vi.waitFor(() => expect(calls).toContain('end'))
    expect(api.editText).toHaveBeenCalledTimes(1)
    expect(api.editText.mock.calls[0]![0]).toMatchObject({
      slideIndex: 2,
      sourceId: 'a',
      paragraphs: [{ srcPara: 0, runs: [{ text: 'HELLO', srcRun: 0 }] }],
    })
  })
})

describe('F4 repeat', () => {
  it('replays the last action on the current selection', async () => {
    const { api, ctx } = setup([], ['a'])
    onElementTextColor(ctx, '#123456')
    expect(api.setElementFont).toHaveBeenCalledTimes(1)
    const next = { ...ctx, selectedIds: ['b', 'c'] } as ActionCtx
    expect(repeatLast(next)).toBe(true)
    expect(api.setElementFont).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceIds: ['b', 'c'], color: '#123456' }),
    )
  })

  it('keeps only the latest action', () => {
    const first = vi.fn()
    const second = vi.fn()
    rememberRepeat(first)
    rememberRepeat(second)
    repeatLast({} as ActionCtx)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
