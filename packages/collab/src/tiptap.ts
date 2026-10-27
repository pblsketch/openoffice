/**
 * Co-editing for the TipTap editors (Word, Markdown). The editor is created
 * as usual with `CollabHistory` among its extensions; `bindTiptap` then
 * attaches it to a session after the fact, so sharing never rebuilds the
 * editor or reloads the document.
 *
 * The shared state is one Y.XmlFragment. y-tiptap replaces only the
 * top-level blocks a remote change touched and keeps those transactions out
 * of the local history, so decorations, node views and the editors' own
 * plugins see small, ordinary edits.
 */
import { Extension, type CommandProps, type Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { history, redo as historyRedo, undo as historyUndo } from '@tiptap/pm/history'
import {
  defaultProtectedNodes,
  prosemirrorToYXmlFragment,
  redo as yRedo,
  undo as yUndo,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from '@tiptap/y-tiptap'
import type { EditorState } from '@tiptap/pm/state'
import type { CollabSession, CollabUser } from './session'

const FRAGMENT = 'prosemirror'
const WORD_JOINER = String.fromCharCode(0x2060)
/** TipTap's UndoRedo defaults, for the history put back after a session */
const HISTORY_OPTIONS = { depth: 100, newGroupDelay: 500 }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    // the same commands UndoRedo declares; this extension takes them over
    collabHistory: {
      undo: () => ReturnType
      redo: () => ReturnType
    }
  }
}

function isBound(state: EditorState): boolean {
  return ySyncPluginKey.getState(state) !== undefined
}

/** a change that arrived from another peer (or the first render of the shared state) */
export function isRemoteTransaction(tr: Transaction): boolean {
  const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined
  return meta?.isChangeOrigin === true
}

/**
 * Undo and redo that follow the session: inside one they undo only this
 * person's edits, outside it they are the editor's usual history. Lower
 * priority than UndoRedo, so these commands replace its own and every
 * button, menu item and shortcut that calls `undo`/`redo` follows along.
 */
export const CollabHistory = Extension.create({
  name: 'collabHistory',
  priority: 50,
  addCommands() {
    const route =
      (direction: 'undo' | 'redo') =>
      () =>
      ({ state, tr, dispatch }: CommandProps) => {
        if (!isBound(state)) {
          return direction === 'undo' ? historyUndo(state, dispatch) : historyRedo(state, dispatch)
        }
        // the plugin's hasUndoOps lags one transaction behind; the stacks do not
        const manager = yUndoPluginKey.getState(state)?.undoManager
        const stack = direction === 'undo' ? manager?.undoStack : manager?.redoStack
        const possible = (stack?.length ?? 0) > 0
        if (!dispatch) return possible
        if (!possible) return false
        // the shared history dispatches its own transaction; the command's must not follow it
        tr.setMeta('preventDispatch', true)
        return (direction === 'undo' ? yUndo(state) : yRedo(state)) === true
      }
    return { undo: route('undo'), redo: route('redo') }
  },
})

/**
 * Forget this person's shared undo steps, e.g. after the document was
 * re-based under them. Re-adding the editor's own history plugin instead
 * would restart every plugin view, the binding's included, and leave the
 * session's undo detached. False when the editor is not shared.
 */
export function clearCollabHistory(editor: Editor): boolean {
  const manager = yUndoPluginKey.getState(editor.state)?.undoManager
  if (!manager) return false
  manager.clear()
  return true
}

function caretOf(user: Partial<CollabUser>): HTMLElement {
  const caret = document.createElement('span')
  caret.className = 'collab-caret'
  caret.style.setProperty('--collab-c', String(user.color ?? 'var(--collab-0)'))
  const label = document.createElement('span')
  label.className = 'collab-caret-label'
  label.textContent = String(user.name ?? '')
  // word joiners keep the line from breaking around the label, as y-prosemirror's own caret does
  caret.append(WORD_JOINER, label, WORD_JOINER)
  return caret
}

function hasHistory(editor: Editor): boolean {
  return editor.state.plugins.some((plugin) =>
    (plugin as unknown as { key: string }).key.startsWith('history$'),
  )
}

function resetHistory(editor: Editor): void {
  editor.unregisterPlugin('history')
  editor.registerPlugin(history(HISTORY_OPTIONS))
}

export interface BindTiptapOptions {
  /**
   * Block types an undo must never delete, because another person may have
   * typed into them since. `paragraph` is always included.
   */
  protectedNodes?: readonly string[]
}

/**
 * Attach the editor to the session. The host puts its current document into
 * the shared state first; a guest's editor (bound after the first sync) takes
 * the host's content. The returned function detaches it again; the content
 * stays as it is.
 */
export function bindTiptap(
  editor: Editor,
  session: CollabSession,
  options: BindTiptapOptions = {},
): () => void {
  const fragment = session.doc.getXmlFragment(FRAGMENT)
  const hadHistory = hasHistory(editor)
  if (session.role === 'host' && fragment.length === 0) {
    prosemirrorToYXmlFragment(editor.state.doc, fragment)
  }
  editor.registerPlugin(ySyncPlugin(fragment))
  editor.registerPlugin(
    yCursorPlugin(session.awareness, {
      cursorBuilder: (user) => caretOf(user as Partial<CollabUser>),
      selectionBuilder: (user) => ({
        class: 'collab-selection',
        style: `--collab-c: ${String((user as Partial<CollabUser>).color ?? 'var(--collab-0)')}`,
      }),
    }),
  )
  const protectedNodes = new Set([...defaultProtectedNodes, ...(options.protectedNodes ?? [])])
  editor.registerPlugin(yUndoPlugin({ protectedNodes }))
  return () => {
    if (editor.isDestroyed) return
    editor.unregisterPlugin([ySyncPluginKey, yCursorPluginKey, yUndoPluginKey])
    // local steps recorded while shared were mapped over others' edits: start clean
    if (hadHistory) resetHistory(editor)
  }
}
