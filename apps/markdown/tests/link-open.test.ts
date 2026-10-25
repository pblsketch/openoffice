/**
 * What a click on a link does. `linkOpen.ts` is the whole story: the editor is
 * always editable, so a plain click must keep placing the caret (that is how
 * link text stays editable) and Cmd/Ctrl+click leaves the document. The show
 * (F5) is read-only, and there a plain click opens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { showToast } from '../src/renderer/components/toast-bus'
import { buildExtensions } from '../src/renderer/editor/extensions'
import { externalLinkTarget } from '../src/renderer/editor/linkOpen'
import { parseDocText } from '../src/renderer/markdown/docText'

vi.mock('../src/renderer/components/toast-bus', () => ({ showToast: vi.fn() }))

const editors: Editor[] = []
const openBrowser = vi.fn<(url?: string | URL, target?: string) => Window | null>(() => null)

afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy())
  vi.restoreAllMocks()
  openBrowser.mockClear()
  vi.mocked(showToast).mockClear()
})

function open(markdown: string): Editor {
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
      slashItems: () => [],
    }),
    content: '',
  })
  editors.push(editor)
  const envelope = parseDocText(markdown)
  editor
    .chain()
    .setMeta('addToHistory', false)
    .setContent(envelope.body, { contentType: 'markdown' })
    .run()
  vi.spyOn(window, 'open').mockImplementation(openBrowser)
  return editor
}

/** the browser the main process would have opened for this click */
function clickLink(editor: Editor, init: MouseEventInit = {}, selector = 'a[href]'): MouseEvent {
  const el = editor.view.dom.querySelector(selector)
  if (!el) throw new Error(`no element matches ${selector}`)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  el.dispatchEvent(event)
  return event
}

describe('externalLinkTarget', () => {
  it.each([
    ['a web page', 'https://example.com/page', 'https://example.com/page'],
    ['a plain http page', 'http://example.com', 'http://example.com'],
    ['an email address', 'mailto:someone@example.com', 'mailto:someone@example.com'],
    ['a scheme in capitals', 'HTTPS://EXAMPLE.COM/x', 'HTTPS://EXAMPLE.COM/x'],
    ['padded input', '  https://example.com/pad  ', 'https://example.com/pad'],
  ])('walks %s out of the document', (_label, href, expected) => {
    expect(externalLinkTarget(href)).toBe(expected)
  })

  it.each([
    ['nothing', null],
    ['an empty value', ''],
    ['a relative note', 'notes/other.md'],
    ['an in-page anchor', '#section'],
    ['a local file', 'file:///C:/notes/secret.txt'],
    ['script', 'javascript:alert(1)'],
  ])('leaves %s in the document', (_label, href) => {
    expect(externalLinkTarget(href)).toBeNull()
  })
})

describe('clicking a link', () => {
  it('opens the page on Cmd/Ctrl+click while editing', () => {
    const editor = open('See [the page](https://example.com/page) for details.')
    const event = clickLink(editor, { ctrlKey: true })
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith('https://example.com/page', '_blank')
    expect(event.defaultPrevented).toBe(true)
  })

  it('takes Meta as the modifier too', () => {
    const editor = open('[the page](https://example.com/page)')
    clickLink(editor, { metaKey: true })
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith('https://example.com/page', '_blank')
  })

  it('a plain click while editing keeps the caret and opens nothing', () => {
    const editor = open('See [the page](https://example.com/page) here.')
    const event = clickLink(editor)
    expect(openBrowser).not.toHaveBeenCalled()
    // never let the anchor navigate the whole editor window
    expect(event.defaultPrevented).toBe(true)
  })

  it('teaches the modifier once when a plain click falls into a link', () => {
    const editor = open('See [the page](https://example.com/page) here.')
    clickLink(editor)
    clickLink(editor)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('does not teach the modifier when the link actually opens', () => {
    const editor = open('See [the page](https://example.com/page) here.')
    clickLink(editor, { ctrlKey: true })
    expect(showToast).not.toHaveBeenCalled()
  })

  it('does not teach the modifier for a relative note link', () => {
    const editor = open('See [the other note](notes/other.md).')
    clickLink(editor)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('a plain click opens while the show is running (read-only)', () => {
    const editor = open('[the page](https://example.com/page)')
    editor.setEditable(false)
    clickLink(editor)
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith('https://example.com/page', '_blank')
  })

  it('opens an image badge through the link that wraps it', () => {
    const editor = open('[![badge](assets/badge.png)](https://example.com/page)')
    const img = editor.view.dom.querySelector('a[href] img')
    if (!img) throw new Error('no linked image rendered')
    img.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
    )
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith('https://example.com/page', '_blank')
  })

  it('a relative note stays in the document even with the modifier', () => {
    const editor = open('See [the other note](notes/other.md).')
    clickLink(editor, { ctrlKey: true })
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it('script and local-file addresses are refused', () => {
    const editor = open('')
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'not a page',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
            {
              type: 'text',
              text: 'nor this',
              marks: [{ type: 'link', attrs: { href: 'file:///C:/notes/secret.txt' } }],
            },
          ],
        },
      ],
    })
    const anchors = editor.view.dom.querySelectorAll('a[href]')
    expect(anchors).toHaveLength(2)
    anchors.forEach((anchor) =>
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
      ),
    )
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it('leaves a wiki link to the wiki handler (it has no href of its own)', () => {
    const editor = open('See [[Alpha]] here.')
    expect(editor.view.dom.querySelector('a[href]')).toBeNull()
    clickLink(editor, { ctrlKey: true }, 'a.wiki-link')
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it('ignores clicks outside the editor body', () => {
    const editor = open('[the page](https://example.com/page)')
    const outside = document.createElement('a')
    outside.href = 'https://example.com/outside'
    outside.addEventListener('click', (e) => e.preventDefault())
    document.body.append(outside)
    outside.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
    )
    expect(openBrowser).not.toHaveBeenCalled()
    outside.remove()
    expect(editor.view.dom.querySelector('a[href]')).not.toBeNull()
  })
})
