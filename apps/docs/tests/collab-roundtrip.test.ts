/**
 * A shared Word document travels as a Yjs XML fragment (decision 0073). The
 * save matches blocks by docxIndex and attribute signatures, so the document
 * the other peers rebuild from the fragment must save exactly like the
 * editor's own: untouched, and after the same edits.
 *
 * y-tiptap keeps marks on text only, not on inline atoms (footnote
 * references, pictures, line breaks). Those that carry nothing the save
 * writes may go; a document whose atoms carry real formatting is not shared
 * (`atomMarksLost`).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import * as Y from 'yjs'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { parseDocx, readSections, saveDocx, type ParsedDocFull } from '@genoffice/docx-engine'
import { editorExtensions } from '../src/renderer/editor/extensions'
import {
  blocksToPmDoc,
  pmDocOptions,
  pmDocToSavePlan,
  type PmNode,
} from '../src/renderer/editor/convert'
import { atomMarksLost } from '../src/renderer/collab'

const CORPUS = join(__dirname, 'pagination-corpus/docx')
const FIXTURES = readdirSync(CORPUS).filter((name) => name.endsWith('.docx'))

const editors = new Set<Editor>()
afterEach(() => {
  for (const editor of editors) editor.destroy()
  editors.clear()
})

function editorWith(content: unknown): Editor {
  const editor = new Editor({ extensions: editorExtensions, content: content as never })
  editors.add(editor)
  return editor
}

async function open(name: string) {
  const parsed = await parseDocx(new Uint8Array(readFileSync(join(CORPUS, name))))
  const editor = editorWith(
    blocksToPmDoc(parsed.blocks, readSections(parsed), pmDocOptions(parsed)),
  )
  return { parsed, editor }
}

/** the document as another peer's editor builds it from the host's update */
function throughYjs(editor: Editor): ProseMirrorNode {
  const host = new Y.Doc()
  prosemirrorToYXmlFragment(editor.state.doc, host.getXmlFragment('prosemirror'))
  const guest = new Y.Doc()
  Y.applyUpdate(guest, Y.encodeStateAsUpdate(host))
  return yXmlFragmentToProseMirrorRootNode(guest.getXmlFragment('prosemirror'), editor.schema)
}

/** marks the fragment cannot carry: those on inline atoms */
function withoutAtomMarks(node: PmNode): PmNode {
  const atom = node.type !== 'text' && node.content === undefined && node.marks !== undefined
  const { marks, ...rest } = node
  return {
    ...(atom ? rest : { ...rest, ...(marks ? { marks } : {}) }),
    ...(node.content ? { content: node.content.map(withoutAtomMarks) } : {}),
  }
}

/** type one character at the end of every top-level text block, as a peer's edit would */
function editEveryParagraph(editor: Editor): void {
  const tr = editor.state.tr
  const ends: number[] = []
  editor.state.doc.forEach((node, offset) => {
    if (node.isTextblock) ends.push(offset + node.nodeSize - 1)
  })
  for (const at of ends.reverse()) tr.insertText('x', at)
  editor.view.dispatch(tr)
}

async function saved(parsed: ParsedDocFull, editor: Editor): Promise<Buffer> {
  const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
  return Buffer.from(await saveDocx(parsed, plan.saveBlocks, {}))
}

describe('a shared Word document through Yjs', () => {
  it('has fixtures to check', () => {
    expect(FIXTURES.length).toBeGreaterThan(5)
  })

  it.each(FIXTURES)('%s comes back as the same document', async (name) => {
    const { editor } = await open(name)
    const back = throughYjs(editor)
    expect(withoutAtomMarks(back.toJSON() as PmNode)).toEqual(
      withoutAtomMarks(editor.state.doc.toJSON() as PmNode),
    )
    // what the fragment drops on atoms is nothing the save writes
    expect(atomMarksLost(editor.state.doc)).toBe(false)
  })

  it.each(FIXTURES)('%s saves the same bytes, untouched and edited', async (name) => {
    const { parsed, editor } = await open(name)
    const peer = editorWith(throughYjs(editor).toJSON())
    expect((await saved(parsed, peer)).equals(await saved(parsed, editor))).toBe(true)
    editEveryParagraph(editor)
    editEveryParagraph(peer)
    expect((await saved(parsed, peer)).equals(await saved(parsed, editor))).toBe(true)
  })

  it('refuses a document whose inline atoms carry formatting the save writes', () => {
    const paragraph = (breakMarks: PmNode['marks'], around: PmNode['marks']) =>
      editorWith({
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            content: [
              { type: 'text', text: 'Title', marks: around },
              { type: 'hardBreak', marks: breakMarks },
              { type: 'text', text: 'Subtitle', marks: around },
            ],
          },
        ],
      }).state.doc
    const bold = [{ type: 'bold' }]
    // a bold line break between plain text is a run of its own in the file
    expect(atomMarksLost(paragraph(bold, undefined))).toBe(true)
    // inside bold text it merges into the same run either way
    expect(atomMarksLost(paragraph(bold, bold))).toBe(false)
    expect(atomMarksLost(paragraph(undefined, undefined))).toBe(false)
  })
})
