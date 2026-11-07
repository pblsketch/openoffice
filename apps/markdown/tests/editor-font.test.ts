import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/renderer/editor/extensions'
import { Ribbon } from '../src/renderer/components/Ribbon'
import {
  EDITOR_FONT_KEY,
  applyEditorFont,
  editorFontChoices,
  rememberEditorFont,
  storedEditorFont,
} from '../src/renderer/editor-font'

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  localStorage.clear()
  applyEditorFont(null)
})

describe('the remembered editor font', () => {
  it('reads back what was picked, and nothing after going back to the default', () => {
    expect(storedEditorFont()).toBeNull()
    rememberEditorFont('Georgia')
    expect(storedEditorFont()).toBe('Georgia')
    rememberEditorFont(null)
    expect(storedEditorFont()).toBeNull()
    expect(localStorage.getItem(EDITOR_FONT_KEY)).toBeNull()
  })

  it('reads a stored value that is more than one family name as the default', () => {
    for (const bad of ['Arial", serif', 'a;b', ' Arial', '', 'x'.repeat(101), 'a\nb']) {
      localStorage.setItem(EDITOR_FONT_KEY, bad)
      expect(storedEditorFont()).toBeNull()
    }
    localStorage.setItem(EDITOR_FONT_KEY, '맑은 고딕')
    expect(storedEditorFont()).toBe('맑은 고딕')
  })
})

describe('applyEditorFont', () => {
  it('marks the document root with the font and clears it for the default', () => {
    const root = document.documentElement
    applyEditorFont('Malgun Gothic')
    expect(root.hasAttribute('data-md-font')).toBe(true)
    expect(root.style.getPropertyValue('--md-editor-font')).toBe('"Malgun Gothic"')
    applyEditorFont(null)
    expect(root.hasAttribute('data-md-font')).toBe(false)
    expect(root.style.getPropertyValue('--md-editor-font')).toBe('')
  })
})

describe('editorFontChoices', () => {
  it('lists the language candidates first, then the PC fonts once each', () => {
    const choices = editorFontChoices('ko', ['Arial', 'Zeta Sans', 'Malgun Gothic'])
    expect(choices).toContain('Zeta Sans')
    expect(choices.indexOf('Malgun Gothic')).toBeLessThan(choices.indexOf('Zeta Sans'))
    expect(choices.filter((f) => f === 'Arial')).toHaveLength(1)
  })

  it('keeps every candidate while the PC fonts are unknown', () => {
    expect(editorFontChoices('en', [])).toContain('Georgia')
  })
})

function renderRibbon(props: { editorFont: string | null; sourceMode?: boolean }) {
  const onEditorFont = vi.fn()
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
      slashItems: () => [],
    }),
    content: '<p>body</p>',
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(Ribbon, {
        editor,
        disabled: false,
        dirty: false,
        onSave: vi.fn(),
        onSaveAs: vi.fn(),
        onFind: vi.fn(),
        autoSave: false,
        onToggleAutoSave: vi.fn(),
        imageEnabled: true,
        onInsertImage: vi.fn(),
        frontmatterOpen: false,
        onToggleFrontmatter: vi.fn(),
        outlineOpen: false,
        onToggleOutline: vi.fn(),
        spellcheck: true,
        onToggleSpellcheck: vi.fn(),
        aiOpen: false,
        onToggleAi: vi.fn(),
        onAiPreset: vi.fn(),
        sourceViewOpen: false,
        onToggleSource: vi.fn(),
        mdTheme: 'default',
        onMarkdownTheme: vi.fn(),
        editorFont: props.editorFont,
        onEditorFont,
        sourceMode: props.sourceMode ?? false,
      } as unknown as Parameters<typeof Ribbon>[0]),
    )
  })
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
    editor.destroy()
  })
  return { container, onEditorFont }
}

function pickFont(container: HTMLElement, value: string) {
  act(() => (container.querySelector('.rb-font .gs-dd-btn') as HTMLButtonElement).click())
  const item = container.querySelector(`.gs-dd-item[data-value="${value}"]`) as HTMLButtonElement
  act(() => item.click())
}

describe('the ribbon font picker', () => {
  it('passes the picked family, and null for the default entry', () => {
    const { container, onEditorFont } = renderRibbon({ editorFont: 'Georgia' })
    expect(container.querySelector('.rb-font .gs-dd-btn')?.getAttribute('data-value')).toBe(
      'Georgia',
    )
    pickFont(container, 'Arial')
    expect(onEditorFont).toHaveBeenLastCalledWith('Arial')
    pickFont(container, '')
    expect(onEditorFont).toHaveBeenLastCalledWith(null)
  })

  it('still shows a remembered font the list no longer has', () => {
    const { container } = renderRibbon({ editorFont: 'Gone Font' })
    expect(container.querySelector('.rb-font .gs-dd-value')?.textContent).toBe('Gone Font')
  })

  it('is not offered for a .txt or .json file, which has no block editor', () => {
    const { container } = renderRibbon({ editorFont: null, sourceMode: true })
    expect(container.querySelector('.rb-font')).toBeNull()
  })
})
