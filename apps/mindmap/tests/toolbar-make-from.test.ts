/**
 * The toolbar's "make another document from this one" (spec 5.2, 8.2): one
 * line-icon button in its own group after export, before the AI entry, named
 * in the app's language, asking the shell through the preload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Lang } from '@genoffice/i18n'
import { Toolbar, type ToolbarProps } from '../src/renderer/components/Toolbar'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import type { MindmapApi } from '../src/shared/ipc'

let container: HTMLElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;(window as unknown as { mindmapApi: Partial<MindmapApi> }).mindmapApi = {
    onLanguageChanged: () => () => {},
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function props(onMakeFromDocument: () => void, disabled = false): ToolbarProps {
  const none = () => {}
  return {
    disabled,
    dirty: false,
    statusText: '',
    canUndo: false,
    canRedo: false,
    autoSave: false,
    hasTopic: false,
    layout: 'right',
    layoutExact: true,
    pickingRelationship: false,
    themeOpen: false,
    noteOpen: false,
    aiOpen: false,
    onSave: none,
    onSaveAs: none,
    onUndo: none,
    onRedo: none,
    onToggleAutoSave: none,
    onAddChild: none,
    onAddSibling: none,
    onRelationship: none,
    onSummary: none,
    onNote: none,
    onLabel: none,
    onLink: none,
    onLayout: none,
    onToggleTheme: none,
    onFoldAll: none,
    onUnfoldAll: none,
    onZoomIn: none,
    onZoomOut: none,
    onZoomFit: none,
    onToggleAi: none,
    onExport: none,
    onMakeFromDocument,
  }
}

async function render(lang: Lang, p: ToolbarProps): Promise<HTMLButtonElement> {
  await act(async () => {
    root.render(
      createElement(LocaleProvider, { initial: lang, children: createElement(Toolbar, p) }),
    )
  })
  const button = container.querySelector<HTMLButtonElement>('[data-action="make-from-document"]')
  if (!button) throw new Error('no make-from-document button')
  return button
}

describe('the make-from-document button', () => {
  it('sits in its own group between export and the AI entry, as a line icon', async () => {
    const button = await render(
      'en',
      props(() => {}),
    )
    const tools = container.querySelector('.mm-tools')!
    const order = [...tools.querySelectorAll('[data-action]')].map((b) =>
      b.getAttribute('data-action'),
    )
    expect(order.indexOf('make-from-document')).toBe(order.indexOf('ai') - 1)
    expect(order.indexOf('make-from-document')).toBeGreaterThan(order.indexOf('zoom-fit'))
    const group = button.closest('.ribbon-group')!
    expect(group.previousElementSibling?.className).toBe('rb-sep')
    const svg = button.querySelector('svg')!
    expect(svg.getAttribute('stroke-width')).toBe('1.5')
    expect(svg.getAttribute('fill')).toBe('none')
  })

  it('is named in the app language and calls the handler', async () => {
    const asked = vi.fn()
    const button = await render('ko', props(asked))
    expect(button.getAttribute('aria-label')).toBe('이 문서로 다른 문서 만들기')
    button.click()
    expect(asked).toHaveBeenCalledTimes(1)
  })

  it('reads in English as written', async () => {
    const button = await render(
      'en',
      props(() => {}),
    )
    expect(button.getAttribute('aria-label')).toBe('Make Another Document from This')
  })

  it('is off while the map is not ready', async () => {
    const button = await render(
      'en',
      props(() => {}, true),
    )
    expect(button.disabled).toBe(true)
  })
})
