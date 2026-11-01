import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimationItem, SetAnimationsOp } from '../src/shared/ipc'
import type { ActionCtx } from '../src/renderer/action-context'
import {
  armAnimPainter,
  paintAnimationsOnto,
  paintedAnimations,
} from '../src/renderer/animation-actions'

vi.mock('../src/renderer/i18n/locale', () => ({ t: (key: string) => key }))

const item = (over: Partial<AnimationItem>): AnimationItem => ({
  sourceId: 'src',
  targetName: '',
  effect: 'fade',
  trigger: 'onClick',
  durationMs: 500,
  delayMs: 0,
  ...over,
})

describe('paintedAnimations', () => {
  it('moves whole-shape effects to the target in order', () => {
    const out = paintedAnimations(
      [item({ effect: 'fade' }), item({ effect: 'spin', trigger: 'afterPrev' })],
      'dst',
      0,
      false,
    )
    expect(out.map((a) => [a.sourceId, a.effect, a.trigger])).toEqual([
      ['dst', 'fade', 'onClick'],
      ['dst', 'spin', 'afterPrev'],
    ])
  })

  it("spreads a by-paragraph effect over the target's paragraphs", () => {
    const src = [
      item({ effect: 'flyIn', paragraph: 0 }),
      item({ effect: 'flyIn', paragraph: 1, trigger: 'afterPrev' }),
    ]
    const out = paintedAnimations(src, 'dst', 3, false)
    expect(out.map((a) => [a.paragraph, a.trigger])).toEqual([
      [0, 'onClick'],
      [1, 'afterPrev'],
      [2, 'afterPrev'],
    ])
    // a target without text gets the effect once for the whole shape
    const whole = paintedAnimations(src, 'dst', 0, false)
    expect(whole).toHaveLength(1)
    expect(whole[0]).not.toHaveProperty('paragraph')
  })

  it('keeps media commands for media targets only', () => {
    const src = [item({ effect: 'mediaPlay' }), item({ effect: 'fade' })]
    expect(paintedAnimations(src, 'dst', 0, false).map((a) => a.effect)).toEqual(['fade'])
    expect(paintedAnimations(src, 'dst', 0, true).map((a) => a.effect)).toEqual([
      'mediaPlay',
      'fade',
    ])
  })
})

describe('animation painter actions', () => {
  afterEach(() => vi.unstubAllGlobals())

  function setup(animations: AnimationItem[]) {
    const api = {
      setAnimations: vi.fn(async (_op: SetAnimationsOp) => true),
      getAnimations: vi.fn(async () => []),
    }
    vi.stubGlobal('window', { slidesApi: api })
    const ctx = {
      current: 0,
      selectedIds: ['src'],
      animations,
      animPainter: null as unknown,
      setAnimPainter: vi.fn(),
      setAnimations: vi.fn(),
      setStatus: vi.fn(),
      setDirty: vi.fn(),
      findNodeCtx: (id: string) => ({ node: { type: 'shape', sourceId: id } }),
    }
    return { api, ctx: ctx as unknown as ActionCtx & { animPainter: unknown } }
  }

  it('arms with the selected element animations and says so when there are none', () => {
    const { ctx } = setup([item({ sourceId: 'src' }), item({ sourceId: 'other' })])
    armAnimPainter(ctx, 'continuous')
    expect(ctx.setAnimPainter).toHaveBeenCalledWith({
      slideIndex: 0,
      sourceId: 'src',
      items: [item({ sourceId: 'src' })],
      mode: 'continuous',
    })
    const empty = setup([])
    armAnimPainter(empty.ctx, 'once')
    expect(empty.ctx.setAnimPainter).not.toHaveBeenCalled()
    expect(empty.ctx.setStatus).toHaveBeenCalledWith('appStatusAnimPainterNone')
  })

  it("replaces the target's animations, appends them at the end and disarms a one-shot painter", async () => {
    const anims = [
      item({ sourceId: 'dst', effect: 'spin' }),
      item({ sourceId: 'src', effect: 'zoom' }),
    ]
    const { api, ctx } = setup(anims)
    ctx.animPainter = { slideIndex: 0, sourceId: 'src', items: [anims[1]!], mode: 'once' }
    await paintAnimationsOnto(ctx, 'dst')
    const items = api.setAnimations.mock.calls[0]![0].items
    expect(items.map((a) => [a.sourceId, a.effect])).toEqual([
      ['src', 'zoom'],
      ['dst', 'zoom'],
    ])
    expect(ctx.setAnimPainter).toHaveBeenCalledWith(null)
  })

  it('ignores a click on the source element itself', async () => {
    const { api, ctx } = setup([item({})])
    ctx.animPainter = { slideIndex: 0, sourceId: 'src', items: [item({})], mode: 'continuous' }
    await paintAnimationsOnto(ctx, 'src')
    expect(api.setAnimations).not.toHaveBeenCalled()
  })
})
