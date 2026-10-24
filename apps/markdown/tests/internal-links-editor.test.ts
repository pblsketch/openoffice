/**
 * Internal links in the block editor: wiki links are decorations over plain
 * text (the saved bytes never change because of them), Ctrl+click finds the
 * right target, a heading link scrolls here, embedded pictures appear once
 * resolved, and `[[` completes note names.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/renderer/editor/extensions'
import {
  internalLinksKey,
  linkTargetAt,
  scrollToHeading,
} from '../src/renderer/editor/internalLinks'
import type { InternalLinksHost, NoteSuggestState } from '../src/renderer/editor/internalLinks'
import { buildSourceMap, spliceMarkdown } from '../src/renderer/markdown/sourceSplice'
import type { NoteSuggestion } from '../src/shared/internal-links'

const editors: Editor[] = []
afterAll(() => {
  for (const e of editors) e.destroy()
})

const noSlash = {
  slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
  slashItems: () => [],
}

function stubHost(overrides: Partial<InternalLinksHost> = {}): InternalLinksHost {
  return {
    open: vi.fn(),
    resolveEmbed: vi.fn(async () => null),
    hint: () => 'Ctrl+click to open',
    ...overrides,
  }
}

function createEditor(
  host: InternalLinksHost | null,
  suggest?: {
    states: (NoteSuggestState | null)[]
    items: (query: string) => Promise<NoteSuggestion[]>
  },
): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions({
      ...noSlash,
      internalLinks: {
        host,
        suggest: suggest
          ? {
              controller: {
                onOpen: (state) => suggest.states.push(state),
                onUpdate: (state) => suggest.states.push(state),
                onKeyDown: () => false,
                onClose: () => suggest.states.push(null),
              },
              items: suggest.items,
            }
          : null,
      },
    }),
    content: '',
  })
  editors.push(editor)
  return editor
}

function wikiDecorations(editor: Editor): string[] {
  const set = internalLinksKey.getState(editor.state)
  return (set?.find() ?? [])
    .filter((d) => (d.spec as { wiki?: unknown }).wiki)
    .map((d) => editor.state.doc.textBetween(d.from, d.to))
}

/** position of the first occurrence of `text` in the document, plus `offset` */
function posOf(editor: Editor, text: string, offset = 1): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return
    const i = node.text!.indexOf(text)
    if (i >= 0) found = pos + i + offset
  })
  if (found < 0) throw new Error(`no "${text}" in the document`)
  return found
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('wiki link decorations', () => {
  it('decorates links in text but not in code', () => {
    const editor = createEditor(stubHost())
    editor.commands.setContent(
      'See [[Plan]] and ![[a.png]] and `[[Not]]`\n\n```\n[[Neither]]\n```\n\n- item [[Tasks#Due|due]]\n',
      { contentType: 'markdown' },
    )
    expect(wikiDecorations(editor)).toEqual(['[[Plan]]', '![[a.png]]', '[[Tasks#Due|due]]'])
  })

  it('follows typing: a new link is decorated, a broken one is not', () => {
    const editor = createEditor(stubHost())
    editor.commands.setContent('First paragraph\n\nSecond [[Old]]\n', { contentType: 'markdown' })
    expect(wikiDecorations(editor)).toEqual(['[[Old]]'])
    editor.commands.setTextSelection(posOf(editor, 'paragraph', 'paragraph'.length))
    editor.commands.insertContent(' [[New]]')
    expect(wikiDecorations(editor)).toEqual(['[[New]]', '[[Old]]'])
    // break `[[Old]]` by deleting one closing bracket
    const close = posOf(editor, 'Old]]', 'Old]'.length)
    editor.commands.deleteRange({ from: close, to: close + 1 })
    expect(wikiDecorations(editor)).toEqual(['[[New]]'])
  })
})

describe('saving with wiki links', () => {
  it('keeps every byte of untouched blocks and the links themselves', () => {
    const editor = createEditor(stubHost())
    const source =
      '# Plan\n\nLinks: [[Tasks]], [[Kim Min|Kim]], ![[diagram.png|300]] and [x](Other%20Note.md#part).\n\n| a | b |\n| - | - |\n| [[One\\|1]] | two |\n\nEdit me\n'
    editor.commands.setContent(source, { contentType: 'markdown' })
    const map = buildSourceMap(editor, editor.state.doc, source)
    expect(map).not.toBeNull()
    expect(spliceMarkdown(editor, editor.state.doc, map!)).toBe(source)
    editor.commands.setTextSelection(posOf(editor, 'Edit me', 'Edit me'.length))
    editor.commands.insertContent(' now [[Added]]')
    const saved = spliceMarkdown(editor, editor.state.doc, map!)
    expect(saved).toBe(source.replace('Edit me\n', 'Edit me now [[Added]]\n'))
  })

  it('serializes a whole document without escaping the brackets', () => {
    const editor = createEditor(stubHost())
    editor.commands.setContent('A [[Note#Part|alias]] and ![[pic.png]]\n', {
      contentType: 'markdown',
    })
    expect(editor.getMarkdown().trim()).toBe('A [[Note#Part|alias]] and ![[pic.png]]')
  })
})

