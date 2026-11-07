// @vitest-environment jsdom
/**
 * The plugin's memo commands against the real rhwp engine: listing, the selection an anchor
 * may be put on, inserting/editing/removing inside one undo step, the body anchors on the
 * pages, and the input lock a memo modal holds. The editor's view (pages one under another,
 * 2000 pixels apart, 10 pixels from the left) and its caret are stand-ins.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const PAGE_GAP = 2000
const PAGE_LEFT = 10
let zoom = 2

interface Rect {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

interface Position {
  sectionIndex: number
  paragraphIndex: number
  charOffset: number
  parentParaIndex?: number
  controlIndex?: number
  cellIndex?: number
  cellParaIndex?: number
  isTextBox?: boolean
}

/** The editor's caret, as the plugin's selection command reads it. */
function fakeCursor() {
  const cursor = {
    position: null as Position | null,
    selection: null as { start: Position; end: Position } | null,
    header: false,
    footnote: false,
    isInCellSelectionMode: () => false,
    isInHeaderFooter: () => cursor.header,
    isInFootnote: () => cursor.footnote,
    isInPictureObjectSelection: () => false,
    isInTableObjectSelection: () => false,
    hasSelection: () => cursor.selection !== null,
    getSelectionOrdered: () => cursor.selection,
    getPosition: () => cursor.position,
  }
  return cursor
}

/** A document with the given body paragraphs. */
function blank(lines: string[]): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, k) => {
    if (k > 0) doc.splitParagraph(0, k - 1, doc.getParagraphLength(0, k - 1))
    if (line) doc.insertText(0, k, 0, line)
  })
  return doc
}

/** A body paragraph at `para` holding a 2×2 table. */
function withTable(doc: HwpDocument, para: number): string {
  doc.pasteHtml(
    0,
    para,
    0,
    '<table><tr><td>one</td><td>two</td></tr><tr><td>three</td><td>four</td></tr></table>',
  )
  return JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
}

/** A text box in body paragraph 0, after the text, with the text `box text`. */
function withTextBox(doc: HwpDocument): string {
  const made = JSON.parse(
    doc.createShapeControl(
      JSON.stringify({
        sectionIdx: 0,
        paraIdx: 0,
        charOffset: doc.getParagraphLength(0, 0),
        width: 8000,
        height: 3000,
        shapeType: 'textbox',
        textWrap: 'Square',
      }),
    ),
  ) as { controlIdx: number }
  const path = JSON.stringify([{ controlIndex: made.controlIdx, cellIndex: 0, cellParaIndex: 0 }])
  doc.insertTextInCellByPath(0, 0, path, 0, 'box text')
  return path
}

const insertBodyMemo = (
  doc: HwpDocument,
  para: number,
  start: number,
  end: number,
  author = 'tester',
  text = 'memo body',
) =>
  JSON.parse(doc.insertMemo(0, para, start, end, JSON.stringify({ author, text }))) as {
    ok: true
    id: number
    index: number
  }

const insertPathMemo = (
  doc: HwpDocument,
  para: number,
  path: string,
  start: number,
  end: number,
  author = 'tester',
  text = 'memo body',
) =>
  JSON.parse(doc.insertMemoByPath(0, para, path, start, end, JSON.stringify({ author, text }))) as {
    ok: true
    id: number
    index: number
  }

