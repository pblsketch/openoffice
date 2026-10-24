import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => {
  const realpathSync = ((path?: string) => {
    if (path === undefined) return undefined
    if (path === '/real/file' || path === '/canonical/file' || path === '/REAL/FILE')
      return '/real/file'
    return path
  }) as typeof import('node:fs').realpathSync

  realpathSync.native = ((path?: string) => {
    if (path === undefined) return undefined
    if (path === '/real/file' || path === '/canonical/file' || path === '/REAL/FILE')
      return '/real/file'
    return path
  }) as typeof import('node:fs').realpathSync.native

  return { realpathSync }
})

/**
 * TabManager unloaded tabs (spec 5.3): restored tabs that hold no editor
 * view until they are first activated, then load exactly once.
 * Electron and the per-module main entrypoints are mocked; only the
 * manager's own observable behavior is asserted.
 */

interface FakeWebContents {
  id: number
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  listeners: Map<string, () => void>
  onceListeners: Map<string, () => void>
}

interface FakeView {
  webContents: FakeWebContents
  setVisible: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
}

let nextWebContentsId = 1

function makeFakeView(): FakeView {
  const listeners = new Map<string, () => void>()
  const onceListeners = new Map<string, () => void>()
  return {
    webContents: {
      id: nextWebContentsId++,
      listeners,
      onceListeners,
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler)
      }),
      once: vi.fn((event: string, handler: () => void) => {
        onceListeners.set(event, handler)
      }),
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
  // the manual's view is constructed inline in tab-manager (createHelpView),
  // unlike the editor views which arrive through mocked module factories, so
  // the electron mock itself must construct one. Self-contained: no outside
  // references (vi.mock factories run before the module body). The large id
  // stays clear of makeFakeView's counter.
  WebContentsView: class {
    webContents = {
      id: 900001,
      setWindowOpenHandler: () => ({ action: 'deny' as const }),
      // every URL the manual's view loads, for the help-topic tests
      loadURL: (url: string) => {
        ;(globalThis as { __helpLoads?: string[] }).__helpLoads?.push(url)
        return Promise.resolve()
      },
      focus: () => {},
      on: () => {},
      once: () => {},
      close: () => {},
      reload: () => {},
      isDestroyed: () => false,
    }
    setBounds = () => {}
    setVisible = () => {}
  },
}))

const createDocsView = vi.fn(() => makeFakeView())
const docsQueryDirty = vi.fn(() => Promise.resolve(false))
const markDocsNewBlank = vi.fn()
const requestDocsClose = vi.fn(() => Promise.resolve(true))
const setActiveDocsResolver = vi.fn()
const teardownDocsRenderer = vi.fn()

vi.mock('../../docs/src/main/docs-main', () => ({
  createDocsView: (...args: unknown[]) => createDocsView(...(args as [])),
  docsQueryDirty: (...args: unknown[]) => docsQueryDirty(...(args as [])),
  markDocsNewBlank: (...args: unknown[]) => markDocsNewBlank(...args),
  requestDocsClose: (...args: unknown[]) => requestDocsClose(...(args as [])),
  setActiveDocsResolver: (...args: unknown[]) => setActiveDocsResolver(...args),
  teardownDocsRenderer: (...args: unknown[]) => teardownDocsRenderer(...args),
}))

const releaseClosedRenderer = vi.fn(() => true)

vi.mock('../src/main/renderer-disposal', () => ({
  releaseClosedRenderer: (...args: unknown[]) => releaseClosedRenderer(...(args as [])),
}))

const createPdfView = vi.fn(() => makeFakeView())
const pdfIsDirty = vi.fn(() => false)
const clearPdfDirty = vi.fn()
const requestPdfClose = vi.fn(() => Promise.resolve(true))

vi.mock('../../pdf/src/main/pdf-main', () => ({
  createPdfView: (...args: unknown[]) => createPdfView(...(args as [])),
  pdfIsDirty: (...args: unknown[]) => pdfIsDirty(...(args as [])),
  clearPdfDirty: (...args: unknown[]) => clearPdfDirty(...(args as [])),
  requestPdfClose: (...args: unknown[]) => requestPdfClose(...(args as [])),
}))

const createSheetsView = vi.fn(() => makeFakeView())
const nudgeQueuedWorkbook = vi.fn()
const queueWorkbookForView = vi.fn()
const requestSheetsClose = vi.fn(() => Promise.resolve(true))
const setActiveSheetsWebContents = vi.fn()
const setSheetsNewBlank = vi.fn()
const sheetsPendingEditCount = vi.fn(() => 0)

