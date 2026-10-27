// @vitest-environment node
/**
 * Co-editing's routing of the editing calls: a host runs its own calls and
 * reports every change and lock, a guest sends reads and edits to the host
 * and never counts as changed, an ended guest reaches no book at all; and
 * what arrives over the network is checked before it is used.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  ChangedChapters,
  TOPIC,
  applyRequestOf,
  catchupOf,
  chapterOf,
  rangesRequestOf,
  remoteChapterOf,
  remoteEditOf,
  routedApi,
  type OkEdit,
} from '../src/renderer/collab/routed-api'
import type { EpubApi, EpubEditResult } from '../src/shared/ipc'
import type { RemoteChapter } from '../src/renderer/edit/controller'

const BLOCK = {
  id: 'b1',
  kind: 'p',
  tag: 'p',
  flowing: true,
  outer: { start: 10, end: 30 },
  inner: { start: 13, end: 26 },
} as const

function okEdit(over: Partial<OkEdit> = {}): OkEdit {
  return {
    ok: true,
    spineIndex: 0,
    path: 'OEBPS/text/one.xhtml',
    source: '<p>Text</p>',
    version: 1,
    blocks: [{ ...BLOCK, outer: { ...BLOCK.outer }, inner: { ...BLOCK.inner } }],
    created: [],
    replacements: [{ start: 3, end: 3, text: 'x' }],
    inverse: [{ start: 3, end: 4, text: '' }],
    dirty: true,
    ...over,
  }
}

function fakeBase() {
  return {
    readChapter: vi.fn(async () => ({ ok: false as const, error: 'not-open' as const })),
    applyEdits: vi.fn(async (): Promise<EpubEditResult> => okEdit()),
    replaceRanges: vi.fn(async (): Promise<EpubEditResult> => okEdit({ version: 2 })),
    setTranslationLock: vi.fn(async (locked: boolean) => locked),
    setDirty: vi.fn(),
    collabBase: vi.fn(),
  }
}

const asApi = (base: ReturnType<typeof fakeBase>) => base as unknown as EpubApi

describe('routing the editing calls', () => {
  it('passes everything through to the own book outside a session, other calls untouched', async () => {
    const base = fakeBase()
    const { api } = routedApi(asApi(base))
    await api.applyEdits({ spineIndex: 0, edits: [] })
    await api.readChapter(1)
    expect(base.applyEdits).toHaveBeenCalledTimes(1)
    expect(base.readChapter).toHaveBeenCalledWith(1)
    expect(api.collabBase).toBe(base.collabBase)
    expect(api.setDirty).toBe(base.setDirty)
  })

  it('a host reports every change that changed something, and its lock', async () => {
    const base = fakeBase()
    const routed = routedApi(asApi(base))
    const changed = vi.fn()
    const locked = vi.fn()
    routed.setRoute({ kind: 'host', changed, locked })
    const result = await routed.api.applyEdits({ spineIndex: 0, edits: [] })
    expect(result).toMatchObject({ ok: true, dirty: true })
    expect(changed).toHaveBeenCalledWith(result)
    base.applyEdits.mockResolvedValueOnce(okEdit({ replacements: [] }))
    await routed.api.applyEdits({ spineIndex: 0, edits: [] })
    expect(changed).toHaveBeenCalledTimes(1)
    base.applyEdits.mockResolvedValueOnce({ ok: false, error: 'locked' })
    await routed.api.applyEdits({ spineIndex: 0, edits: [] })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(await routed.api.setTranslationLock(true)).toBe(true)
    expect(locked).toHaveBeenCalledWith(true)
  })

  it("a guest reads and edits through the host, and the host's dirty state is not its own", async () => {
    const base = fakeBase()
    const routed = routedApi(asApi(base))
    const changed = vi.fn()
    const request = vi.fn(async (topic: string, payload: unknown): Promise<unknown> => {
      if (topic === TOPIC.read) return { ok: true, spineIndex: payload, from: 'host' }
      return okEdit({ version: 7 })
    })
    routed.setRoute({ kind: 'guest', request, changed })
    expect(await routed.api.readChapter(2)).toMatchObject({ from: 'host', spineIndex: 2 })
    const applied = await routed.api.applyEdits({ spineIndex: 0, edits: [] })
    expect(applied).toMatchObject({ ok: true, version: 7, dirty: false })
    const ranges = { spineIndex: 0, version: 7, replacements: [] }
    await routed.api.replaceRanges(ranges)
    expect(request.mock.calls.map(([topic]) => topic)).toEqual([
      TOPIC.read,
      TOPIC.apply,
      TOPIC.ranges,
    ])
    expect(request).toHaveBeenLastCalledWith(TOPIC.ranges, ranges)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(base.readChapter).not.toHaveBeenCalled()
    expect(base.applyEdits).not.toHaveBeenCalled()
    // the guest follows the host's lock without locking a book of its own
    expect(await routed.api.setTranslationLock(true)).toBe(true)
    expect(base.setTranslationLock).not.toHaveBeenCalled()
  })

  it('a lost session or an empty answer is a failed call, never a throw', async () => {
    const base = fakeBase()
    const routed = routedApi(asApi(base))
    const request = vi.fn(async (): Promise<unknown> => {
      throw new Error('ended')
    })
    routed.setRoute({ kind: 'guest', request, changed: vi.fn() })
    expect(await routed.api.applyEdits({ spineIndex: 0, edits: [] })).toMatchObject({
      ok: false,
      error: 'failed',
      message: 'ended',
    })
    request.mockResolvedValueOnce(null)
    expect(await routed.api.readChapter(0)).toMatchObject({ ok: false, error: 'failed' })
  })

  it('an ended guest reaches neither book until its copy took over', async () => {
    const base = fakeBase()
    const routed = routedApi(asApi(base))
    routed.setRoute({ kind: 'closed' })
    expect(await routed.api.applyEdits({ spineIndex: 0, edits: [] })).toMatchObject({ ok: false })
    expect(
      await routed.api.replaceRanges({ spineIndex: 0, version: 1, replacements: [] }),
    ).toMatchObject({ ok: false })
    expect(await routed.api.readChapter(0)).toMatchObject({ ok: false })
    expect(base.applyEdits).not.toHaveBeenCalled()
    expect(base.replaceRanges).not.toHaveBeenCalled()
    expect(base.readChapter).not.toHaveBeenCalled()
    routed.setRoute({ kind: 'local' })
    await routed.api.applyEdits({ spineIndex: 0, edits: [] })
    expect(base.applyEdits).toHaveBeenCalledTimes(1)
  })
})

describe('what arrives from other peers', () => {
  it('takes a chapter only with its fields in shape', () => {
    const chapter = chapterOf(okEdit())
    expect(remoteChapterOf(chapter)).toEqual(chapter)
    expect(remoteChapterOf({ ...chapter, version: -1 })).toBeNull()
    expect(remoteChapterOf({ ...chapter, source: 5 })).toBeNull()
    expect(
      remoteChapterOf({ ...chapter, blocks: [{ ...BLOCK, outer: { start: 5, end: 2 } }] }),
    ).toBeNull()
    expect(remoteChapterOf({ ...chapter, blocks: 'b1' })).toBeNull()
    expect(remoteEditOf({ by: 'g1', chapter })).toEqual({ by: 'g1', chapter })
    expect(remoteEditOf({ chapter })).toBeNull()
  })

  it('a catch-up keeps the lock and the chapters in shape', () => {
    const chapter = chapterOf(okEdit())
    expect(catchupOf({ locked: true, chapters: [chapter, { nope: 1 }] })).toEqual({
      locked: true,
      chapters: [chapter],
    })
    expect(catchupOf({ chapters: [] })).toBeNull()
  })

  it("narrows a guest's requests to what the book takes (the main process checks the rest)", () => {
    const edits = [{ op: 'replace', blockId: 'b1', text: 'x' }]
    expect(applyRequestOf({ spineIndex: 1, edits, extra: true })).toEqual({ spineIndex: 1, edits })
    expect(applyRequestOf({ spineIndex: -1, edits })).toBeNull()
    expect(applyRequestOf({ spineIndex: 1, edits: 'x' })).toBeNull()
    const replacements = [{ start: 0, end: 1, text: '' }]
    expect(rangesRequestOf({ spineIndex: 0, version: 3, replacements })).toEqual({
      spineIndex: 0,
      version: 3,
      replacements,
    })
    expect(rangesRequestOf({ spineIndex: 0, version: 1.5, replacements })).toBeNull()
  })
})

describe('the chapters a session changed', () => {
  it('keeps each chapter as its latest edit left it', () => {
    const changed = new ChangedChapters()
    const one = (version: number, source: string): RemoteChapter => ({
      ...chapterOf(okEdit()),
      version,
      source,
    })
    changed.take(one(2, 'second'))
    changed.take(one(1, 'first'))
    changed.take({ ...one(1, 'other chapter'), path: 'OEBPS/text/two.xhtml', spineIndex: 1 })
    expect(changed.all().map((c) => c.source)).toEqual(['second', 'other chapter'])
    changed.take(one(3, 'third'))
    expect(changed.all()[0]!.source).toBe('third')
    changed.clear()
    expect(changed.all()).toEqual([])
  })
})
