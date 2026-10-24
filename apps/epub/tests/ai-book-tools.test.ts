/**
 * The AI panel's book skill (spec §7) against an in-memory book and the real
 * edit controller, with fake models only: the five tools' inputs and
 * outputs, edit_blocks as one undo entry and all or nothing with a reason
 * for every refused op, the tool list of a fixed-layout book,
 * start_book_translation handing its request to the translating screen, and
 * the per-turn context. Nothing here reaches a real `claude` or `codex`.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  AgentLoop,
  type AgentMessage,
  type AgentStreamCallbacks,
  type AgentToolCall,
  type AgentTransport,
} from '@genoffice/agent-core'
import { brandText } from '@genoffice/i18n'
import { EpubEditController, type EditHost } from '../src/renderer/edit/controller'
import { visibleBlocks } from '../src/renderer/ai/AiDock'
import type {
  BookAiHost,
  BookAiView,
  BookTranslationAnswer,
  StartBookTranslation,
} from '../src/renderer/ai/book-tools'
import {
  BOOK_TOOL_NAMES,
  EPUB_SYSTEM_PROMPT,
  SELECTION_CONTEXT_CHARS,
  bookContext,
  createEpubSkill,
} from '../src/renderer/ai/epub-skill'
import type { EpubBookSummary } from '../src/shared/ipc'
import { FakeBook, type ChapterSpec } from './helpers/edit-backend'

interface Setup {
  book: FakeBook
  controller: EpubEditController
  summary: EpubBookSummary
  host: BookAiHost
  skill: ReturnType<typeof createEpubSkill>
  run(name: string, input?: Record<string, unknown>): Promise<{ output: string; isError: boolean }>
  json(name: string, input?: Record<string, unknown>): Promise<Record<string, unknown>>
}

function setup(
  specs: ChapterSpec[],
  options: {
    fixedLayout?: boolean
    view?: BookAiView | null
    start?: StartBookTranslation | null
    limits?: Parameters<typeof createEpubSkill>[0]['limits']
  } = {},
): Setup {
  const book = new FakeBook(specs)
  const host: EditHost = {
    api: book,
    chapterHtml: () => '<html><body></body></html>',
    readingText: () => '',
    showChapter: () => {},
    notify: () => {},
    changed: () => {},
  }
  const controller = new EpubEditController(host, 5)
  const summary: EpubBookSummary = {
    opfPath: 'OEBPS/content.opf',
    version: '3',
    metadata: {
      title: 'A Small Book',
      titles: ['A Small Book'],
      creators: ['Ann Author', 'Ben Writer'],
      languages: ['en'],
      identifiers: [],
      uniqueIdentifier: null,
      layout: options.fixedLayout ? 'pre-paginated' : 'reflowable',
      primaryWritingMode: null,
    },
    manifest: [],
    spine: book.chapters.map((c, index) => ({
      index,
      idref: `c${index}`,
      path: c.path,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      layout: null,
      fixedLayout: options.fixedLayout === true || c.readOnly === 'fixed-layout-chapter',
    })),
    pageProgressionDirection: null,
    toc: {
      source: 'nav',
      entries: [
        { title: 'Opening', path: book.chapters[0]!.path, fragment: null, spineIndex: 0, depth: 1 },
        { title: 'A part', path: null, fragment: null, spineIndex: null, depth: 1 },
        {
          title: 'Second',
          path: book.chapters[1]?.path ?? null,
          fragment: null,
          spineIndex: book.chapters[1] ? 1 : null,
          depth: 2,
        },
      ],
    },
    fixedLayout: options.fixedLayout === true,
    verticalWriting: false,
  }
  if (options.fixedLayout) {
    for (const c of book.chapters) c.readOnly = 'fixed-layout-book'
  }
  const aiHost: BookAiHost = {
    book: () => summary,
    readChapter: (i) => book.readChapter(i),
    editor: () => controller,
    view: () => options.view ?? null,
    startBookTranslation: options.start ?? null,
  }
  const skill = createEpubSkill({ host: () => aiHost, limits: options.limits })
  let n = 0
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const result = await skill.executeTool({ id: `call-${++n}`, name, input })
    return { output: result.output, isError: result.isError === true }
  }
  return {
    book,
    controller,
    summary,
    host: aiHost,
    skill,
    run,
    json: async (name, input) => {
      const result = await run(name, input)
      expect(result.isError).toBe(false)
      return JSON.parse(result.output) as Record<string, unknown>
    },
  }
}

const THREE = [
  {
    body: '<h1>Opening</h1>\n<p>The <b>whale</b> rose.</p>\n<p>See <a href="#n1">note</a> here.</p>',
  },
  { body: '<p>Second chapter, whale again.</p>' },
  { body: '<p>Third.</p>' },
]

const toolNames = (s: Setup) => s.skill.tools.map((tool) => tool.name)

describe('the tool list', () => {
  it('offers the five tools with the inputs of spec §7', () => {
    const s = setup(THREE)
    expect(toolNames(s)).toEqual([
      'read_book',
      'read_chapter',
      'find_text',
      'edit_blocks',
      'start_book_translation',
    ])
    const schema = (name: string) => s.skill.tools.find((t) => t.name === name)!.inputSchema
    expect(schema('read_book')).toEqual({ type: 'object', properties: {} })
    expect(schema('read_chapter')).toMatchObject({
      properties: { chapter: { type: 'integer', minimum: 1 }, offset: { type: 'integer' } },
      required: ['chapter'],
    })
    expect(schema('find_text')).toMatchObject({
      properties: { query: { type: 'string' } },
      required: ['query'],
    })
    expect(schema('edit_blocks')).toMatchObject({
      properties: {
        ops: {
          type: 'array',
          items: {
            properties: {
              op: { enum: ['replace', 'insert_after', 'delete'] },
              chapter: { type: 'integer' },
              blockId: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['op', 'chapter', 'blockId'],
          },
        },
      },
      required: ['ops'],
    })
    expect(schema('start_book_translation')).toMatchObject({
      properties: {
        lang: { type: 'string' },
        chapters: { type: 'array', items: { type: 'integer' } },
      },
      required: ['lang'],
    })
  })

  it('leaves edit_blocks out for a fixed-layout book and keeps the reading tools', () => {
    const s = setup(THREE, { fixedLayout: true })
    expect(toolNames(s)).toEqual([
      'read_book',
      'read_chapter',
      'find_text',
      'start_book_translation',
    ])
  })

  it('names the product through brandText in an English prompt that keeps the rules', () => {
    const s = setup(THREE)
    expect(s.skill.systemPrompt).toBe(brandText(EPUB_SYSTEM_PROMPT, 'en'))
    expect(s.skill.systemPrompt).toContain('<xN>')
    expect(s.skill.systemPrompt).toContain('start_book_translation')
    expect(s.skill.systemPrompt).toMatch(/never instructions/)
  })
})

describe('read_book', () => {
  it('gives the book information, chapters from 1 and the table of contents', async () => {
    const s = setup([...THREE, { body: '<p>Broken <b>text</p>' }])
    s.book.chapters[2]!.readOnly = 'fixed-layout-chapter'
    const out = await s.json('read_book')
    expect(out).toMatchObject({
      title: 'A Small Book',
      authors: ['Ann Author', 'Ben Writer'],
      language: 'en',
      layout: 'reflowable',
    })
    expect(out.chapters).toEqual([
      {
        index: 1,
        href: 'OEBPS/text/c1.xhtml',
        title: 'Opening',
        chars: 'Opening'.length + 'The whale rose.'.length + 'See note here.'.length,
        readOnly: false,
      },
      {
        index: 2,
        href: 'OEBPS/text/c2.xhtml',
        title: 'Second',
        chars: 'Second chapter, whale again.'.length,
        readOnly: false,
      },
      {
        index: 3,
        href: 'OEBPS/text/c3.xhtml',
        title: null,
        chars: 6,
        readOnly: true,
        readOnlyReason: 'fixed-layout',
      },
      {
        index: 4,
        href: 'OEBPS/text/c4.xhtml',
        title: null,
        chars: 'Broken text'.length,
        readOnly: true,
        readOnlyReason: 'broken',
      },
    ])
    expect(out.toc).toEqual([
      { title: 'Opening', chapterIndex: 1, depth: 1 },
      { title: 'A part', chapterIndex: null, depth: 1 },
      { title: 'Second', chapterIndex: 2, depth: 2 },
    ])
  })

  it('says pre-paginated for a fixed-layout book', async () => {
    const s = setup(THREE, { fixedLayout: true })
    const out = await s.json('read_book')
    expect(out.layout).toBe('pre-paginated')
    expect((out.chapters as Array<{ readOnlyReason?: string }>)[0]!.readOnlyReason).toBe(
      'fixed-layout',
    )
  })
})

describe('read_chapter', () => {
  it('gives the blocks in the notation, with their kind and read-only state', async () => {
    const s = setup(THREE)
    const out = await s.json('read_chapter', { chapter: 1 })
    expect(out).toMatchObject({ chapter: 1, title: 'Opening', readOnly: false, offset: 0 })
    expect(out.blocks).toEqual([
      { id: 'b1', kind: 'h1', text: 'Opening', readOnly: false },
      { id: 'b2', kind: 'p', text: 'The <b>whale</b> rose.', readOnly: false },
      { id: 'b3', kind: 'p', text: 'See <x1>note</x1> here.', readOnly: false },
    ])
    expect(out.nextOffset).toBeNull()
    expect(out.totalBlocks).toBe(3)
  })

  it('reads a long chapter in parts and says where the next part starts', async () => {
    const body = Array.from({ length: 5 }, (_, i) => `<p>Paragraph ${i + 1}.</p>`).join('\n')
    const s = setup([{ body }], { limits: { chapterBlocks: 2 } })
    const first = await s.json('read_chapter', { chapter: 1 })
    expect((first.blocks as unknown[]).length).toBe(2)
    expect(first.nextOffset).toBe(2)
    const second = await s.json('read_chapter', { chapter: 1, offset: 2 })
    expect((second.blocks as Array<{ text: string }>).map((b) => b.text)).toEqual([
      'Paragraph 3.',
      'Paragraph 4.',
    ])
    const last = await s.json('read_chapter', { chapter: 1, offset: 4 })
    expect((last.blocks as Array<{ text: string }>).map((b) => b.text)).toEqual(['Paragraph 5.'])
    expect(last.nextOffset).toBeNull()
  })

  it('marks the blocks of a read-only chapter and refuses a chapter out of range', async () => {
    const s = setup([{ body: '<p>Fixed.</p>', readOnly: 'fixed-layout-chapter' }])
    const out = await s.json('read_chapter', { chapter: 1 })
    expect(out).toMatchObject({ readOnly: true, readOnlyReason: 'fixed-layout' })
    expect(out.blocks).toEqual([{ id: 'b1', kind: 'p', text: 'Fixed.', readOnly: true }])
    const bad = await s.run('read_chapter', { chapter: 2 })
    expect(bad.isError).toBe(true)
    expect(bad.output).toContain('from 1 to 1')
  })
})

describe('find_text', () => {
  it('lists every match with its chapter, block and context', async () => {
    const s = setup(THREE)
    const out = await s.json('find_text', { query: 'WHALE' })
    expect(out.results).toEqual([
      { chapter: 1, blockId: 'b2', before: 'The ', match: 'whale', after: ' rose.' },
      {
        chapter: 2,
        blockId: 'b1',
        before: 'Second chapter, ',
        match: 'whale',
        after: ' again.',
      },
    ])
    expect(out.truncated).toBeUndefined()
  })

  it('stops at the result cap and says so', async () => {
    const s = setup(THREE, { limits: { findResults: 1 } })
    const out = await s.json('find_text', { query: 'whale' })
    expect((out.results as unknown[]).length).toBe(1)
    expect(out.truncated).toBe(true)
  })

  it('refuses an empty query', async () => {
    const s = setup(THREE)
    expect((await s.run('find_text', { query: '  ' })).isError).toBe(true)
  })
})

describe('edit_blocks', () => {
  it('applies a batch over two chapters as one undo entry', async () => {
    const s = setup(THREE)
    const before = [0, 1, 2].map((i) => s.book.source(i))
    const result = await s.run('edit_blocks', {
      ops: [
        { op: 'replace', chapter: 1, blockId: 'b2', text: 'The <i>white</i> whale rose.' },
        { op: 'insert_after', chapter: 1, blockId: 'b2', text: 'A <b>new</b> line.' },
        { op: 'replace', chapter: 2, blockId: 'b1', text: 'Second chapter, changed.' },
        { op: 'delete', chapter: 1, blockId: 'b3' },
      ],
    })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('Applied 4 edit(s) as one step')
    expect(result.output).toMatch(/New block id\(s\) in chapter 1: b\d+/)
    expect(s.book.source(0)).toContain('<p>The <em>white</em> whale rose.</p>')
    expect(s.book.source(0)).toContain('<p>A <strong>new</strong> line.</p>')
    expect(s.book.source(0)).not.toContain('note')
    expect(s.book.source(1)).toContain('<p>Second chapter, changed.</p>')
    expect(s.controller.state().canUndo).toBe(true)
    await s.controller.undo()
    expect([0, 1, 2].map((i) => s.book.source(i))).toEqual(before)
    expect(s.controller.state().canUndo).toBe(false)
  })

  it('keeps the placeholders of a replaced block', async () => {
    const s = setup(THREE)
    const result = await s.run('edit_blocks', {
      ops: [{ op: 'replace', chapter: 1, blockId: 'b3', text: 'Read the <x1>footnote</x1> now.' }],
    })
    expect(result.isError).toBe(false)
    expect(s.book.source(0)).toContain('<p>Read the <a href="#n1">footnote</a> now.</p>')
  })

  it('refuses the whole call and names every refused op with its reason', async () => {
    const s = setup([
      ...THREE.slice(0, 2),
      { body: '<p>Fixed.</p>', readOnly: 'fixed-layout-chapter' },
      { body: '<table><tr><td>Cell</td></tr></table>' },
      { body: '<p>Broken <b>text</p>' },
    ])
    const before = [0, 1, 2, 3, 4].map((i) => s.book.source(i))
    const result = await s.run('edit_blocks', {
      ops: [
        { op: 'replace', chapter: 2, blockId: 'b1', text: 'A fine change.' },
        { op: 'replace', chapter: 1, blockId: 'b3', text: 'The note is gone.' },
        { op: 'replace', chapter: 3, blockId: 'b1', text: 'Changed.' },
        { op: 'delete', chapter: 4, blockId: 'b1' },
        { op: 'replace', chapter: 1, blockId: 'b99', text: 'Nobody.' },
        { op: 'insert_after', chapter: 1, blockId: 'b2', text: 'With <x1>a link</x1>.' },
        { op: 'replace', chapter: 5, blockId: 'b1', text: 'Broken.' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('nothing was changed')
    const lines = result.output.split('\n')
    expect(lines.some((l) => l.startsWith('op 1'))).toBe(false)
    expect(lines.find((l) => l.startsWith('op 2'))).toMatch(/placeholder mismatch/)
    expect(lines.find((l) => l.startsWith('op 3'))).toMatch(/read-only chapter/)
    expect(lines.find((l) => l.startsWith('op 4'))).toMatch(/not flowing/)
    expect(lines.find((l) => l.startsWith('op 5'))).toMatch(/unknown block/)
    expect(lines.find((l) => l.startsWith('op 6'))).toMatch(/only <b>, <i> and <br\/>/)
    expect(lines.find((l) => l.startsWith('op 7'))).toMatch(/read-only chapter.*broken/)
    // nothing reached the book
    expect(s.book.calls.filter((c) => c.kind === 'apply')).toEqual([])
    expect([0, 1, 2, 3, 4].map((i) => s.book.source(i))).toEqual(before)
    expect(s.controller.state().canUndo).toBe(false)
  })

  it('refuses while the tab is locked by a book translation', async () => {
    const s = setup(THREE)
    await s.controller.setTranslationLock(true)
    const before = s.book.source(0)
    const result = await s.run('edit_blocks', {
      ops: [{ op: 'replace', chapter: 1, blockId: 'b1', text: 'Locked?' }],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/locked/)
    expect(s.book.source(0)).toBe(before)
  })

  it('reports the lock the main process answers with, and changes nothing', async () => {
    const s = setup(THREE)
    // the lock arrived in the main process before the controller knew of it
    s.book.locked = true
    const before = [s.book.source(0), s.book.source(1)]
    const result = await s.run('edit_blocks', {
      ops: [
        { op: 'replace', chapter: 1, blockId: 'b1', text: 'One.' },
        { op: 'replace', chapter: 2, blockId: 'b1', text: 'Two.' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/op 1 .*locked/)
    expect([s.book.source(0), s.book.source(1)]).toEqual(before)
  })

  it('takes back the chapters already changed when a later one is refused by the main process', async () => {
    const s = setup([
      { body: '<p>First.</p>' },
      { body: '<section>\n<p id="keep">Alone.</p>\n</section>' },
    ])
    const before = [s.book.source(0), s.book.source(1)]
    const result = await s.run('edit_blocks', {
      ops: [
        { op: 'replace', chapter: 1, blockId: 'b1', text: 'Changed first.' },
        { op: 'delete', chapter: 2, blockId: 'b1' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/op 2 \(delete, chapter 2, block b1\): no anchor host/)
    expect([s.book.source(0), s.book.source(1)]).toEqual(before)
    expect(s.controller.state().canUndo).toBe(false)
  })

  it('is refused for a fixed-layout book even when called', async () => {
    const s = setup(THREE, { fixedLayout: true })
    const result = await s.run('edit_blocks', {
      ops: [{ op: 'replace', chapter: 1, blockId: 'b1', text: 'No.' }],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/fixed layout/)
  })

  it('checks the shape of every op', async () => {
    const s = setup(THREE)
    const result = await s.run('edit_blocks', {
      ops: [
        { op: 'rename', chapter: 1, blockId: 'b1' },
        { op: 'replace', chapter: 9 },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/op 1: op must be one of replace, insert_after, delete/)
    expect(result.output).toMatch(/op 2: chapter must be a chapter number from 1 to 3/)
  })
})

describe('start_book_translation', () => {
  it('hands the language and the chapters (as spine indices) to the translating screen', async () => {
    const start = vi.fn((): BookTranslationAnswer => ({ opened: true }))
    const s = setup(THREE, { start })
    const result = await s.run('start_book_translation', { lang: 'ko', chapters: [3, 1, 3] })
    expect(result.isError).toBe(false)
    expect(start).toHaveBeenCalledWith({ lang: 'ko', chapters: [0, 2] })
    expect(result.output).toMatch(/Opened the book-translation window with ko preselected/)
    expect(result.output).toMatch(/do not translate it yourself/)
  })

  it('asks for the whole book when no chapters are named, and reports a running translation', async () => {
    const start = vi.fn((): BookTranslationAnswer => ({ running: { done: 3, total: 10 } }))
    const s = setup(THREE, { start })
    const result = await s.run('start_book_translation', { lang: 'en' })
    expect(start).toHaveBeenCalledWith({ lang: 'en', chapters: null })
    expect(result.output).toMatch(/already running .*3\/10/)
  })

  it('says it is not available when the window has no book translation', async () => {
    const s = setup(THREE, { start: null })
    const result = await s.run('start_book_translation', { lang: 'en' })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/not available/)
  })

  it('refuses a fixed-layout book, an unknown language and chapters out of range', async () => {
    const start = vi.fn((): BookTranslationAnswer => ({ opened: true }))
    const fixed = setup(THREE, { fixedLayout: true, start })
    const refused = await fixed.run('start_book_translation', { lang: 'en' })
    expect(refused.isError).toBe(true)
    expect(refused.output).toMatch(/fixed layout/)
    const s = setup(THREE, { start })
    expect((await s.run('start_book_translation', { lang: 'xx' })).output).toMatch(
      /lang must be one of/,
    )
    expect(
      (await s.run('start_book_translation', { lang: 'en', chapters: [0, 4] })).output,
    ).toMatch(/0, 4 out of range/)
    expect(start).not.toHaveBeenCalled()
  })
})

describe('the per-turn context', () => {
  it('names the book, the chapter on screen, the blocks in view and the selected text', () => {
    const s = setup(THREE, {
      view: {
        spineIndex: 0,
        visible: { firstId: 'b2', lastId: 'b3', first: 1, last: 2, total: 3 },
        selection: 'The whale',
      },
    })
    const context = s.skill.buildContext!()
    expect(context).toContain('Book: "A Small Book" — 3 chapter(s), reflowable.')
    expect(context).toContain('On screen: chapter 1 ("Opening").')
    expect(context).toContain('Visible blocks: b2 to b3 (positions 1 to 2 of 3')
    expect(context).toContain('<selected_text>\nThe whale\n</selected_text>')
  })

  it('says when the book is fixed layout or locked, and cuts a long selection', async () => {
    const fixed = setup(THREE, { fixedLayout: true })
    expect(bookContext(fixed.host)).toMatch(/fixed layout: it can be read, but its text cannot/)
    const long = 'x'.repeat(SELECTION_CONTEXT_CHARS + 50)
    const s = setup(THREE, { view: { spineIndex: 1, visible: null, selection: long } })
    await s.controller.setTranslationLock(true)
    const context = bookContext(s.host)
    expect(context).toMatch(/A book translation runs in this tab/)
    expect(context).toContain(`the first ${SELECTION_CONTEXT_CHARS} characters`)
    expect(context).not.toContain(long)
  })
})

describe('the blocks in view', () => {
  it('finds the first and last block on screen in the chapter frame', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    doc.body.innerHTML = [1, 2, 3, 4].map((i) => `<p data-epub-block="b${i}">P${i}</p>`).join('')
    const tops: Record<string, number> = { b1: -200, b2: 50, b3: 400, b4: 2000 }
    const spy = vi
      // the frame's elements have the frame's own prototypes
      .spyOn(
        (iframe.contentWindow as unknown as typeof window).Element.prototype,
        'getBoundingClientRect',
      )
      .mockImplementation(function (this: Element) {
        const top = tops[this.getAttribute('data-epub-block') ?? ''] ?? 0
        return { top, bottom: top + 100 } as DOMRect
      })
    try {
      expect(visibleBlocks(doc)).toEqual({
        firstId: 'b2',
        lastId: 'b3',
        first: 1,
        last: 2,
        total: 4,
      })
    } finally {
      spy.mockRestore()
      iframe.remove()
    }
  })
})

/** A model played from a script: each turn is a list of tool calls or a closing text. */
function fakeModel(turns: Array<AgentToolCall[] | string>): AgentTransport & {
  requests: Array<{ tools: string[]; messages: AgentMessage[] }>
} {
  let turn = 0
  const transport = {
    requests: [] as Array<{ tools: string[]; messages: AgentMessage[] }>,
    stream(
      request: { messages: AgentMessage[]; tools: Array<{ name: string }> },
      cb: AgentStreamCallbacks,
    ) {
      transport.requests.push({
        tools: request.tools.map((t) => t.name),
        messages: [...request.messages],
      })
      const step = turns[turn++] ?? 'done'
      queueMicrotask(() => {
        if (typeof step === 'string') cb.onDelta(step)
        else for (const call of step) cb.onToolCall(call)
        cb.onDone()
      })
      return { cancel: () => queueMicrotask(() => cb.onDone()) }
    },
  }
  return transport
}