vi.mock('../../sheets/src/main/sheets-main', () => ({
  createSheetsView: (...args: unknown[]) => createSheetsView(...(args as [])),
  nudgeQueuedWorkbook: (...args: unknown[]) => nudgeQueuedWorkbook(...args),
  queueWorkbookForView: (...args: unknown[]) => queueWorkbookForView(...args),
  requestSheetsClose: (...args: unknown[]) => requestSheetsClose(...(args as [])),
  setActiveSheetsWebContents: (...args: unknown[]) => setActiveSheetsWebContents(...args),
  setSheetsNewBlank: (...args: unknown[]) => setSheetsNewBlank(...args),
  sheetsPendingEditCount: (...args: unknown[]) => sheetsPendingEditCount(...(args as [])),
}))

const createSlidesView = vi.fn(() => makeFakeView())
const requestSlidesClose = vi.fn(() => Promise.resolve(true))
const setActiveSlidesWebContents = vi.fn()
const slidesIsDirty = vi.fn(() => false)

vi.mock('../../slides/src/main/slides-main', () => ({
  createSlidesView: (...args: unknown[]) => createSlidesView(...(args as [])),
  requestSlidesClose: (...args: unknown[]) => requestSlidesClose(...(args as [])),
  setActiveSlidesWebContents: (...args: unknown[]) => setActiveSlidesWebContents(...args),
  slidesIsDirty: (...args: unknown[]) => slidesIsDirty(...(args as [])),
}))

const createMarkdownView = vi.fn(() => makeFakeView())
const markdownIsDirty = vi.fn(() => false)
const requestMarkdownClose = vi.fn(() => Promise.resolve(true))

vi.mock('../../markdown/src/main/markdown-main', () => ({
  createMarkdownView: (...args: unknown[]) => createMarkdownView(...(args as [])),
  markdownIsDirty: (...args: unknown[]) => markdownIsDirty(...(args as [])),
  requestMarkdownClose: (...args: unknown[]) => requestMarkdownClose(...(args as [])),
}))

const createHtmlView = vi.fn(() => makeFakeView())
const createHtmlPresentView = vi.fn(() => makeFakeView())
const htmlIsDirty = vi.fn(() => false)
const requestHtmlClose = vi.fn(() => Promise.resolve(true))

vi.mock('../../html/src/main/html-main', () => ({
  createHtmlView: (...args: unknown[]) => createHtmlView(...(args as [])),
  createHtmlPresentView: (...args: unknown[]) => createHtmlPresentView(...(args as [])),
  htmlIsDirty: (...args: unknown[]) => htmlIsDirty(...(args as [])),
  requestHtmlClose: (...args: unknown[]) => requestHtmlClose(...(args as [])),
}))

const createMindmapView = vi.fn(() => makeFakeView())
const mindmapIsDirty = vi.fn(() => false)
const requestMindmapClose = vi.fn(() => Promise.resolve(true))

vi.mock('../../mindmap/src/main/mindmap-main', () => ({
  createMindmapView: (...args: unknown[]) => createMindmapView(...(args as [])),
  mindmapIsDirty: (...args: unknown[]) => mindmapIsDirty(...(args as [])),
  requestMindmapClose: (...args: unknown[]) => requestMindmapClose(...(args as [])),
}))

const createHwpView = vi.fn(() => makeFakeView())
const hwpIsDirty = vi.fn(() => false)
const requestHwpClose = vi.fn(() => Promise.resolve(true))

vi.mock('../../hwp/src/main/hwp-main', () => ({
  createHwpView: (...args: unknown[]) => createHwpView(...(args as [])),
  hwpIsDirty: (...args: unknown[]) => hwpIsDirty(...(args as [])),
  requestHwpClose: (...args: unknown[]) => requestHwpClose(...(args as [])),
}))

import { createPlainEditorView, TabManager } from '../src/main/tab-manager'
import type { UnloadedTabOpener, UnloadedTabSpec } from '../src/main/tab-manager'

interface FakeShellWindow {
  on: ReturnType<typeof vi.fn>
  webContents: { once: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }
  isDestroyed: ReturnType<typeof vi.fn>
  isFocused: ReturnType<typeof vi.fn>
  getContentBounds: () => { x: number; y: number; width: number; height: number }
  contentView: {
    addChildView: ReturnType<typeof vi.fn>
    removeChildView: ReturnType<typeof vi.fn>
  }
}

function makeShellWindow(): FakeShellWindow {
  return {
    on: vi.fn(),
    webContents: { once: vi.fn(), focus: vi.fn() },
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    getContentBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  }
}

