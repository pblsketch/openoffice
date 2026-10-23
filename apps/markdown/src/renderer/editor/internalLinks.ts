import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { Suggestion } from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import {
  classifyHref,
  embedImageSize,
  findHeadingIndex,
  findWikiLinks,
  wikiLinkTarget,
} from '../../shared/internal-links'
import type { LinkTarget, NoteSuggestion, WikiLinkMatch } from '../../shared/internal-links'
import { collectOutline } from './outline'
import { resolveImageSrc } from './localImage'

/**
 * Internal links in the block editor.
 *
 * - Wiki links (`[[Note]]`, `![[picture.png]]`) stay plain text; this plugin
 *   only decorates them, so serialization and the block splice never see them.
 * - Ctrl+click (⌘+click) follows a wiki link or a link mark: a heading in this
 *   note scrolls here, anything else goes to the host (`open`). A plain click
 *   keeps editing the text.
 * - An embedded picture is shown after its `![[…]]` text once the host has
 *   resolved it inside the vault.
 * - Typing `[[` offers the vault's notes.
 */

/** the host side: following links, finding embedded pictures, completing `[[` */
export interface InternalLinksHost {
  /** follow a link that leaves this note's text (another file, a web page) */
  open(target: LinkTarget, editor: Editor): void
  /** the absolute path an embed shows, or null; resolved once per target until reset */
  resolveEmbed(target: string): Promise<string | null>
  /** tooltip on a wiki link */
  hint(): string
}

export interface NoteSuggestState {
  items: NoteSuggestion[]
  clientRect: DOMRect | null
  command: (item: NoteSuggestion) => void
}

/** App-side sink for the `[[` suggestion lifecycle; the React menu renders from it */
export interface NoteSuggestController {
  onOpen(state: NoteSuggestState): void
  onUpdate(state: NoteSuggestState): void
  onKeyDown(event: KeyboardEvent): boolean
  onClose(): void
}

export interface InternalLinksOptions {
  host: InternalLinksHost | null
  suggest: {
    controller: NoteSuggestController
    items: (query: string) => Promise<NoteSuggestion[]>
  } | null
}

interface WikiSpec {
  wiki: WikiLinkMatch
}

interface LinksMeta {
  /** rebuild every decoration (an embed resolved, the note moved) */
  refresh?: boolean
  /** forget resolved embeds first (the note's folder changed) */
  reset?: boolean
}

export const internalLinksKey = new PluginKey<DecorationSet>('internalLinks')
const noteSuggestKey = new PluginKey('noteSuggest')

/** stands in for code text so a wiki link cannot match across or inside it */
const BLOCKED = '\uFFFF'

/** text of one textblock with the document position of every character */
function textOf(block: PmNode, start: number): { text: string; positions: number[] } {
  let text = ''
  const positions: number[] = []
  block.forEach((child, offset) => {
    const pos = start + offset
    if (child.isText) {
      const isCode = child.marks.some((mark) => mark.type.name === 'code')
      const value = child.text ?? ''
      for (let i = 0; i < value.length; i++) positions.push(pos + i)
      text += isCode ? BLOCKED.repeat(value.length) : value
    } else {
      // an image, a hard break, a formula: a wiki link does not run across it
      positions.push(pos)
      text += '\n'
    }
  })
  return { text, positions }
}

type EmbedCache = Map<string, string | null | 'pending'>

function decorationsIn(
  doc: PmNode,
  from: number,
  to: number,
  embeds: EmbedCache,
  host: InternalLinksHost | null,
  request: (target: string) => void,
): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'codeBlock') return false
    if (!node.isTextblock) return true
    const start = pos + 1
    const { text, positions } = textOf(node, start)
    for (const link of findWikiLinks(text)) {
      const linkFrom = positions[link.start]!
      const linkTo = positions[link.end - 1]! + 1
      const spec: WikiSpec = { wiki: link }
      decorations.push(
        Decoration.inline(
          linkFrom,
          linkTo,
          {
            class: link.embed ? 'wiki-link wiki-embed' : 'wiki-link',
            ...(host ? { title: host.hint() } : {}),
          },
          spec,
        ),
      )
      if (!link.embed || !link.target) continue
      const picture = embeds.get(link.target)
      if (picture === undefined) request(link.target)
      if (!picture || picture === 'pending') continue
      const size = embedImageSize(link.alias)
      decorations.push(
        Decoration.widget(linkTo, () => embedWidget(picture, link.target, size), {
          side: 1,
          key: `embed:${picture}:${size.width ?? ''}x${size.height ?? ''}`,
          ignoreSelection: true,
        }),
      )
    }
    return false
  })
  return decorations
}