function openEditor(doc: HwpDocument) {
  document.body.innerHTML = '<div id="scroll-container"><div id="scroll-content"></div></div>'
  zoom = 2
  let current = doc
  const history: Uint8Array[] = []
  const labels: string[] = []
  const listeners: (() => void)[] = []
  const commands = new Map<string, (services: unknown, params?: unknown) => unknown>()
  const cursor = fakeCursor()
  const services = {
    getInputHandler: () => ({
      cursor,
      virtualScroll: {
        getPageOffset: (page: number) => page * PAGE_GAP,
        getPageLeftResolved: () => PAGE_LEFT,
      },
    }),
    getViewportManager: () => ({ getZoom: () => zoom }),
  }
  const emit = () => listeners.forEach((listener) => listener())
  const host = {
    read: (fn: (d: never) => unknown) => fn(current as never),
    transaction: (label: string, fn: (tx: never) => unknown) => {
      labels.push(label)
      const before = current.exportHwp()
      try {
        const result = fn({ doc: () => current, deferPagination: () => {} } as never)
        history.push(before)
        emit()
        return result
      } catch (thrown) {
        current = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: (_name: string, handler: () => void) => listeners.push(handler) },
    automation: {
      registerCommand: (def: { id: string; execute: (s: unknown, p?: unknown) => unknown }) =>
        commands.set(def.id, def.execute),
      execute: (command: string, params?: unknown) => {
        if (command === 'edit:undo') {
          const before = history.pop()
          if (!before) return { ok: false }
          current = new HwpDocument(before)
          emit()
          return { ok: true }
        }
        const run = commands.get(command)
        return run ? run(services, params) : null
      },
    },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host)
  /** a change the user makes in the editor: the editor says the document changed */
  const userEdit = (change: (doc: HwpDocument) => void) => {
    history.push(current.exportHwp())
    change(current)
    emit()
  }
  return {
    plugin,
    doc: () => current,
    cursor,
    commands,
    steps: () => history.length,
    labels,
    userEdit,
  }
}

/** The anchor boxes the plugin drew, as page rectangles again. */
function anchorsOnPage(): { rect: Rect; selected: boolean; caret: boolean }[] {
  return [...document.querySelectorAll<HTMLElement>('.ieum-memo-anchors > div')].map((box) => {
    const top = parseFloat(box.style.top)
    const pageIndex = Math.floor(top / PAGE_GAP)
    return {
      rect: {
        pageIndex,
        x: Math.round((parseFloat(box.style.left) - PAGE_LEFT) / zoom),
        y: Math.round((top - pageIndex * PAGE_GAP) / zoom),
        width: Math.round(parseFloat(box.style.width) / zoom),
        height: Math.round(parseFloat(box.style.height) / zoom),
      },
      selected: box.classList.contains('selected'),
      caret: box.classList.contains('caret'),
    }
  })
}

/** Where the engine lays the memo anchor out, rounded as `anchorsOnPage` rounds. */
function rectsOf(doc: HwpDocument, memo: { rects: Rect[] }): Rect[] {
  return memo.rects.map((rect) => ({
    pageIndex: rect.pageIndex,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }))
}

const bodyPlace = (para: number, offset: number): Position => ({
  sectionIndex: 0,
  paragraphIndex: para,
  charOffset: offset,
})

const cellPlace = (para: number, cell: number, offset: number, control = 0): Position => ({
  sectionIndex: 0,
  parentParaIndex: para,
  paragraphIndex: para,
  controlIndex: control,
  cellIndex: cell,
  cellParaIndex: 0,
  charOffset: offset,
})

afterEach(() => {
  agentPlugin.deactivate?.()
  document.body.innerHTML = ''
})

describe('listing memos', () => {
  it('lists body and table-cell memos in document order with pages and anchor rectangles', () => {
    const doc = blank(['본문 메모 자리', ''])
    const cellPath = withTable(doc, 1)
    insertBodyMemo(doc, 0, 0, 2, '본문', '첫 메모')
    insertPathMemo(doc, 1, cellPath, 0, 3, '표', '표 메모')
    const { plugin } = openEditor(doc)

    const listed = plugin.listMemos()
    expect(listed.count).toBe(2)
    expect(listed.memos.map((memo) => memo.place)).toEqual(['body', 'tableCell'])
    expect(listed.memos.map((memo) => memo.page)).toEqual([1, 1])
    const body = listed.memos[0]!
    expect(body).toMatchObject({
      author: '본문',
      text: '첫 메모',
      sectionIndex: 0,
      paraIndex: 0,
      startCharIdx: 0,
      endCharIdx: 2,
      path: null,
      editable: true,
      readOnlyReason: null,
    })
    expect(body.anchor).toEqual({ sec: 0, para: 0, offset: 0, length: 2 })
    expect(body.rects).toEqual(JSON.parse(doc.getSelectionRects(0, 0, 0, 0, 2)))

    const cell = listed.memos[1]!
    expect(cell).toMatchObject({ place: 'tableCell', sectionIndex: 0, paraIndex: 1 })
    expect(cell.path).toEqual([{ type: 'cell', controlIndex: 0, cellIndex: 0, paraIndex: 0 }])
    expect(cell.anchor).toEqual({
      sec: 0,
      para: 1,
      path: [{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }],
      offset: 0,
      length: 3,
    })
    expect(cell.rects).toEqual(
      JSON.parse(
        doc.getSelectionRectsInCellByPath(
          0,
          1,
          JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }]),
          0,
          0,
          0,
          3,
        ),
      ),
    )
  })

  it('gives a text box memo the same rectangles and a caret memo a zero-width marker', () => {
    const doc = blank(['anchor text'])
    const path = withTextBox(doc)
    insertPathMemo(doc, 0, path, 0, 3, '상자', '상자 메모')
    insertBodyMemo(doc, 0, 6, 6, '빈', '빈 앵커')
    const { plugin } = openEditor(doc)

    const listed = plugin.listMemos()
    expect(listed.memos.map((memo) => memo.place)).toEqual(['textBox', 'body'])
    const box = listed.memos[0]!
    expect(box.path).toHaveLength(1)
    expect(box.path![0]).toMatchObject({ type: 'textbox', paraIndex: 0 })
    const step = box.path![0]!
    expect(box.rects).toEqual(
      JSON.parse(
        doc.getSelectionRectsInCellByPath(
          0,
          0,
          JSON.stringify([
            { controlIndex: step.controlIndex, cellIndex: 0, cellParaIndex: step.paraIndex },
          ]),
          0,
          0,
          0,
          3,
        ),
      ),
    )
    const caret = listed.memos[1]!
    expect(caret.startCharIdx).toBe(6)
    expect(caret.endCharIdx).toBe(6)
    expect(caret.rects).toHaveLength(1)
    expect(caret.rects[0]).toMatchObject({ pageIndex: 0, width: 0 })
    expect(caret.rects[0]!.height).toBeGreaterThan(0)
  })

  it('numbers a table-cell field as listFields does when a memo comes first', () => {
    const doc = blank(['memo text', ''])
    insertBodyMemo(doc, 0, 0, 4, 'body', 'memo')
    doc.pasteHtml(0, 1, 0, '<table><tr><td>name: </td></tr></table>')
    const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
    doc.insertClickHereFieldByPath(0, 1, path, 6, 'guide', '', 'field', true)
    const { plugin } = openEditor(doc)

    const fields = plugin.listFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]!.field).toBe(1)
    const table = plugin.readTable(1)
    expect(table.ok).toBe(true)
    if (!table.ok) return
    expect(table.cells[0]!.fields).toEqual([1])
  })
})

