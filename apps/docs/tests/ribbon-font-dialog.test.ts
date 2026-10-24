/**
 * Home ▸ Font group: the dialog launcher opens the Font dialog, whose Advanced
 * tab is where character scale (장평) and spacing (자간) live.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { computeFormatState } from '../src/renderer/components/ribbon-format-state'
import { Ribbon } from '../src/renderer/components/Ribbon'
import { ribbonProps } from './helpers/ribbon-props'

describe('ribbon font dialog launcher', () => {
  let editor: Editor
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    )
    editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            content: [{ type: 'text', text: '기도제목', marks: [{ type: 'docTextStyle' }] }],
          },
        ],
      },
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    editor.destroy()
    vi.unstubAllGlobals()
  })

  it('calls onFontDialog when the launcher is pressed', () => {
    const onFontDialog = vi.fn()
    act(() =>
      root.render(
        createElement(Ribbon, {
          ...ribbonProps(editor, computeFormatState(editor)),
          onFontDialog,
        }),
      ),
    )
    const launcher = host.querySelector<HTMLButtonElement>('[data-testid="ribbon-font-dialog"]')
    expect(launcher).not.toBeNull()
    act(() => launcher!.click())
    expect(onFontDialog).toHaveBeenCalledOnce()
  })
})
