/**
 * The editing controller against an in-memory book: which blocks are
 * editable, typing sent as block edits, Enter / Shift+Enter / Backspace /
 * Delete as split, line break and merge (structural blocks doing nothing on
 * Enter), bold and italic, plain-text paste, the per-tab history with its
 * cross-chapter undo, replace all as one undo with the read-only count, the
 * translation lock, and AI batches as one undo.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { EpubEditController, type EditHost, type OkChapter } from '../src/renderer/edit/controller'
import { buildChapterHtml } from '../src/renderer/reader/chapter-html'
import { buildTextIndex } from '../src/renderer/reader/book-search'
import { FakeBook, type ChapterSpec } from './helpers/edit-backend'

const frames: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

function html(chapter: {
  source: string
  path: string
  broken?: boolean
  blocks: OkChapter extends never
    ? never
    : readonly { id: string; tag: string; outer: { start: number } }[]
}): string {
  return buildChapterHtml({
    source: chapter.source,
    broken: chapter.broken === true,
    blocks: chapter.blocks,
    baseUrl: `epub-asset://t/${chapter.path}`,
  })
}

/** A same-origin frame document holding a drawing copy (the page's view of the chapter frame). */
function frameDoc(markup: string): Document {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  frames.push(iframe)
  const doc = iframe.contentDocument!
  const parsed = new DOMParser().parseFromString(markup, 'text/html')
  doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement)
  return doc
}

function setup(specs: ChapterSpec[]) {
  const book = new FakeBook(specs)
  const shown: Array<{ spineIndex: number; blockId: string | null }> = []
  const notices: string[] = []
  const host: EditHost = {
    api: book,
    chapterHtml: (c) => html({ ...c, broken: false }),
    readingText: (ch) => {
      const copy = html({ ...ch, blocks: ch.broken ? [] : ch.blocks })
      return buildTextIndex(new DOMParser().parseFromString(copy, 'text/html').body).text
    },
    showChapter: (spineIndex, blockId) => void shown.push({ spineIndex, blockId }),
    notify: (n) => void notices.push(n.key),
    changed: () => {},
  }
  const controller = new EpubEditController(host, 5)
  let doc: Document | null = null
  const open = async (i: number): Promise<Document> => {
    const chapter = await book.readChapter(i)
    if (!chapter.ok) throw new Error('chapter did not read')
    doc = frameDoc(html({ ...chapter, blocks: chapter.broken ? [] : chapter.blocks }))
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
  const caret = (node: Node, offset: number, endNode = node, endOffset = offset): void => {
    const range = doc!.createRange()
    range.setStart(node, offset)
    range.setEnd(endNode, endOffset)
    const selection = doc!.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }
  const win = () => doc!.defaultView as unknown as typeof globalThis
  /** True when the page took the key (default prevented). */
  const press = (target: Node, key: string, mods: KeyboardEventInit = {}): boolean => {
    const event = new (win().KeyboardEvent)('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...mods,
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  /** The user changed the text of a block in place. */
  const type = (id: string, contains: string, next: string): void => {
    const node = textIn(id, contains)
    node.data = node.data.replace(contains, next)
    caret(node, node.data.length)
    block(id).dispatchEvent(new (win().Event)('input', { bubbles: true }))
  }
  return { book, controller, open, block, textIn, caret, press, type, shown, notices, win }
}

const P3 =
  '<p>Alpha <a href="#x" class="ref">link</a> one.</p>\n<p>Beta two.</p>\n<p>Gamma three.</p>'

describe('which blocks are editable', () => {
  it('makes only the blocks of an editable chapter contenteditable, none of a read-only one', async () => {
    const t = setup([
      {
        body: '<section><p>Para</p><table><tr><td>Cell</td></tr></table><figure><img src="a.png"/><figcaption>Cap</figcaption></figure></section>',
      },
      { body: '<p>Fixed</p>', readOnly: 'fixed-layout-chapter' },
    ])
    const doc = await t.open(0)
    const editable = Array.from(doc.querySelectorAll('[contenteditable]'))
    expect(editable.map((el) => el.localName)).toEqual(['p', 'td', 'figcaption'])
    expect(editable.every((el) => el.hasAttribute('data-epub-block'))).toBe(true)
    expect(t.controller.state().editable).toBe(true)
    const fixed = await t.open(1)
    expect(fixed.querySelectorAll('[contenteditable]').length).toBe(0)
    expect(t.controller.state().editable).toBe(false)
  })
})

describe('typing', () => {
  it('sends the typed block as a replace edit, keeping the link, and undoes and redoes it', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    const stored = t.book.source(0)
    t.type('b1', 'Alpha', 'Alpha and omega')
    expect(t.controller.state().dirty).toBe(true)
    expect(t.book.dirtyCalls).toEqual([true])
    await t.controller.flush()
    expect(t.book.source(0)).toContain(
      '<p>Alpha and omega <a href="#x" class="ref">link</a> one.</p>',
    )
    expect(t.book.dirtyCalls).toEqual([true, false])
    expect(t.controller.state()).toMatchObject({ dirty: true, canUndo: true, canRedo: false })
    await t.controller.undo()
    expect(t.book.source(0)).toBe(stored)
    expect(t.block('b1').textContent).toBe('Alpha link one.')
    expect(t.controller.state()).toMatchObject({ canUndo: false, canRedo: true })
    await t.controller.redo()
    expect(t.book.source(0)).toContain('Alpha and omega <a')
  })

  it('sends typed text by itself after a short rest', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    t.type('b2', 'Beta', 'Better')
    await new Promise((r) => setTimeout(r, 40))
    await t.controller.flush()
    expect(t.book.source(0)).toContain('<p>Better two.</p>')
    expect(t.book.calls).toEqual([{ kind: 'apply', spineIndex: 0 }])
  })

  it('takes only the plain text of a paste', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    const beta = t.textIn('b2', 'Beta')
    t.caret(beta, 4)
    const event = new (t.win().Event)('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) =>
          type === 'text/html' ? '<b style="color:red">rich</b>' : ' pasted\nlines',
      },
    })
    beta.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('<p>Beta pasted lines two.</p>')
    expect(t.book.source(0)).not.toContain('rich')
  })
})