function embedWidget(path: string, alt: string, size: { width?: number; height?: number }) {
  const wrap = document.createElement('span')
  wrap.className = 'wiki-embed-image'
  wrap.contentEditable = 'false'
  const img = document.createElement('img')
  img.src = resolveImageSrc(path)
  img.alt = alt
  img.draggable = false
  if (size.width) img.width = size.width
  if (size.height) img.height = size.height
  wrap.appendChild(img)
  return wrap
}

/** ranges of the new document a transaction touched */
function changedRanges(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1)
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: rest.map(newStart, -1), to: rest.map(newEnd, 1) })
    })
  })
  return ranges
}

/** widen a range to the top-level blocks it touches */
function blockSpan(doc: PmNode, from: number, to: number): { from: number; to: number } {
  let start = 0
  let end = doc.content.size
  doc.forEach((node, offset) => {
    const nodeEnd = offset + node.nodeSize
    if (nodeEnd < from) start = nodeEnd
    if (offset > to && end === doc.content.size) end = offset
  })
  return { from: start, to: Math.max(start, end) }
}

/** the wiki link decoration covering `pos`, if any */
function wikiAt(state: EditorState, pos: number): WikiLinkMatch | null {
  const set = internalLinksKey.getState(state)
  if (!set) return null
  for (const decoration of set.find(pos, pos)) {
    const spec = decoration.spec as Partial<WikiSpec>
    if (spec.wiki && decoration.from <= pos && pos <= decoration.to) return spec.wiki
  }
  return null
}

/** the href of a link mark at `pos` (either side of the click position) */
function hrefAt(state: EditorState, pos: number): string | null {
  const $pos = state.doc.resolve(pos)
  const candidates = [$pos.nodeAfter, $pos.nodeBefore]
  for (const node of candidates) {
    const link = node?.marks.find((mark) => mark.type.name === 'link')
    if (link && typeof link.attrs.href === 'string') return link.attrs.href
  }
  return null
}

/** Move the caret into the heading a link fragment names; false when there is none. */
export function scrollToHeading(editor: Editor, fragment: string): boolean {
  const outline = collectOutline(editor)
  const index = findHeadingIndex(
    outline.map((item) => item.text),
    fragment,
  )
  if (index < 0) return false
  const { view, state } = editor
  const pos = outline[index]!.pos
  const selection = TextSelection.near(state.doc.resolve(pos + 1))
  view.dispatch(state.tr.setSelection(selection).scrollIntoView())
  view.focus()
  // ProseMirror stops once the caret is barely visible; bring the heading to the
  // top, again on the next frame in case layout was still settling (a new tab)
  const reveal = () => {
    const dom = view.isDestroyed ? null : view.nodeDOM(pos)
    if (dom instanceof HTMLElement) dom.scrollIntoView?.({ block: 'start' })
  }
  reveal()
  requestAnimationFrame(reveal)
  return true
}

/** Ctrl+click target at a document position: a wiki link first, then a link mark. */
export function linkTargetAt(state: EditorState, pos: number): LinkTarget | null {
  const wiki = wikiAt(state, pos)
  if (wiki) return wikiLinkTarget(wiki)
  const href = hrefAt(state, pos)
  return href ? classifyHref(href) : null
}

/** forget resolved embeds and redraw (the note was saved somewhere else) */
export function resetInternalLinks(editor: Editor): void {
  const meta: LinksMeta = { refresh: true, reset: true }
  editor.view.dispatch(
    editor.state.tr.setMeta(internalLinksKey, meta).setMeta('addToHistory', false),
  )
}

function inCode(state: EditorState, range: Range): boolean {
  const $from = state.doc.resolve(range.from)
  if ($from.parent.type.name === 'codeBlock') return true
  return $from.marks().some((mark) => mark.type.name === 'code')
}

/** the caret sits inside a wiki link that is already closed (`[[Ta|sks]]`): editing, not typing one */
function insideClosedLink(state: EditorState, range: Range): boolean {
  const $to = state.doc.resolve(range.to)
  const rest = $to.parent.textBetween($to.parentOffset, $to.parent.content.size, '\n', '\n')
  return /^[^[\]\n]*\]\]/.test(rest)
}

