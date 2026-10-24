import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A skill template's copy opens as a NEW, UNTITLED document of its editor
 * (spec 5.7): TabManager.openTemplateCopy makes the editor's tab without the
 * copy as its file (or, for the editors that read a file, marked as an
 * untitled copy) and hands the copy's content over in the same tick. Electron
 * and the editor main modules are mocked; only what the manager does is
 * asserted. Sheets is opened by the shell itself (its backing workbook).
 */

let nextWebContentsId = 1

function makeFakeView() {
  return {
    webContents: {
      id: nextWebContentsId++,
      on: vi.fn(),
      once: vi.fn(),
      close: vi.fn(),
      reload: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
    setVisible: vi.fn(),
    setBounds: vi.fn(),
  }
}

vi.mock('electron', () => ({
  BrowserWindow: class {},
  WebContentsView: class {},
}))

const createDocsView = vi.fn((..._args: unknown[]) => makeFakeView())
const queueDocsCopy = vi.fn()
vi.mock('../../docs/src/main/docs-main', () => ({
  createDocsView: (...args: unknown[]) => createDocsView(...args),
  docsQueryDirty: vi.fn(),
  markDocsNewBlank: vi.fn(),
  queueDocsAiContent: vi.fn(),
  queueDocsCopy: (...args: unknown[]) => queueDocsCopy(...args),
  requestDocsClose: vi.fn(),
  setActiveDocsResolver: vi.fn(),
  teardownDocsRenderer: vi.fn(),
}))
vi.mock('../src/main/renderer-disposal', () => ({ releaseClosedRenderer: vi.fn(() => true) }))

const createPdfView = vi.fn((..._args: unknown[]) => makeFakeView())
const markPdfUntitledCopy = vi.fn()
vi.mock('../../pdf/src/main/pdf-main', () => ({
  createPdfView: (...args: unknown[]) => createPdfView(...args),
  clearPdfDirty: vi.fn(),
  markPdfUntitledCopy: (...args: unknown[]) => markPdfUntitledCopy(...args),
  pdfIsDirty: vi.fn(() => false),
  requestPdfClose: vi.fn(),
}))
vi.mock('../../sheets/src/main/sheets-main', () => ({
  createSheetsView: vi.fn(() => makeFakeView()),
  nudgeQueuedWorkbook: vi.fn(),
  queueWorkbookForView: vi.fn(),
  requestSheetsClose: vi.fn(),
  setActiveSheetsWebContents: vi.fn(),
  setSheetsNewBlank: vi.fn(),
  sheetsPendingEditCount: vi.fn(() => 0),
}))
const createSlidesView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../slides/src/main/slides-main', () => ({
  createSlidesView: (...args: unknown[]) => createSlidesView(...args),
  requestSlidesClose: vi.fn(),
  setActiveSlidesWebContents: vi.fn(),
  slidesIsDirty: vi.fn(() => false),
}))
const createMarkdownView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../markdown/src/main/markdown-main', () => ({
  createMarkdownView: (...args: unknown[]) => createMarkdownView(...args),
  markdownIsDirty: vi.fn(() => false),
  requestMarkdownClose: vi.fn(),
}))
const createHtmlView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../html/src/main/html-main', () => ({
  createHtmlView: (...args: unknown[]) => createHtmlView(...args),
  createHtmlPresentView: vi.fn(() => makeFakeView()),
  htmlIsDirty: vi.fn(() => false),
  requestHtmlClose: vi.fn(),
}))
const createMindmapView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../mindmap/src/main/mindmap-main', () => ({
  createMindmapView: (...args: unknown[]) => createMindmapView(...args),
  mindmapIsDirty: vi.fn(() => false),
  requestMindmapClose: vi.fn(),
}))
const createHwpView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../hwp/src/main/hwp-main', () => ({
  createHwpView: (...args: unknown[]) => createHwpView(...args),
  hwpIsDirty: vi.fn(() => false),
  requestHwpClose: vi.fn(),
}))

const createEpubView = vi.fn((..._args: unknown[]) => makeFakeView())
vi.mock('../../epub/src/main/epub-main', () => ({
  createEpubView: (...args: unknown[]) => createEpubView(...args),
  epubIsDirty: vi.fn(() => false),
  requestEpubClose: vi.fn(),
}))

const queueHtmlSeedFor = vi.fn()
vi.mock('../../html/src/main/seed-main', () => ({
  queueHtmlSeedFor: (...args: unknown[]) => queueHtmlSeedFor(...args),
}))
const queueMarkdownSeedFor = vi.fn()
vi.mock('../../markdown/src/main/seed-main', () => ({
  queueMarkdownSeedFor: (...args: unknown[]) => queueMarkdownSeedFor(...args),
}))
const queueMindmapSeedFor = vi.fn()
vi.mock('../../mindmap/src/main/seed-main', () => ({
  queueMindmapSeedFor: (...args: unknown[]) => queueMindmapSeedFor(...args),
}))
const queueSlidesSeedFor = vi.fn()
vi.mock('../../slides/src/main/seed-queue', () => ({
  queueSlidesSeedFor: (...args: unknown[]) => queueSlidesSeedFor(...args),
}))

