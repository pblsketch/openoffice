/**
 * Co-editing in the Markdown editor (decision 0073). The block editor's
 * content is shared through the TipTap binding; the frontmatter block, which
 * lives beside the editor, is one shared value (last writer wins).
 *
 * Plain text and JSON files open in the source editor and are not shared here.
 */
import { useRef, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import {
  useCollab,
  type CollabController,
  type CollabSession,
  type CollabShareBlock,
} from '@genoffice/collab'
import { bindTiptap, isRemoteTransaction } from '@genoffice/collab/tiptap'

const META = 'markdown'
const FRONTMATTER = 'frontmatter'
/** blocks someone else may have typed into, which an undo of mine must keep */
const PROTECTED_BLOCKS = [
  'heading',
  'codeBlock',
  'blockquote',
  'listItem',
  'taskItem',
  'tableCell',
  'tableHeader',
]

export interface MarkdownCollabOptions {
  editor: Editor | null
  /** a block-editor document is on screen */
  ready: boolean
  /** the name guests see and their copy is written under */
  fileName: () => string
  /** what a save would write now; null before the document is ready */
  fileText: () => string | null
  shareBlock: () => CollabShareBlock | null
  /** the raw frontmatter block (with its fences), as the envelope holds it */
  getFrontmatter: () => string
  /** another person changed the frontmatter */
  setFrontmatter: (raw: string) => void
  /** close what cannot stay open while shared (the source pane) */
  beforeBind: () => void
  markDirty: () => void
  /** true while this tab is a guest in a live session */
  guestRef: MutableRefObject<boolean>
}

export interface MarkdownCollab {
  collab: CollabController
  /** whether an editor change should mark the document changed */
  dirtiesDocument: (tr: Transaction) => boolean
  /** this person edited the frontmatter */
  frontmatterChanged: (raw: string) => void
}

export function useMarkdownCollab(options: MarkdownCollabOptions): MarkdownCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const sessionRef = useRef<CollabSession | null>(null)

  const collab = useCollab({
    kind: 'markdown',
    ready: options.ready,
    shareBlock: () => optionsRef.current.shareBlock(),
    describe: async () => {
      const text = optionsRef.current.fileText()
      if (text === null) return null
      const fileName = optionsRef.current.fileName()
      return {
        title: fileName,
        fileName,
        base: new TextEncoder().encode(text),
      }
    },
    bind: (session) => {
      const o = optionsRef.current
      const editor = o.editor
      if (!editor) throw new Error('no editor to share')
      o.beforeBind()
      const meta = session.doc.getMap<string>(META)
      if (session.role === 'host') meta.set(FRONTMATTER, o.getFrontmatter())
      else {
        o.guestRef.current = true
        const raw = meta.get(FRONTMATTER)
        if (typeof raw === 'string') o.setFrontmatter(raw)
      }
      const onMeta = (_event: unknown, tr: { local: boolean }) => {
        const raw = meta.get(FRONTMATTER)
        if (!tr.local && typeof raw === 'string') {
          optionsRef.current.setFrontmatter(raw)
          if (session.role === 'host') optionsRef.current.markDirty()
        }
      }
      meta.observe(onMeta)
      const unbind = bindTiptap(editor, session, { protectedNodes: PROTECTED_BLOCKS })
      sessionRef.current = session
      return () => {
        meta.unobserve(onMeta)
        unbind()
        sessionRef.current = null
      }
    },
    onEnded: (role) => {
      if (role !== 'guest') return
      // the copy is now this person's own unsaved document
      optionsRef.current.guestRef.current = false
      optionsRef.current.markDirty()
    },
  })

  return {
    collab,
    dirtiesDocument: (tr) => {
      if (optionsRef.current.guestRef.current) return false
      // the first render of the shared state puts back the same content
      return !(isRemoteTransaction(tr) && tr.before.eq(tr.doc))
    },
    frontmatterChanged: (raw) => {
      sessionRef.current?.doc.getMap<string>(META).set(FRONTMATTER, raw)
    },
  }
}