export const InternalLinks = Extension.create<InternalLinksOptions>({
  name: 'internalLinks',

  addOptions() {
    return { host: null, suggest: null }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const host = this.options.host
    const embeds: EmbedCache = new Map()
    let view: EditorView | null = null

    const request = (target: string) => {
      if (!host) return
      embeds.set(target, 'pending')
      void host
        .resolveEmbed(target)
        .catch(() => null)
        .then((picture) => {
          // a reset while this was in flight dropped the entry; leave it to the next request
          if (embeds.get(target) !== 'pending') return
          embeds.set(target, picture)
          if (picture && view && !view.isDestroyed) {
            const meta: LinksMeta = { refresh: true }
            view.dispatch(
              view.state.tr.setMeta(internalLinksKey, meta).setMeta('addToHistory', false),
            )
          }
        })
    }
    const build = (doc: PmNode) =>
      DecorationSet.create(doc, decorationsIn(doc, 0, doc.content.size, embeds, host, request))

    const plugins: Plugin[] = [
      new Plugin<DecorationSet>({
        key: internalLinksKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply(tr, old) {
            const meta = tr.getMeta(internalLinksKey) as LinksMeta | undefined
            if (meta?.reset) embeds.clear()
            if (meta?.refresh) return build(tr.doc)
            if (!tr.docChanged) return old
            let set = old.map(tr.mapping, tr.doc)
            for (const range of changedRanges(tr)) {
              const span = blockSpan(tr.doc, range.from, range.to)
              set = set.remove(set.find(span.from, span.to))
              set = set.add(
                tr.doc,
                decorationsIn(tr.doc, span.from, span.to, embeds, host, request),
              )
            }
            return set
          },
        },
        view(editorView) {
          view = editorView
          // Ctrl (⌘) held: links show the pointer, as they open on click. The
          // class sits on the root element — ProseMirror rewrites the editor's own
          const root = editorView.dom.ownerDocument.documentElement
          const arm = (event: KeyboardEvent | MouseEvent) =>
            root.classList.toggle('md-links-armed', event.ctrlKey || event.metaKey)
          const disarm = () => root.classList.remove('md-links-armed')
          window.addEventListener('keydown', arm, true)
          window.addEventListener('keyup', arm, true)
          window.addEventListener('mousemove', arm, true)
          window.addEventListener('blur', disarm)
          return {
            destroy() {
              view = null
              disarm()
              window.removeEventListener('keydown', arm, true)
              window.removeEventListener('keyup', arm, true)
              window.removeEventListener('mousemove', arm, true)
              window.removeEventListener('blur', disarm)
            },
          }
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          handleClick(clickView, pos, event) {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.button !== 0) {
              return false
            }
            const target = linkTargetAt(clickView.state, pos)
            if (!target) return false
            event.preventDefault()
            if (!host) return true
            host.open(target, editor)
            return true
          },
        },
      }),
    ]

    const suggest = this.options.suggest
    if (suggest) {
      const rectOf = (props: SuggestionProps<NoteSuggestion>): DOMRect | null => {
        try {
          return props.clientRect?.() ?? null
        } catch {
          // no layout to measure (a detached or hidden view): the menu stays closed
          return null
        }
      }
      const toState = (props: SuggestionProps<NoteSuggestion>): NoteSuggestState => ({
        items: props.items,
        clientRect: rectOf(props),
        command: (item) => props.command(item),
      })
      plugins.push(
        Suggestion<NoteSuggestion>({
          editor,
          char: '[[',
          pluginKey: noteSuggestKey,
          allowSpaces: true,
          allowedPrefixes: null,
          allow: ({ state, range }) =>
            !inCode(state, range) &&
            !state.doc.textBetween(range.from, range.to).includes(']') &&
            !insideClosedLink(state, range),
          command: ({ editor: current, range, props }) => {
            // swallow a closing `]]` already typed after the caret
            const after = current.state.doc.textBetween(
              range.to,
              Math.min(range.to + 2, current.state.doc.content.size),
            )
            const to = after === ']]' ? range.to + 2 : range.to
            current
              .chain()
              .focus()
              .insertContentAt(
                { from: range.from, to },
                { type: 'text', text: `[[${props.insert}]]` },
              )
              .run()
          },
          items: ({ query }) => suggest.items(query),
          render: () => ({
            onStart: (props) => suggest.controller.onOpen(toState(props)),
            onUpdate: (props) => suggest.controller.onUpdate(toState(props)),
            onKeyDown: (props) => suggest.controller.onKeyDown(props.event),
            onExit: () => suggest.controller.onClose(),
          }),
        }),
      )
    }
    return plugins
  },
})
