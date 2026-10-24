/**
 * The editing screen wired into the editor page, against a fake preload
 * API: typed text sent before a save, the shortcuts on the page and inside
 * the chapter frame, menu commands, the unsaved-changes mark, the lock
 * notice, and replace all from the find pane.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { epubAssetBase } from '../src/shared/asset-url'
import type {
  EpubApi,
  EpubBookSummary,
  EpubEditResult,
  EpubMenuCommand,
  EpubSaveRequest,
} from '../src/shared/ipc'
import { FakeBook, type ChapterSpec } from './helpers/edit-backend'

interface Harness {
  book: FakeBook
  order: string[]
  saves: EpubSaveRequest[]
  menu(command: EpubMenuCommand): void
}

function fakeApi(
  specs: ChapterSpec[],
  overrides: Partial<EpubApi> = {},
): Harness & { api: EpubApi } {
  const book = new FakeBook(specs)
  const order: string[] = []
  const saves: EpubSaveRequest[] = []
  const handlers: Record<string, ((...args: never[]) => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: (...args: never[]) => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  const summary: EpubBookSummary = {
    opfPath: 'OEBPS/content.opf',
    version: '3',
    metadata: {} as EpubBookSummary['metadata'],
    manifest: [],
    spine: book.chapters.map((c, index) => ({
      index,
      idref: `c${index}`,
      path: c.path,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      layout: null,
      fixedLayout: c.readOnly === 'fixed-layout-chapter',
    })),
    pageProgressionDirection: null,
    toc: { source: 'spine', entries: [] },
    fixedLayout: false,
    verticalWriting: false,
  }
  const api = {
    consumePending: async () => 'C:/books/a.epub',
    openFile: async () => ({
      status: 'ok' as const,
      book: summary,
      assetBase: epubAssetBase('0123abcd'),
      docHash: 'h',
      readOnly: null,
    }),
    readChapter: book.readChapter,
    applyEdits: async (request: Parameters<EpubApi['applyEdits']>[0]) => {
      order.push('apply')
      return book.applyEdits(request)
    },
    replaceRanges: async (request: Parameters<EpubApi['replaceRanges']>[0]) => {
      order.push('ranges')
      return book.replaceRanges(request)
    },
    setTranslationLock: book.setTranslationLock,
    setDirty: book.setDirty,
    getReadingState: async () => ({
      position: null,
      viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
    }),
    setReadPosition: () => {},
    setViewPrefs: async () => ({ fontScale: 1, lineHeight: null, dark: false }),
    onViewPrefsChanged: on('prefs'),
    save: async (request: EpubSaveRequest) => {
      order.push('save')
      saves.push(request)
      return { ok: true, path: 'C:/books/a.epub', written: true, docHash: 'h2' }
    },
    onSaveRequest: on('save'),
    sendSaveRequestAck: () => {},
    onCloseSaveRequest: on('close'),
    sendCloseSaveResult: () => {},
    onMenuCommand: on('menu'),
    onChromePressed: on('chrome'),
    onLanguageChanged: on('language'),
    openLink: async () => true,
    ...overrides,
  } as unknown as EpubApi
  return {
    api,
    book,
    order,
    saves,
    menu: (command) => (handlers.menu as ((c: EpubMenuCommand) => void) | undefined)?.(command),
  }
}

let root: Root | null = null
let container: HTMLElement

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await act(() => new Promise((r) => setTimeout(r, 5)))
}

async function until(done: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`still waiting for ${what}`)
    await act(() => new Promise((r) => setTimeout(r, 5)))
  }
}

const frame = () => container.querySelector('iframe.epub-frame') as HTMLIFrameElement | null

/** jsdom does not load `srcdoc`: put the copy into the frame and send its load event. */
async function loadFrame(): Promise<Document> {
  await until(() => frame() !== null, 'the chapter frame')
  const iframe = frame()!
  const doc = iframe.contentDocument!
  const parsed = new DOMParser().parseFromString(iframe.getAttribute('srcdoc') ?? '', 'text/html')
  doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement)
  await act(async () => {
    iframe.dispatchEvent(new Event('load'))
  })
  await settle()
  return doc
}

async function mount(h: { api: EpubApi }): Promise<Document> {
  window.epubApi = h.api
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
  return loadFrame()
}

function textIn(doc: Document, id: string, contains: string): Text {
  const el = doc.querySelector(`[data-epub-block="${id}"]`)!
  const walker = doc.createTreeWalker(el, 4)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.includes(contains)) return n as Text
  }
  throw new Error(`no text ${contains}`)
}

function select(doc: Document, node: Node, start: number, end = start): void {
  const range = doc.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  doc.getSelection()!.removeAllRanges()
  doc.getSelection()!.addRange(range)
}

async function typeInto(doc: Document, id: string, contains: string, next: string): Promise<void> {
  const node = textIn(doc, id, contains)
  await act(async () => {
    node.data = node.data.replace(contains, next)
    select(doc, node, node.data.length)
    const win = doc.defaultView as unknown as typeof globalThis
    node.parentElement!.dispatchEvent(new win.Event('input', { bubbles: true }))
  })
}

async function pageKey(key: string, mods: KeyboardEventInit = {}): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  await act(async () => {
    window.dispatchEvent(event)
  })
  await settle()
  return event.defaultPrevented
}

async function frameKey(doc: Document, target: Node, key: string, mods: KeyboardEventInit = {}) {
  const win = doc.defaultView as unknown as typeof globalThis
  const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  await act(async () => {
    target.dispatchEvent(event)
  })
  await settle()
  return event.defaultPrevented
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  vi.unstubAllGlobals()
})

