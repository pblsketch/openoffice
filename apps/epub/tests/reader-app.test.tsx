/**
 * The reading screen against a fake preload API: the refusal screens, the
 * chapter frame it builds, the flow between chapters, the table of contents,
 * the view settings, the in-book search, saving, and link presses inside a
 * chapter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Lang } from '@genoffice/i18n'
import { openChapter, type EpubTocEntry } from '@genoffice/epub-engine'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import {
  wireChapterDocument,
  type ChapterFrameProps,
} from '../src/renderer/components/ChapterFrame'
import { buildChapterHtml } from '../src/renderer/reader/chapter-html'
import { epubAssetBase } from '../src/shared/asset-url'
import type {
  EpubApi,
  EpubBookSummary,
  EpubChapterResult,
  EpubMenuCommand,
  EpubOpenFileResult,
  EpubReadingState,
  EpubSaveRequest,
  EpubViewPrefs,
  SaveMode,
} from '../src/shared/ipc'
import { xhtml } from './helpers/book'

const ASSET_BASE = epubAssetBase('0123abcd')

const SOURCES = [
  xhtml('One', '<h1>Chapter One</h1>\n<p>The whale is <a href="three.xhtml#end">here</a>.</p>'),
  xhtml('Notes', '<p>A note about the whale.</p>'),
  xhtml('Three', '<h1>Chapter Three</h1>\n<p id="end">Last whale paragraph.</p>'),
  xhtml('Four', '<h1>Chapter Four</h1>\n<p>Broken whale <b>markup</p>'),
]
const PATHS = [
  'OEBPS/text/one.xhtml',
  'OEBPS/text/notes.xhtml',
  'OEBPS/text/three.xhtml',
  'OEBPS/text/four.xhtml',
]

function chapterOf(i: number, fixed = false): EpubChapterResult {
  const source = SOURCES[i]!
  const map = openChapter(source)
  const base = { ok: true as const, spineIndex: i, path: PATHS[i]!, source, version: 0 }
  if (map.broken) return { ...base, broken: true, error: 'broken', readOnly: 'broken-chapter' }
  return {
    ...base,
    broken: false,
    blocks: map.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      tag: b.tag,
      flowing: b.flowing,
      outer: { ...b.outer },
      inner: { ...b.inner },
    })),
    readOnly: fixed ? 'fixed-layout-chapter' : null,
  }
}

const toc: EpubTocEntry[] = [
  { title: 'Chapter One', path: PATHS[0]!, fragment: null, spineIndex: 0, depth: 1 },
  { title: 'Notes', path: PATHS[1]!, fragment: null, spineIndex: 1, depth: 1 },
  { title: 'Chapter Three', path: PATHS[2]!, fragment: null, spineIndex: 2, depth: 1 },
  { title: 'Chapter Four', path: PATHS[3]!, fragment: null, spineIndex: 3, depth: 1 },
]

const BOOK: EpubBookSummary = {
  opfPath: 'OEBPS/content.opf',
  version: '3',
  metadata: {} as EpubBookSummary['metadata'],
  manifest: [],
  spine: PATHS.map((path, index) => ({
    index,
    idref: `c${index}`,
    path,
    mediaType: 'application/xhtml+xml',
    linear: index !== 1,
    properties: [],
    layout: null,
    fixedLayout: false,
  })),
  pageProgressionDirection: null,
  toc: { source: 'nav', entries: toc },
  fixedLayout: false,
  verticalWriting: false,
}

interface Fake {
  api: EpubApi
  reads: number[]
  saves: EpubSaveRequest[]
  prefPatches: Partial<EpubViewPrefs>[]
  positions: unknown[]
  closeResults: boolean[]
  links: string[]
  emit: {
    menu(command: EpubMenuCommand): void
    saveRequest(mode: SaveMode): void
    closeSave(): void
  }
}

function fakeApi(
  open: EpubOpenFileResult,
  state: EpubReadingState = {
    position: null,
    viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
  },
  fixedChapter = -1,
): Fake {
  const handlers: Record<string, ((...args: never[]) => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: (...args: never[]) => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  let prefs = state.viewPrefs
  const fake: Fake = {
    reads: [],
    saves: [],
    prefPatches: [],
    positions: [],
    closeResults: [],
    links: [],
    emit: {
      menu: (command) => (handlers.menu as ((c: EpubMenuCommand) => void) | undefined)?.(command),
      saveRequest: (mode) => (handlers.save as ((m: SaveMode) => void) | undefined)?.(mode),
      closeSave: () => (handlers.close as (() => void) | undefined)?.(),
    },
    api: {
      consumePending: async () => 'C:/books/moby.epub',
      openFile: async () => open,
      readChapter: async (i: number) => {
        fake.reads.push(i)
        return chapterOf(i, i === fixedChapter)
      },
      getReadingState: async () => state,
      setReadPosition: (position: unknown) => void fake.positions.push(position),
      setViewPrefs: async (patch: Partial<EpubViewPrefs>) => {
        fake.prefPatches.push(patch)
        prefs = { ...prefs, ...patch }
        return prefs
      },
      onViewPrefsChanged: on('prefs'),
      save: async (request: EpubSaveRequest) => {
        fake.saves.push(request)
        return { ok: true, path: 'C:/books/moby.epub', written: false, docHash: 'h' }
      },
      onSaveRequest: on('save'),
      sendSaveRequestAck: () => {},
      onCloseSaveRequest: on('close'),
      sendCloseSaveResult: (ok: boolean) => void fake.closeResults.push(ok),
      onMenuCommand: on('menu'),
      onChromePressed: on('chrome'),
      onLanguageChanged: on('language'),
      openLink: async (url: string) => {
        fake.links.push(url)
        return true
      },
    } as unknown as EpubApi,
  }
  return fake
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

async function mount(fake: Fake, lang: Lang = 'en'): Promise<void> {
  window.epubApi = fake.api
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <LocaleProvider initial={lang}>
        <App />
      </LocaleProvider>,
    )
  })
  await settle()
}

const frame = () => container.querySelector('iframe.epub-frame') as HTMLIFrameElement | null
const click = async (el: Element | null) => {
  if (!el) throw new Error('nothing to press')
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await settle()
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

const OPEN: EpubOpenFileResult = {
  status: 'ok',
  book: BOOK,
  assetBase: ASSET_BASE,
  docHash: 'h',
  readOnly: null,
}

describe('a file that does not open', () => {
  it('says a protected book cannot be opened, in the words of the spec', async () => {
    const fake = fakeApi({ status: 'refused', reason: 'drm' })
    await mount(fake, 'ko')
    const refusal = container.querySelector('.epub-refusal')
    expect(refusal?.getAttribute('data-reason')).toBe('drm')
    expect(refusal?.textContent).toContain(
      '저작권 보호가 걸린 전자책은 열 수 없습니다. 구입한 서점의 앱에서 여세요',
    )
    expect(fake.reads).toEqual([])
    expect(frame()).toBeNull()
  })

  it.each([
    ['damaged', 'The file is damaged or too large'],
    ['too-large', 'The file is damaged or too large'],
    ['not-epub', 'This is not an EPUB file, or it is damaged'],
    ['unreadable', 'The file could not be read'],
  ] as const)('explains %s', async (reason, text) => {
    await mount(fakeApi({ status: 'refused', reason }))
    expect(container.querySelector('.epub-refusal-text')?.textContent).toBe(text)
  })
})

describe('reading a book', () => {
  it('opens where the book was left, in a sandboxed frame with the cleaned copy', async () => {
    const fake = fakeApi(
      OPEN,
      {
        position: { spineIndex: 2, blockId: 'b2' },
        viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
      },
      2,
    )
    await mount(fake)
    await until(() => frame() !== null, 'the chapter frame')
    expect(fake.reads[0]).toBe(2)
    const iframe = frame()!
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin')
    const srcdoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"')
    expect(srcdoc).toContain(`<base href="${ASSET_BASE}OEBPS/text/three.xhtml">`)
    expect(srcdoc).toContain('data-epub-block="b1"')
    // the read-only reason: at the chapter's head and in the status line
    expect(container.querySelector('.epub-chapter-notice')?.textContent).toBe(
      'Fixed-layout chapter: this chapter is read only',
    )
    expect(container.querySelector('.epub-status-readonly')?.textContent).toBe(
      'Fixed-layout chapter: this chapter is read only',
    )
    expect(container.querySelector('.epub-status-chapter')?.textContent).toBe('Chapter 3/4')
  })

  it('shows the broken-chapter sentence for a chapter that is not well-formed', async () => {
    const fake = fakeApi(OPEN, {
      position: { spineIndex: 3, blockId: null },
      viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
    })
    // chapter four's <b> is never closed: the engine reads it as broken
    expect(chapterOf(3).ok && (chapterOf(3) as { broken: boolean }).broken).toBe(true)
    await mount(fake, 'ko')
    await until(() => frame() !== null, 'the chapter frame')
    expect(container.querySelector('.epub-chapter-notice')?.textContent).toBe(
      '형식이 깨져 이 장은 고칠 수 없습니다',
    )
  })

  it('goes chapter by chapter, skipping linear="no", and the contents reach every chapter', async () => {
    const fake = fakeApi(OPEN)
    await mount(fake)
    await until(() => frame() !== null, 'the chapter frame')
    expect(fake.reads).toEqual([0])
    const prev = container.querySelector('[data-action="prev-chapter"]') as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    await click(container.querySelector('[data-action="next-chapter"]'))
    await until(() => fake.reads.length === 2, 'the next chapter')
    expect(fake.reads).toEqual([0, 2])
    await click(container.querySelector('[data-action="prev-chapter"]'))
    await until(() => fake.reads.length === 3, 'the previous chapter')
    expect(fake.reads).toEqual([0, 2, 0])

    const entries = Array.from(container.querySelectorAll('.epub-toc-entry'))
    expect(entries.map((e) => e.textContent)).toEqual([
      'Chapter One',
      'Notes',
      'Chapter Three',
      'Chapter Four',
    ])
    await click(entries[1]!)
    await until(() => fake.reads.length === 4, 'the notes')
    expect(fake.reads.at(-1)).toBe(1)
    expect(container.querySelector('.epub-toc-entry.active')?.textContent).toBe('Notes')
  })

  it('changes the view settings through the main process, for the screen only', async () => {
    const fake = fakeApi(OPEN)
    await mount(fake)
    await until(() => frame() !== null, 'the chapter frame')
    await act(async () => fake.emit.menu('zoom-in'))
    await settle()
    expect(fake.prefPatches).toEqual([{ fontScale: 1.1 }])
    await click(container.querySelector('.ribbon-tab[data-tab="view"]'))
    await click(container.querySelector('[data-action="dark-view"]'))
    expect(fake.prefPatches.at(-1)).toEqual({ dark: true })
    expect(fake.saves).toEqual([])
  })

  it('searches every chapter and lists where', async () => {
    const fake = fakeApi(OPEN)
    await mount(fake)
    await until(() => frame() !== null, 'the chapter frame')
    await act(async () => fake.emit.menu('find'))
    await settle()
    const input = container.querySelector('.epub-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'WHALE')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.form!.requestSubmit()
    })
    await until(
      () => container.querySelectorAll('.epub-search-hit').length === 4,
      'the search results',
    )
    const hits = Array.from(container.querySelectorAll('.epub-search-hit'))
    // the non-linear notes and the broken fourth chapter are searched too
    expect(hits.map((h) => h.querySelector('.epub-search-hit-chapter')?.textContent)).toEqual([
      'Chapter One',
      'Notes',
      'Chapter Three',
      'Chapter Four',
    ])
    expect(hits.map((h) => h.querySelector('mark')?.textContent)).toEqual([
      'whale',
      'whale',
      'whale',
      'whale',
    ])
    expect(container.querySelector('.epub-search-summary')?.textContent).toBe('4 matches')
    const before = fake.reads.length
    await click(hits[3]!)
    await until(() => fake.reads.length > before, 'the hit chapter')
    expect(fake.reads.at(-1)).toBe(3)
  })

  it('answers the menu save and the close prompt', async () => {
    const fake = fakeApi(OPEN)
    await mount(fake)
    await until(() => frame() !== null, 'the chapter frame')
    await act(async () => fake.emit.saveRequest('saveAs'))
    await settle()
    expect(fake.saves).toEqual([{ mode: 'saveAs' }])
    await act(async () => fake.emit.closeSave())
    await settle()
    expect(fake.saves.at(-1)).toEqual({ mode: 'save' })
    expect(fake.closeResults).toEqual([true])
  })
})

describe('presses inside a chapter', () => {
  function chapterDoc(): Document {
    const html = buildChapterHtml({
      source: SOURCES[0]!,
      broken: false,
      blocks: [],
      baseUrl: `${ASSET_BASE}OEBPS/text/one.xhtml`,
    })
    return new DOMParser().parseFromString(html, 'text/html')
  }

  it('never follows a link; it hands the address to the screen', () => {
    const doc = chapterDoc()
    const onLink = vi.fn()
    const handlers = {
      html: '',
      title: '',
      onReady: () => {},
      onLink,
      onWheel: () => {},
      onScroll: () => {},
      onKeyDown: () => {},
      onPress: () => {},
    } satisfies ChapterFrameProps
    wireChapterDocument(doc, () => handlers)
    const anchor = doc.querySelector('a')!
    const inner = doc.createElement('span')
    anchor.appendChild(inner)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    inner.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onLink).toHaveBeenCalledWith('three.xhtml#end')
  })

  it("routes an image map's area like a link", () => {
    const doc = chapterDoc()
    const onLink = vi.fn()
    const handlers = {
      html: '',
      title: '',
      onReady: () => {},
      onLink,
      onWheel: () => {},
      onScroll: () => {},
      onKeyDown: () => {},
      onPress: () => {},
    } satisfies ChapterFrameProps
    wireChapterDocument(doc, () => handlers)
    const map = doc.createElement('map')
    map.name = 'm'
    const area = doc.createElement('area')
    area.setAttribute('href', 'two.xhtml#top')
    map.appendChild(area)
    doc.body.appendChild(map)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    area.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onLink).toHaveBeenCalledWith('two.xhtml#top')
  })
})