describe('the selection a memo may be put on', () => {
  it('accepts one paragraph of the body and shows what it holds', () => {
    const doc = blank(['제출 기한은 3월 2일입니다'])
    const { plugin, cursor } = openEditor(doc)
    cursor.selection = { start: bodyPlace(0, 7), end: bodyPlace(0, 12) }

    expect(plugin.memoSelection()).toMatchObject({
      ok: true,
      place: 'body',
      sectionIndex: 0,
      paraIndex: 0,
      startCharIdx: 7,
      endCharIdx: 12,
      path: null,
      preview: '3월 2일',
    })
  })

  it('shows the selected words where emoji and 𠀀 come before them', () => {
    // the engine counts 😀 and 𠀀 as one character each: 끝𠀀말 is characters 6 to 9
    const doc = blank(['웃음😀😀😀 끝𠀀말'])
    const { plugin, cursor } = openEditor(doc)
    cursor.selection = { start: bodyPlace(0, 6), end: bodyPlace(0, 9) }
    expect(plugin.memoSelection()).toMatchObject({
      ok: true,
      startCharIdx: 6,
      endCharIdx: 9,
      preview: '끝𠀀말',
    })
  })

  it('cuts a long preview at 80 characters without splitting an emoji', () => {
    // the 80th character is 😀: a cut by string units would keep only its first half
    const text = '가'.repeat(79) + '😀' + '나'.repeat(10)
    const doc = blank([text])
    const { plugin, cursor } = openEditor(doc)
    cursor.selection = { start: bodyPlace(0, 0), end: bodyPlace(0, 90) }
    const result = plugin.memoSelection()
    if (!result.ok) throw new Error('expected a selection')
    expect(result.preview).toBe(`${'가'.repeat(79)}😀…`)
    // no half of a pair is left: encodeURIComponent throws on one
    expect(() => encodeURIComponent(result.preview)).not.toThrow()
  })

  it('accepts a caret with no text and shows the words around it', () => {
    const doc = blank(['제출 기한은 3월 2일입니다'])
    const { plugin, cursor } = openEditor(doc)
    cursor.position = bodyPlace(0, 7)

    const result = plugin.memoSelection()
    expect(result).toMatchObject({
      ok: true,
      startCharIdx: 7,
      endCharIdx: 7,
    })
    expect(result.ok === true && result.preview).toContain('3월')
  })

  it('accepts a selection in a table cell and in a text box', () => {
    const doc = blank(['title', ''])
    withTable(doc, 1)
    const { plugin, cursor } = openEditor(doc)
    cursor.selection = { start: cellPlace(1, 0, 0), end: cellPlace(1, 0, 3) }
    expect(plugin.memoSelection()).toMatchObject({
      ok: true,
      place: 'tableCell',
      sectionIndex: 0,
      paraIndex: 1,
      startCharIdx: 0,
      endCharIdx: 3,
      path: [{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }],
    })

    const box = blank(['anchor'])
    const boxPath = withTextBox(box)
    const second = openEditor(box)
    const control = JSON.parse(boxPath)[0].controlIndex
    second.cursor.selection = {
      start: { ...cellPlace(0, 0, 0, control), isTextBox: true },
      end: { ...cellPlace(0, 0, 3, control), isTextBox: true },
    }
    expect(second.plugin.memoSelection()).toMatchObject({
      ok: true,
      place: 'textBox',
      path: [{ controlIndex: control, cellIndex: 0, cellParaIndex: 0 }],
    })
  })

  it('refuses a selection over more than one paragraph', () => {
    const { plugin, cursor } = openEditor(blank(['첫째 문단', '둘째 문단']))
    cursor.selection = { start: bodyPlace(0, 0), end: bodyPlace(1, 3) }
    expect(plugin.memoSelection()).toEqual({ ok: false, reason: 'multi_paragraph' })
  })

  it('refuses a place without an address here, and a protected document', () => {
    const { plugin, cursor } = openEditor(blank(['본문']))
    cursor.selection = { start: bodyPlace(0, 0), end: bodyPlace(0, 2) }
    cursor.footnote = true
    expect(plugin.memoSelection()).toEqual({ ok: false, reason: 'unsupported_place' })

    cursor.footnote = false
    const source = blank(['본문'])
    const protectedDoc = HwpDocument.openWithPassword(
      source.exportHwpWithPassword('secret'),
      'secret',
    )
    const second = openEditor(protectedDoc)
    second.cursor.selection = { start: bodyPlace(0, 0), end: bodyPlace(0, 2) }
    expect(second.plugin.memoSelection()).toEqual({ ok: false, reason: 'protected' })
  })

  it('refuses a range that overlaps an existing memo, but not one that ends on its edge', () => {
    const doc = blank(['abcdef'])
    insertBodyMemo(doc, 0, 1, 3)
    const { plugin, cursor } = openEditor(doc)

    cursor.selection = { start: bodyPlace(0, 2), end: bodyPlace(0, 4) }
    expect(plugin.memoSelection()).toEqual({ ok: false, reason: 'overlap' })

    cursor.selection = null
    cursor.position = bodyPlace(0, 3)
    expect(plugin.memoSelection()).toMatchObject({ ok: true, startCharIdx: 3, endCharIdx: 3 })

    cursor.selection = { start: bodyPlace(0, 0), end: bodyPlace(0, 1) }
    expect(plugin.memoSelection()).toMatchObject({ ok: true, startCharIdx: 0, endCharIdx: 1 })
  })
})

