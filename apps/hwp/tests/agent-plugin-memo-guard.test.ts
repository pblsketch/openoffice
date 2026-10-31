// @vitest-environment jsdom
/**
 * The memo guard around AI edits, against the real rhwp engine: an edit that would take a
 * memo away is rolled back and asks for approval, the same edit goes through with the
 * allowance; a user's own deletion is announced once; and the copy/paste results the engine
 * makes of memos are what the panel sees.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)
const FIXTURES = join(__dirname, 'fixtures')

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

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

function blank(lines: string[]): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, k) => {
    if (k > 0) doc.splitParagraph(0, k - 1, doc.getParagraphLength(0, k - 1))
    if (line) doc.insertText(0, k, 0, line)
  })
  return doc
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

/** A two-row, two-column table in paragraph 1, with a memo in the text of its last cell. */
function tableWithMemo() {
  const doc = blank(['title', ''])
  doc.pasteHtml(
    0,
    1,
    0,
    '<table><tr><td>r1</td><td>x</td></tr><tr><td>r2</td><td>memo here</td></tr></table>',
  )
  const path = JSON.stringify([{ controlIndex: 0, cellIndex: 3, cellParaIndex: 0 }])
  const made = JSON.parse(
    doc.insertMemoByPath(0, 1, path, 0, 4, JSON.stringify({ author: 'cell', text: 'cell memo' })),
  ) as { ok: true; id: number; index: number }
  return { doc, made, path }
}

/** A text box after the text of paragraph 0, holding `box text`. */
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

/** A one-cell table in paragraph 1 with a memo on its whole text `cell text`. */
function tableWithCellMemo() {
  const doc = blank(['title', ''])
  doc.pasteHtml(0, 1, 0, '<table><tr><td>cell text</td></tr></table>')
  const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
  const made = JSON.parse(
    doc.insertMemoByPath(
      0,
      1,
      path,
      0,
      4,
      JSON.stringify({ author: 'cell author', text: 'cell memo' }),
    ),
  ) as { ok: true; id: number; index: number }
  return { doc, made, path }
}

/** A text box holding `box text`, with a memo on its whole text. */
function textBoxWithMemo() {
  const doc = blank(['anchor'])
  const path = withTextBox(doc)
  const made = JSON.parse(
    doc.insertMemoByPath(
      0,
      0,
      path,
      0,
      3,
      JSON.stringify({ author: 'box author', text: 'box memo' }),
    ),
  ) as { ok: true; id: number; index: number }
  return { doc, made, path }
}

