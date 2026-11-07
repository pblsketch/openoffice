/**
 * Typing the studio tells only as a mutation of its page, against the real rhwp engine. In a
 * document of more than 30 pages a typed character goes through the studio's
 * afterPageLocalEdit: it fires 'document-mutated' and 'document-page-invalidated' and no
 * 'document-changed', and it does not lay the pages out again later either. The plugin's watch
 * on the user's edits must see it: the AI's undo has to know the user typed after the run (or it
 * takes the user's text back with the run's), and the text the AI reads must be read again.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

/** A document of well over 30 pages: 1,500 paragraphs of 200 characters, then a short one. */
function longDocument(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const line = '긴 문서의 한 문단입니다. The quick brown fox jumps over the lazy dog. '
  const text = line.repeat(Math.ceil(200 / line.length)).slice(0, 200)
  const html = [...Array.from({ length: 1500 }, () => `<p>${text}</p>`), '<p>마지막 문단</p>']
  doc.pasteHtml(0, 0, 0, html.join(''))
  return doc
}

function openLong() {
  let doc = longDocument()
  const history: Uint8Array[] = []
  const listeners = new Map<string, ((payload?: unknown) => void)[]>()
  /** the studio's event bus: each event reaches only those who listen to it */
  const emit = (name: string, payload?: unknown) =>
    (listeners.get(name) ?? []).forEach((listener) => listener(payload))
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        const result = fn({ doc: () => doc, deferPagination: () => {} } as never)
        history.push(before)
        // the studio's commit of a plugin transaction
        emit('document-mutated', 'document-agent')
        emit('document-changed')
        return result
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: {
      on: (name: string, handler: (payload?: unknown) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), handler])
        return () =>
          listeners.set(
            name,
            (listeners.get(name) ?? []).filter((one) => one !== handler),
          )
      },
    },
    automation: {
      execute: (command: string) => {
        if (command !== 'edit:undo') return null
        const before = history.pop()
        if (!before) return { ok: false }
        doc = new HwpDocument(before)
        emit('document-mutated', 'input-handler-edit')
        emit('document-changed')
        return { ok: true }
      },
    },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host)
  const last = () => doc.getParagraphCount(0) - 1
  return {
    plugin,
    doc: () => doc,
    last,
    lastText: () => doc.getTextRange(0, last(), 0, doc.getParagraphLength(0, last())),
    /** the user types at the end of the last paragraph, as afterPageLocalEdit tells of it */
    userTypesOnPage: (text: string) => {
      doc.insertText(0, last(), doc.getParagraphLength(0, last()), text)
      history.push(new Uint8Array())
      emit('document-mutated', 'input-handler-edit')
      emit('document-page-invalidated', { pageIndex: 40, reason: 'text-edit' })
    },
    /** the user types where the studio lays the document out again and says it changed */
    userTypes: (text: string) => {
      doc.insertText(0, last(), doc.getParagraphLength(0, last()), text)
      history.push(new Uint8Array())
      emit('document-mutated', 'input-handler-edit')
      emit('document-changed')
    },
    /** the studio finishing a deferred layout: no edit of anyone's */
    layoutDone: () => {
      emit('document-mutated', 'input-handler-resumable-pagination')
    },
  }
}

describe('an edit the studio tells only as a page mutation (over 30 pages)', () => {
  it('is a document of more than 30 pages', () => {
    const editor = openLong()
    expect(JSON.parse(editor.doc().getDocumentInfo()).pageCount).toBeGreaterThan(30)
  })

  it('keeps the AI from taking the user’s typing back with its run', () => {
    const editor = openLong()
    const before = editor.plugin.foreignChanges()
    expect(editor.plugin.replaceText('마지막 문단', '끝 문단')).toMatchObject({ ok: true })
    editor.userTypesOnPage(' 사람이 친 글')
    // the user typed after the run: the run can no longer be taken back on its own
    expect(editor.plugin.foreignChanges()).not.toBe(before)
    expect(editor.plugin.undo(1, before)).toEqual({ ok: false, reason: 'changed', undone: 0 })
    expect(editor.lastText()).toBe('끝 문단 사람이 친 글')
  })

  it('makes the AI read the text again', () => {
    const editor = openLong()
    expect(editor.plugin.readText()).not.toContain('사람이 친 글')
    editor.userTypesOnPage(' 사람이 친 글')
    expect(editor.plugin.readText()).toContain('마지막 문단 사람이 친 글')
  })

  it('counts an edit the studio tells both ways once', () => {
    const editor = openLong()
    const before = editor.plugin.foreignChanges()
    editor.userTypes('가')
    expect(editor.plugin.foreignChanges()).toBe(before + 1)
    editor.userTypesOnPage('나')
    expect(editor.plugin.foreignChanges()).toBe(before + 2)
  })

  it('takes the end of a deferred layout for no edit, and the AI’s own run neither', () => {
    const editor = openLong()
    const before = editor.plugin.foreignChanges()
    editor.layoutDone()
    expect(editor.plugin.replaceText('마지막 문단', '끝 문단')).toMatchObject({ ok: true })
    expect(editor.plugin.foreignChanges()).toBe(before)
    expect(editor.plugin.undo(1, before)).toMatchObject({ ok: true, undone: 1 })
    expect(editor.lastText()).toBe('마지막 문단')
  })
})
