import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/core'

// Undestroyed views leave DOMObserver flush timers that fire after jsdom teardown
// ("document is not defined" unhandled error) — destroy every editor we create.
const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

describe('block gutter placement', () => {
  it("measures against the element it ends up in, not the view's first parent", async () => {
    const { Editor } = await import('@tiptap/core')
    const { buildExtensions } = await import('../src/renderer/editor/extensions')

    const wrapper = document.createElement('div')
    const element = document.createElement('div')
    wrapper.appendChild(element)
    document.body.appendChild(wrapper)

    const editor = new Editor({
      element,
      extensions: buildExtensions({
        slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
        slashItems: () => [],
      }),
      content: 'block',
    })
    editors.push(editor)

    // EditorContent.init (TipTap React) moves every child of the element the view
    // was built in into its own div, so the parent captured when the plugin was
    // created is no longer where the gutter lives.
    const page = document.createElement('div')
    wrapper.appendChild(page)
    page.append(...element.childNodes)

    const handle = wrapper.querySelector<HTMLElement>('.md-block-gutter')!
    expect(handle.parentElement).toBe(page)

    const block = editor.view.dom.querySelector('p')!
    block.style.lineHeight = '30px'
    block.style.fontSize = '16px'
    page.getBoundingClientRect = () => rect(60, 280, 500, 400)
    block.getBoundingClientRect = () => rect(200, 300, 300, 60)

    // posAtCoords needs layout, which jsdom does not do
    editor.view.posAtCoords = () => ({ pos: 0, inside: 0 })
    editor.view.dom.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 240, clientY: 306, bubbles: true }),
    )

    expect(handle.style.display).toBe('flex')
    // block left (200) - page left (60) - gutter width (40) - gap (12)
    expect(handle.style.left).toBe('88px')
    // block top (300) - page top (280) + half of (line height 30 - button 22)
    expect(handle.style.top).toBe('24px')
    expect(getComputedStyle(page).position).toBe('relative')

    editor.destroy()
    expect(page.style.position).toBe('')
    expect(wrapper.querySelector('.md-block-gutter')).toBeNull()

    wrapper.remove()
  })

  it('points at the bullet under the pointer, and + adds an item there', async () => {
    const { Editor } = await import('@tiptap/core')
    const { NodeSelection } = await import('@tiptap/pm/state')
    const { buildExtensions } = await import('../src/renderer/editor/extensions')

    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<div class="doc-page"></div>'
    const page = wrapper.querySelector<HTMLElement>('.doc-page')!
    const element = document.createElement('div')
    page.appendChild(element)
    document.body.appendChild(wrapper)

    const editor = new Editor({
      element,
      extensions: buildExtensions({
        slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
        slashItems: () => [],
      }),
      content: '',
    })
    editor.commands.setContent('- one\n- two\n- three', { contentType: 'markdown' })
    editors.push(editor)

    // the second bullet: its list item position, then a text position inside it
    let itemPos = -1
    let textPos = -1
    let seen = 0
    editor.state.doc.descendants((node, pos) => {
      if (itemPos >= 0) return false
      if (node.type.name === 'listItem') {
        if (seen === 1) {
          itemPos = pos
          textPos = pos + 2
          return false
        }
        seen++
      }
      return true
    })
    expect(itemPos).toBeGreaterThan(0)

    editor.view.posAtCoords = () => ({ pos: textPos, inside: -1 })
    editor.view.dom.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true }),
    )

    // the grip addresses that one bullet, not the whole list
    const grip = page.querySelector<HTMLElement>('.md-gutter-grip')!
    grip.click()
    const menu = page.querySelector<HTMLElement>('.md-block-menu')!
    expect(menu.style.display).toBe('block')
    const rows = [...menu.querySelectorAll('button')].map((b) => b.textContent)
    expect(rows.length).toBe(5)

    // "+" from the menu inserts another item of the same list, then types "/"
    const handle = page.querySelector<HTMLElement>('.md-block-gutter')!
    expect(handle.style.display).toBe('flex')
    page.querySelector<HTMLElement>('.md-gutter-plus')!.click()

    const items: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'listItem') {
        items.push(node.textContent)
        return false
      }
      return true
    })
    expect(items).toEqual(['one', 'two', '/', 'three'])
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')

    wrapper.remove()
  })
})
