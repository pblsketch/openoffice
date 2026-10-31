/**
 * The book preview inside the editor screen, against a fake preload API: it
 * opens from the ribbon where the reader is, draws the same cleaned copy in a
 * sandboxed frame cut into pages, turns pages and chapters in reading order,
 * follows the table of contents and links, remembers its settings, reads the
 * chapter again when the book changes, and on closing leaves the editing view
 * where the preview was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { openChapter, type EpubTocEntry } from '@genoffice/epub-engine'
import App from '../src/renderer/App'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { BookPreview, PREVIEW_SETTINGS_KEY } from '../src/renderer/components/BookPreview'
import { epubAssetBase } from '../src/shared/asset-url'
import type {
  EpubApi,
  EpubBookSummary,
  EpubChapterResult,
  EpubOpenFileResult,
  EpubReadingState,
  EpubViewPrefs,
} from '../src/shared/ipc'
import { xhtml } from './helpers/book'

const ASSET_BASE = epubAssetBase('0123abcd')

const SOURCES = [
  xhtml(
    'One',
    '<h1>Chapter One</h1>\n<p>The whale is <a href="three.xhtml#end">here</a>.</p>\n<p><a href="https://example.com/">Away</a></p>',
  ),
  xhtml('Notes', '<p>A note about the whale.</p>'),
  xhtml('Three', '<h1>Chapter Three</h1>\n<p id="end">Last whale paragraph.</p>'),
]
const PATHS = ['OEBPS/text/one.xhtml', 'OEBPS/text/notes.xhtml', 'OEBPS/text/three.xhtml']

const toc: EpubTocEntry[] = [
  { title: 'Chapter One', path: PATHS[0]!, fragment: null, spineIndex: 0, depth: 1 },
  { title: 'Notes', path: PATHS[1]!, fragment: null, spineIndex: 1, depth: 1 },
  { title: 'Chapter Three', path: PATHS[2]!, fragment: 'end', spineIndex: 2, depth: 1 },
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

const OPEN: EpubOpenFileResult = {
  status: 'ok',
  book: BOOK,
  assetBase: ASSET_BASE,
  docHash: 'h',
  readOnly: null,
}

interface Fake {
  api: EpubApi
  reads: number[]
  links: string[]
  versions: number[]
}

function fakeApi(): Fake {
  const on = () => () => () => {}
  const state: EpubReadingState = {
    position: null,
    viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
  }
  const fake: Fake = {
    reads: [],
    links: [],
    versions: SOURCES.map(() => 0),
    api: {
      consumePending: async () => 'C:/books/moby.epub',
      openFile: async () => OPEN,
      readChapter: async (i: number): Promise<EpubChapterResult> => {
        fake.reads.push(i)
        const source = SOURCES[i]!
        const map = openChapter(source)
        if (map.broken) throw new Error('the test chapters are well-formed')
        return {
          ok: true,
          spineIndex: i,
          path: PATHS[i]!,
          source,
          version: fake.versions[i]!,
          broken: false,
          blocks: map.blocks.map((b) => ({
            id: b.id,
            kind: b.kind,
            tag: b.tag,
            flowing: b.flowing,
            outer: { ...b.outer },
            inner: { ...b.inner },
          })),
          readOnly: null,
        }
      },
      getReadingState: async () => state,
      setReadPosition: () => {},
      setViewPrefs: async (patch: Partial<EpubViewPrefs>) => ({ ...state.viewPrefs, ...patch }),
      onViewPrefsChanged: on(),
      save: async () => ({ ok: true, path: 'C:/books/moby.epub', written: false, docHash: 'h' }),
      onSaveRequest: on(),
      sendSaveRequestAck: () => {},
      onCloseSaveRequest: on(),
      sendCloseSaveResult: () => {},
      onMenuCommand: on(),
      onChromePressed: on(),
      onLanguageChanged: on(),
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

const editFrame = () => container.querySelector('iframe.epub-frame') as HTMLIFrameElement | null
const previewFrame = () =>
  container.querySelector('iframe.epub-preview-frame') as HTMLIFrameElement | null
const pageText = () => container.querySelector('.epub-preview-where')?.textContent ?? ''

const click = async (el: Element | null) => {
  if (!el) throw new Error('nothing to press')
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await settle()
}

const press = async (key: string, target: EventTarget = window) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  await settle()
}

/**
 * jsdom does not load `srcdoc`: put the copy into the frame and send its load
 * event. `run` is how far the chapter runs sideways once laid out.
 */
