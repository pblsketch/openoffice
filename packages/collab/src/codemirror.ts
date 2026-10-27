/**
 * Co-editing for the CodeMirror editors (HTML source, plain text and JSON).
 * The editor keeps an empty compartment from creation; `bindCodeMirror`
 * fills it with the Yjs binding for the length of a session.
 *
 * Remote changes are kept out of CodeMirror's own history, so the editor's
 * usual undo keeps undoing only this person's edits, mapped over everyone
 * else's; no second undo stack is needed.
 */
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { yCollab, ySyncAnnotation } from 'y-codemirror.next'
import type { CollabSession } from './session'

const TEXT = 'text'

const remoteOutOfHistory = EditorState.transactionExtender.of((tr) =>
  tr.annotation(ySyncAnnotation) === undefined
    ? null
    : { annotations: Transaction.addToHistory.of(false) },
)

/** a change that arrived from another peer */
export function isRemoteCodeMirrorTransaction(tr: Transaction): boolean {
  return tr.annotation(ySyncAnnotation) !== undefined
}

/** the slot an editor reserves among its extensions */
export function collabCompartment(): { compartment: Compartment; extension: Extension } {
  const compartment = new Compartment()
  return { compartment, extension: compartment.of([]) }
}

/**
 * Attach the view to the session. The host's text becomes the shared text;
 * a guest's view (bound after the first sync) takes the host's text without
 * adding an undo step. The returned function detaches it.
 */
export function bindCodeMirror(
  view: EditorView,
  compartment: Compartment,
  session: CollabSession,
): () => void {
  const ytext = session.doc.getText(TEXT)
  const current = view.state.doc.toString()
  if (session.role === 'host') {
    if (ytext.length === 0 && current) ytext.insert(0, current)
  } else if (ytext.toString() !== current) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: ytext.toString() },
      annotations: Transaction.addToHistory.of(false),
    })
  }
  view.dispatch({
    effects: compartment.reconfigure([
      yCollab(ytext, session.awareness, { undoManager: false }),
      remoteOutOfHistory,
    ]),
  })
  return () => {
    try {
      view.dispatch({ effects: compartment.reconfigure([]) })
    } catch {
      // the view was destroyed first: nothing left to detach
    }
  }
}
