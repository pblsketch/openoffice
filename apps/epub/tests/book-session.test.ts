// @vitest-environment node
/**
 * The book session: chapters read from the one copy of the bytes, edits as
 * block edits or range replacements, and the refusals that do not depend on
 * the renderer (translation lock, fixed layout, broken chapters, stale
 * versions).
 */
import { describe, expect, it } from 'vitest'
import { applyReplacements } from '@genoffice/epub-engine'
import {
  EpubBookSession,
  blockEditOf,
  diffReplacement,
  invertReplacements,
  replacementsOf,
} from '../src/main/book-session'
import { buildBook } from './helpers/book'

async function session(options: Parameters<typeof buildBook>[0] = {}): Promise<EpubBookSession> {
  const opened = await EpubBookSession.open(await buildBook(options))
  if (!opened.ok) throw new Error(`did not open: ${opened.reason}`)
  return opened.session
}

async function firstParagraph(s: EpubBookSession) {
  const chapter = await s.readChapter(0)
  if (!chapter.ok || chapter.broken) throw new Error('chapter did not read')
  const block = chapter.blocks.find((b) => b.kind === 'p')!
  return { chapter, block }
}

describe('opening', () => {
  it('holds one copy of the book: the opened book reads from the session bytes', async () => {
    const bytes = await buildBook()
    const opened = await EpubBookSession.open(bytes)
    if (!opened.ok) throw new Error(opened.reason)
    const s = opened.session
    expect(s.bytes).toBe(bytes)
    expect(new TextDecoder().decode((await s.book.read('mimetype'))!)).toBe('application/epub+zip')
    // a change to the bytes shows through the book: there is no second copy
    bytes.fill(0)
    expect(await s.book.read('mimetype')).toEqual(new Uint8Array(20))
  })

  it('stands on the saved bytes alone after a save', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    await s.applyEdits(0, [{ op: 'replace', blockId: block.id, text: 'Changed.' }])
    const prepared = await s.prepareSave({ now: () => new Date('2026-10-24T00:00:00Z') })
    if (!prepared.result.ok || !prepared.result.changed) throw new Error('nothing to save')
    const saved = prepared.result.bytes
    await s.rebase(saved, prepared.snapshot)
    expect(s.bytes).toBe(saved)
    expect((await s.book.readText('OEBPS/text/one.xhtml'))!.text).toContain('<p>Changed.</p>')
    saved.fill(0)
    expect(await s.book.read('mimetype')).toEqual(new Uint8Array(20))
  })

  it('refuses bytes that are not a book, with the engine reason', async () => {
    const opened = await EpubBookSession.open(new TextEncoder().encode('not a zip'))
    expect(opened).toEqual({ ok: false, reason: 'damaged' })
  })

  it('gives the book summary, the document hash and no read-only reason for a reflowable book', async () => {
    const s = await session()
    const summary = s.summary()
    expect(summary.spine.map((i) => i.path)).toEqual([
      'OEBPS/text/one.xhtml',
      'OEBPS/text/two.xhtml',
    ])
    expect(summary.metadata.title).toBe('A Small Book')
    expect(s.docHash).toMatch(/^[0-9a-f]{64}$/)
    expect(s.bookReadOnly()).toBeNull()
  })
})

describe('reading chapters', () => {
  it('hands back the chapter text and its blocks with source ranges', async () => {
    const s = await session()
    const { chapter, block } = await firstParagraph(s)
    expect(chapter.version).toBe(0)
    expect(chapter.readOnly).toBeNull()
    expect(chapter.source.slice(block.inner.start, block.inner.end)).toBe('First paragraph.')
  })

  it('reports a broken chapter as read only and gives its text as stored', async () => {
    const s = await session({ brokenChapter: true })
    const chapter = await s.readChapter(1)
    expect(chapter.ok && chapter.broken).toBe(true)
    if (!chapter.ok) return
    expect(chapter.readOnly).toBe('broken-chapter')
    expect(chapter.source).toContain('Broken <b>markup</p>')
  })

  it('refuses an index that is not a spine index', async () => {
    const s = await session()
    for (const index of [-1, 2, 1.5, '0', null]) {
      expect(await s.readChapter(index)).toMatchObject({ ok: false, error: 'invalid-request' })
    }
  })
})