describe('Enter, Shift+Enter, Backspace and Delete', () => {
  it('splits a flowing block at the caret, after sending what was typed', async () => {
    const t = setup([{ body: P3 }])
    const doc = await t.open(0)
    t.type('b2', 'Beta', 'Beta!')
    const node = t.textIn('b2', 'Beta!')
    t.caret(node, 5)
    expect(t.press(node, 'Enter')).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('<p>Beta!</p>\n<p> two.</p>')
    expect(t.book.calls.map((c) => c.kind)).toEqual(['apply', 'apply'])
    // the screen was drawn again: the new block is there, editable, with the caret
    const blocks = Array.from(doc.querySelectorAll('[data-epub-block]'))
    expect(blocks.map((b) => b.textContent)).toEqual([
      'Alpha link one.',
      'Beta!',
      ' two.',
      'Gamma three.',
    ])
    expect(blocks[2]!.getAttribute('contenteditable')).toBe('true')
    const selection = doc.getSelection()!
    expect(blocks[2]!.contains(selection.anchorNode)).toBe(true)
    // undo takes the split back, then the typing
    await t.controller.undo()
    expect(t.book.source(0)).toContain('<p>Beta! two.</p>')
  })

  it('does nothing on Enter in a table cell, and writes a br there on Shift+Enter', async () => {
    const t = setup([{ body: '<table><tr><td>Cell text</td></tr></table>' }])
    await t.open(0)
    const node = t.textIn('b1', 'Cell')
    t.caret(node, 4)
    expect(t.press(node, 'Enter')).toBe(true)
    await t.controller.flush()
    expect(t.book.calls).toEqual([])
    t.caret(t.textIn('b1', 'Cell'), 4)
    expect(t.press(t.textIn('b1', 'Cell'), 'Enter', { shiftKey: true })).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('<td>Cell<br/> text</td>')
  })

  it('merges with the previous block on Backspace at the start, with the next on Delete at the end', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    const beta = t.textIn('b2', 'Beta')
    t.caret(beta, 0)
    expect(t.press(beta, 'Backspace')).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('one.Beta two.</p>\n<p>Gamma')
    const merged = t.textIn('b1', 'Beta')
    t.caret(t.textIn('b1', 'two.'), t.textIn('b1', 'two.').data.length)
    expect(t.press(merged, 'Delete')).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('Beta two.Gamma three.</p>')
    // Backspace in the middle of a block is the browser's own
    const gamma = t.textIn('b1', 'Gamma')
    t.caret(gamma, gamma.data.indexOf('Gamma') + 2)
    expect(t.press(gamma, 'Backspace')).toBe(false)
  })

  it('does nothing when the neighbour is not a flowing block under the same parent', async () => {
    const t = setup([{ body: '<div class="box"><p>Inside</p></div>\n<p>Outside</p>' }])
    await t.open(0)
    const before = t.book.source(0)
    const outside = t.textIn('b2', 'Outside')
    t.caret(outside, 0)
    expect(t.press(outside, 'Backspace')).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toBe(before)
    expect(t.book.calls).toEqual([])
  })
})