function openEditor(doc: HwpDocument) {
  document.body.innerHTML = '<div id="scroll-container"><div id="scroll-content"></div></div>'
  let current = doc
  const history: Uint8Array[] = []
  const labels: string[] = []
  const listeners: (() => void)[] = []
  const commands = new Map<string, (services: unknown, params?: unknown) => unknown>()
  const cursor = {
    position: null as Position | null,
    selection: null as { start: Position; end: Position } | null,
    isInCellSelectionMode: () => false,
    isInHeaderFooter: () => false,
    isInFootnote: () => false,
    isInPictureObjectSelection: () => false,
    isInTableObjectSelection: () => false,
    hasSelection: () => cursor.selection !== null,
    getSelectionOrdered: () => cursor.selection,
    getPosition: () => cursor.position,
  }
  const services = {
    getInputHandler: () => ({ cursor }),
    getViewportManager: () => ({ getZoom: () => 2 }),
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
  /** a change the user makes in the editor, recorded so the editor's undo can take it back */
  const userEdit = (change: (doc: HwpDocument) => void) => {
    history.push(current.exportHwp())
    change(current)
    emit()
  }
  return {
    plugin,
    doc: () => current,
    cursor,
    labels,
    steps: () => history.length,
    userEdit,
  }
}

/** The events the plugin sends on the editor's window. */
function watch(name: string) {
  const seen: { detail: Record<string, unknown> }[] = []
  const handler = (event: Event) => seen.push((event as CustomEvent).detail)
  globalThis.addEventListener(name, handler)
  return { seen, stop: () => globalThis.removeEventListener(name, handler) }
}

/** A small BroadcastChannel: each message reaches the other channels of the same name. */
class FakeChannel {
  static groups = new Map<string, Set<FakeChannel>>()
  onmessage: ((event: { data: unknown }) => void) | null = null
  readonly name: string

  constructor(name: string) {
    this.name = name
    const group = FakeChannel.groups.get(name) ?? new Set<FakeChannel>()
    group.add(this)
    FakeChannel.groups.set(name, group)
  }

  postMessage(data: unknown) {
    for (const other of FakeChannel.groups.get(this.name) ?? []) {
      if (other !== this) other.onmessage?.({ data })
    }
  }

  close() {
    FakeChannel.groups.get(this.name)?.delete(this)
  }
}

afterEach(() => {
  agentPlugin.deactivate?.()
  document.body.innerHTML = ''
})

describe('an AI edit that would take a memo with it', () => {
  it('rolls back and answers with the memos that would be lost', () => {
    const { doc, made } = tableWithMemo()
    const editor = openEditor(doc)

    const result = editor.plugin.removeTableLines(1, 'rows', 2, 1)
    expect(result).toMatchObject({
      ok: false,
      reason: 'memo_removal_requires_approval',
      count: 1,
    })
    expect(result.ok === false && result.memos).toEqual([
      { id: made.id, index: 1, author: 'cell', text: 'cell memo', place: 'tableCell', page: 1 },
    ])
    // nothing was left behind: the table and its memo are as they were, with no undo step
    expect(editor.steps()).toBe(0)
    expect(JSON.parse(editor.doc().getTableDimensions(0, 1, 0))).toMatchObject({
      rowCount: 2,
      colCount: 2,
    })
    expect(editor.plugin.listMemos()).toMatchObject({ count: 1 })
  })

  it('goes through when the same call is given the allowance', () => {
    const { doc } = tableWithMemo()
    const editor = openEditor(doc)

    const result = editor.plugin.removeTableLines(1, 'rows', 2, 1, { allowMemoRemoval: true })
    expect(result).toMatchObject({ ok: true, rows: 1, cols: 2 })
    expect(JSON.parse(editor.doc().getTableDimensions(0, 1, 0))).toMatchObject({ rowCount: 1 })
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('asks before a replace that deletes the whole anchor text', () => {
    const doc = blank(['hello world'])
    const made = insertBodyMemo(doc, 0, 0, 5, 'tester', 'memo body')
    const editor = openEditor(doc)

    const result = editor.plugin.replaceText('hello', '')
    expect(result).toMatchObject({
      ok: false,
      reason: 'memo_removal_requires_approval',
      count: 1,
    })
    expect(result.ok === false && result.memos[0]).toMatchObject({
      id: made.id,
      author: 'tester',
      text: 'memo body',
    })
    // the engine deleted the memo inside the transaction; the rollback brought it back
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe('hello world')
    expect(editor.plugin.listMemos().count).toBe(1)
    expect(editor.steps()).toBe(0)

    const retry = editor.plugin.replaceText('hello', '', null, { allowMemoRemoval: true })
    expect(retry).toMatchObject({ ok: true })
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe(' world')
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('asks before a paragraph edit that deletes the whole anchor text', () => {
    const doc = blank(['first', 'memo paragraph', 'third'])
    insertBodyMemo(doc, 1, 0, 4, 'body', 'body memo')
    const editor = openEditor(doc)

    const result = editor.plugin.deleteParagraph('memo paragraph', null)
    expect(result).toMatchObject({
      ok: false,
      reason: 'memo_removal_requires_approval',
      count: 1,
    })
    expect(editor.plugin.listMemos().count).toBe(1)

    const retry = editor.plugin.deleteParagraph('memo paragraph', null, {
      allowMemoRemoval: true,
    })
    expect(retry).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('does not ask when the edit only changes the text inside the anchor', () => {
    const doc = blank(['hello world'])
    insertBodyMemo(doc, 0, 0, 5)
    const editor = openEditor(doc)

    expect(editor.plugin.replaceText('ell', 'ipp')).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().memos[0]).toMatchObject({
      startCharIdx: 0,
      endCharIdx: 5,
    })
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe('hippo world')
  })

  it('never flags the plugin’s own memo calls', () => {
    const doc = blank(['hello world'])
    const editor = openEditor(doc)
    const anchor = {
      place: 'body' as const,
      sectionIndex: 0,
      paraIndex: 0,
      startCharIdx: 0,
      endCharIdx: 5,
      path: null,
    }
    const made = editor.plugin.insertMemo(anchor, 'me', 'note')
    expect(made.ok).toBe(true)
    if (!made.ok) return
    expect(editor.plugin.setMemo(made.id, 'changed')).toEqual({ ok: true })
    expect(editor.plugin.removeMemo(made.id)).toEqual({ ok: true })
  })
})

describe('replacing text in a memo’s cell', () => {
  it('keeps a cell memo when its whole anchor is replaced with text of the same length', () => {
    const { doc, made, path } = tableWithCellMemo()
    const editor = openEditor(doc)

    expect(editor.plugin.replaceText('cell', 'CELL')).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().memos[0]).toMatchObject({
      id: made.id,
      author: 'cell author',
      text: 'cell memo',
      place: 'tableCell',
      startCharIdx: 0,
      endCharIdx: 4,
    })
    expect(editor.doc().getTextInCellByPath(0, 1, path, 0, 20)).toBe('CELL text')
  })

  it('keeps a cell memo when its anchor is replaced with shorter or longer text', () => {
    for (const replacement of [
      'C',
      'a much longer replacement',
      'abcdefg😀tail',
      'a😀bcdefgh',
      'abcdefgh😀tail',
      '😀😀😀😀😀',
    ]) {
      const { doc, made, path } = tableWithCellMemo()
      const editor = openEditor(doc)

      expect(editor.plugin.replaceText('cell', replacement)).toMatchObject({ ok: true })
      expect(editor.plugin.listMemos().memos[0]).toMatchObject({
        id: made.id,
        author: 'cell author',
        text: 'cell memo',
        startCharIdx: 0,
        endCharIdx: Array.from(replacement).length,
      })
      expect(editor.doc().getTextInCellByPath(0, 1, path, 0, 60)).toBe(`${replacement} text`)
    }
  })

  it('replaces more than eight characters of a cell, shorter or longer, keeping its memo', () => {
    // the engine's one-call cell replace removes at most eight characters; a cell title
    // of a school form is longer than that
    for (const replacement of ['C', 'short', 'a much longer replacement', '😀😀😀😀😀😀😀😀😀😀']) {
      const doc = blank(['title', ''])
      doc.pasteHtml(0, 1, 0, '<table><tr><td>a long cell heading here</td></tr></table>')
      const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
      const made = JSON.parse(
        doc.insertMemoByPath(
          0,
          1,
          path,
          0,
          17,
          JSON.stringify({ author: 'cell author', text: 'cell memo' }),
        ),
      ) as { ok: true; id: number }
      const editor = openEditor(doc)

      expect(editor.plugin.replaceText('a long cell heading', replacement)).toMatchObject({
        ok: true,
        inTable: true,
      })
      expect(editor.doc().getTextInCellByPath(0, 1, path, 0, 60)).toBe(`${replacement} here`)
      expect(editor.plugin.listMemos().memos[0]).toMatchObject({
        id: made.id,
        text: 'cell memo',
        startCharIdx: 0,
      })
    }
  })

  it('keeps a memo that lies wholly in the far part of a long replaced span', () => {
    for (const [start, end] of [
      [12, 19],
      [2, 5],
      [15, 24],
    ]) {
      const doc = blank(['title', ''])
      doc.pasteHtml(0, 1, 0, '<table><tr><td>a long cell heading here</td></tr></table>')
      const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
      const made = JSON.parse(
        doc.insertMemoByPath(0, 1, path, start, end, JSON.stringify({ author: 'a', text: 'm' })),
      ) as { ok: true; id: number }
      const editor = openEditor(doc)

      expect(editor.plugin.replaceText('a long cell heading', 'new title')).toMatchObject({
        ok: true,
      })
      expect(editor.doc().getTextInCellByPath(0, 1, path, 0, 60)).toBe('new title here')
      expect(editor.plugin.listMemos().memos.map((memo) => memo.id)).toEqual([made.id])
    }
  })

  it('replaces every long occurrence in cells at once', () => {
    const doc = blank(['title', ''])
    doc.pasteHtml(
      0,
      1,
      0,
      '<table><tr><td>first long cell title</td><td>second long cell title</td></tr></table>',
    )
    const editor = openEditor(doc)

    expect(editor.plugin.replaceAllText('long cell title', 'heading')).toMatchObject({
      ok: true,
      count: 2,
    })
    const cell = (index: number) =>
      editor
        .doc()
        .getTextInCellByPath(
          0,
          1,
          JSON.stringify([{ controlIndex: 0, cellIndex: index, cellParaIndex: 0 }]),
          0,
          60,
        )
    expect([cell(0), cell(1)]).toEqual(['first heading', 'second heading'])
  })

  it('keeps a text-box memo when its whole anchor is replaced', () => {
    const { doc, made, path } = textBoxWithMemo()
    const editor = openEditor(doc)

    expect(editor.plugin.replaceText('box', 'BOXX')).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().memos[0]).toMatchObject({
      id: made.id,
      author: 'box author',
      text: 'box memo',
      place: 'textBox',
      startCharIdx: 0,
      endCharIdx: 4,
    })
    expect(editor.doc().getTextInCellByPath(0, 0, path, 0, 20)).toBe('BOXX text')
  })

  it('keeps a text-box memo with non-BMP replacement text', () => {
    for (const replacement of ['a😀bcdefgh', '😀😀😀😀😀']) {
      const { doc, made, path } = textBoxWithMemo()
      const editor = openEditor(doc)

      expect(editor.plugin.replaceText('box', replacement)).toMatchObject({ ok: true })
      expect(editor.plugin.listMemos().memos[0]).toMatchObject({
        id: made.id,
        author: 'box author',
        text: 'box memo',
        place: 'textBox',
        startCharIdx: 0,
        endCharIdx: Array.from(replacement).length,
      })
      expect(editor.doc().getTextInCellByPath(0, 0, path, 0, 60)).toBe(`${replacement} text`)
    }
  })

  it('keeps a cell’s click-here field when its text is replaced', () => {
    const doc = blank(['title', ''])
    doc.pasteHtml(0, 1, 0, '<table><tr><td>cell text</td></tr></table>')
    const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
    doc.insertClickHereFieldByPath(0, 1, path, 0, 'guide', '', 'field', true)
    const editor = openEditor(doc)

    const before = editor.plugin.listFields()
    expect(before).toHaveLength(1)
    expect(editor.plugin.replaceText('cell', 'CELL')).toMatchObject({ ok: true })
    const after = editor.plugin.listFields()
    expect(after).toHaveLength(1)
    expect(after[0]!.field).toBe(before[0]!.field)
  })

  it('keeps a cell memo through replaceAll', () => {
    for (const replacement of ['CELL', 'a😀bcdefgh']) {
      const { doc, made, path } = tableWithCellMemo()
      const editor = openEditor(doc)

      expect(editor.plugin.replaceAllText('cell', replacement)).toMatchObject({
        ok: true,
        count: 1,
      })
      expect(editor.plugin.listMemos().memos[0]).toMatchObject({
        id: made.id,
        startCharIdx: 0,
        endCharIdx: Array.from(replacement).length,
      })
      expect(editor.doc().getTextInCellByPath(0, 1, path, 0, 60)).toBe(`${replacement} text`)
    }
  })

  it('keeps a cell memo and a text-box memo through replaceSelection', () => {
    for (const replacement of ['CELL', 'a😀bcdefgh']) {
      const cell = tableWithCellMemo()
      const first = openEditor(cell.doc)
      const cellMemo = first.plugin.listMemos().memos[0]!
      expect(
        first.plugin.replaceSelection([{ ...cellMemo.anchor!, text: 'cell' }], [replacement]),
      ).toMatchObject({ ok: true })
      expect(first.plugin.listMemos().memos[0]).toMatchObject({
        id: cell.made.id,
        startCharIdx: 0,
        endCharIdx: Array.from(replacement).length,
      })
      expect(first.doc().getTextInCellByPath(0, 1, cell.path, 0, 60)).toBe(`${replacement} text`)

      const box = textBoxWithMemo()
      const second = openEditor(box.doc)
      const boxMemo = second.plugin.listMemos().memos[0]!
      expect(
        second.plugin.replaceSelection([{ ...boxMemo.anchor!, text: 'box' }], [replacement]),
      ).toMatchObject({ ok: true })
      expect(second.plugin.listMemos().memos[0]).toMatchObject({
        id: box.made.id,
        place: 'textBox',
        startCharIdx: 0,
        endCharIdx: Array.from(replacement).length,
      })
      expect(second.doc().getTextInCellByPath(0, 0, box.path, 0, 60)).toBe(`${replacement} text`)
    }
  })

  it('still asks before an empty replacement in a cell, and removes it with the allowance', () => {
    const { doc } = tableWithCellMemo()
    const editor = openEditor(doc)

    const result = editor.plugin.replaceText('cell', '')
    expect(result).toMatchObject({
      ok: false,
      reason: 'memo_removal_requires_approval',
      count: 1,
    })
    expect(editor.plugin.listMemos().count).toBe(1)

    expect(editor.plugin.replaceText('cell', '', null, { allowMemoRemoval: true })).toMatchObject({
      ok: true,
    })
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('still asks before an empty replacement in a text box', () => {
    const { doc } = textBoxWithMemo()
    const editor = openEditor(doc)

    expect(editor.plugin.replaceText('box', '')).toMatchObject({
      ok: false,
      reason: 'memo_removal_requires_approval',
      count: 1,
    })
    expect(editor.plugin.listMemos().count).toBe(1)

    expect(editor.plugin.replaceText('box', '', null, { allowMemoRemoval: true })).toMatchObject({
      ok: true,
    })
    expect(editor.plugin.listMemos().count).toBe(0)
  })

  it('does not ask when text inside a cell or text-box memo is replaced', () => {
    const cell = tableWithCellMemo()
    const first = openEditor(cell.doc)
    expect(first.plugin.replaceText('el', 'ip')).toMatchObject({ ok: true })
    expect(first.plugin.listMemos().memos[0]).toMatchObject({
      id: cell.made.id,
      startCharIdx: 0,
      endCharIdx: 4,
    })

    const box = textBoxWithMemo()
    const second = openEditor(box.doc)
    expect(second.plugin.replaceText('bo', 'BO')).toMatchObject({ ok: true })
    expect(second.plugin.listMemos().memos[0]).toMatchObject({
      id: box.made.id,
      startCharIdx: 0,
      endCharIdx: 3,
    })
  })
})

describe('a memo the user’s own edit takes away', () => {
  it('is announced once, and the editor’s undo brings it back', () => {
    const doc = blank(['title', ''])
    const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
    doc.pasteHtml(0, 1, 0, '<table><tr><td>cell text</td></tr></table>')
    insertBodyMemo(doc, 0, 0, 2, 'body', 'body memo')
    JSON.parse(
      doc.insertMemoByPath(0, 1, path, 0, 4, JSON.stringify({ author: 'cell', text: 'cell memo' })),
    )
    const editor = openEditor(doc)
    const watched = watch('ieum:memo-removed')

    editor.userEdit((current) => current.deleteTableControl(0, 1, 0))
    expect(watched.seen).toHaveLength(1)
    expect(watched.seen[0]).toMatchObject({ kind: 'memo-removed', count: 1 })
    expect((watched.seen[0]!.memos as { author: string }[])[0]).toMatchObject({ author: 'cell' })

    // the editor's undo brings the table and its memo back, without a second notice
    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(2)
    expect(watched.seen).toHaveLength(1)

    // another change that takes nothing away is not announced
    editor.userEdit((current) => current.insertText(0, 0, 0, 'x'))
    expect(watched.seen).toHaveLength(1)
    watched.stop()
  })

  it('is announced when a body memo’s whole anchor text is deleted', () => {
    const doc = blank(['hello world'])
    insertBodyMemo(doc, 0, 0, 5, 'body', 'body memo')
    const editor = openEditor(doc)
    const watched = watch('ieum:memo-removed')

    editor.userEdit((current) => current.deleteText(0, 0, 0, 5))
    expect(watched.seen).toHaveLength(1)
    expect(watched.seen[0]).toMatchObject({ kind: 'memo-removed', count: 1 })
    expect(editor.plugin.listMemos().count).toBe(0)
    expect(editor.doc().getTextRange(0, 0, 0, 6)).toBe(' world')

    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(1)
    expect(editor.doc().getTextRange(0, 0, 0, 11)).toBe('hello world')
    expect(watched.seen).toHaveLength(1)
    watched.stop()
  })

  it('is announced when a table-cell memo’s whole anchor text is deleted', () => {
    const doc = blank(['title', ''])
    const path = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
    doc.pasteHtml(0, 1, 0, '<table><tr><td>cell text</td></tr></table>')
    JSON.parse(
      doc.insertMemoByPath(0, 1, path, 0, 4, JSON.stringify({ author: 'cell', text: 'cell memo' })),
    )
    const editor = openEditor(doc)
    const watched = watch('ieum:memo-removed')

    editor.userEdit((current) => current.deleteTextInCellByPath(0, 1, path, 0, 4))
    expect(watched.seen).toHaveLength(1)
    expect(watched.seen[0]).toMatchObject({ kind: 'memo-removed', count: 1 })
    expect(editor.plugin.listMemos().count).toBe(0)

    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(1)
    expect(watched.seen).toHaveLength(1)
    watched.stop()
  })

  it('is announced when a text-box memo’s whole anchor text is deleted', () => {
    const doc = blank(['anchor'])
    const path = withTextBox(doc)
    JSON.parse(
      doc.insertMemoByPath(0, 0, path, 0, 3, JSON.stringify({ author: 'box', text: 'box memo' })),
    )
    const editor = openEditor(doc)
    const watched = watch('ieum:memo-removed')

    editor.userEdit((current) => current.deleteTextInCellByPath(0, 0, path, 0, 3))
    expect(watched.seen).toHaveLength(1)
    expect(watched.seen[0]).toMatchObject({ kind: 'memo-removed', count: 1 })
    expect(editor.plugin.listMemos().count).toBe(0)

    expect(editor.plugin.undo(1, editor.plugin.foreignChanges())).toMatchObject({ ok: true })
    expect(editor.plugin.listMemos().count).toBe(1)
    expect(watched.seen).toHaveLength(1)
    watched.stop()
  })
})

describe('copy and paste', () => {
  it('duplicates a whole paragraph memo with a new id and number', () => {
    const doc = blank(['source text', 'target '])
    const made = insertBodyMemo(doc, 0, 0, 6, 'copier', 'copy body')
    const editor = openEditor(doc)

    doc.copySelection(0, 0, 0, 0, doc.getParagraphLength(0, 0))
    const pasted = JSON.parse(doc.pasteInternal(0, 1, 7)) as { containsField: boolean }
    expect(pasted.containsField).toBe(true)

    const listed = editor.plugin.listMemos()
    expect(listed.count).toBe(2)
    expect(listed.memos[1]).toMatchObject({
      author: 'copier',
      text: 'copy body',
      paraIndex: 1,
      startCharIdx: 7,
      endCharIdx: 13,
      index: 2,
    })
    expect(listed.memos[1]!.id).not.toBe(made.id)
  })

  it('keeps the text but drops a memo anchor whose end marker was not copied', () => {
    const source = new Uint8Array(readFileSync(join(FIXTURES, 'memo-source.hwp')))
    const doc = new HwpDocument(source)
    const editor = openEditor(doc)
    const memo = editor.plugin.listMemos().memos[0]!
    expect(editor.plugin.listMemos().count).toBe(1)

    const last = doc.getParagraphCount(0) - 1
    doc.splitParagraph(0, last, doc.getParagraphLength(0, last))
    const target = doc.getParagraphCount(0) - 1
    doc.insertText(0, target, 0, 'target ')
    doc.copySelection(0, memo.paraIndex!, 0, memo.paraIndex!, 1_000_000)
    const pasted = JSON.parse(doc.pasteInternal(0, target, 7)) as { containsField: boolean }
    expect(pasted.containsField).toBe(false)

    expect(editor.plugin.listMemos().count).toBe(1)
    const again = new HwpDocument(doc.exportHwp())
    expect(again.getMemoList()).toContain('"index":1')
    expect(again.getTextFileUnicode()).toContain('target')
  })

  it('tells the app when a paste brought the text without the memo', async () => {
    const doc = blank(['hello world'])
    insertBodyMemo(doc, 0, 0, 5, 'copier', 'copy body')
    const editor = openEditor(doc)
    editor.cursor.selection = {
      start: { sectionIndex: 0, paragraphIndex: 0, charOffset: 0 },
      end: { sectionIndex: 0, paragraphIndex: 0, charOffset: 5 },
    }
    const watched = watch('ieum:memo-not-copied')

    document.body.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }))
    // the editor's system-clipboard paste: text only, no memo field
    doc.insertText(0, 0, 11, ' hello')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(watched.seen).toHaveLength(1)
    expect(watched.seen[0]).toMatchObject({ kind: 'memo-not-copied', count: 1 })
    watched.stop()
  })

  it('does not report a same-editor paste that brought the memo', async () => {
    const doc = blank(['source text', 'target '])
    insertBodyMemo(doc, 0, 0, 6, 'copier', 'copy body')
    const editor = openEditor(doc)
    editor.cursor.selection = {
      start: { sectionIndex: 0, paragraphIndex: 0, charOffset: 0 },
      end: { sectionIndex: 0, paragraphIndex: 0, charOffset: 11 },
    }
    const watched = watch('ieum:memo-not-copied')

    document.body.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }))
    // the same editor's internal paste: the engine copies the memo with a new id
    doc.copySelection(0, 0, 0, 0, doc.getParagraphLength(0, 0))
    doc.pasteInternal(0, 1, 7)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(editor.plugin.listMemos().count).toBe(2)
    expect(watched.seen).toHaveLength(0)
    watched.stop()
  })

  it('tells the app when another editor’s memo copy is pasted as text', async () => {
    const globals = globalThis as unknown as { BroadcastChannel?: unknown }
    const previous = globals.BroadcastChannel
    globals.BroadcastChannel = FakeChannel
    try {
      const doc = blank(['hello world'])
      openEditor(doc)
      const watched = watch('ieum:memo-not-copied')

      // the other editor instance copied two memos and told the channel so
      const source = new FakeChannel('ieum:hwp-memo-copied')
      source.postMessage({ kind: 'memo-copied', count: 2, at: Date.now(), source: 'another' })
      document.body.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }))
      // the system-clipboard paste lands as text only
      doc.insertText(0, 0, 11, ' hello')
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(watched.seen).toHaveLength(1)
      expect(watched.seen[0]).toMatchObject({ kind: 'memo-not-copied', count: 2 })
      source.close()
      watched.stop()
    } finally {
      globals.BroadcastChannel = previous
    }
  })
})