import { TabManager } from '../src/main/tab-manager'

function makeShellWindow() {
  return {
    on: vi.fn(),
    webContents: { once: vi.fn(), focus: vi.fn() },
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    getContentBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  }
}

let manager: TabManager
beforeEach(() => {
  vi.clearAllMocks()
  nextWebContentsId = 1
  manager = new TabManager(
    makeShellWindow() as never,
    () => {},
    () => {},
  )
})

const BYTES = new TextEncoder().encode('# Letter\n\nDear ___')
const copy = (
  editor: Parameters<TabManager['openTemplateCopy']>[0]['editor'],
  fileName: string,
) => ({
  editor,
  path: `/tmp/copy/${fileName}`,
  bytes: BYTES,
  fileName,
  title: 'Template preview - Letter',
})

const tabOf = (id: string) => manager.list().find((tab) => tab.id === id)

describe('a template copy opens as a new untitled document', () => {
  it.each([
    ['docs', 'letter.docx', createDocsView],
    ['markdown', 'letter.md', createMarkdownView],
    ['html', 'letter.html', createHtmlView],
    ['mindmap', 'letter.xmind', createMindmapView],
    ['slides', 'letter.pptx', createSlidesView],
  ] as const)('%s: a tab with no file, titled for the copy', (editor, fileName, factory) => {
    const opened = manager.openTemplateCopy(copy(editor, fileName))
    expect(opened).not.toBeNull()
    // the view is made for no file: its first save asks where
    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory.mock.calls[0]?.[0]).toBeUndefined()
    const tab = tabOf(opened!.tabId)
    expect(tab).toMatchObject({ kind: editor, title: 'Template preview - Letter', active: true })
    expect(tab?.filePath).toBeUndefined()
  })

  it('hands each editor the copy in the form it takes', () => {
    const docs = manager.openTemplateCopy(copy('docs', 'letter.docx'))!
    expect(queueDocsCopy).toHaveBeenCalledWith(docs.contents.id, {
      path: '/tmp/copy/letter.docx',
      name: 'letter.docx',
    })
    const md = manager.openTemplateCopy(copy('markdown', 'letter.md'))!
    expect(queueMarkdownSeedFor).toHaveBeenCalledWith(md.contents, '# Letter\n\nDear ___')
    const html = manager.openTemplateCopy(copy('html', 'letter.html'))!
    expect(queueHtmlSeedFor).toHaveBeenCalledWith(html.contents, '# Letter\n\nDear ___')
    const map = manager.openTemplateCopy(copy('mindmap', 'letter.xmind'))!
    expect(queueMindmapSeedFor).toHaveBeenCalledWith(map.contents, { bytes: BYTES })
    const deck = manager.openTemplateCopy(copy('slides', 'letter.pptx'))!
    expect(queueSlidesSeedFor).toHaveBeenCalledWith(deck.contents, BYTES, {
      askPathOnFirstSave: true,
      suggestedName: 'letter.pptx',
    })
  })

  it('hwp: reads the copy but the tab is not that file', () => {
    const opened = manager.openTemplateCopy(copy('hwp', 'letter.hwpx'))!
    expect(createHwpView).toHaveBeenCalledWith('/tmp/copy/letter.hwpx', { untitledCopy: true })
    const tab = tabOf(opened.tabId)
    expect(tab?.filePath).toBeUndefined()
    expect(tab?.title).toBe('Template preview - Letter')
  })

  it('pdf: the copy is marked untitled before its view opens', () => {
    const opened = manager.openTemplateCopy(copy('pdf', 'letter.pdf'))!
    expect(markPdfUntitledCopy).toHaveBeenCalledWith('/tmp/copy/letter.pdf')
    expect(markPdfUntitledCopy.mock.invocationCallOrder[0]!).toBeLessThan(
      createPdfView.mock.invocationCallOrder[0]!,
    )
    expect(tabOf(opened.tabId)?.kind).toBe('pdf')
  })

  it('leaves sheets to the shell', () => {
    expect(manager.openTemplateCopy(copy('sheets', 'grades.xlsx'))).toBeNull()
  })

  it('opens no book: a book has no new, untitled document', () => {
    expect(manager.openTemplateCopy(copy('epub', 'novel.epub'))).toBeNull()
    expect(createEpubView).not.toHaveBeenCalled()
  })

  it('decodes text copies without a leading byte order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('hi')])
    manager.openTemplateCopy({ ...copy('markdown', 'a.md'), bytes: withBom })
    expect(queueMarkdownSeedFor.mock.calls[0]?.[1]).toBe('hi')
  })
})