describe('link targets under the pointer', () => {
  it('finds wiki links, same-note headings and link marks', () => {
    const editor = createEditor(stubHost())
    editor.commands.setContent(
      'Go [[Plan#Due|soon]], [[#Intro]], [web](https://example.com), [rel](sub/a.md#x), [bad](file:///c:/x)\n',
      { contentType: 'markdown' },
    )
    const { state } = editor
    expect(linkTargetAt(state, posOf(editor, 'Plan'))).toEqual({
      kind: 'wiki',
      target: 'Plan',
      heading: 'Due',
    })
    expect(linkTargetAt(state, posOf(editor, '#Intro'))).toEqual({
      kind: 'heading',
      heading: 'Intro',
    })
    expect(linkTargetAt(state, posOf(editor, 'web'))).toEqual({
      kind: 'external',
      url: 'https://example.com',
    })
    expect(linkTargetAt(state, posOf(editor, 'rel'))).toEqual({
      kind: 'path',
      path: 'sub/a.md',
      heading: 'x',
    })
    expect(linkTargetAt(state, posOf(editor, 'bad'))).toBeNull()
    expect(linkTargetAt(state, posOf(editor, 'Go', 0))).toBeNull()
  })
})

describe('Ctrl+click', () => {
  function click(editor: Editor, pos: number, init: MouseEventInit): boolean {
    const event = new MouseEvent('click', { button: 0, ...init })
    let handled = false
    editor.view.someProp('handleClick', (f) => {
      if (f(editor.view, pos, event)) handled = true
      return handled
    })
    return handled
  }

  it('hands the link to the host only with Ctrl or ⌘ held', () => {
    const host = stubHost()
    const editor = createEditor(host)
    editor.commands.setContent('See [[Plan]]\n', { contentType: 'markdown' })
    const pos = posOf(editor, 'Plan')
    expect(click(editor, pos, {})).toBe(false)
    expect(host.open).not.toHaveBeenCalled()
    expect(click(editor, pos, { ctrlKey: true })).toBe(true)
    expect(click(editor, pos, { metaKey: true })).toBe(true)
    expect(host.open).toHaveBeenCalledTimes(2)
    expect(vi.mocked(host.open).mock.calls[0]![0]).toEqual({ kind: 'wiki', target: 'Plan' })
  })

  it('leaves plain text alone', () => {
    const host = stubHost()
    const editor = createEditor(host)
    editor.commands.setContent('Plain words\n', { contentType: 'markdown' })
    expect(click(editor, 3, { ctrlKey: true })).toBe(false)
    expect(host.open).not.toHaveBeenCalled()
  })
})

describe('scrollToHeading', () => {
  it('moves the caret into the named heading', () => {
    const editor = createEditor(stubHost())
    editor.commands.setContent('# Intro\n\ntext\n\n## Two Words\n\nmore\n', {
      contentType: 'markdown',
    })
    expect(scrollToHeading(editor, 'two-words')).toBe(true)
    expect(editor.state.selection.$from.parent.textContent).toBe('Two Words')
    expect(scrollToHeading(editor, 'Missing')).toBe(false)
  })
})

describe('embedded pictures', () => {
  it('shows the resolved picture after its text and asks once per target', async () => {
    const resolveEmbed = vi.fn(async (target: string) =>
      target === 'diagram.png' ? 'C:/vault/attachments/diagram.png' : null,
    )
    const editor = createEditor(stubHost({ resolveEmbed }))
    editor.commands.setContent('![[diagram.png|300]] and ![[missing.png]] and ![[diagram.png]]\n', {
      contentType: 'markdown',
    })
    await flush()
    await flush()
    const images = editor.view.dom.querySelectorAll('.wiki-embed-image img')
    expect(images).toHaveLength(2)
    const first = images[0] as HTMLImageElement
    expect(first.getAttribute('src')).toBe('md-asset:///C:/vault/attachments/diagram.png')
    expect(first.width).toBe(300)
    expect(resolveEmbed).toHaveBeenCalledTimes(2)
    // the document itself is untouched
    expect(editor.getMarkdown().trim()).toBe(
      '![[diagram.png|300]] and ![[missing.png]] and ![[diagram.png]]',
    )
  })
})

describe('[[ completion', () => {
  it('offers notes and writes the chosen one as a wiki link', async () => {
    const states: (NoteSuggestState | null)[] = []
    const items = vi.fn(async (query: string) =>
      [
        { name: 'Alpha Plan', folder: 'projects', insert: 'Alpha Plan' },
        { name: 'Beta', folder: '', insert: 'Beta' },
      ].filter((n) => n.name.toLowerCase().includes(query.toLowerCase())),
    )
    const editor = createEditor(stubHost(), { states, items })
    editor.commands.setContent('Start\n', { contentType: 'markdown' })
    editor.commands.setTextSelection(posOf(editor, 'Start', 'Start'.length))
    editor.commands.insertContent(' [[alp')
    await flush()
    await flush()
    const open = states.filter(Boolean).pop()
    expect(items).toHaveBeenLastCalledWith('alp')
    expect(open?.items.map((i) => i.name)).toEqual(['Alpha Plan'])
    open!.command(open!.items[0]!)
    expect(editor.getMarkdown().trim()).toBe('Start [[Alpha Plan]]')
  })

  it('does not open inside inline code', async () => {
    const states: (NoteSuggestState | null)[] = []
    const items = vi.fn(async () => [])
    const editor = createEditor(stubHost(), { states, items })
    editor.commands.setContent('`code`\n', { contentType: 'markdown' })
    editor.commands.setTextSelection(posOf(editor, 'code', 2))
    editor.commands.insertContent('[[x')
    await flush()
    expect(items).not.toHaveBeenCalled()
  })

  it('does not open when the caret lands inside a link that is already closed', async () => {
    const states: (NoteSuggestState | null)[] = []
    const items = vi.fn(async () => [])
    const editor = createEditor(stubHost(), { states, items })
    editor.commands.setContent('Next: [[Tasks#Due]] and more\n', { contentType: 'markdown' })
    editor.commands.setTextSelection(posOf(editor, 'Tasks', 3))
    await flush()
    expect(items).not.toHaveBeenCalled()
    expect(states.filter(Boolean)).toEqual([])
    expect(wikiDecorations(editor)).toEqual(['[[Tasks#Due]]'])
  })
})
