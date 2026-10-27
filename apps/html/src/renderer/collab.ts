/**
 * Co-editing in the HTML editor (decision 0073). Every edit here, typed, from
 * the inspector or from the AI, is a patch to the CodeMirror source, so
 * sharing the source text shares the page; the preview follows as usual.
 */
import { useRef, type MutableRefObject } from 'react'
import { useCollab, type CollabController } from '@genoffice/collab'
import type { SourceEditorHandle } from './source/SourceEditor'

export interface HtmlCollabOptions {
  ready: boolean
  editor: () => SourceEditorHandle | null
  /** the name guests see and their copy is written under */
  fileName: () => string
  /** what a save would write now; null before the page is ready */
  fileText: () => string | null
  /** true while this tab is a guest in a live session */
  guestRef: MutableRefObject<boolean>
}

export function useHtmlCollab(options: HtmlCollabOptions): CollabController {
  const optionsRef = useRef(options)
  optionsRef.current = options
  return useCollab({
    kind: 'html',
    ready: options.ready,
    describe: async () => {
      const text = optionsRef.current.fileText()
      if (text === null) return null
      const fileName = optionsRef.current.fileName()
      return { title: fileName, fileName, base: new TextEncoder().encode(text) }
    },
    bind: (session) => {
      const editor = optionsRef.current.editor()
      if (!editor) throw new Error('no source editor to share')
      if (session.role === 'guest') optionsRef.current.guestRef.current = true
      return editor.bindCollab(session)
    },
    // a guest's copy opened as a new page: once the session is over it is simply unsaved
    onEnded: (role) => {
      if (role === 'guest') optionsRef.current.guestRef.current = false
    },
  })
}
