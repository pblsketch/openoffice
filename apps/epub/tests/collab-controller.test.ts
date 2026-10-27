/**
 * The edit controller under co-editing: two people's controllers on one
 * in-memory book (the host's book, which a guest reaches through the host).
 * Someone else's edit is drawn without losing what is typed here, blocks
 * that came or went redraw the chapter (after an input method finishes),
 * undo never takes back someone else's edit, and only the host's book
 * counts as changed by it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  EpubEditController,
  type EditApi,
  type EditHost,
  type OkEdit,
} from '../src/renderer/edit/controller'
import { chapterOf } from '../src/renderer/collab/routed-api'
import { buildChapterHtml } from '../src/renderer/reader/chapter-html'
import type { EpubEditResult } from '../src/shared/ipc'
import { FakeBook } from './helpers/edit-backend'

const frames: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

const P3 = '<p>Alpha one.</p>\n<p>Beta two.</p>\n<p>Gamma three.</p>'

function html(chapter: {
  source: string
  path: string
  blocks: readonly { id: string; tag: string; outer: { start: number } }[]
}): string {
  return buildChapterHtml({
    source: chapter.source,
    broken: false,
    blocks: chapter.blocks,
    baseUrl: `epub-asset://t/${chapter.path}`,
  })
}

function frameDoc(markup: string): Document {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  frames.push(iframe)
  const doc = iframe.contentDocument!
  const parsed = new DOMParser().parseFromString(markup, 'text/html')
  doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement)
  return doc
}

/** One person's screen on the shared book; `made` lists the edits this person made. */
function person(book: FakeBook, api?: Partial<EditApi>) {
  const made: OkEdit[] = []
  const record = async (result: Promise<EpubEditResult>) => {
    const r = await result
    if (r.ok) made.push(r)
    return r
  }
  const host: EditHost = {
    api: {
      readChapter: book.readChapter,
      applyEdits: (request) => record(book.applyEdits(request)),
      replaceRanges: (request) => record(book.replaceRanges(request)),
      setTranslationLock: book.setTranslationLock,
      ...api,
    },
    chapterHtml: (c) => html(c),
    readingText: () => '',
    showChapter: () => {},
    notify: () => {},
    changed: () => {},
  }
  const controller = new EpubEditController(host, 5)
  let doc: Document | null = null
  const open = async (i: number): Promise<Document> => {
    const chapter = await book.readChapter(i)
    if (!chapter.ok || chapter.broken) throw new Error('chapter did not read')
    doc = frameDoc(html(chapter))
    controller.attach(doc, chapter)
    return doc
  }
  const block = (id: string): HTMLElement => {
    const el = doc!.querySelector(`[data-epub-block="${id}"]`)
    if (!el) throw new Error(`no block ${id}`)
    return el as HTMLElement
  }
  const textIn = (id: string, contains: string): Text => {
    const walker = doc!.createTreeWalker(block(id), 4)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n as Text).data.includes(contains)) return n as Text
    }
    throw new Error(`no text "${contains}" in ${id}`)
  }
  const caret = (node: Node, offset: number): void => {
    const range = doc!.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const selection = doc!.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }
  const win = () => doc!.defaultView as unknown as typeof globalThis
  const type = (id: string, contains: string, next: string): void => {
    const node = textIn(id, contains)
    node.data = node.data.replace(contains, next)
    caret(node, node.data.length)
    block(id).dispatchEvent(new (win().Event)('input', { bubbles: true }))
  }
  const ids = () =>
    Array.from(doc!.querySelectorAll('[data-epub-block]')).map((el) =>
      el.getAttribute('data-epub-block'),
    )
  /** what this person made, as the others receive it */
  const last = () => chapterOf(made.at(-1)!)
  return { controller, made, open, block, textIn, caret, type, win, ids, last }
}

