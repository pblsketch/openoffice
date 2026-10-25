import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** what this editor's main-process window-open guard hands to the OS */
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * The address a click on a link should hand to the browser, or null when it
 * does not leave the document. A relative path names no page the OS could
 * open, and `file:`/`javascript:` must never reach the handler — the main
 * process rejects them too, but nothing here should rely on that.
 */
export function externalLinkTarget(href: string | null | undefined): string | null {
  const text = (href ?? '').trim()
  if (!text) return null
  try {
    return OPENABLE_PROTOCOLS.has(new URL(text).protocol) ? text : null
  } catch {
    return null
  }
}

/**
 * Links open through `window.open`, which the main process turns into
 * `shell.openExternal`. While the document is editable a plain click has to
 * place the caret — that is how link text stays editable, and it is the rule
 * the wiki links and the Word editor already follow — so only Cmd/Ctrl+click
 * opens. A presentation (F5) is read-only, and there a plain click opens.
 */
export const MarkdownLinkOpen = Extension.create({
  name: 'markdownLinkOpen',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => openLinkOnClick(view, event as MouseEvent),
          },
        },
      }),
    ]
  },
})

function openLinkOnClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0) return false
  const anchor = (event.target as Element | null)?.closest?.('a[href]')
  if (!anchor || !view.dom.contains(anchor)) return false
  // the anchor must never navigate the renderer itself: a page outside the
  // document belongs in the browser, and an edit-time click belongs to the caret
  event.preventDefault()
  if (view.editable && !event.metaKey && !event.ctrlKey) return false
  const target = externalLinkTarget(anchor.getAttribute('href'))
  if (!target) return false
  window.open(target, '_blank')
  return true
}