describe('bold and italic', () => {
  it('toggles bold on the selection as strong, and off again', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    const gamma = t.textIn('b3', 'Gamma')
    t.caret(gamma, 0, gamma, 5)
    await t.controller.toggleMark('bold')
    expect(t.book.source(0)).toContain('<p><strong>Gamma</strong> three.</p>')
    const bold = t.textIn('b3', 'Gamma')
    t.caret(bold, 0, bold, 5)
    await t.controller.toggleMark('bold')
    expect(t.book.source(0)).toContain('<p>Gamma three.</p>')
  })

  it('routes the browser formatting command to the engine instead of the browser', async () => {
    const t = setup([{ body: P3 }])
    await t.open(0)
    const beta = t.textIn('b2', 'Beta')
    t.caret(beta, 0, beta, 4)
    const event = new (t.win().InputEvent)('beforeinput', {
      inputType: 'formatItalic',
      bubbles: true,
      cancelable: true,
    })
    beta.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await t.controller.flush()
    expect(t.book.source(0)).toContain('<p><em>Beta</em> two.</p>')
  })
})

describe('history across chapters', () => {
  it('undoing an edit of another chapter undoes it there and goes there', async () => {
    const t = setup([{ body: P3 }, { body: '<p>Second chapter.</p>' }])
    await t.open(0)
    const stored = t.book.source(0)
    t.type('b1', 'Alpha', 'ALPHA')
    await t.controller.flush()
    await t.open(1)
    await t.controller.undo()
    expect(t.book.source(0)).toBe(stored)
    expect(t.shown).toEqual([{ spineIndex: 0, blockId: 'b1' }])
    await t.controller.redo()
    expect(t.book.source(0)).toContain('ALPHA')
  })

  it('takes an AI batch over two chapters back in one undo', async () => {
    const t = setup([{ body: P3 }, { body: '<p>Second chapter.</p>' }])
    await t.open(0)
    const before = [t.book.source(0), t.book.source(1)]
    const outcome = await t.controller.applyEditGroups([
      { spineIndex: 0, edits: [{ op: 'replace', blockId: 'b2', text: '<b>Bold</b> beta.' }] },
      { spineIndex: 1, edits: [{ op: 'insert_after', blockId: 'b1', text: 'New one.' }] },
    ])
    expect(outcome.ok).toBe(true)
    expect(t.book.source(0)).toContain('<p><strong>Bold</strong> beta.</p>')
    expect(t.book.source(1)).toContain('<p>New one.</p>')
    // the chapter on screen shows the change
    expect(t.block('b2').textContent).toBe('Bold beta.')
    await t.controller.undo()
    expect([t.book.source(0), t.book.source(1)]).toEqual(before)
    expect(t.controller.state().canUndo).toBe(false)
  })

  it('applies nothing of an atomic batch when one group is refused', async () => {
    const t = setup([{ body: P3 }, { body: '<p>Second chapter.</p>' }])
    await t.open(0)
    const before = t.book.source(0)
    const outcome = await t.controller.applyEditGroups(
      [
        { spineIndex: 0, edits: [{ op: 'replace', blockId: 'b2', text: 'Changed.' }] },
        { spineIndex: 1, edits: [{ op: 'replace', blockId: 'b9', text: 'No such block.' }] },
      ],
      { atomic: true },
    )
    expect(outcome).toMatchObject({ ok: false, index: 1, results: [] })
    expect(t.book.source(0)).toBe(before)
    expect(t.controller.state().canUndo).toBe(false)
  })
})

