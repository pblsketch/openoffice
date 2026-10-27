// @vitest-environment node
/**
 * Co-editing in the main process, without Electron: the bytes a shared book's
 * guests open, a guest's copy taking the shared chapters when its session
 * ends (any well-formed text, but never a read-only chapter), and what a
 * guest view may write.
 */
import { describe, expect, it } from 'vitest'
import { EpubBookSession } from '../src/main/book-session'
import {
  adoptChapters,
  collabBase,
  forgetCollabView,
  isCollabCopy,
  isCollabGuest,
  setCollabGuest,
} from '../src/main/collab'
import { buildBook, entryText } from './helpers/book'

async function session(options: Parameters<typeof buildBook>[0] = {}): Promise<EpubBookSession> {
  const opened = await EpubBookSession.open(await buildBook(options))
  if (!opened.ok) throw new Error(`did not open: ${opened.reason}`)
  return opened.session
}

async function source(s: EpubBookSession, spineIndex: number): Promise<string> {
  const chapter = await s.readChapter(spineIndex)
  if (!chapter.ok) throw new Error('chapter did not read')
  return chapter.source
}

describe('the bytes guests open', () => {
  it('are the book as opened when nothing changed, else what a save would write', async () => {
    const s = await session()
    expect(await collabBase(s)).toBe(s.bytes)
    const chapter = await s.readChapter(0)
    if (!chapter.ok || chapter.broken) throw new Error('no chapter')
    const block = chapter.blocks.find((b) => b.kind === 'p')!
    await s.applyEdits(0, [{ op: 'replace', blockId: block.id, text: 'Unsaved edit.' }])
    const base = await collabBase(s)
    expect(base).not.toBe(s.bytes)
    expect(await entryText(base!, 'OEBPS/text/one.xhtml')).toContain('<p>Unsaved edit.</p>')
    // nothing was saved: the session still holds the edit as unsaved
    expect(s.isDirty()).toBe(true)
  })
})

describe("a guest's copy taking the shared chapters", () => {
  it('takes a text with blocks added, which a range replacement from the page may not', async () => {
    const s = await session()
    const before = await source(s, 0)
    const shared = before.replace(
      '<p>Second paragraph.</p>',
      '<p>Second</p>\n<p>paragraph, split.</p>',
    )
    const outside = await s.replaceRanges(0, 0, [{ start: 0, end: before.length, text: shared }])
    expect(outside).toMatchObject({ ok: false })
    expect(await s.adoptText(0, shared)).toBe(true)
    expect(await source(s, 0)).toBe(shared)
    const chapter = await s.readChapter(0)
    expect(chapter.ok && chapter.version).toBe(1)
    const prepared = await s.prepareSave()
    if (!prepared.result.ok || !prepared.result.changed) throw new Error('nothing to save')
    expect(await entryText(prepared.result.bytes, 'OEBPS/text/one.xhtml')).toContain(
      '<p>paragraph, split.</p>',
    )
  })

  it('refuses a text that is not well-formed, and leaves read-only chapters alone', async () => {
    const s = await session({ fixedChapter: true })
    const before = await source(s, 0)
    expect(await s.adoptText(0, before.replace('</h1>', ''))).toBe(false)
    expect(await source(s, 0)).toBe(before)
    const fixed = await source(s, 1)
    expect(await s.adoptText(1, fixed.replace('Third', 'Changed'))).toBe(false)
    expect(await source(s, 1)).toBe(fixed)
    expect(await s.adoptText(0, 42)).toBe(false)
    expect(await s.adoptText(0, before)).toBe(true)
    expect(s.isDirty()).toBe(false)
  })

  it('counts the chapters taken from a list in any shape', async () => {
    const s = await session()
    const one = (await source(s, 0)).replace('First paragraph.', 'From the host.')
    expect(await adoptChapters(s, 'nope')).toBe(0)
    expect(
      await adoptChapters(s, [
        { spineIndex: 0, source: one },
        { spineIndex: 9, source: one },
        null,
      ]),
    ).toBe(1)
    expect(await source(s, 0)).toContain('From the host.')
  })
})

describe('a guest view', () => {
  it('writes nothing while live, then holds an unsaved copy until saved elsewhere', () => {
    const copy = 'C:/temp/genoffice-collab-1/book.epub'
    setCollabGuest(7, 'copy', copy)
    expect(isCollabCopy(7, copy)).toBe(false)
    setCollabGuest(7, 'live', copy)
    expect(isCollabGuest(7)).toBe(true)
    expect(isCollabCopy(7, copy)).toBe(false)
    setCollabGuest(7, 'copy', 'C:/elsewhere.epub')
    expect(isCollabGuest(7)).toBe(false)
    // the copy is the path it opened, whatever the renderer says later
    expect(isCollabCopy(7, copy)).toBe(true)
    expect(isCollabCopy(7, 'C:/saved/book.epub')).toBe(false)
    expect(isCollabGuest(8)).toBe(false)
    forgetCollabView(7)
    expect(isCollabCopy(7, copy)).toBe(false)
  })
})