async function loadFrame(iframe: HTMLIFrameElement, run = 0): Promise<Document> {
  const doc = iframe.contentDocument!
  const parsed = new DOMParser().parseFromString(iframe.getAttribute('srcdoc') ?? '', 'text/html')
  doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement)
  Object.defineProperty(doc.documentElement, 'scrollWidth', { configurable: true, value: run })
  await act(async () => {
    iframe.dispatchEvent(new Event('load'))
  })
  await settle()
  return doc
}

async function mount(fake: Fake): Promise<void> {
  window.epubApi = fake.api
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
  await until(() => editFrame() !== null, 'the chapter frame')
  await loadFrame(editFrame()!)
}

/** Opens the preview from the View tab and loads its first chapter. */
async function openPreview(run = 0): Promise<Document> {
  await click(container.querySelector('[data-tab="view"]'))
  await click(container.querySelector('.ribbon-body [data-action="preview"]'))
  await until(() => previewFrame() !== null, 'the preview frame')
  return loadFrame(previewFrame()!, run)
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.localStorage.removeItem(PREVIEW_SETTINGS_KEY)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  vi.unstubAllGlobals()
})

describe('the book preview', () => {
  it('opens over the chapter view with the cleaned copy cut into pages, and edits nothing', async () => {
    const fake = fakeApi()
    await mount(fake)
    // on Home as well, after find
    expect(container.querySelector('.ribbon-body [data-action="preview"]')).not.toBeNull()
    await openPreview()
    const iframe = previewFrame()!
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin')
    const srcdoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"')
    expect(srcdoc).toContain(`<base href="${ASSET_BASE}OEBPS/text/one.xhtml">`)
    expect(srcdoc).toContain('column-width:')
    expect(srcdoc).not.toContain('<script')
    // the default screen is an e-reader page
    expect(iframe.style.width).toBe('600px')
    expect(iframe.style.height).toBe('800px')
    // nothing in the preview is editable; the editing frame stays loaded underneath
    expect(iframe.contentDocument!.querySelector('[contenteditable="true"]')).toBeNull()
    expect(editFrame()).not.toBeNull()
    expect(container.querySelector('.epub-frame-wrap')?.getAttribute('data-covered')).toBe('true')
    expect(container.querySelector('.epub-status-preview')?.textContent).toBe('Previewing')
    expect(container.querySelector('[data-action="preview"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
    // bold and italic are off while previewing
    await click(container.querySelector('[data-tab="home"]'))
    expect(
      (container.querySelector('[data-action="bold"]') as HTMLButtonElement | null)?.disabled,
    ).toBe(true)
  })

  it('turns page by page, then on to the next chapter in reading order and back', async () => {
    const fake = fakeApi()
    await mount(fake)
    // three 600 px pages
    await openPreview(1800)
    expect(pageText()).toBe('Chapter One · Page 1 of 3')
    const prev = container.querySelector('[data-action="preview-prev-page"]') as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    await click(container.querySelector('[data-action="preview-next-page"]'))
    expect(pageText()).toBe('Chapter One · Page 2 of 3')
    await press('ArrowRight')
    expect(pageText()).toBe('Chapter One · Page 3 of 3')
    const before = fake.reads.length
    await press('PageDown')
    // linear="no" notes are skipped
    await until(() => fake.reads.length > before, 'the next chapter')
    expect(fake.reads.at(-1)).toBe(2)
    await loadFrame(previewFrame()!)
    expect(pageText()).toBe('Chapter Three · Page 1 of 1')
    expect(container.querySelector('.epub-status-chapter')?.textContent).toBe('Chapter 3/3')
    expect(container.querySelector('.epub-toc-entry.active')?.textContent).toBe('Chapter Three')
    const next = container.querySelector('[data-action="preview-next-page"]') as HTMLButtonElement
    expect(next.disabled).toBe(true)
    // back to the last page of chapter one
    await press('ArrowLeft')
    await until(() => fake.reads.at(-1) === 0, 'the chapter before')
    await loadFrame(previewFrame()!, 1800)
    expect(pageText()).toBe('Chapter One · Page 3 of 3')
  })

  it('leaves keys typed into a field alone', async () => {
    const fake = fakeApi()
    await mount(fake)
    await openPreview(1800)
    const field = document.createElement('textarea')
    container.appendChild(field)
    await press('ArrowRight', field)
    expect(pageText()).toBe('Chapter One · Page 1 of 3')
  })

  it('follows the table of contents and links without touching the editing view', async () => {
    const fake = fakeApi()
    await mount(fake)
    const doc = await openPreview()
    // an outside link goes to the browser through the main process
    await act(async () => {
      ;(doc.querySelector('a[href^="https:"]') as HTMLElement).click()
    })
    await settle()
    expect(fake.links).toEqual(['https://example.com/'])
    // a link into the book turns the preview there
    await act(async () => {
      ;(doc.querySelector('a[href^="three"]') as HTMLElement).click()
    })
    await until(() => fake.reads.at(-1) === 2, 'the linked chapter')
    await loadFrame(previewFrame()!)
    expect(pageText()).toBe('Chapter Three · Page 1 of 1')
    // the contents move the preview, not the frame underneath
    const reads = fake.reads.length
    await click(container.querySelectorAll('.epub-toc-entry')[1]!)
    await until(() => fake.reads.length > reads, 'the notes')
    expect(fake.reads.at(-1)).toBe(1)
    expect(editFrame()?.getAttribute('srcdoc')).toContain('one.xhtml')
  })

  it('remembers its screen, paper and text size', async () => {
    const fake = fakeApi()
    await mount(fake)
    await openPreview()
    await click(container.querySelector('[data-action="preview-font-larger"]'))
    expect(container.querySelector('.epub-preview-scale')?.textContent).toBe('115%')
    await click(container.querySelector('[data-action="preview-rotate"]'))
    expect(previewFrame()!.style.width).toBe('800px')
    expect(
      previewFrame()!.contentDocument!.getElementById('genoffice-epub-view')?.textContent,
    ).toContain('font-size: 115% !important')
    expect(JSON.parse(window.localStorage.getItem(PREVIEW_SETTINGS_KEY) ?? '{}')).toMatchObject({
      device: 'ereader',
      landscape: true,
      fontScale: 1.15,
    })
  })

  it('reads the chapter again when the book changes, and draws it only if its text moved on', async () => {
    const fake = fakeApi()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const render = (signal: number) =>
      act(async () => {
        root!.render(
          <LocaleProvider initial="en">
            <BookPreview
              book={BOOK}
              assetBase={ASSET_BASE}
              start={{ spineIndex: 0, blockId: null }}
              readChapter={fake.api.readChapter}
              refreshSignal={signal}
              chapterName={(i) => `Chapter ${i + 1}`}
              openOutside={() => {}}
              onChapter={() => {}}
              onClose={() => {}}
            />
          </LocaleProvider>,
        )
      })
    await render(1)
    await until(() => previewFrame() !== null, 'the preview frame')
    await loadFrame(previewFrame()!)
    const first = previewFrame()
    // the same text: read, not drawn again
    await render(2)
    await settle()
    expect(fake.reads).toEqual([0, 0])
    expect(previewFrame()).toBe(first)
    // the text moved on: drawn again
    fake.versions[0] = 1
    await render(3)
    await until(() => previewFrame() !== first, 'the chapter drawn again')
    expect(fake.reads).toEqual([0, 0, 0, 0])
  })

  it('closes with Escape and leaves the editing view at the chapter the preview showed', async () => {
    const fake = fakeApi()
    await mount(fake)
    await openPreview()
    await click(container.querySelectorAll('.epub-toc-entry')[2]!)
    await until(() => fake.reads.at(-1) === 2, 'chapter three')
    await loadFrame(previewFrame()!)
    const reads = fake.reads.length
    await press('Escape')
    expect(container.querySelector('.epub-preview')).toBeNull()
    expect(container.querySelector('.epub-frame-wrap')?.getAttribute('data-covered')).toBeNull()
    await until(() => fake.reads.length > reads, 'the editing view to follow')
    expect(fake.reads.at(-1)).toBe(2)
  })
})