describe('editing', () => {
  it('applies block edits, keeps the stored text, and marks the book dirty', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    const result = await s.applyEdits(0, [{ op: 'replace', blockId: block.id, text: 'Changed.' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.version).toBe(1)
    expect(result.source).toContain('<p>Changed.</p>')
    expect(result.dirty).toBe(true)
    expect(s.isDirty()).toBe(true)
    const again = await s.readChapter(0)
    expect(again.ok && again.source).toBe(result.source)
  })

  it('gives the inverse of every edit; applying it restores the text and the book is clean again', async () => {
    const s = await session()
    const { chapter, block } = await firstParagraph(s)
    const edit = await s.applyEdits(0, [{ op: 'split', blockId: block.id, offset: 5 }])
    if (!edit.ok) throw new Error('split refused')
    expect(applyReplacements(edit.source, edit.inverse)).toBe(chapter.source)
    const undo = await s.replaceRanges(0, edit.version, edit.inverse)
    expect(undo.ok && undo.source).toBe(chapter.source)
    expect(s.isDirty()).toBe(false)
    expect(s.editsForSave().size).toBe(0)
  })

  it('takes back merges, deletes and insertions, and redoes them, through range replacements', async () => {
    const s = await session()
    const steps: Array<(ids: string[]) => Record<string, unknown>> = [
      (ids) => ({ op: 'merge', blockId: ids[1], with: 'previous' }),
      (ids) => ({ op: 'delete', blockId: ids[1] }),
      (ids) => ({ op: 'insert_after', blockId: ids[0], text: 'New one.' }),
    ]
    for (const step of steps) {
      const before = await s.readChapter(0)
      if (!before.ok || before.broken) throw new Error('chapter did not read')
      const ids = before.blocks.filter((b) => b.kind === 'p').map((b) => b.id)
      const edit = await s.applyEdits(0, [step(ids)])
      if (!edit.ok) throw new Error(`edit refused: ${edit.message}`)
      const undo = await s.replaceRanges(0, edit.version, edit.inverse)
      if (!undo.ok) throw new Error(`undo refused: ${undo.message}`)
      expect(undo.source).toBe(before.source)
      const redo = await s.replaceRanges(0, undo.version, undo.inverse)
      if (!redo.ok) throw new Error(`redo refused: ${redo.message}`)
      expect(redo.source).toBe(edit.source)
      const back = await s.replaceRanges(0, redo.version, redo.inverse)
      expect(back.ok && back.source).toBe(before.source)
    }
  })

  it('refuses replacements outside the blocks that do not take the chapter back to an earlier text', async () => {
    const s = await session()
    const { chapter, block } = await firstParagraph(s)
    const head = chapter.source.indexOf('</head>')
    // right after the paragraph, between it and the next block
    const between = block.outer.end
    const bad = [
      [{ start: head, end: head, text: '<script>alert(1)</script>' }],
      [{ start: between, end: between, text: '<p>Smuggled.</p>' }],
      // starts inside the block, ends past it
      [{ start: block.inner.start, end: block.outer.end, text: 'x</p>' }],
      // the whole block, tags and all
      [{ start: block.outer.start, end: block.outer.end, text: '<div>x</div>' }],
    ]
    for (const replacements of bad) {
      expect(await s.replaceRanges(0, 0, replacements)).toMatchObject({
        ok: false,
        error: 'invalid-request',
      })
    }
    expect(s.isDirty()).toBe(false)
    // inside a block's inner range is taken
    const inside = await s.replaceRanges(0, 0, [
      { start: block.inner.start, end: block.inner.start + 5, text: 'Very first' },
    ])
    expect(inside.ok && inside.source).toContain('<p>Very first paragraph.</p>')
  })

  it('still takes the chapter back to its text from before a save', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    const edit = await s.applyEdits(0, [{ op: 'delete', blockId: block.id }])
    if (!edit.ok) throw new Error('delete refused')
    const prepared = await s.prepareSave()
    if (!prepared.result.ok || !prepared.result.changed) throw new Error('nothing to save')
    await s.rebase(prepared.result.bytes, prepared.snapshot)
    expect(s.isDirty()).toBe(false)
    const undo = await s.replaceRanges(0, edit.version, edit.inverse)
    expect(undo.ok && undo.source).toContain('<p>First paragraph.</p>')
  })

  it('refuses every edit while the translation lock is on, and takes them again after', async () => {
    const s = await session()
    const { chapter, block } = await firstParagraph(s)
    s.setLocked(true)
    expect(await s.applyEdits(0, [{ op: 'delete', blockId: block.id }])).toMatchObject({
      ok: false,
      error: 'locked',
    })
    expect(
      await s.replaceRanges(0, 0, [{ start: block.inner.start, end: block.inner.end, text: 'x' }]),
    ).toMatchObject({ ok: false, error: 'locked' })
    expect(s.isDirty()).toBe(false)
    s.setLocked(false)
    const ok = await s.replaceRanges(0, chapter.version, [
      { start: block.inner.start, end: block.inner.end, text: 'x' },
    ])
    expect(ok.ok).toBe(true)
  })

  it('refuses edits of a fixed-layout book', async () => {
    const s = await session({ fixedLayout: true })
    expect(s.bookReadOnly()).toBe('fixed-layout-book')
    const chapter = await s.readChapter(0)
    expect(chapter.ok && chapter.readOnly).toBe('fixed-layout-book')
    expect(await s.applyEdits(0, [{ op: 'delete', blockId: 'b1' }])).toMatchObject({
      ok: false,
      error: 'read-only',
      readOnly: 'fixed-layout-book',
    })
  })

  it('refuses edits of a fixed-layout chapter but not of the others', async () => {
    const s = await session({ fixedChapter: true })
    expect(await s.applyEdits(1, [{ op: 'delete', blockId: 'b1' }])).toMatchObject({
      ok: false,
      error: 'read-only',
      readOnly: 'fixed-layout-chapter',
    })
    const { block } = await firstParagraph(s)
    expect((await s.applyEdits(0, [{ op: 'delete', blockId: block.id }])).ok).toBe(true)
  })

  it('refuses edits of a broken chapter', async () => {
    const s = await session({ brokenChapter: true })
    expect(await s.replaceRanges(1, 0, [{ start: 0, end: 0, text: '' }])).toMatchObject({
      ok: false,
      error: 'read-only',
      readOnly: 'broken-chapter',
    })
  })

  it('refuses replacements made against an older version', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    const range = { start: block.inner.start, end: block.inner.end, text: 'x' }
    expect((await s.replaceRanges(0, 0, [range])).ok).toBe(true)
    expect(await s.replaceRanges(0, 0, [range])).toMatchObject({ ok: false, error: 'stale' })
  })

  it('refuses replacements that break the chapter, and leaves it as it was', async () => {
    const s = await session()
    const { chapter, block } = await firstParagraph(s)
    const result = await s.replaceRanges(0, 0, [
      { start: block.inner.start, end: block.inner.end, text: '<b>open' },
    ])
    expect(result).toMatchObject({ ok: false, error: 'refused' })
    expect((await s.readChapter(0)).ok && (await s.readChapter(0))).toMatchObject({
      source: chapter.source,
      version: 0,
    })
  })

  it('passes engine refusals through with the index of the refused edit', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    const result = await s.applyEdits(0, [
      { op: 'replace', blockId: block.id, text: 'ok' },
      { op: 'replace', blockId: 'b999', text: 'nope' },
    ])
    expect(result).toMatchObject({ ok: false, error: 'refused', index: 1 })
    expect(s.isDirty()).toBe(false)
  })

  it('refuses malformed requests', async () => {
    const s = await session()
    expect(await s.applyEdits(0, [])).toMatchObject({ error: 'invalid-request' })
    expect(await s.applyEdits(0, [{ op: 'eval', blockId: 'b1' }])).toMatchObject({
      error: 'invalid-request',
    })
    expect(await s.replaceRanges(0, 0, [{ start: -1, end: 0, text: '' }])).toMatchObject({
      error: 'invalid-request',
    })
    expect(await s.replaceRanges(0, 0, [{ start: 0, end: 1e9, text: '' }])).toMatchObject({
      error: 'invalid-request',
    })
  })
})