describe("someone else's edit on screen", () => {
  it('redraws the changed block and keeps the one typed in here', async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(0)
    guest.type('b2', 'Beta', 'Beta typed')
    const typed = guest.block('b2')
    host.type('b1', 'Alpha', 'Alpha by host')
    await host.controller.flush()
    guest.controller.applyRemote(host.last())
    expect(guest.block('b1').textContent).toBe('Alpha by host one.')
    // the typed block is the same element, text and all, and still editable
    expect(guest.block('b2')).toBe(typed)
    expect(typed.textContent).toBe('Beta typed two.')
    expect(typed.getAttribute('contenteditable')).toBe('true')
    await guest.controller.flush()
    expect(book.source(0)).toContain('<p>Alpha by host one.</p>\n<p>Beta typed two.</p>')
  })

  it('redraws the chapter when blocks came or went, keeping the typed block', async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(0)
    guest.type('b3', 'Gamma', 'Gamma typed')
    const typed = guest.block('b3')
    await host.controller.applyEdits(0, [{ op: 'split', blockId: 'b1', offset: 5 }])
    guest.controller.applyRemote(host.last())
    expect(guest.ids()).toHaveLength(4)
    expect(guest.block('b1').textContent).toBe('Alpha')
    expect(guest.block('b3')).toBe(typed)
    await guest.controller.flush()
    expect(book.source(0)).toContain('<p>Alpha</p>')
    expect(book.source(0)).toContain('<p>Gamma typed three.</p>')
  })

  it('keeps a block whose edit is still on its way as it is drawn', async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    let release: (() => void) | null = null
    const guest = person(book, {
      applyEdits: async (request) => {
        await new Promise<void>((resolve) => (release = resolve))
        return book.applyEdits(request)
      },
    })
    await host.open(0)
    await guest.open(0)
    guest.type('b2', 'Beta', 'Beta sent')
    const sending = guest.controller.flush()
    await new Promise((r) => setTimeout(r, 0))
    host.type('b1', 'Alpha', 'Alpha meanwhile')
    await host.controller.flush()
    guest.controller.applyRemote(host.last())
    expect(guest.block('b2').textContent).toBe('Beta sent two.')
    expect(guest.block('b2').getAttribute('contenteditable')).toBe('true')
    release!()
    await sending
    expect(book.source(0)).toContain('<p>Alpha meanwhile one.</p>\n<p>Beta sent two.</p>')
    expect(guest.block('b1').textContent).toBe('Alpha meanwhile one.')
  })

  it('waits for an input method to finish before blocks that came or went are drawn', async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    const doc = await guest.open(0)
    guest.block('b3').dispatchEvent(new (guest.win().Event)('compositionstart', { bubbles: true }))
    await host.controller.applyEdits(0, [{ op: 'split', blockId: 'b1', offset: 5 }])
    guest.controller.applyRemote(host.last())
    expect(guest.ids()).toHaveLength(3)
    guest.type('b3', 'Gamma', '감마')
    guest.block('b3').dispatchEvent(new (guest.win().Event)('compositionend', { bubbles: true }))
    expect(guest.ids()).toHaveLength(4)
    expect(doc.body.textContent).toContain('감마 three.')
    await guest.controller.flush()
    expect(book.source(0)).toContain('<p>감마 three.</p>')
  })

  it('ignores an edit older than what is known here', async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(0)
    host.type('b1', 'Alpha', 'First')
    await host.controller.flush()
    const first = host.last()
    host.type('b1', 'First', 'Second')
    await host.controller.flush()
    guest.controller.applyRemote(host.last())
    guest.controller.applyRemote(first)
    expect(guest.block('b1').textContent).toBe('Second one.')
  })
})

describe('history and changed state', () => {
  it("undo never takes back someone else's edit: a chapter they changed leaves the history", async () => {
    const book = new FakeBook([{ body: P3 }, { body: '<p>Delta four.</p>' }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(0)
    guest.type('b2', 'Beta', 'Beta guest')
    await guest.controller.flush()
    expect(guest.controller.state().canUndo).toBe(true)
    host.type('b1', 'Alpha', 'Alpha host')
    await host.controller.flush()
    guest.controller.applyRemote(host.last())
    expect(guest.controller.state().canUndo).toBe(false)
    await guest.controller.undo()
    expect(book.source(0)).toContain('Beta guest two.')
    expect(book.source(0)).toContain('Alpha host one.')
  })

  it('keeps the history of the chapters nobody else touched', async () => {
    const book = new FakeBook([{ body: P3 }, { body: '<p>Delta four.</p>' }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(1)
    guest.type('b1', 'Delta', 'Delta guest')
    await guest.controller.flush()
    host.type('b1', 'Alpha', 'Alpha host')
    await host.controller.flush()
    guest.controller.applyRemote(host.last())
    expect(guest.controller.state().canUndo).toBe(true)
    await guest.controller.undo()
    expect(book.source(1)).toContain('<p>Delta four.</p>')
    expect(book.source(0)).toContain('Alpha host one.')
  })

  it("marks the host's book changed by a guest's edit, never a guest's copy", async () => {
    const book = new FakeBook([{ body: P3 }])
    const host = person(book)
    const guest = person(book)
    await host.open(0)
    await guest.open(0)
    guest.type('b2', 'Beta', 'Beta guest')
    await guest.controller.flush()
    expect(host.controller.state().dirty).toBe(false)
    host.controller.applyRemote(guest.last(), guest.made.at(-1)!.dirty)
    expect(host.controller.state().dirty).toBe(true)
    expect(host.block('b2').textContent).toBe('Beta guest two.')
    const other = person(book)
    await other.open(0)
    other.controller.applyRemote(guest.last())
    expect(other.controller.state().dirty).toBe(false)
  })

  it('forgets versions, history and unsent typing when the book that answers changes', async () => {
    const book = new FakeBook([{ body: P3 }])
    const guest = person(book)
    await guest.open(0)
    guest.type('b1', 'Alpha', 'Alpha sent')
    await guest.controller.flush()
    guest.type('b2', 'Beta', 'Beta unsent')
    guest.controller.forgetHistory()
    expect(guest.controller.state()).toMatchObject({ canUndo: false, canRedo: false })
    await guest.controller.flush()
    expect(book.source(0)).not.toContain('Beta unsent')
    guest.controller.markChanged()
    expect(guest.controller.state().dirty).toBe(true)
  })
})

describe('where this person is', () => {
  it('gives the caret as a block and offsets, and finds such a place on screen', async () => {
    const book = new FakeBook([{ body: P3 }])
    const guest = person(book)
    await guest.open(0)
    expect(guest.controller.caret()).toBeNull()
    guest.caret(guest.textIn('b2', 'Beta'), 3)
    expect(guest.controller.caret()).toEqual({ id: 'b2', start: 3, end: 3 })
    expect(guest.controller.rangeIn('b2', 1, 4)?.toString()).toBe('eta')
    expect(guest.controller.rangeIn('b2', 4, 1)?.toString()).toBe('eta')
    expect(guest.controller.rangeIn('b2', 0, 999)?.toString()).toBe('Beta two.')
    expect(guest.controller.rangeIn('b9', 0, 1)).toBeNull()
  })
})