describe('replace all', () => {
  it('replaces in every editable chapter as one undo and counts what read-only chapters skipped', async () => {
    const t = setup([
      { body: '<p>The whale.</p>\n<p>A <i>Whale</i> again.</p>' },
      { body: '<p>A fixed whale.</p>', readOnly: 'fixed-layout-chapter' },
      { body: '<p>Last whale here.</p>' },
    ])
    await t.open(0)
    const before = [0, 1, 2].map((i) => t.book.source(i))
    const outcome = await t.controller.replaceAll('whale', 'shark', 3)
    expect(outcome).toEqual({ replaced: 3, skipped: 1, failed: 0 })
    expect(t.book.source(0)).toContain('<p>The shark.</p>\n<p>A <i>shark</i> again.</p>')
    expect(t.book.source(1)).toBe(before[1])
    expect(t.book.source(2)).toContain('<p>Last shark here.</p>')
    // the chapter on screen shows it
    expect(t.block('b1').textContent).toBe('The shark.')
    await t.controller.undo()
    expect([0, 1, 2].map((i) => t.book.source(i))).toEqual(before)
  })

  it('counts in a read-only chapter only the matches inside a block, as replacing would', async () => {
    const t = setup([
      { body: '<p>The whale.</p>\n<p>The end.</p>' },
      { body: '<p>A fixed whale.</p>\n<p>The whale.</p>', readOnly: 'fixed-layout-chapter' },
    ])
    await t.open(0)
    // "whale. The" runs across two blocks in both chapters: never replaced, never skipped
    expect(await t.controller.replaceAll('whale. The', 'x', 2)).toEqual({
      replaced: 0,
      skipped: 0,
      failed: 0,
    })
    expect(await t.controller.replaceAll('whale', 'shark', 2)).toEqual({
      replaced: 1,
      skipped: 2,
      failed: 0,
    })
  })

  it('replaces one match on screen', async () => {
    const t = setup([{ body: P3 }])
    const doc = await t.open(0)
    const node = t.textIn('b2', 'Beta')
    const range = doc.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 4)
    expect(await t.controller.replaceRange(range, 'Delta')).toBe(true)
    expect(t.book.source(0)).toContain('<p>Delta two.</p>')
  })
})

describe('the translation lock', () => {
  it('stops editing while this tab translates the book, and lets it go after', async () => {
    const t = setup([{ body: P3 }])
    const doc = await t.open(0)
    t.type('b1', 'Alpha', 'Alpha typed')
    await t.controller.setTranslationLock(true)
    // what was typed went in before the lock
    expect(t.book.source(0)).toContain('Alpha typed')
    expect(t.controller.state()).toMatchObject({ locked: true, editable: false })
    expect(doc.querySelectorAll('[contenteditable]').length).toBe(0)
    const calls = t.book.calls.length
    t.block('b2').dispatchEvent(new (t.win().Event)('input', { bubbles: true }))
    await t.controller.flush()
    expect(t.book.calls.length).toBe(calls)
    const outcome = await t.controller.applyEdits(0, [
      { op: 'replace', blockId: 'b2', text: 'AI text.' },
    ])
    expect(outcome).toMatchObject({ ok: false, error: 'locked' })
    expect(await t.controller.replaceAll('Beta', 'x', 1)).toBeNull()
    await t.controller.undo()
    expect(t.notices).toContain('editLocked')
    expect(t.book.source(0)).toContain('Alpha typed')
    await t.controller.setTranslationLock(false)
    expect(t.controller.state().editable).toBe(true)
    expect(doc.querySelectorAll('[contenteditable]').length).toBe(3)
  })
})