describe('a run with a fake model', () => {
  it('reads, edits through the controller and leaves one undo entry', async () => {
    const s = setup(THREE)
    const model = fakeModel([
      [{ id: 'r1', name: BOOK_TOOL_NAMES.readChapter, input: { chapter: 1 } }],
      [
        {
          id: 'e1',
          name: BOOK_TOOL_NAMES.editBlocks,
          input: {
            ops: [
              { op: 'replace', chapter: 1, blockId: 'b1', text: 'Beginning' },
              { op: 'replace', chapter: 1, blockId: 'b2', text: 'The <b>whale</b> sank.' },
            ],
          },
        },
      ],
      'Changed the heading and the first line.',
    ])
    const before = s.book.source(0)
    const done = new Promise<void>((resolve) => {
      const loop = new AgentLoop({
        transport: model,
        skill: s.skill,
        events: { onDone: () => resolve(), onError: () => resolve() },
      })
      void loop.run('Rename the heading and let the whale sink.')
    })
    await done
    expect(model.requests[0]!.tools).toContain('edit_blocks')
    expect(s.book.source(0)).toContain('<h1>Beginning</h1>')
    expect(s.book.source(0)).toContain('<p>The <b>whale</b> sank.</p>')
    await s.controller.undo()
    expect(s.book.source(0)).toBe(before)
    expect(s.controller.state().canUndo).toBe(false)
  })
})
