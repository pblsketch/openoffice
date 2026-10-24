/**
 * The AI panel in the editor page, against a fake preload API: the dock
 * sits beside the chapter, its conversation is kept for the book's file, the
 * starters fit the book (a fixed-layout one is only read), and nothing is
 * sent to a model until the person sends: opening the book or picking a
 * starter never calls the AI stream. No real `claude` or `codex` is reached.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { epubAssetBase } from '../src/shared/asset-url'
import type { EpubApi, EpubBookSummary } from '../src/shared/ipc'
import { FakeBook } from './helpers/edit-backend'

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  delete (window as { projectApi?: unknown }).projectApi
})

function fakeApi(fixedLayout: boolean) {
  const book = new FakeBook([{ body: '<p>One.</p>' }, { body: '<p>Two.</p>' }])
  const summary: EpubBookSummary = {
    opfPath: 'OEBPS/content.opf',
    version: '3',
    metadata: {
      title: 'A Small Book',
      titles: ['A Small Book'],
      creators: [],
      languages: ['en'],
      identifiers: [],
      uniqueIdentifier: null,
      layout: fixedLayout ? 'pre-paginated' : 'reflowable',
      primaryWritingMode: null,
    },
    manifest: [],
    spine: book.chapters.map((c, index) => ({
      index,
      idref: `c${index}`,
      path: c.path,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      layout: null,
      fixedLayout,
    })),
    pageProgressionDirection: null,
    toc: { source: 'spine', entries: [] },
    fixedLayout,
    verticalWriting: false,
  }
  const aiStream = vi.fn(async () => {})
  const noop = () => () => {}
  const api = {
    consumePending: async () => 'C:/books/a.epub',
    openFile: async () => ({
      status: 'ok' as const,
      book: summary,
      assetBase: epubAssetBase('0123abcd'),
      docHash: 'h',
      readOnly: fixedLayout ? ('fixed-layout-book' as const) : null,
    }),
    readChapter: book.readChapter,
    applyEdits: book.applyEdits,
    replaceRanges: book.replaceRanges,
    setTranslationLock: book.setTranslationLock,
    setDirty: book.setDirty,
    getReadingState: async () => ({
      position: null,
      viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
    }),
    setReadPosition: () => {},
    setViewPrefs: async () => ({ fontScale: 1, lineHeight: null, dark: false }),
    onViewPrefsChanged: noop,
    onSaveRequest: noop,
    sendSaveRequestAck: () => {},
    onCloseSaveRequest: noop,
    sendCloseSaveResult: () => {},
    onMenuCommand: noop,
    onChromePressed: noop,
    onLanguageChanged: noop,
    onFileRenamed: noop,
    openLink: async () => true,
    getAiSettings: async () => ({}),
    onAiSettingsChanged: noop,
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: noop,
    aiStream,
    aiStreamCancel: async () => {},
    onAiStream: noop,
  } as unknown as EpubApi
  return { api, aiStream }
}

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await act(() => new Promise((r) => setTimeout(r, 5)))
}

async function mount(api: EpubApi): Promise<HTMLElement> {
  window.epubApi = api
  const resolveChat = vi.fn(async () => ({ projectId: 'p', chatId: 'c' }))
  window.projectApi = {
    resolveChat,
    appendChat: vi.fn(async () => {}),
    loadChat: vi.fn(async () => []),
    rebindChat: vi.fn(async () => null),
  } as unknown as NonNullable<typeof window.projectApi>
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <LocaleProvider initial="en">
        <App />
      </LocaleProvider>,
    )
  })
  await settle()
  return container
}

const starters = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.ai-starter')).map((b) => b.textContent)

describe('the AI panel in the editor', () => {
  it('docks beside the chapter and keeps its conversation for the book file', async () => {
    const { api } = fakeApi(false)
    const el = await mount(api)
    const main = el.querySelector('.epub-main')!
    expect(main.lastElementChild?.classList.contains('ai-dock')).toBe(true)
    expect(main.querySelector('.ai-dock .copilot')).not.toBeNull()
    expect(window.projectApi!.resolveChat).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'C:/books/a.epub' }),
    )
  })

  it('offers the four starters and sends nothing until the person sends', async () => {
    const { api, aiStream } = fakeApi(false)
    const el = await mount(api)
    expect(starters(el)).toEqual([
      'Summarize this chapter',
      'Find in the book',
      'Proofread this chapter',
      'Translate the book',
    ])
    const button = el.querySelector('.ai-starter') as HTMLButtonElement
    await act(async () => button.click())
    await settle()
    const box = el.querySelector('.ai-composer textarea') as HTMLTextAreaElement
    expect(box.value).toBe('Summarize the chapter on screen in a few sentences.')
    expect(aiStream).not.toHaveBeenCalled()
  })

  it('offers only the reading starters for a fixed-layout book', async () => {
    const { api } = fakeApi(true)
    const el = await mount(api)
    expect(starters(el)).toEqual(['Summarize this chapter', 'Find in the book'])
  })
})