describe('inserting, editing and removing a memo', () => {
  it('inserts at the selection in one undo step, then takes it back', () => {
    const editor = openEditor(blank(['제출 기한은 3월 2일입니다']))
    editor.cursor.selection = { start: bodyPlace(0, 7), end: bodyPlace(0, 12) }
    const anchor = editor.plugin.memoSelection()
    expect(anchor.ok).toBe(true)
    if (!anchor.ok) return
    editor.plugin.showMemoAnchors(true)
    expect(document.querySelectorAll('.ieum-memo-anchors > div')).toHaveLength(0)

    const made = editor.plugin.insertMemo(anchor.anchor, 'tester', '첫 줄\n둘째 줄')
    expect(made.ok).toBe(true)
    if (!made.ok) return
    expect(editor.labels).toEqual(['memo-insert'])
    expect(editor.steps()).toBe(1)
    // the new anchor is drawn without the panel asking again
    expect(document.querySelectorAll('.ieum-memo-anchors > div').length).toBeGreaterThan(0)
    expect(editor.plugin.listMemos().memos[0]).toMatchObject({
      id: made.id,
      index: made.index,
      author: 'tester',
      text: '첫 줄\n둘째 줄',
    })
    expect(JSON.parse(editor.doc().getDocumentInfo()).pageCount).toBe(1)

    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({
      ok: true,
      undone: 1,
    })
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('inserts in a table cell and in a text box through their paths', () => {
    const table = blank(['title', ''])
    withTable(table, 1)
    const first = openEditor(table)
    first.cursor.selection = { start: cellPlace(1, 0, 0), end: cellPlace(1, 0, 3) }
    const cellAnchor = first.plugin.memoSelection()
    expect(cellAnchor.ok).toBe(true)
    if (!cellAnchor.ok) return
    expect(first.plugin.insertMemo(cellAnchor.anchor, 'cell', 'cell note')).toMatchObject({
      ok: true,
    })
    expect(first.plugin.listMemos().memos[0]).toMatchObject({
      place: 'tableCell',
      path: [{ type: 'cell', controlIndex: 0, cellIndex: 0, paraIndex: 0 }],
    })

    const box = blank(['anchor'])
    const boxPath = withTextBox(box)
    const control = JSON.parse(boxPath)[0].controlIndex
    const second = openEditor(box)
    second.cursor.selection = {
      start: { ...cellPlace(0, 0, 0, control), isTextBox: true },
      end: { ...cellPlace(0, 0, 3, control), isTextBox: true },
    }
    const boxAnchor = second.plugin.memoSelection()
    expect(boxAnchor.ok).toBe(true)
    if (!boxAnchor.ok) return
    expect(second.plugin.insertMemo(boxAnchor.anchor, 'box', 'box note')).toMatchObject({
      ok: true,
    })
    expect(second.plugin.listMemos().memos[0]).toMatchObject({ place: 'textBox' })
    expect(second.plugin.listMemos().memos[0]!.rects.length).toBeGreaterThan(0)
  })

  it('changes only the text and keeps the author and date', () => {
    const doc = blank(['hello world'])
    const made = insertBodyMemo(doc, 0, 0, 5, 'tester', 'before')
    const editor = openEditor(doc)

    expect(editor.plugin.setMemo(made.id, 'after\n\nend')).toEqual({ ok: true })
    expect(editor.labels).toEqual(['memo-set'])
    expect(editor.steps()).toBe(1)
    expect(editor.plugin.listMemos().memos[0]).toMatchObject({
      id: made.id,
      author: 'tester',
      date: null,
      text: 'after\n\nend',
    })
    // the text the memo was put on is untouched
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe('hello world')

    editor.plugin.setMemo(made.id, 'again')
    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().memos[0]!.text).toBe('after\n\nend')
  })

  it('removes a memo and keeps its text, then takes the removal back', () => {
    const doc = blank(['hello world'])
    const made = insertBodyMemo(doc, 0, 0, 5)
    const editor = openEditor(doc)

    expect(editor.plugin.removeMemo(made.id)).toEqual({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(0)
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe('hello world')
    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(1)
  })

  it('refuses a protected document and a read-only memo, and an unknown id', () => {
    const doc = blank(['hello'])
    insertBodyMemo(doc, 0, 0, 2)
    const protectedDoc = HwpDocument.openWithPassword(doc.exportHwpWithPassword('secret'), 'secret')
    const editor = openEditor(protectedDoc)
    const memo = editor.plugin.listMemos().memos[0]!
    const anchor = {
      place: 'body' as const,
      sectionIndex: 0,
      paraIndex: 0,
      startCharIdx: 0,
      endCharIdx: 2,
      path: null,
    }
    expect(editor.plugin.insertMemo(anchor, 'me', 'new')).toEqual({
      ok: false,
      reason: 'protected',
    })
    expect(editor.plugin.setMemo(memo.id, 'new')).toMatchObject({
      ok: false,
      reason: 'memo_read_only',
    })
    expect(editor.plugin.removeMemo(memo.id)).toMatchObject({
      ok: false,
      reason: 'memo_read_only',
    })

    const plain = openEditor(blank(['hello']))
    expect(plain.plugin.removeMemo(999)).toEqual({ ok: false, reason: 'memo_not_found' })
  })
})

describe('the anchors on the pages', () => {
  it('draws a band over each memo range when the panel is open, and hides them when it closes', () => {
    const doc = blank(['본문 메모 자리', '둘째 문단입니다'])
    insertBodyMemo(doc, 0, 0, 2)
    insertBodyMemo(doc, 1, 0, 3)
    const { plugin } = openEditor(doc)

    expect(document.querySelector('.ieum-memo-anchors')).toBeNull()
    plugin.showMemoAnchors(true)
    const listed = plugin.listMemos()
    expect(anchorsOnPage().map((box) => box.rect)).toEqual([
      ...rectsOf(doc, listed.memos[0]!),
      ...rectsOf(doc, listed.memos[1]!),
    ])

    plugin.showMemoAnchors(false)
    expect(document.querySelector('.ieum-memo-anchors')).toBeNull()
  })

  it('makes the selected memo stronger and marks a caret anchor with a small bar', () => {
    const doc = blank(['abcdef'])
    const first = insertBodyMemo(doc, 0, 0, 2, 'one', 'first')
    insertBodyMemo(doc, 0, 4, 4, 'two', 'caret')
    const { plugin } = openEditor(doc)

    plugin.showMemoAnchors(true)
    plugin.selectMemo(first.id)
    const boxes = anchorsOnPage()
    expect(boxes.some((box) => box.selected)).toBe(true)
    expect(boxes.filter((box) => box.selected)).toHaveLength(
      rectsOf(doc, plugin.listMemos().memos[0]!).length,
    )

    const caret = boxes.filter((box) => box.caret)
    expect(caret).toHaveLength(1)
    expect(caret[0]!.rect.width).toBeLessThanOrEqual(4)
    expect(caret[0]!.rect.height).toBeGreaterThan(0)
  })

  it('draws the new places again when the document changes or the zoom does', () => {
    const doc = blank(['abcdef'])
    insertBodyMemo(doc, 0, 2, 5)
    const editor = openEditor(doc)
    editor.plugin.showMemoAnchors(true)
    const before = anchorsOnPage()[0]!.rect

    editor.userEdit((current) => current.insertText(0, 0, 0, 'XX'))
    const moved = anchorsOnPage()[0]!.rect
    expect(moved.x).toBeGreaterThan(before.x)
    expect(moved).toEqual(rectsOf(editor.doc(), editor.plugin.listMemos().memos[0]!)[0])

    let resized: (() => void) | null = null
    const Observer = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      editor.plugin.showMemoAnchors(false)
      editor.plugin.showMemoAnchors(true)
      const first = () =>
        document.querySelector<HTMLElement>('.ieum-memo-anchors > div') as HTMLElement
      const base = parseFloat(first().style.left)
      const baseWidth = parseFloat(first().style.width)
      zoom = 3
      resized!()
      expect(parseFloat(first().style.left)).not.toBe(base)
      expect(parseFloat(first().style.width)).not.toBe(baseWidth)
    } finally {
      globalThis.ResizeObserver = Observer
    }
  })
})

describe('the lock a memo modal holds', () => {
  const fire = (name: string) => {
    const event = new Event(name, { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event
  }

  it('blocks keys, pointer, paste, drop and typing while locked, and lets them through after', () => {
    const { plugin } = openEditor(blank(['본문']))
    expect(plugin.setMemoLock(true)).toEqual({ ok: true, locked: true })
    for (const name of ['keydown', 'beforeinput', 'paste', 'drop', 'pointerdown']) {
      expect(fire(name).defaultPrevented).toBe(true)
    }

    expect(plugin.setMemoLock(false)).toEqual({ ok: true, locked: false })
    for (const name of ['keydown', 'beforeinput', 'paste', 'drop', 'pointerdown']) {
      expect(fire(name).defaultPrevented).toBe(false)
    }
  })

  it('exposes the list, selection and lock as the editor commands the app names', () => {
    const { plugin, commands } = openEditor(blank(['본문']))
    for (const id of [
      'ext:ieum-memo-list',
      'ext:ieum-memo-selection',
      'ext:ieum-memo-insert',
      'ext:ieum-memo-set',
      'ext:ieum-memo-remove',
      'ext:ieum-memo-lock',
      'ext:ieum-memo-unlock',
    ]) {
      expect(commands.has(id)).toBe(true)
    }

    commands.get('ext:ieum-memo-lock')!(null)
    expect(fire('keydown').defaultPrevented).toBe(true)
    commands.get('ext:ieum-memo-unlock')!(null)
    expect(fire('keydown').defaultPrevented).toBe(false)
    expect(plugin.listMemos()).toEqual({ count: 0, memos: [], supported: true })

    commands.get('ext:ieum-memo-insert')!(null, {
      anchor: {
        place: 'body',
        sectionIndex: 0,
        paraIndex: 0,
        startCharIdx: 0,
        endCharIdx: 2,
        path: null,
      },
      author: 'me',
      text: 'command note',
    })
    expect(plugin.listMemos().count).toBe(1)
    commands.get('ext:ieum-memo-remove')!(null, { id: plugin.listMemos().memos[0]!.id })
    expect(plugin.listMemos().count).toBe(0)
  })
})
