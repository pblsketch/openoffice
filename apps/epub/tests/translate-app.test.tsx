/**
 * Book translation wired into the editor page: the ribbon's "Translate
 * book" button and the menu's translate-book command open the window; a
 * fixed-layout book has the button off with the reason on screen; opening
 * the book sends nothing. A fake preload API stands in for the main process;
 * no real `claude` or `codex` is reached.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { epubAssetBase } from '../src/shared/asset-url'
import type { EpubApi, EpubMenuCommand } from '../src/shared/ipc'
import { FakeBook } from './helpers/edit-backend'
import {
  buildTranslateBook,
  createFakeBackend,
  fakeSubscription,
  type FakeBackend,
} from './helpers/translate-backend'

let root: Root | null = null
let container: HTMLElement | null = null
let backend: FakeBackend | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  backend?.dispose()
  backend = null
  delete (window as { projectApi?: unknown }).projectApi
})

async function fakeApi(fixedLayout: boolean) {
  backend = await createFakeBackend(
    await buildTranslateBook(
      [
        { title: 'One', body: '<p>One.</p>' },
        { title: 'Two', body: '<p>Two.</p>' },
      ],
      { fixedLayout },
    ),
  )
  const book = new FakeBook([{ body: '<p>One.</p>' }, { body: '<p>Two.</p>' }])
  const menu: { handler: ((command: EpubMenuCommand) => void) | null } = { handler: null }
  const noop = () => () => {}
  const api = {
    ...(backend.api as object),
    subscription: fakeSubscription(),
    consumePending: async () => 'C:/books/a.epub',
    openFile: async () => ({
      status: 'ok' as const,
      book: backend!.summary,
      assetBase: epubAssetBase('0123abcd'),
      docHash: backend!.docHash,
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
    onMenuCommand: (handler: (command: EpubMenuCommand) => void) => {
      menu.handler = handler
      return () => {}
    },
    onChromePressed: noop,
    onLanguageChanged: noop,
    onFileRenamed: noop,
    openLink: async () => true,
    getAiPanelPrefs: async () => ({}),
    onAiPanelPrefsChanged: noop,
  } as unknown as EpubApi
  return { api, menu }
}

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await act(() => new Promise((r) => setTimeout(r, 5)))
}

async function mount(api: EpubApi): Promise<HTMLElement> {
  window.epubApi = api
  window.projectApi = {
    resolveChat: vi.fn(async () => ({ projectId: 'p', chatId: 'c' })),
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

const dialog = (el: HTMLElement) => el.querySelector('[role="dialog"][aria-label="Translate book"]')

describe('book translation in the editor', () => {
  it('opens the window from the ribbon button, and sends nothing', async () => {
    const { api } = await fakeApi(false)
    const el = await mount(api)
    const button = el.querySelector<HTMLButtonElement>('[data-action="translate-book"]')!
    expect(button.disabled).toBe(false)
    expect(dialog(el)).toBeNull()
    await act(async () => button.click())
    await settle()
    expect(dialog(el)).not.toBeNull()
    expect(backend!.aiStream).not.toHaveBeenCalled()
  })

  it('opens the window from the menu command', async () => {
    const { api, menu } = await fakeApi(false)
    const el = await mount(api)
    await act(async () => menu.handler!('translate-book'))
    await settle()
    expect(dialog(el)).not.toBeNull()
  })

  it('turns the button off for a fixed-layout book and says why', async () => {
    const { api, menu } = await fakeApi(true)
    const el = await mount(api)
    const button = el.querySelector<HTMLButtonElement>('[data-action="translate-book"]')!
    expect(button.disabled).toBe(true)
    expect(el.querySelector('.bt-ribbon-note')?.textContent).toBe(
      'A fixed-layout book cannot be translated',
    )
    await act(async () => menu.handler!('translate-book'))
    await settle()
    expect(dialog(el)).toBeNull()
    expect(el.querySelector('.epub-status-notice')?.textContent).toContain(
      'A fixed-layout book cannot be translated',
    )
  })
})