let shellWindow: FakeShellWindow
let onChanged: ReturnType<typeof vi.fn>
let applyMenuFor: ReturnType<typeof vi.fn>
let manager: TabManager

/** an opener whose views are recorded, with an optional readiness promise and needs-user answer */
function makeOpener(options: { ready?: Promise<void>; needsUser?: boolean } = {}): {
  opener: UnloadedTabOpener
  open: ReturnType<typeof vi.fn>
  views: FakeView[]
} {
  const views: FakeView[] = []
  const open = vi.fn((_context: unknown) => {
    const view = makeFakeView()
    views.push(view)
    return options.ready ? { view: view as never, ready: options.ready } : { view: view as never }
  })
  const opener: UnloadedTabOpener = {
    open: (context) => open(context) as never,
    ...(options.needsUser !== undefined ? { needsUser: () => options.needsUser! } : {}),
  }
  return { opener, open, views }
}

function spec(
  kind: UnloadedTabSpec['kind'],
  filePath: string | undefined,
  opener: UnloadedTabOpener,
  title?: string,
): UnloadedTabSpec {
  return { kind, opener, ...(filePath ? { filePath } : {}), ...(title ? { title } : {}) }
}

/** the strip position of a tab */
function indexOf(id: string): number {
  return manager.list().findIndex((t) => t.id === id)
}

function activeId(): string | undefined {
  return manager.list().find((t) => t.active)?.id
}

function lastHwpView(): FakeView {
  return createHwpView.mock.results.at(-1)!.value as FakeView
}

beforeEach(() => {
  vi.clearAllMocks()
  nextWebContentsId = 1
  docsQueryDirty.mockImplementation(() => Promise.resolve(false))
  requestDocsClose.mockImplementation(() => Promise.resolve(true))
  pdfIsDirty.mockImplementation(() => false)
  sheetsPendingEditCount.mockImplementation(() => 0)
  slidesIsDirty.mockImplementation(() => false)
  mindmapIsDirty.mockImplementation(() => false)
  markdownIsDirty.mockImplementation(() => false)
  htmlIsDirty.mockImplementation(() => false)
  hwpIsDirty.mockImplementation(() => false)
  requestMindmapClose.mockImplementation(() => Promise.resolve(true))
  shellWindow = makeShellWindow()
  onChanged = vi.fn()
  applyMenuFor = vi.fn()
  manager = new TabManager(
    shellWindow as never,
    () => onChanged(),
    (kind) => applyMenuFor(kind),
  )
})

describe('adding an unloaded tab', () => {
  it('shows it in the strip with its title, kind and file, without making a view', () => {
    const { opener, open } = makeOpener()
    const id = manager.addUnloadedTab(spec('hwp', '/docs/report.hwp', opener))
    expect(manager.list()).toEqual([
      { id: 'home', kind: 'home', title: 'IeumOffice', closable: false, active: true },
      {
        id,
        kind: 'hwp',
        title: 'report.hwp',
        closable: true,
        active: false,
        filePath: '/docs/report.hwp',
      },
    ])
    expect(open).not.toHaveBeenCalled()
    expect(shellWindow.contentView.addChildView).not.toHaveBeenCalled()
    expect(manager.isTabUnloaded(id)).toBe(true)
    expect(manager.webContentsForTab(id)).toBeUndefined()
    expect(onChanged).toHaveBeenCalled()
  })

  it('keeps an untitled tab untitled under the title it was given', () => {
    const { opener } = makeOpener()
    const id = manager.addUnloadedTab(spec('markdown', undefined, opener, 'Notes'))
    const tab = manager.list().find((t) => t.id === id)
    expect(tab).toMatchObject({ kind: 'markdown', title: 'Notes' })
    expect(tab?.filePath).toBeUndefined()
  })

  it('takes the next tab id like any other tab', () => {
    const first = manager.openDocsTab('/a.docx')
    const { opener } = makeOpener()
    const second = manager.addUnloadedTab(spec('docs', '/b.docx', opener))
    expect(first).toBe('t1')
    expect(second).toBe('t2')
  })
})

