import type { Editor } from '@tiptap/core'
import type { LinkTarget } from '../shared/internal-links'
import type { MarkdownApi } from '../shared/ipc'
import { scrollToHeading } from './editor/internalLinks'
import type { InternalLinksHost } from './editor/internalLinks'
import { showToast } from './components/toast-bus'
import { t } from './i18n/locale'

type LinkApi = Pick<MarkdownApi, 'openLink' | 'resolveEmbed'>

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/** the label a link names in a "not found" notice */
function targetLabel(target: Extract<LinkTarget, { kind: 'path' | 'wiki' }>): string {
  const name = target.kind === 'path' ? target.path : target.target
  return target.heading ? `${name}#${target.heading}` : name
}

/**
 * What the editor's internal links do in this window: a heading of this note
 * scrolls here, a web or mail link opens in the browser (the main process
 * vets it), and a file is resolved and opened in its tab by the main process.
 */
export function createInternalLinksHost(api: LinkApi): InternalLinksHost {
  return {
    hint: () => t('linkOpenHint', { key: isMac ? '⌘' : 'Ctrl' }),
    resolveEmbed: (target) => api.resolveEmbed?.(target) ?? Promise.resolve(null),
    open(target: LinkTarget, editor: Editor): void {
      if (target.kind === 'external') {
        // the window-open handler hands web and mail links to the browser and refuses the rest
        window.open(target.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (target.kind === 'heading') {
        if (!scrollToHeading(editor, target.heading)) {
          showToast(t('linkHeadingNotFound', { heading: target.heading }), 'error')
        }
        return
      }
      if (!api.openLink) return
      void api
        .openLink(target)
        .catch(() => ({ ok: false as const, reason: 'blocked' as const }))
        .then((result) => {
          if (result.ok) return
          if (result.reason === 'untitled') showToast(t('linkNeedsSavedDocument'), 'error')
          else if (result.reason === 'blocked') showToast(t('linkBlocked'), 'error')
          else showToast(t('linkNotFound', { target: targetLabel(target) }), 'error')
        })
    },
  }
}