describe('book text for the in-app MCP read', () => {
  it('is spine-ordered, has headings as # lines and includes unsaved edits', async () => {
    const s = await session()
    const { block } = await firstParagraph(s)
    await s.applyEdits(0, [{ op: 'replace', blockId: block.id, text: 'Edited, not saved.' }])
    const text = await s.readText()
    expect(text.indexOf('# Chapter One')).toBeLessThan(text.indexOf('# Chapter Two'))
    expect(text).toContain('Edited, not saved.')
    expect(text).not.toContain('First paragraph.')
  })
})

describe('pure helpers', () => {
  it('inverts replacements in the coordinates of the new text', () => {
    const before = 'abcdefghij'
    const reps = [
      { start: 1, end: 3, text: 'XYZW' },
      { start: 6, end: 6, text: '!' },
    ]
    const after = applyReplacements(before, reps)
    expect(applyReplacements(after, invertReplacements(before, reps))).toBe(before)
  })

  it('diffs two texts into one replacement around the change', () => {
    expect(diffReplacement('hello world', 'hello there world')).toEqual({
      start: 6,
      end: 6,
      text: 'there ',
    })
    expect(applyReplacements('abc', [diffReplacement('abc', 'xyz')])).toBe('xyz')
  })

  it('checks block edits and replacements field by field', () => {
    expect(blockEditOf({ op: 'split', blockId: 'b1', offset: 3 })).toEqual({
      op: 'split',
      blockId: 'b1',
      offset: 3,
    })
    expect(blockEditOf({ op: 'split', blockId: 'b1', offset: -1 })).toBeNull()
    expect(blockEditOf({ op: 'merge', blockId: 'b1', with: 'sideways' })).toBeNull()
    expect(
      blockEditOf({ op: 'toggle_mark', blockId: 'b1', mark: 'u', start: 0, end: 1 }),
    ).toBeNull()
    expect(replacementsOf([{ start: 0, end: 1, text: 1 }])).toBeNull()
    expect(replacementsOf('nope')).toBeNull()
  })
})