describe('before it loads', () => {
  it('stays out of every dirty query and the docs close sweep', () => {
    // every family would call any live view dirty; the unloaded tabs have none
    pdfIsDirty.mockImplementation(() => true)
    sheetsPendingEditCount.mockImplementation(() => 3)
    slidesIsDirty.mockImplementation(() => true)
    mindmapIsDirty.mockImplementation(() => true)
    markdownIsDirty.mockImplementation(() => true)
    htmlIsDirty.mockImplementation(() => true)
    hwpIsDirty.mockImplementation(() => true)
    for (const [kind, path] of [
      ['docs', '/a.docx'],
      ['sheets', '/a.xlsx'],
      ['slides', '/a.pptx'],
      ['pdf', '/a.pdf'],
      ['markdown', '/a.md'],
      ['html', '/a.html'],
      ['mindmap', '/a.xmind'],
      ['hwp', '/a.hwp'],
    ] as const) {
      manager.addUnloadedTab(spec(kind, path, makeOpener().opener))
    }
    expect(manager.dirtySheetsTabs()).toEqual([])
    expect(manager.dirtyPdfTabs()).toEqual([])
    expect(manager.dirtySlidesTabs()).toEqual([])
    expect(manager.dirtyMarkdownTabs()).toEqual([])
    expect(manager.dirtyHtmlTabs()).toEqual([])
    expect(manager.dirtyMindmapTabs()).toEqual([])
    expect(manager.dirtyHwpTabs()).toEqual([])
    expect(manager.docsTabs()).toEqual([])
    expect(manager.slidesTabs()).toEqual([])
    expect(manager.sheetsTabs()).toEqual([])
  })

  it('is no menu or save target', () => {
    manager.addUnloadedTab(spec('hwp', '/a.hwp', makeOpener().opener))
    manager.addUnloadedTab(spec('mindmap', '/a.xmind', makeOpener().opener))
    manager.addUnloadedTab(spec('pdf', '/a.pdf', makeOpener().opener))
    expect(manager.activeHwpTab()).toBeUndefined()
    expect(manager.activeMindmapTab()).toBeUndefined()
    expect(manager.activePdfTab()).toBeUndefined()
    expect(applyMenuFor).not.toHaveBeenCalled()
  })

  it('closes with no prompt, no view and no editor clean-up, leaving the opener uncalled', async () => {
    hwpIsDirty.mockImplementation(() => true)
    const hwp = makeOpener()
    const docs = makeOpener()
    const hwpId = manager.addUnloadedTab(spec('hwp', '/a.hwp', hwp.opener))
    const docsId = manager.addUnloadedTab(spec('docs', '/a.docx', docs.opener))
    await manager.closeTab(hwpId)
    expect(manager.closeTabWithoutPrompt(docsId)).toBe(true)
    expect(manager.list().map((t) => t.id)).toEqual(['home'])
    expect(hwp.open).not.toHaveBeenCalled()
    expect(docs.open).not.toHaveBeenCalled()
    expect(requestHwpClose).not.toHaveBeenCalled()
    expect(docsQueryDirty).not.toHaveBeenCalled()
    expect(requestDocsClose).not.toHaveBeenCalled()
    // the docs teardown is where a closed docs tab drops its recovery copy
    expect(teardownDocsRenderer).not.toHaveBeenCalled()
    expect(releaseClosedRenderer).not.toHaveBeenCalled()
    expect(shellWindow.contentView.removeChildView).not.toHaveBeenCalled()
  })

  it('keeps Home active when a background unloaded tab closes', async () => {
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', makeOpener().opener))
    await manager.closeTab(id)
    expect(activeId()).toBe('home')
  })
})