const BODY = '<p>The whale is <a href="#n" class="ref">here</a>.</p>\n<p>Second whale.</p>'

describe('saving what was typed', () => {
  it('sends the typed text before the file is written, and marks the book unsaved until then', async () => {
    const h = fakeApi([{ body: BODY }])
    const doc = await mount(h)
    expect(doc.querySelectorAll('[contenteditable="true"]').length).toBe(2)
    await typeInto(doc, 'b2', 'Second', 'Another')
    expect(container.querySelector('.epub-status-dirty')?.textContent).toBe('Unsaved changes')
    expect(await pageKey('s', { ctrlKey: true })).toBe(true)
    await until(() => h.saves.length === 1, 'the save')
    expect(h.order).toEqual(['apply', 'save'])
    expect(h.saves).toEqual([{ mode: 'save' }])
    expect(h.book.source(0)).toContain('<p>Another whale.</p>')
    expect(container.querySelector('.epub-status-dirty')).toBeNull()
    await pageKey('S', { ctrlKey: true, shiftKey: true })
    await until(() => h.saves.length === 2, 'the save as')
    expect(h.saves[1]).toEqual({ mode: 'saveAs' })
  })
})

describe('shortcuts and menu commands', () => {
  it('undoes and redoes from the page, the frame and the menu', async () => {
    const h = fakeApi([{ body: BODY }])
    const doc = await mount(h)
    const stored = h.book.source(0)
    await typeInto(doc, 'b1', 'The whale', 'A whale')
    const node = textIn(doc, 'b1', 'A whale')
    // inside the frame: Ctrl+Z is the book's undo, not the browser's
    expect(await frameKey(doc, node, 'z', { ctrlKey: true })).toBe(true)
    await until(() => h.book.source(0) === stored, 'the undo')
    expect(h.order).toEqual(['apply', 'ranges'])
    // on the page: Ctrl+Y redoes
    expect(await pageKey('y', { ctrlKey: true })).toBe(true)
    await until(() => h.book.source(0).includes('A whale'), 'the redo')
    // the menu's undo goes the same way
    await act(async () => h.menu('undo'))
    await until(() => h.book.source(0) === stored, 'the menu undo')
    // in a text field of the page, Ctrl+Z stays the field's
    const input = document.createElement('input')
    container.appendChild(input)
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('makes the selection bold with Ctrl+B inside the frame and with the ribbon', async () => {
    const h = fakeApi([{ body: BODY }])
    const doc = await mount(h)
    const node = textIn(doc, 'b2', 'Second')
    select(doc, node, 0, 6)
    expect(await frameKey(doc, node, 'b', { ctrlKey: true })).toBe(true)
    await until(() => h.book.source(0).includes('<strong>Second</strong>'), 'bold')
    const again = textIn(doc, 'b2', 'whale')
    select(doc, again, 1, 6)
    await act(async () => {
      ;(container.querySelector('[data-action="italic"]') as HTMLButtonElement).click()
    })
    await until(() => h.book.source(0).includes('<em>whale</em>'), 'italic')
  })

  it('opens find with Ctrl+F and replace with Ctrl+H, and replaces in the whole book', async () => {
    const h = fakeApi([
      { body: BODY },
      { body: '<p>A fixed whale.</p>', readOnly: 'fixed-layout-chapter' },
    ])
    await mount(h)
    expect(await pageKey('f', { ctrlKey: true })).toBe(true)
    expect(container.querySelector('.epub-search-input')).not.toBeNull()
    expect(container.querySelector('.epub-replace-row')).toBeNull()
    expect(await pageKey('h', { ctrlKey: true })).toBe(true)
    expect(container.querySelector('.epub-replace-row')).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const find = container.querySelector('.epub-search-input') as HTMLInputElement
    const replace = container.querySelector('.epub-replace-input') as HTMLInputElement
    await act(async () => {
      setter.call(find, 'WHALE')
      find.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(replace, 'shark')
      replace.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;(container.querySelector('[data-action="replace-all"]') as HTMLButtonElement).click()
    })
    await until(
      () =>
        (container.querySelector('.epub-status-notice')?.textContent ?? '').includes('Replaced'),
      'the replace notice',
    )
    expect(container.querySelector('.epub-status-notice')?.textContent).toBe(
      'Replaced 2 · Skipped 1 in read-only chapters',
    )
    expect(h.book.source(0)).toContain('The shark is')
    expect(h.book.source(0)).toContain('Second shark.')
    expect(h.book.source(1)).toContain('A fixed whale.')
    // one undo takes it all back
    await pageKey('z', { ctrlKey: true })
    await until(() => !h.book.source(0).includes('shark'), 'the undo of replace all')
  })
})

describe('the translation lock', () => {
  it('shows why editing stopped and leaves the blocks alone', async () => {
    const h = fakeApi([{ body: BODY }], {
      applyEdits: async (): Promise<EpubEditResult> => ({ ok: false, error: 'locked' }),
    })
    const doc = await mount(h)
    await typeInto(doc, 'b2', 'Second', 'Typed')
    await pageKey('s', { ctrlKey: true })
    await until(() => container.querySelector('.epub-status-locked') !== null, 'the lock notice')
    expect(container.querySelector('.epub-status-locked')?.textContent).toBe(
      'Editing is not available while the book is being translated',
    )
    expect(doc.querySelectorAll('[contenteditable]').length).toBe(0)
    expect((container.querySelector('[data-action="bold"]') as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})
