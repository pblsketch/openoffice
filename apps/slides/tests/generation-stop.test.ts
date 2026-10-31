/**
 * A blocked connection (rate limit, signed out, out of credit) ends deck
 * generation at once. It used to keep sending the remaining pages and the
 * retry round, spending quota on requests that could only fail, and the
 * planning/regen retry ladders did the same.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RenderSlide } from '@genoffice/pptx-render'
import { createSlidesSkill, type DeckAccess } from '../src/renderer/ai/slides-skill'
import { isGenerationStopKind } from '../src/renderer/ai/generation-stop'

const deck = { widthPx: 1280, heightPx: 720, nodes: [] } as unknown as RenderSlide

function mkAccess(extra: Record<string, unknown> = {}): DeckAccess {
  let stopped: string | undefined
  return {
    getSlides: () => [deck],
    getCurrent: () => 0,
    getSelectedIds: () => [],
    applySlide: () => {},
    applyDeck: () => {},
    fitWidthPx: 1280,
    retryBackoffMs: 0,
    generationStopped: () => stopped,
    markGenerationStopped: (kind: string) => {
      stopped = kind
    },
    ...extra,
  } as unknown as DeckAccess
}

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    title: `Page ${i + 1}`,
    brief: `Body ${i + 1}`,
    layout: 'left_text_right_image',
  }))

const call = (name: string, input: Record<string, unknown>) => ({ id: 't', name, input })

describe('generation stop kinds', () => {
  it('covers the document-job stop rule and the free connection limit', () => {
    for (const kind of ['rate-limit', 'signed-out', 'credits', 'headless-limit', 'free-limit'])
      expect(isGenerationStopKind(kind)).toBe(true)
    expect(isGenerationStopKind('network')).toBe(false)
    expect(isGenerationStopKind(undefined)).toBe(false)
  })
})

describe('generate_deck with a blocked connection', () => {
  it('stops after the in-flight page batch instead of requesting every page and retrying', async () => {
    const generatePageLocal = vi.fn(async () => ({
      ok: false,
      error: 'The subscription limit is used up.',
      stopKind: 'rate-limit',
    }))
    const landGeneratedPages = vi.fn()
    const skill = createSlidesSkill(mkAccess({ generatePageLocal, landGeneratedPages }))

    const r = await skill.executeTool!(
      call('generate_deck', {
        core_hook: 'hook',
        style: 'style',
        pages: pages(6),
      }),
    )

    // one batch of two pages was already in flight; the remaining four are never sent
    expect(generatePageLocal).toHaveBeenCalledTimes(2)
    expect(landGeneratedPages).not.toHaveBeenCalled()
    expect(r.isError).toBe(true)
    expect(r.mutated).toBe(false)
    expect(r.output).toContain('Generation stopped early')
    expect(r.output).toContain('The subscription limit is used up.')
    expect(r.output).toContain('Do not call generate_deck again')
  })

  it('refuses a second generate_deck in the same run without sending another request', async () => {
    const generatePageLocal = vi.fn(async () => ({
      ok: false,
      error: 'The subscription limit is used up.',
      stopKind: 'rate-limit',
    }))
    const skill = createSlidesSkill(mkAccess({ generatePageLocal, landGeneratedPages: vi.fn() }))
    const deckCall = () =>
      skill.executeTool!(
        call('generate_deck', { core_hook: 'hook', style: 'style', pages: pages(6) }),
      )

    await deckCall()
    const afterFirst = generatePageLocal.mock.calls.length
    const second = await deckCall()

    expect(afterFirst).toBe(2)
    expect(generatePageLocal).toHaveBeenCalledTimes(afterFirst)
    expect(second.isError).toBe(true)
    expect(second.output).toContain('already stopped')
  })

  it('does not plan the rest of the outline', async () => {
    const planDeckOutline = vi.fn(async () => ({
      ok: false,
      error: 'Not signed in.',
      stopKind: 'signed-out',
    }))
    const generatePageLocal = vi.fn()
    const skill = createSlidesSkill(
      mkAccess({ planDeckOutline, generatePageLocal, landGeneratedPages: vi.fn() }),
    )

    const r = await skill.executeTool!(
      call('generate_deck', { topic: 'A deck', approx_pages: 12, style: 'style' }),
    )

    expect(planDeckOutline).toHaveBeenCalledTimes(1)
    expect(generatePageLocal).not.toHaveBeenCalled()
    expect(r.isError).toBe(true)
    expect(r.output).toContain('Generation stopped')
  })

  it('keeps the pages that landed before the stop', async () => {
    let calls = 0
    const generatePageLocal = vi.fn(async () => {
      calls++
      return calls <= 2
        ? { ok: true, marker: `marker-${calls}` }
        : { ok: false, error: 'Out of credit.', stopKind: 'credits' }
    })
    const landGeneratedPages = vi.fn(async () => ({ ok: true, appendedFrom: 0 }))
    const skill = createSlidesSkill(mkAccess({ generatePageLocal, landGeneratedPages }))

    const r = await skill.executeTool!(
      call('generate_deck', { core_hook: 'hook', style: 'style', pages: pages(6) }),
    )

    expect(generatePageLocal).toHaveBeenCalledTimes(4) // two batches: two landed, two blocked
    expect(landGeneratedPages).toHaveBeenCalledTimes(2) // one per landed page
    expect(r.isError).toBe(true)
    expect(r.mutated).toBe(true)
    expect(r.output).toContain('2 of 6 page(s) landed')
    expect(r.output).toContain('Out of credit.')
  })
})

describe('regenerate_slide with a blocked connection', () => {
  it('does not retry the page', async () => {
    const generatePageLocal = vi.fn(async () => ({
      ok: false,
      error: 'The subscription limit is used up.',
      stopKind: 'rate-limit',
    }))
    const skill = createSlidesSkill(mkAccess({ generatePageLocal, regenerateSlide: vi.fn() }))

    const r = await skill.executeTool!(
      call('regenerate_slide', { slideIndex: 0, brief: 'Make the title bigger' }),
    )

    expect(generatePageLocal).toHaveBeenCalledTimes(1)
    expect(r.isError).toBe(true)
    expect(r.output).toContain('Page generation stopped')
    expect(r.output).toContain('Do not call regenerate_slide again')
  })
})