describe('loading on first activation', () => {
  it('loads exactly once on a click or a keyboard switch, keeping the id and the slot', () => {
    const { opener, open, views } = makeOpener()
    manager.openDocsTab('/first.docx')
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', opener))
    manager.openDocsTab('/last.docx')
    const slot = indexOf(id)

    manager.activateTab(id)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({
      tabId: id,
      kind: 'hwp',
      title: 'a.hwp',
      filePath: '/a.hwp',
    })
    expect(manager.isTabUnloaded(id)).toBe(false)
    expect(indexOf(id)).toBe(slot)
    expect(activeId()).toBe(id)
    expect(manager.webContentsForTab(id)).toBe(views[0]!.webContents)
    expect(shellWindow.contentView.addChildView).toHaveBeenCalledWith(views[0])
    // shown below the tab strip like any tab
    expect(views[0]!.setVisible).toHaveBeenLastCalledWith(true)
    expect(views[0]!.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 40, width: 800, height: 560 })
    expect(applyMenuFor).toHaveBeenLastCalledWith('hwp')

    // away and back (tab strip click, Ctrl+Tab): no second load
    manager.activateTab('home')
    manager.activateTab(id)
    manager.activateTab(id)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('becomes a normal tab once loaded: dirty queries and menu targets see it', () => {
    hwpIsDirty.mockImplementation(() => true)
    const { opener, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', opener))
    manager.activateTab(id)
    expect(manager.dirtyHwpTabs()).toEqual([{ id, webContents: views[0]!.webContents }])
    expect(manager.activeHwpTab()).toEqual({
      id,
      webContents: views[0]!.webContents,
      filePath: '/a.hwp',
    })
  })

  it('installs the fullscreen and pane-focus listeners on the loaded view', () => {
    const { opener, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('slides', '/a.pptx', opener))
    manager.activateTab(id)
    const events = views[0]!.webContents.on.mock.calls.map((c) => c[0])
    expect(events).toEqual(
      expect.arrayContaining(['enter-html-full-screen', 'leave-html-full-screen', 'focus']),
    )
  })

  it('hands the opener the file the tab carries at load time (a rename in between)', () => {
    const { opener, open } = makeOpener()
    const id = manager.addUnloadedTab(spec('docs', '/old.docx', opener))
    manager.renameTabFile('/old.docx', '/new.docx')
    manager.activateTab(id)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/new.docx', title: 'new.docx' }),
    )
  })

  it('leaves the tab unloaded and the window as it was when the opener throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let fail = true
    const view = makeFakeView()
    const open = vi.fn(() => {
      if (fail) throw new Error('boom')
      return { view: view as never }
    })
    const id = manager.addUnloadedTab({ kind: 'hwp', filePath: '/a.hwp', opener: { open } })
    manager.activateTab(id)
    expect(activeId()).toBe('home')
    expect(manager.isTabUnloaded(id)).toBe(true)
    fail = false
    manager.activateTab(id)
    expect(activeId()).toBe(id)
    expect(open).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('a path lookup finds the unloaded tab, and focusing it loads it', () => {
    const { opener, open, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', opener))
    // routeDocumentPath: find by kind, then activate — no second tab for the file
    expect(manager.findHwpTabByPath('/a.hwp')).toBe(id)
    expect(open).not.toHaveBeenCalled()
    manager.activateTab(id)
    expect(open).toHaveBeenCalledTimes(1)
    expect(manager.findTabByPath('/a.hwp')).toEqual({
      id,
      kind: 'hwp',
      webContents: views[0]!.webContents,
    })
  })

  it('every kind finder sees an unloaded tab of its kind', () => {
    const ids = {
      docs: manager.addUnloadedTab(spec('docs', '/x.docx', makeOpener().opener)),
      sheets: manager.addUnloadedTab(spec('sheets', '/x.xlsx', makeOpener().opener)),
      slides: manager.addUnloadedTab(spec('slides', '/x.pptx', makeOpener().opener)),
      pdf: manager.addUnloadedTab(spec('pdf', '/x.pdf', makeOpener().opener)),
      markdown: manager.addUnloadedTab(spec('markdown', '/x.md', makeOpener().opener)),
      html: manager.addUnloadedTab(spec('html', '/x.html', makeOpener().opener)),
      mindmap: manager.addUnloadedTab(spec('mindmap', '/x.xmind', makeOpener().opener)),
    }
    expect(manager.findDocsTabByPath('/x.docx')).toBe(ids.docs)
    expect(manager.findSheetsTabByPath('/x.xlsx')).toBe(ids.sheets)
    expect(manager.findSlidesTabByPath('/x.pptx')).toBe(ids.slides)
    expect(manager.findPdfTabByPath('/x.pdf')).toBe(ids.pdf)
    expect(manager.findMarkdownTabByPath('/x.md')).toBe(ids.markdown)
    expect(manager.findHtmlTabByPath('/x.html')).toBe(ids.html)
    expect(manager.findMindmapTabByPath('/x.xmind')).toBe(ids.mindmap)
  })

  it('findTabByPath (the CLI focusing an open document) loads the tab it returns', () => {
    const { opener, open, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('docs', '/real/file', opener))
    expect(manager.findTabByPath('/canonical/file')).toEqual({
      id,
      kind: 'docs',
      webContents: views[0]!.webContents,
    })
    expect(open).toHaveBeenCalledTimes(1)
    manager.findTabByPath('/real/file')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('detaching an unloaded tab loads it first and hands out the live view', () => {
    const { opener, open, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('markdown', '/a.md', opener))
    expect(manager.canDetachTab(id)).toBe(true)
    const detached = manager.detachTab(id)
    expect(open).toHaveBeenCalledTimes(1)
    expect(detached).toEqual({
      view: views[0],
      kind: 'markdown',
      title: 'a.md',
      filePath: '/a.md',
    })
  })
})

describe('split panes', () => {
  it('beginSplit loads both unloaded panes and nothing else', () => {
    const a = makeOpener()
    const b = makeOpener()
    const other = makeOpener()
    const aId = manager.addUnloadedTab(spec('docs', '/a.docx', a.opener))
    const bId = manager.addUnloadedTab(spec('hwp', '/b.hwp', b.opener))
    manager.addUnloadedTab(spec('pdf', '/c.pdf', other.opener))
    manager.beginSplit(aId, bId, 'horizontal', 0.5, 'b')
    expect(a.open).toHaveBeenCalledTimes(1)
    expect(b.open).toHaveBeenCalledTimes(1)
    expect(other.open).not.toHaveBeenCalled()
    expect(manager.splitState()).toMatchObject({ aTabId: aId, bTabId: bId, focus: 'b' })
    expect(activeId()).toBe(bId)
    expect(a.views[0]!.setVisible).toHaveBeenLastCalledWith(true)
    expect(b.views[0]!.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('an unloaded tab that replaces the focused pane loads first', () => {
    const aId = manager.openDocsTab('/a.docx')
    const bId = manager.openDocsTab('/b.docx')
    manager.beginSplit(aId, bId, 'horizontal', 0.5, 'a')
    const c = makeOpener()
    const cId = manager.addUnloadedTab(spec('hwp', '/c.hwp', c.opener))
    manager.activateTab(cId)
    expect(c.open).toHaveBeenCalledTimes(1)
    expect(manager.splitState()).toMatchObject({ aTabId: cId, bTabId: bId })
    expect(c.views[0]!.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('dragging an unloaded tab to an edge loads it into the new pane', () => {
    const aId = manager.openDocsTab('/a.docx')
    const d = makeOpener()
    const dId = manager.addUnloadedTab(spec('markdown', '/d.md', d.opener))
    manager.activateTab(aId)
    manager.splitWith(dId, { kind: 'create', orientation: 'horizontal' } as never)
    expect(d.open).toHaveBeenCalledTimes(1)
    expect(manager.splitState()).toMatchObject({ aTabId: aId, bTabId: dId, focus: 'b' })
  })

  it('a create drop can pick an unloaded tab as the other pane, and loads it', () => {
    const p = makeOpener()
    const pId = manager.addUnloadedTab(spec('docs', '/p.docx', p.opener))
    const qId = manager.openDocsTab('/q.docx')
    // p stands as the "previous" document without ever having been shown:
    // the split's other pane is the tab shown before the dragged one
    ;(manager as unknown as { previousActiveId: string }).previousActiveId = pId
    manager.splitWith(qId, { kind: 'create', orientation: 'vertical' } as never)
    expect(manager.splitState()).toMatchObject({ aTabId: pId, bTabId: qId })
    expect(p.open).toHaveBeenCalledTimes(1)
  })
})

describe('the open-documents list (@ mention and MCP open_documents)', () => {
  it('lists unloaded tabs with the same fields as loaded ones, clean and inactive', async () => {
    const loadedId = manager.openHwpTab('/loaded.hwp')
    const unloadedId = manager.addUnloadedTab(spec('hwp', '/later.hwp', makeOpener().opener))
    const untitledId = manager.addUnloadedTab(
      spec('markdown', undefined, makeOpener().opener, 'Untitled notes'),
    )
    const docs = await manager.openDocuments()
    expect(docs).toEqual([
      {
        id: loadedId,
        kind: 'hwp',
        title: 'loaded.hwp',
        filePath: '/loaded.hwp',
        active: true,
        dirty: false,
      },
      {
        id: unloadedId,
        kind: 'hwp',
        title: 'later.hwp',
        filePath: '/later.hwp',
        active: false,
        dirty: false,
      },
      { id: untitledId, kind: 'markdown', title: 'Untitled notes', active: false, dirty: false },
    ])
    expect(Object.keys(docs[1]!).sort()).toEqual(Object.keys(docs[0]!).sort())
  })

  it('listing does not load anything', async () => {
    const { opener, open } = makeOpener()
    manager.addUnloadedTab(spec('docs', '/a.docx', opener))
    await manager.openDocuments()
    manager.list()
    manager.openFilePaths()
    expect(open).not.toHaveBeenCalled()
  })

  it('counts an unloaded tab as an open file', () => {
    manager.addUnloadedTab(spec('docs', '/a.docx', makeOpener().opener))
    expect(manager.openFilePaths()).toEqual(['/a.docx'])
  })
})

describe('ensureTabLoaded (MCP / @ targets)', () => {
  it('loads without activating and resolves once the editor reports ready', async () => {
    let markReady!: () => void
    const ready = new Promise<void>((resolve) => {
      markReady = resolve
    })
    const { opener, open, views } = makeOpener({ ready })
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', opener))
    let settled = false
    const pending = manager.ensureTabLoaded(id).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    expect(open).toHaveBeenCalledTimes(1)
    expect(activeId()).toBe('home')
    await Promise.resolve()
    expect(settled).toBe(false)
    markReady()
    expect(await pending).toEqual({ status: 'ready', webContents: views[0]!.webContents })
  })

  it('loads once when several callers ask at the same time', async () => {
    const { opener, open } = makeOpener({ ready: Promise.resolve() })
    const id = manager.addUnloadedTab(spec('docs', '/a.docx', opener))
    const [first, second] = await Promise.all([
      manager.ensureTabLoaded(id),
      manager.ensureTabLoaded(id),
    ])
    expect(open).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    // a later click does not load again either
    manager.activateTab(id)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('answers needs-user without loading when the document waits on the recovery question', async () => {
    const { opener, open } = makeOpener({ needsUser: true })
    const id = manager.addUnloadedTab(spec('hwp', '/a.hwp', opener))
    expect(await manager.ensureTabLoaded(id)).toEqual({ status: 'needs-user' })
    expect(open).not.toHaveBeenCalled()
    expect(manager.isTabUnloaded(id)).toBe(true)
  })

  it('answers needs-user for a clicked tab whose editor still waits on that question', async () => {
    const waiting = new Promise<void>(() => {})
    let asking = true
    const view = makeFakeView()
    const open = vi.fn(() => ({ view: view as never, ready: waiting }))
    const id = manager.addUnloadedTab({
      kind: 'hwp',
      filePath: '/a.hwp',
      opener: { open, needsUser: () => asking },
    })
    manager.activateTab(id)
    expect(await manager.ensureTabLoaded(id)).toEqual({ status: 'needs-user' })
    asking = false
    // once answered, a caller waits for the document as usual (here: never ready)
    let settled = false
    void manager.ensureTabLoaded(id).then(() => {
      settled = true
    })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(settled).toBe(false)
  })

  it('without a readiness promise, waits for the page to finish loading', async () => {
    const { opener, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('markdown', '/a.md', opener))
    let settled = false
    const pending = manager.ensureTabLoaded(id).then((result) => {
      settled = true
      return result
    })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(settled).toBe(false)
    views[0]!.webContents.onceListeners.get('did-finish-load')!()
    expect(await pending).toEqual({ status: 'ready', webContents: views[0]!.webContents })
  })

  it('rejects when the loaded view goes away before it is ready', async () => {
    const { opener, views } = makeOpener()
    const id = manager.addUnloadedTab(spec('markdown', '/a.md', opener))
    const pending = manager.ensureTabLoaded(id)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    views[0]!.webContents.onceListeners.get('destroyed')!()
    await expect(pending).rejects.toThrow(/closed/)
  })

  it('a normally opened tab is ready at once; Home and unknown ids are missing', async () => {
    const id = manager.openDocsTab('/a.docx')
    expect(await manager.ensureTabLoaded(id)).toEqual({
      status: 'ready',
      webContents: manager.webContentsForTab(id),
    })
    expect(await manager.ensureTabLoaded('home')).toEqual({ status: 'missing' })
    expect(await manager.ensureTabLoaded('t99')).toEqual({ status: 'missing' })
  })

  it('a closed unloaded tab is missing', async () => {
    const id = manager.addUnloadedTab(spec('docs', '/a.docx', makeOpener().opener))
    await manager.closeTab(id)
    expect(await manager.ensureTabLoaded(id)).toEqual({ status: 'missing' })
  })
})

describe('hydrateSession (a restored session)', () => {
  it('adds every tab in order and loads nothing without an active tab or split', () => {
    const openers = [makeOpener(), makeOpener(), makeOpener()]
    const ids = manager.hydrateSession({
      tabs: [
        spec('docs', '/a.docx', openers[0]!.opener),
        spec('hwp', '/b.hwp', openers[1]!.opener),
        spec('markdown', undefined, openers[2]!.opener, 'Draft'),
      ],
    })
    expect(manager.list().map((t) => t.id)).toEqual(['home', ...ids])
    expect(manager.list().map((t) => t.title)).toEqual(['IeumOffice', 'a.docx', 'b.hwp', 'Draft'])
    for (const o of openers) expect(o.open).not.toHaveBeenCalled()
    expect(activeId()).toBe('home')
  })

  it('loads and fronts only the chosen active tab', () => {
    const openers = [makeOpener(), makeOpener(), makeOpener()]
    const ids = manager.hydrateSession({
      tabs: openers.map((o, i) => spec('docs', `/${i}.docx`, o.opener)),
      active: 1,
    })
    expect(openers[0]!.open).not.toHaveBeenCalled()
    expect(openers[1]!.open).toHaveBeenCalledTimes(1)
    expect(openers[2]!.open).not.toHaveBeenCalled()
    expect(activeId()).toBe(ids[1])
  })

  it('rebuilds the split from the pair, loading the two panes only', () => {
    const openers = [makeOpener(), makeOpener(), makeOpener(), makeOpener()]
    const ids = manager.hydrateSession({
      tabs: openers.map((o, i) => spec('docs', `/${i}.docx`, o.opener)),
      active: 3,
      split: { a: 3, b: 1, orientation: 'vertical', ratio: 0.4, focus: 'a' },
    })
    expect(openers[0]!.open).not.toHaveBeenCalled()
    expect(openers[1]!.open).toHaveBeenCalledTimes(1)
    expect(openers[2]!.open).not.toHaveBeenCalled()
    expect(openers[3]!.open).toHaveBeenCalledTimes(1)
    expect(manager.splitState()).toMatchObject({
      aTabId: ids[3],
      bTabId: ids[1],
      orientation: 'vertical',
      focus: 'a',
    })
    expect(activeId()).toBe(ids[3])
  })

  it('the active tab picks the focused pane when it is one of the pair', () => {
    const openers = [makeOpener(), makeOpener()]
    const ids = manager.hydrateSession({
      tabs: openers.map((o, i) => spec('docs', `/${i}.docx`, o.opener)),
      active: 1,
      split: { a: 0, b: 1, orientation: 'horizontal', ratio: 0.5, focus: 'a' },
    })
    expect(manager.splitState()?.focus).toBe('b')
    expect(activeId()).toBe(ids[1])
  })

  it('ignores an out-of-range or degenerate split and active index', () => {
    const openers = [makeOpener(), makeOpener()]
    manager.hydrateSession({
      tabs: openers.map((o, i) => spec('docs', `/${i}.docx`, o.opener)),
      active: 7,
      split: { a: 0, b: 0, orientation: 'horizontal', ratio: 0.5, focus: 'a' },
    })
    for (const o of openers) expect(o.open).not.toHaveBeenCalled()
    expect(manager.splitState()).toBeNull()
    expect(activeId()).toBe('home')
  })
})

describe('createPlainEditorView (the plain-open building block for openers)', () => {
  it('makes the same view an open*Tab call makes, without adding a tab', () => {
    const view = createPlainEditorView('hwp', '/a.hwp')
    expect(createHwpView).toHaveBeenCalledWith('/a.hwp', { untitledCopy: false })
    expect(view).toBe(lastHwpView())
    createPlainEditorView('sheets', '/a.xlsx')
    expect(createSheetsView).toHaveBeenCalledWith({
      includeAiHandlers: false,
      openingWorkbook: true,
    })
    expect(queueWorkbookForView).toHaveBeenCalledTimes(1)
    createPlainEditorView('docs', '/a.docx')
    expect(createDocsView).toHaveBeenCalledWith('/a.docx')
    expect(() => createPlainEditorView('pdf')).toThrow()
    expect(manager.list()).toHaveLength(1)
  })
})

describe('sessionTabs (what the session record keeps of the strip)', () => {
  it('lists document tabs in strip order, loaded or not, without Home, the manual or Present tabs', () => {
    manager.openHwpTab('/docs/a.hwp')
    manager.openHelpTab()
    manager.openHtmlPresentTab(makeFakeView().webContents as never, 'Deck')
    const { opener } = makeOpener()
    const unloaded = manager.addUnloadedTab(spec('markdown', undefined, opener, 'Notes'))
    const docs = manager.openDocsTab()

    const state = manager.sessionTabs()
    expect(state.tabs.map(({ id: _id, ...rest }) => rest)).toEqual([
      { kind: 'hwp', title: 'a.hwp', filePath: '/docs/a.hwp' },
      { kind: 'markdown', title: 'Notes' },
      expect.objectContaining({ kind: 'docs' }),
    ])
    expect(state.tabs[1]!.id).toBe(unloaded)
    expect(state.activeId).toBe(docs)
    expect(state.split).toBeNull()
    expect(manager.isTabUnloaded(unloaded)).toBe(true)
  })

  it('reports the live split by tab id', () => {
    const openers = [makeOpener(), makeOpener()]
    const ids = manager.hydrateSession({
      tabs: openers.map((o, i) => spec('docs', `/${i}.docx`, o.opener)),
      active: 0,
      split: { a: 0, b: 1, orientation: 'side', ratio: 0.5, focus: 'a' },
    })
    expect(manager.sessionTabs().split).toMatchObject({ aTabId: ids[0], bTabId: ids[1] })
  })
})
