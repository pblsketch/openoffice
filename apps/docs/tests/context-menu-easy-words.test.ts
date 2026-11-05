import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { LocaleProvider, setModuleLang } from '../src/renderer/i18n/locale'
import { EditorContextMenu } from '../src/renderer/components/ContextMenu'
import { appStrings } from '../src/renderer/i18n/strings-app'

/**
 * "Explain in plain words": one AI item just before Translate that quotes the
 * selection (redacted projection) into the AI panel, the same way Synonyms does.
 */

const LABEL = 'Explain in plain words'

function createEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { docxIndex: 0 },
          content: [{ type: 'text', text: 'call the client about the order' }],
        },
      ],
    },
  })
}

function select(editor: Editor, from: number, to: number) {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  )
}

function render(element: React.ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(LocaleProvider, { initial: 'en', children: element })))
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

const noop = () => {}

function menuProps(editor: Editor, overrides: Record<string, unknown> = {}) {
  return {
    editor,
    menu: { x: 10, y: 10 },
    onClose: noop,
    onFontDialog: noop,
    onParagraphDialog: noop,
    onLink: noop,
    onNewComment: noop,
    onViewImage: noop,
    onSaveImageAs: noop,
    onAiPreset: noop,
    ...overrides,
  }
}

const byLabel = (container: Element, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('.ctx-item')].find(
    (b) => b.querySelector('.ctx-label')?.textContent === label,
  )

Object.assign(window, { desktop: { onLanguageChanged: () => () => undefined } })
setModuleLang('en')

describe('EditorContextMenu — Explain in plain words', () => {
  it('is present but switched off when nothing is selected', () => {
    const editor = createEditor()
    const onAiPreset = vi.fn()
    const { container, unmount } = render(
      createElement(EditorContextMenu, menuProps(editor, { onAiPreset })),
    )
    const easy = byLabel(container, LABEL)!
    expect(easy).toBeDefined()
    expect(easy.disabled).toBe(true)
    act(() => easy.click())
    expect(onAiPreset).not.toHaveBeenCalled()
    unmount()
    editor.destroy()
  })

  it('sits right before Translate and carries the AI badge', () => {
    const editor = createEditor()
    select(editor, 1, 9)
    const { container, unmount } = render(createElement(EditorContextMenu, menuProps(editor)))
    const labels = [...container.querySelectorAll<HTMLButtonElement>('.ctx-item')].map(
      (b) => b.querySelector('.ctx-label')?.textContent,
    )
    expect(labels.indexOf(LABEL)).toBe(labels.indexOf('Translate') - 1)
    const easy = byLabel(container, LABEL)!
    expect(easy.querySelector('.copilot-badge')).not.toBeNull()
    expect(easy.getAttribute('data-tip')).toBe('Uses AI')
    unmount()
    editor.destroy()
  })

  it('sends the plain-words prompt with the selected text only on click, and closes', () => {
    const editor = createEditor()
    // "call the client" (positions 1..16)
    select(editor, 1, 16)
    const onAiPreset = vi.fn()
    const onClose = vi.fn()
    const { container, unmount } = render(
      createElement(EditorContextMenu, menuProps(editor, { onAiPreset, onClose })),
    )
    // rendering alone never reaches the AI panel
    expect(onAiPreset).not.toHaveBeenCalled()
    const easy = byLabel(container, LABEL)!
    expect(easy.disabled).toBe(false)
    act(() => easy.click())
    expect(onAiPreset).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
    const prompt = String(onAiPreset.mock.calls[0][0])
    expect(prompt).toBe(appStrings.en.appEasyWordsPrompt.replace('{text}', 'call the client'))
    expect(prompt).toContain('in English')
    expect(prompt).toContain('Do not modify the document')
    unmount()
    editor.destroy()
  })

  it('never quotes withheld words', () => {
    const editor = createEditor()
    // withhold "client" (positions 10..16), then select the whole line
    select(editor, 10, 16)
    editor.commands.setRedaction('client name')
    select(editor, 1, editor.state.doc.content.size - 1)
    const onAiPreset = vi.fn()
    const { container, unmount } = render(
      createElement(EditorContextMenu, menuProps(editor, { onAiPreset })),
    )
    act(() => byLabel(container, LABEL)!.click())
    expect(onAiPreset).toHaveBeenCalledOnce()
    const prompt = String(onAiPreset.mock.calls[0][0])
    expect(prompt).not.toContain('client about')
    expect(prompt).toContain('{{client name}}')
    expect(prompt).toContain('call the')
    expect(prompt).toContain('about the order')
    unmount()
    editor.destroy()
  })

  it('quotes only the marker when the whole selection is withheld', () => {
    const editor = createEditor()
    select(editor, 10, 16)
    editor.commands.setRedaction('client name')
    select(editor, 10, 16)
    const onAiPreset = vi.fn()
    const { container, unmount } = render(
      createElement(EditorContextMenu, menuProps(editor, { onAiPreset })),
    )
    act(() => byLabel(container, LABEL)!.click())
    const prompt = String(onAiPreset.mock.calls[0][0])
    expect(prompt).toContain('"{{client name}}"')
    expect(prompt.replace('{{client name}}', '')).not.toContain('client')
    unmount()
    editor.destroy()
  })
})

describe('Explain in plain words strings', () => {
  it('has a label and a prompt with the {text} slot in all 21 languages', () => {
    const langs = Object.keys(appStrings)
    expect(langs).toHaveLength(21)
    for (const lang of langs) {
      const s = appStrings[lang as keyof typeof appStrings]
      expect(s.appEasyWords.trim(), lang).not.toBe('')
      expect(s.appEasyWordsPrompt, lang).toContain('{text}')
      expect(s.appEasyWordsPrompt.split('{text}'), lang).toHaveLength(2)
      // written for each language, not copied from English
      if (lang !== 'en')
        expect(s.appEasyWordsPrompt, lang).not.toBe(appStrings.en.appEasyWordsPrompt)
    }
    expect(appStrings.ko.appEasyWords).toBe('쉬운 말로 풀기')
    expect(appStrings.ko.appEasyWordsPrompt).toContain('한국어로')
  })
})
