import { basename, join } from 'node:path'
import { realpathSync } from 'node:fs'
import { BrowserWindow, shell, WebContentsView } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { PRODUCT_NAME } from '@genoffice/i18n'

import {
  createDocsView,
  docsQueryDirty,
  markDocsNewBlank,
  queueDocsAiContent,
  queueDocsCopy,
  requestDocsClose,
  setActiveDocsResolver,
  teardownDocsRenderer,
} from '../../../docs/src/main/docs-main'
import type { AiDocContent } from '../../../docs/src/shared/ipc'
import {
  createMarkdownView,
  markdownIsDirty,
  requestMarkdownClose,
} from '../../../markdown/src/main/markdown-main'
import {
  createHtmlPresentView,
  createHtmlView,
  htmlIsDirty,
  requestHtmlClose,
} from '../../../html/src/main/html-main'
import { queueHtmlSeedFor } from '../../../html/src/main/seed-main'
import { queueMarkdownSeedFor } from '../../../markdown/src/main/seed-main'
import { queueMindmapSeedFor } from '../../../mindmap/src/main/seed-main'
import { queueSlidesSeedFor } from '../../../slides/src/main/seed-queue'
import { createHwpView, hwpIsDirty, requestHwpClose } from '../../../hwp/src/main/hwp-main'
import {
  createExcalidrawView,
  excalidrawIsDirty,
  requestExcalidrawClose,
} from '../../../excalidraw/src/main/excalidraw-main'
import {
  createMindmapView,
  mindmapIsDirty,
  requestMindmapClose,
} from '../../../mindmap/src/main/mindmap-main'
import {
  createPdfView,
  clearPdfDirty,
  markPdfUntitledCopy,
  pdfIsDirty,
  requestPdfClose,
} from '../../../pdf/src/main/pdf-main'
import {
  createSheetsView,
  nudgeQueuedWorkbook,
  queueWorkbookForView,
  requestSheetsClose,
  setActiveSheetsWebContents,
  setSheetsNewBlank,
  sheetsPendingEditCount,
} from '../../../sheets/src/main/sheets-main'
import {
  createSlidesView,
  requestSlidesClose,
  setActiveSlidesWebContents,
  slidesIsDirty,
} from '../../../slides/src/main/slides-main'
import { rendererUrl, safeExternalUrl } from '@genoffice/electron-utils'
import type { DocumentTabKind, OpenDocumentTab, TabKind, TabSummary } from '../shared/tabs-api'
import { TAB_STRIP_HEIGHT } from '../shared/tab-drag-geometry'
import type {
  SplitDropIntent,
  SplitOrientation,
  SplitPaneRole,
  SplitViewState,
} from '../shared/split-view-api'
import {
  activationMode,
  clampSplitRatio,
  oppositeDocumentId,
  paneRects,
  SPLIT_EVEN_RATIO,
  splitSurvivor,
} from './split-layout'
import type { GenerateHandoff } from '../shared/generate-api'
import { dropGenerateHandoff, queueGenerateHandoffFor } from './generate/handoff'
import type { ConvertedDocument } from './generate/convert'
import { queueConvertedContent } from './generate/converted-tab'
import { releaseClosedRenderer } from './renderer-disposal'

/** a tab lifted out of the strip with its live view: what "Open in New Window",
 *  tear-off and dock hand back and forth between the shell and a detached window */
export interface DetachedTab {
  view: WebContentsView
  kind: TabKind
  title: string
  filePath?: string
}

interface TabRecord {
  id: string
  kind: TabKind
  /** null for the Home tab — it's rendered by the shell window's own webContents */
  view: WebContentsView | null
  title: string
  filePath?: string
  /** chrome-free Present tab: no file, no editor menu or save/export targets */
  present?: boolean
}

const HOME_ID = 'home'

/**
 * Owns every open tab (Home + docs + sheets) inside the shell's single
 * BrowserWindow. Docs/sheets tabs are WebContentsView children of that
 * window; only the active one is visible at a time. Home has no view of its
 * own — hiding every other tab reveals the shell window's own content.
 */
export class TabManager {
  private readonly tabs: TabRecord[] = [
    // the tab strip shows the name in the UI language (TabBar.tsx)
    { id: HOME_ID, kind: 'home', view: null, title: PRODUCT_NAME },
  ]
  private activeId: string = HOME_ID
  private nextId = 1
  /** tab whose page entered HTML fullscreen (e.g. slides slideshow) — its view covers the tab strip */
  private htmlFullScreenId: string | null = null
  /** webContents ids whose view must cover the tab strip without HTML fullscreen
   *  (slides show: the window snaps via simpleFullScreen and asks for the bleed
   *  over IPC, since requestFullscreen would animate the native transition) */
  private readonly bleedWcIds = new Set<number>()
  /** tabs mid unsaved-changes prompt, so a second close click doesn't stack dialogs */
  private readonly closingIds = new Set<string>()
  /** views whose HTML-fullscreen listeners are installed: a view that leaves
   *  for a detached window and docks back must not get a second pair */
  private readonly fullScreenTracked = new WeakSet<WebContentsView>()
  /** Sheets renderer mounted ahead of the next open: parsing its bundle and
   *  booting Univer is the bulk of a workbook's open time, and the shell hands
   *  the path over after mount anyway. */
  private spareSheetsView: WebContentsView | null = null
  private spareSheetsTimer: ReturnType<typeof setTimeout> | null = null
  /** live two-pane split of this window (decision 0037); null = one visible document */
  private split: SplitViewState | null = null
  /** the tab shown before the current one: the "other document" a split falls
   *  back to when the dropped tab was itself the visible one */
  private previousActiveId: string | null = null
  /** views whose pane-focus listener is installed (WeakSet: a view can dock
   *  back from a detached window and must not get a second listener pair) */
  private readonly paneFocusTracked = new WeakSet<WebContentsView>()
  /** prompt-time arrangement snapshot: close prompts activate dirty tabs, and
   *  the original split comes back afterwards (spec: 확인이 끝나면 원래 칸
   *  문서를 되돌린다). Nested prompts count down to the outermost snapshot. */
  private promptDepth = 0
  private promptSplitSnapshot: SplitViewState | null = null
  private promptActiveIdSnapshot: string | null = null

  constructor(
    private readonly shellWindow: BrowserWindow,
    private readonly onChanged: () => void,
    private readonly applyMenuFor: (kind: TabKind) => void,
    /** localized placeholder title for a tab that has no file yet */
    private readonly untitledTitleFor?: (kind: TabKind) => string,
    /** fired whenever the split appears, changes or goes away (roles + memory) */
    private readonly onSplitChanged?: (state: SplitViewState | null) => void,
  ) {
    // Layout once synchronously for macOS/Windows (bounds are already correct),
    // then once more on the next tick. On Linux/X11, `resize` fires before the
    // window manager applies the new size, so getContentBounds() is still the
    // pre-maximize size inside the handler and a follow-up layout is required.
    // See genoffice#15
    shellWindow.on('resize', () => {
      this.layout()
      setImmediate(() => this.layout())
    })
  }

  private scheduleSpareSheetsView(delayMs: number): void {
    if (process.env.GENOFFICE_NO_SPARE_VIEW || this.spareSheetsTimer || this.spareSheetsView) return
    // a spare sheets view belongs to the single-pane shell; it must never
    // shadow a pane while a split is live
    if (this.split) return
    if (this.tabs.find((t) => t.id === this.activeId)?.kind !== 'sheets') return
    this.spareSheetsTimer = setTimeout(() => {
      this.spareSheetsTimer = null
      if (this.spareSheetsView || this.shellWindow.isDestroyed() || this.split) return
      const active = this.tabs.find((t) => t.id === this.activeId)
      if (active?.kind !== 'sheets') return
      const view = createSheetsView({ includeAiHandlers: false })
      // registering the session made the spare the menu-action target
      setActiveSheetsWebContents(active.view?.webContents ?? null)
      this.shellWindow.contentView.addChildView(view)
      view.setVisible(false)
      view.setBounds(this.contentBounds())
      view.webContents.once('render-process-gone', () => {
        if (this.spareSheetsView !== view) return
        this.spareSheetsView = null
        view.webContents.close()
      })
      this.spareSheetsView = view
    }, delayMs)
  }

  private takeSpareSheetsView(): WebContentsView | null {
    const view = this.spareSheetsView
    this.spareSheetsView = null
    return view && !view.webContents.isDestroyed() ? view : null
  }

  private discardSpareSheetsView(): void {
    if (this.spareSheetsTimer) clearTimeout(this.spareSheetsTimer)
    this.spareSheetsTimer = null
    const spare = this.spareSheetsView
    this.spareSheetsView = null
    if (!spare) return
    this.shellWindow.contentView.removeChildView(spare)
    spare.webContents.close()
  }

  private untitled(kind: TabKind, fallback: string): string {
    return this.untitledTitleFor?.(kind) ?? fallback
  }

  /** the shell window's own content size — what a covering view fills */
  private windowRect(): Rectangle {
    const { width, height } = this.shellWindow.getContentBounds()
    return { x: 0, y: 0, width, height }
  }

  /** the layout space normal tab views live in: the window below the strip */
  private contentBounds(): Rectangle {
    const { width, height } = this.shellWindow.getContentBounds()
    return { x: 0, y: TAB_STRIP_HEIGHT, width, height: Math.max(0, height - TAB_STRIP_HEIGHT) }
  }

  /** the tab whose view covers the whole window right now (HTML fullscreen / slides show) */
  private coverTabId(): string | null {
    if (this.htmlFullScreenId !== null) return this.htmlFullScreenId
    const active = this.tabs.find((t) => t.id === this.activeId)
    if (active?.view && this.bleedWcIds.has(active.view.webContents.id)) return this.activeId
    return null
  }

  private tabById(id: string): TabRecord | undefined {
    return this.tabs.find((t) => t.id === id)
  }

  /** Grow/restore a tab view over the tab strip on request (slides show fullscreen) */
  setContentBleed(wc: WebContents, on: boolean): void {
    if (on) this.bleedWcIds.add(wc.id)
    else this.bleedWcIds.delete(wc.id)
    this.layout()
  }

  /**
   * When a tab's page enters HTML fullscreen (the slides slideshow calls requestFullscreen),
   * grow its view over the tab strip so nothing of the shell chrome shows;
   * restore the normal bounds on leave.
   */
  private trackHtmlFullScreen(view: WebContentsView): void {
    if (this.fullScreenTracked.has(view)) return
    this.fullScreenTracked.add(view)
    // resolved at event time: the same view gets a fresh id every time it docks
    const currentId = () => this.tabs.find((t) => t.view === view)?.id
    view.webContents.on('enter-html-full-screen', () => {
      const id = currentId()
      if (id === undefined) return
      this.htmlFullScreenId = id
      this.layout()
    })
    view.webContents.on('leave-html-full-screen', () => {
      const id = currentId()
      if (id !== undefined && this.htmlFullScreenId === id) this.htmlFullScreenId = null
      this.layout()
    })
  }

  /**
   * Note pointer focus on a pane view so the "focused pane" follows clicks.
   * The renderer-side fallback ping reaches the same state through
   * focusPaneByWebContents, so this listener being silent on some Electron
   * builds (no focus events for WebContentsView) is survivable.
   */
  private trackPaneFocus(view: WebContentsView): void {
    if (this.paneFocusTracked.has(view)) return
    this.paneFocusTracked.add(view)
    view.webContents.on('focus', () => {
      const tab = this.tabs.find((t) => t.view === view)
      const split = this.split
      if (!tab || !split) return
      if (tab.id === split.aTabId) this.focusPane('a')
      else if (tab.id === split.bTabId) this.focusPane('b')
    })
  }

  /**
   * Re-fit every visible view after a window resize, an activation or a split
   * change: a covering view (fullscreen / slides show) fills the window, a
   * focused pane shows both panes at their computed rectangles, and anything
   * else shows the single active tab below the strip.
   */
  layout(): void {
    // Deferred resize layouts can land after the shell window was closed.
    if (this.shellWindow.isDestroyed()) return
    // pane references can go stale while a close prompt is settling; drop them
    if (
      this.split &&
      (!this.tabById(this.split.aTabId)?.view || !this.tabById(this.split.bTabId)?.view)
    ) {
      this.split = null
    }
    const cover = this.coverTabId()
    if (cover !== null) {
      for (const t of this.tabs) t.view?.setVisible(t.id === cover)
      this.tabById(cover)?.view?.setBounds(this.windowRect())
      return
    }
    const split = this.split
    if (split && (this.activeId === split.aTabId || this.activeId === split.bTabId)) {
      for (const t of this.tabs) {
        t.view?.setVisible(t.id === split.aTabId || t.id === split.bTabId)
      }
      const rects = paneRects(this.contentBounds(), split.orientation, split.ratio)
      this.tabById(split.aTabId)?.view?.setBounds(rects.a)
      this.tabById(split.bTabId)?.view?.setBounds(rects.b)
      return
    }
    for (const t of this.tabs) t.view?.setVisible(t.id === this.activeId)
    this.tabById(this.activeId)?.view?.setBounds(this.contentBounds())
  }

  /** files open in any tab, for the open-documents registry */
  openFilePaths(): string[] {
    return this.tabs.flatMap((t) => (t.filePath ? [t.filePath] : []))
  }

  list(): TabSummary[] {
    return this.tabs.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      closable: t.id !== HOME_ID,
      active: t.id === this.activeId,
      ...(t.filePath ? { filePath: t.filePath } : {}),
    }))
  }

  /**
   * Documents an MCP agent may act on: every editor tab except Home (no file)
   * and chrome-free Present tabs (a live preview of another tab's document, so
   * acting on it would double-count that document).
   *
   * Dirtiness is resolved here per family because it is not uniform — five
   * families answer synchronously in the main process, docs has to ask its
   * renderer. Hence the async signature.
   */
  async openDocuments(): Promise<OpenDocumentTab[]> {
    const tabs = this.tabs.filter((tab) => tab.kind !== 'home' && !tab.present && tab.view)
    return Promise.all(
      tabs.map(async (tab) => ({
        id: tab.id,
        kind: tab.kind as DocumentTabKind,
        title: tab.title,
        ...(tab.filePath ? { filePath: tab.filePath } : {}),
        active: tab.id === this.activeId,
        dirty: await this.tabIsDirty(tab),
      })),
    )
  }

  /** unsaved-changes state of one tab, whichever family owns it */
  private async tabIsDirty(tab: TabRecord): Promise<boolean> {
    const wc = tab.view?.webContents
    if (!wc || wc.isDestroyed()) return false
    switch (tab.kind) {
      case 'sheets':
        return sheetsPendingEditCount(wc.id) > 0
      case 'pdf':
        return pdfIsDirty(wc.id)
      case 'markdown':
        return markdownIsDirty(wc.id)
      case 'html':
        return htmlIsDirty(wc.id)
      case 'hwp':
        return hwpIsDirty(wc.id)
      case 'slides':
        return slidesIsDirty(wc.id)
      case 'docs':
        return docsQueryDirty(wc)
      case 'mindmap':
        return mindmapIsDirty(wc.id)
      case 'excalidraw':
        return excalidrawIsDirty(wc.id)
      default:
        return false
    }
  }

  openHomeTab(): void {
    this.activateTab(HOME_ID)
  }

  /** The in-app user manual (issue #1520): a closable tab showing the shell
      renderer's help mode — the same bundle, branched on ?mode=help, so no
      second renderer build is needed. `topic` opens the manual at that topic
      (a help link next to a setting); without one the manual opens as F1 does. */
  openHelpTab(topic?: string): string {
    const wanted = helpTopicParam(topic)
    // F1 again, or the Help menu while the manual is already open, focuses it
    // instead of stacking a second copy: the tab is closable (only Home is
    // not), so "press F1 again" is an ordinary thing to do
    const existing = this.tabs.find((t) => t.kind === 'help')
    if (existing) {
      // a link to one topic has to land on it even when the manual was open
      // on another; reloading at the topic is the whole navigation
      if (wanted && existing.view) void existing.view.webContents.loadURL(helpViewUrl(wanted))
      this.activateTab(existing.id)
      return existing.id
    }
    const view = createHelpView(wanted)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.tabs.push({ id, kind: 'help', view, title: this.untitled('help', `${PRODUCT_NAME} Help`) })
    this.activateTab(id)
    return id
  }

  openDocsTab(
    openPath?: string,
    options?: { newBlank?: boolean; aiContent?: AiDocContent },
  ): string {
    const view = createDocsView(openPath)
    const id = `t${this.nextId++}`
    if (options?.newBlank) markDocsNewBlank(view.webContents.id)
    if (options?.aiContent) queueDocsAiContent(view.webContents.id, options.aiContent)
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'docs',
      view,
      title: openPath ? basename(openPath) : this.untitled('docs', `${PRODUCT_NAME} Docs`),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  openSheetsTab(openPath?: string, options?: { newBlank?: boolean }): string {
    if (options?.newBlank) setSheetsNewBlank()
    const spare = this.takeSpareSheetsView()
    const view =
      spare ?? createSheetsView({ includeAiHandlers: false, openingWorkbook: Boolean(openPath) })
    // bind the path to this tab's webContents: a multi-select Open creates
    // several sheets tabs in one loop, so a single global path would be
    // overwritten before the earlier tabs consume it
    if (openPath) {
      queueWorkbookForView(view.webContents, openPath)
      if (spare) nudgeQueuedWorkbook(view.webContents)
    }
    const id = `t${this.nextId++}`
    if (!spare) {
      this.shellWindow.contentView.addChildView(view)
      view.setVisible(false)
    }
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'sheets',
      view,
      title: openPath ? basename(openPath) : this.untitled('sheets', 'AI Sheets'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  openSlidesTab(openPath?: string): string {
    const view = createSlidesView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'slides',
      view,
      title: openPath ? basename(openPath) : this.untitled('slides', 'AI Slides'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  openPdfTab(openPath: string): string {
    const view = createPdfView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({ id, kind: 'pdf', view, title: basename(openPath), filePath: openPath })
    this.activateTab(id)
    return id
  }

  /** Remount the tab's renderer so it re-reads its file from disk (View > Reload). */
  reloadTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    const wc = tab?.view?.webContents
    if (!wc || wc.isDestroyed()) return
    if (tab.kind === 'pdf') clearPdfDirty(wc.id)
    wc.reload()
  }

  openMarkdownTab(openPath?: string): string {
    const view = createMarkdownView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'markdown',
      view,
      title: openPath ? basename(openPath) : this.untitled('markdown', 'AI Markdown'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  openHtmlTab(openPath?: string): string {
    const view = createHtmlView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'html',
      view,
      title: openPath ? basename(openPath) : this.untitled('html', 'AI HTML'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  openMindmapTab(openPath?: string): string {
    const view = createMindmapView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'mindmap',
      view,
      title: openPath ? basename(openPath) : this.untitled('mindmap', 'Mind Map'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  /** Opens a drawing (an Obsidian note or a .excalidraw file), or with no path a new drawing note */
  openExcalidrawTab(openPath?: string): string {
    const view = createExcalidrawView(openPath)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'excalidraw',
      view,
      title: openPath ? basename(openPath) : this.untitled('excalidraw', 'Drawing'),
      filePath: openPath,
    })
    this.activateTab(id)
    return id
  }

  /**
   * The generate window's "make": a new untitled tab of the target kind, with
   * the request queued for that tab's webContents to take once. The view is
   * created and the request queued in the same tick, before its renderer can
   * ask; a tab that closes first drops the request.
   */
  openGenerateTargetTab(handoff: GenerateHandoff): string {
    const id =
      handoff.target === 'slides'
        ? this.openSlidesTab()
        : handoff.target === 'html'
          ? this.openHtmlTab()
          : this.openMindmapTab()
    const contents = this.webContentsForTab(id)
    if (!contents) throw new Error('the new tab could not be opened')
    queueGenerateHandoffFor(contents, handoff)
    return id
  }

  /**
   * The generate window's "make" for a conversion without AI (8.6): a new
   * untitled tab of the result's editor, with the content queued for that
   * tab's webContents (taken once, as a new unsaved document) in the same
   * tick, and the conversion recorded. A tab that closes first drops it.
   */
  openConversionResult(doc: ConvertedDocument): string {
    const target = doc.content.target
    const id =
      target === 'markdown'
        ? this.openMarkdownTab()
        : target === 'slides'
          ? this.openSlidesTab()
          : this.openMindmapTab()
    const contents = this.webContentsForTab(id)
    if (!contents) throw new Error('the new tab could not be opened')
    queueConvertedContent(contents, doc)
    return id
  }

  /** Opens an HWP/HWPX file, or with no path a new blank document that has no file until it is saved */
  openHwpTab(openPath?: string, options?: { untitledCopy?: { title: string } }): string {
    const copy = options?.untitledCopy
    const view = createHwpView(openPath, { untitledCopy: !!copy })
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'hwp',
      view,
      // an untitled copy reads a temp file but is not that file
      title: copy ? copy.title : openPath ? basename(openPath) : this.untitled('hwp', 'HWP'),
      filePath: copy ? undefined : openPath,
    })
    this.activateTab(id)
    return id
  }

  /**
   * A skill template's copy (spec 5.7) as a NEW, UNTITLED document of its
   * editor, in a new tab: the copy's bytes go to the editor in the same tick
   * as the view is made, the tab shows `title`, and the first save asks where.
   * Sheets is opened by the shell itself (its backing workbook needs the new
   * file folder); null for it here and when the tab could not be made.
   */
  openTemplateCopy(copy: {
    editor: 'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown' | 'html' | 'mindmap' | 'hwp'
    path: string
    bytes: Uint8Array
    fileName: string
    title: string
  }): { tabId: string; contents: WebContents } | null {
    let id: string
    switch (copy.editor) {
      case 'docs':
        id = this.openDocsTab()
        break
      case 'markdown':
        id = this.openMarkdownTab()
        break
      case 'html':
        id = this.openHtmlTab()
        break
      case 'mindmap':
        id = this.openMindmapTab()
        break
      case 'slides':
        id = this.openSlidesTab()
        break
      case 'hwp':
        id = this.openHwpTab(copy.path, { untitledCopy: { title: copy.title } })
        break
      case 'pdf':
        markPdfUntitledCopy(copy.path)
        id = this.openPdfTab(copy.path)
        break
      default:
        return null
    }
    const contents = this.webContentsForTab(id)
    if (!contents) return null
    // the decoder drops a leading byte order mark
    const text = () => new TextDecoder('utf-8').decode(copy.bytes)
    if (copy.editor === 'docs') queueDocsCopy(contents.id, { path: copy.path, name: copy.fileName })
    else if (copy.editor === 'markdown') queueMarkdownSeedFor(contents, text())
    else if (copy.editor === 'html') queueHtmlSeedFor(contents, text())
    else if (copy.editor === 'mindmap') queueMindmapSeedFor(contents, { bytes: copy.bytes })
    else if (copy.editor === 'slides') {
      queueSlidesSeedFor(contents, copy.bytes, {
        askPathOnFirstSave: true,
        suggestedName: copy.fileName,
      })
    }
    // a tab without a file takes the copy's title (one with the copy's path shows its name)
    this.setTabTitleFor(contents.id, copy.title)
    return { tabId: id, contents }
  }

  /** Present → New tab: a chrome-free html tab showing the owner tab's live preview */
  openHtmlPresentTab(owner: WebContents, title: string): string {
    const view = createHtmlPresentView(owner, title)
    const id = `t${this.nextId++}`
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    this.tabs.push({
      id,
      kind: 'html',
      view,
      title: title || this.untitled('html', 'AI HTML'),
      present: true,
    })
    this.activateTab(id)
    return id
  }

  activateTab(id: string): void {
    const target = this.tabs.find((t) => t.id === id)
    if (!target) return
    const previous = this.activeId
    if (this.split) {
      const mode = activationMode(this.split, {
        id: target.id,
        kind: target.kind,
        present: target.present,
      })
      if (mode === 'replace-pane') {
        // a strip document tab takes over the focused pane; the replaced
        // document stays open in the strip
        const side = this.split.focus
        this.split = side === 'a' ? { ...this.split, aTabId: id } : { ...this.split, bTabId: id }
        if (previous !== id) this.previousActiveId = previous
        this.activeId = id
        this.layout()
        this.refreshActiveTargets()
        this.focusActiveView()
        this.onChanged()
        this.notifySplitChanged()
        return
      }
      if (mode === 'pane') {
        const side = id === this.split.aTabId ? 'a' : 'b'
        if (this.split.focus !== side) {
          this.split = { ...this.split, focus: side }
          this.notifySplitChanged()
        }
      }
    }
    if (previous !== id) this.previousActiveId = previous
    this.activeId = id
    if (target.kind === 'sheets' && !this.split) this.scheduleSpareSheetsView(3000)
    else this.discardSpareSheetsView()
    this.layout()
    this.refreshActiveTargets()
    this.focusActiveView()
    this.onChanged()
  }

  /** Hand keyboard focus to the active tab's view. The click that opened or
   *  switched a tab lands on the chrome webContents (tab strip, Home list),
   *  and a WebContentsView made visible does not take focus on its own — so
   *  without this, typing after every open/switch keeps going to a hidden
   *  view. Home has no view of its own; the shell window's webContents is
   *  the focus target there. Skipped while the window is unfocused
   *  (background opens must not steal OS focus); the window's `focus`
   *  handler re-runs it. */
  focusActiveView(): void {
    if (this.shellWindow.isDestroyed() || !this.shellWindow.isFocused()) return
    const target = this.tabs.find((t) => t.id === this.activeId)
    if (!target) return
    if (target.view) target.view.webContents.focus()
    else this.shellWindow.webContents.focus()
  }

  /** Re-point the process-global active-editor targets and the app menu at this
   *  window's active tab. Called on every activation and on shell-window focus:
   *  a detached editor window ("Open in New Window") claims the same globals
   *  while it is focused. */
  refreshActiveTargets(): void {
    const target = this.tabs.find((t) => t.id === this.activeId)
    if (!target) return
    setActiveDocsResolver(target.kind === 'docs' ? () => target.view!.webContents : () => null)
    if (target.kind === 'sheets' && target.view) setActiveSheetsWebContents(target.view.webContents)
    if (target.kind === 'slides' && target.view) setActiveSlidesWebContents(target.view.webContents)
    this.applyMenuFor(target.present ? 'home' : target.kind)
  }

  // ---- two-pane split (decision 0037) ----

  private notifySplitChanged(): void {
    this.onSplitChanged?.(this.split ? { ...this.split } : null)
  }

  /** the live split (copy) or null */
  splitState(): SplitViewState | null {
    return this.split ? { ...this.split } : null
  }

  /** which pane role the given view plays right now (null = not a pane view) */
  splitRoleOf(webContentsId: number): SplitPaneRole | null {
    const split = this.split
    if (!split) return null
    const tab = this.tabs.find((t) => t.view?.webContents.id === webContentsId)
    if (!tab) return null
    if (tab.id === split.aTabId) return split.focus === 'a' ? 'focus' : 'secondary'
    if (tab.id === split.bTabId) return split.focus === 'b' ? 'focus' : 'secondary'
    return null
  }

  isPaneTab(tabId: string): boolean {
    return !!this.split && (tabId === this.split.aTabId || tabId === this.split.bTabId)
  }

  /**
   * Make the given pane the focused one without stealing keyboard focus: the
   * click or the focus event already happened (or the rail click asked for it),
   * so this only re-points state, menus and roles.
   */
  private focusPane(side: 'a' | 'b'): void {
    const split = this.split
    if (!split || split.focus === side) return
    const id = side === 'a' ? split.aTabId : split.bTabId
    this.split = { ...split, focus: side }
    if (this.tabs.some((t) => t.id === id)) {
      if (this.activeId !== id) this.previousActiveId = this.activeId
      this.activeId = id
    }
    this.layout()
    this.refreshActiveTargets()
    this.onChanged()
    this.notifySplitChanged()
  }

  /** focus the pane showing this view's document (focus events and the renderer ping) */
  focusPaneByWebContents(webContentsId: number): void {
    const split = this.split
    if (!split) return
    const tab = this.tabs.find((t) => t.view?.webContents.id === webContentsId)
    if (!tab) return
    if (tab.id === split.aTabId) this.focusPane('a')
    else if (tab.id === split.bTabId) this.focusPane('b')
  }

  /** the pane whose document is this tab's document (same tab or same file) */
  private paneOfDocument(tab: TabRecord): 'a' | 'b' | null {
    const split = this.split
    if (!split) return null
    const wanted = canonicalPath(tab.filePath)
    for (const side of ['a', 'b'] as const) {
      const pane = this.tabById(side === 'a' ? split.aTabId : split.bTabId)
      if (!pane) continue
      if (pane.id === tab.id) return side
      if (wanted !== undefined && canonicalPath(pane.filePath) === wanted) return side
    }
    return null
  }

  /** the last shown document tab other than the excluded one ("직전에 보던 문서") */
  private previousDocumentTab(excludeId: string): string | null {
    return oppositeDocumentId({
      activeId: this.activeId,
      previousActiveId: this.previousActiveId,
      excludeId,
      tabs: this.tabs.map((t) => ({
        id: t.id,
        kind: t.kind,
        present: t.present,
        hasView: t.view !== null,
      })),
    })
  }

  /** install a split state and make one of its tabs active (clamps the ratio) */
  private setSplit(next: SplitViewState, activeTabId?: string): void {
    const bounded =
      next.ratio > 0 && next.ratio < 1
        ? { ...next, ratio: clampSplitRatio(next.ratio, this.contentBounds(), next.orientation) }
        : next
    this.split = bounded
    if (activeTabId !== undefined && this.tabs.some((t) => t.id === activeTabId)) {
      if (this.activeId !== activeTabId) this.previousActiveId = this.activeId
      this.activeId = activeTabId
    }
    this.layout()
    this.refreshActiveTargets()
    this.focusActiveView()
    this.onChanged()
    this.notifySplitChanged()
  }

  /**
   * Apply a drop intent decided by split-layout.decideSplitDrop — the drag
   * rules live there, this only realizes the outcome. A null intent means the
   * caller keeps the existing tear-off / dock flow.
   */
  splitWith(tabId: string, intent: SplitDropIntent | null): void {
    if (!intent) return
    const tab = this.tabById(tabId)
    if (!tab || !tab.view || tab.present) return
    switch (intent.kind) {
      case 'noop':
        return
      case 'create': {
        let aTabId = this.previousDocumentTab(tabId)
        if (aTabId === null) {
          aTabId = this.openDuplicatePaneTab(tabId)
          if (aTabId === null) return
        }
        this.setSplit(
          {
            aTabId,
            bTabId: tabId,
            orientation: intent.orientation,
            ratio: SPLIT_EVEN_RATIO,
            focus: 'b',
          },
          tabId,
        )
        return
      }
      case 'replace': {
        if (!this.split) return
        // the dropped side becomes the focused pane, like create/reorient:
        // activeId must stay the focused pane's tab (menus, roles, MCP list)
        this.setSplit({ ...this.split, bTabId: tabId, focus: 'b' }, tabId)
        return
      }
      case 'reorient': {
        const split = this.split
        if (!split) return
        const focusedTabId = split.focus === 'a' ? split.aTabId : split.bTabId
        this.setSplit(
          {
            aTabId: focusedTabId,
            bTabId: tabId,
            orientation: intent.orientation,
            ratio: split.ratio,
            focus: 'b',
          },
          tabId,
        )
        return
      }
      case 'flip': {
        if (!this.split) return
        // setSplit re-clamps the ratio for the new axis (a flip can make the
        // old share violate the minimum on the other orientation)
        this.setSplit({ ...this.split, orientation: intent.orientation })
        return
      }
      case 'focus': {
        const side = this.paneOfDocument(tab)
        if (side !== null) this.focusPane(side)
        return
      }
    }
  }

  /**
   * Rebuild a remembered split at launch (the wiring reads split-memory and
   * opens both tabs first). Rejects tabs that cannot be panes.
   */
  beginSplit(
    aTabId: string,
    bTabId: string,
    orientation: SplitOrientation,
    ratio: number,
    focus: 'a' | 'b',
  ): void {
    if (aTabId === bTabId) return
    const a = this.tabById(aTabId)
    const b = this.tabById(bTabId)
    if (!a?.view || !b?.view || a.present || b.present) return
    if (a.kind === 'home' || a.kind === 'help' || b.kind === 'home' || b.kind === 'help') return
    const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : SPLIT_EVEN_RATIO
    this.setSplit(
      { aTabId, bTabId, orientation, ratio: safeRatio, focus },
      focus === 'a' ? aTabId : bTabId,
    )
  }

  /**
   * Divider drags: an in-between share resizes the panes; 0 closes the first
   * pane and 1 closes the second (the surviving document fills the window).
   */
  setSplitRatio(ratio: number): void {
    if (!this.split || !Number.isFinite(ratio)) return
    if (ratio <= 0) {
      this.unsplitKeeping('b')
      return
    }
    if (ratio >= 1) {
      this.unsplitKeeping('a')
      return
    }
    const bounded = clampSplitRatio(ratio, this.contentBounds(), this.split.orientation)
    if (bounded === this.split.ratio) return
    this.split = { ...this.split, ratio: bounded }
    this.layout()
    this.notifySplitChanged()
  }

  /** drop the split; the focused pane's document becomes the single visible tab */
  unsplit(): void {
    if (!this.split) return
    this.unsplitKeeping(this.split.focus)
  }

  private unsplitKeeping(side: 'a' | 'b'): void {
    const split = this.split
    if (!split) return
    const keepId = side === 'a' ? split.aTabId : split.bTabId
    this.split = null
    if (this.tabs.some((t) => t.id === keepId)) this.activateTab(keepId)
    else {
      this.layout()
      this.onChanged()
    }
    this.notifySplitChanged()
  }

  /**
   * Open a second view of the same document for the same-document split: a
   * fresh tab for the same path, or a blank tab of the same kind when the
   * document has no file yet. Bypasses the single-instance open rule on
   * purpose (this is the one path allowed to duplicate a document). Returns
   * the new tab id, or null for a kind that cannot be duplicated.
   */
  openDuplicatePaneTab(tabId: string): string | null {
    const tab = this.tabById(tabId)
    if (!tab || !tab.view || tab.present) return null
    const path = tab.filePath
    switch (tab.kind) {
      case 'docs':
        return this.openDocsTab(path, path ? undefined : { newBlank: true })
      case 'sheets':
        return this.openSheetsTab(path, path ? undefined : { newBlank: true })
      case 'slides':
        return this.openSlidesTab(path)
      case 'pdf':
        return path ? this.openPdfTab(path) : null
      case 'markdown':
        return this.openMarkdownTab(path)
      case 'html':
        return this.openHtmlTab(path)
      case 'mindmap':
        return this.openMindmapTab(path)
      case 'hwp':
        return this.openHwpTab(path)
      case 'excalidraw':
        return this.openExcalidrawTab(path)
      default:
        return null
    }
  }

  /**
   * Snapshot the arrangement around a prompt that may activate dirty tabs
   * (tab close, window close). endExclusivePrompt puts it back exactly as it
   * was before the outermost begin — cancel or proceed alike, because the
   * temporarily shown tab was never a real pane member.
   */
  beginExclusivePrompt(): void {
    if (this.promptDepth === 0) {
      // only a live split needs restoring: without one the existing behavior
      // stands (the prompt's tab stays active after a cancel)
      if (this.split) {
        this.promptSplitSnapshot = { ...this.split }
        this.promptActiveIdSnapshot = this.activeId
      } else {
        this.promptSplitSnapshot = null
        this.promptActiveIdSnapshot = null
      }
    }
    this.promptDepth++
  }

  endExclusivePrompt(): void {
    if (this.promptDepth === 0) return
    this.promptDepth--
    if (this.promptDepth > 0) return
    const split = this.promptSplitSnapshot
    const activeId = this.promptActiveIdSnapshot
    this.promptSplitSnapshot = null
    this.promptActiveIdSnapshot = null
    if (activeId === null) return
    const same =
      this.split === split ||
      (this.split !== null &&
        split !== null &&
        this.split.aTabId === split.aTabId &&
        this.split.bTabId === split.bTabId &&
        this.split.orientation === split.orientation &&
        this.split.ratio === split.ratio &&
        this.split.focus === split.focus)
    if (same && this.activeId === activeId) return
    this.split = split
    if (this.tabs.some((t) => t.id === activeId)) this.activeId = activeId
    this.layout()
    this.refreshActiveTargets()
    this.focusActiveView()
    this.onChanged()
    this.notifySplitChanged()
  }

  /** move a tab to a new index in the strip; Home is pinned at index 0 */
  reorderTab(id: string, toIndex: number): void {
    if (id === HOME_ID) return
    const fromIndex = this.tabs.findIndex((t) => t.id === id)
    if (fromIndex < 0) return
    const clamped = Math.min(Math.max(Math.trunc(toIndex), 1), this.tabs.length - 1)
    if (clamped === fromIndex) return
    const [moved] = this.tabs.splice(fromIndex, 1)
    this.tabs.splice(clamped, 0, moved)
    this.onChanged()
  }

  /** kind, title and file of the document tab rendered by `webContentsId` (Home has no view) */
  describeWebContents(
    webContentsId: number,
  ): { kind: TabKind; title: string; filePath?: string } | null {
    const tab = this.tabs.find((t) => t.view?.webContents.id === webContentsId)
    if (!tab) return null
    return { kind: tab.kind, title: tab.title, ...(tab.filePath ? { filePath: tab.filePath } : {}) }
  }

  tabIdForWebContents(webContentsId: number): string | undefined {
    return this.tabs.find((t) => t.view?.webContents.id === webContentsId)?.id
  }

  /** a module opened a file inside an existing tab (⌘O / queued path) — sync title + dedupe path */
  setTabFileFor(webContentsId: number, filePath: string): void {
    const tab = this.tabs.find((t) => t.view?.webContents.id === webContentsId)
    if (!tab) return
    tab.filePath = filePath
    tab.title = basename(filePath)
    this.onChanged()
  }

  /** an untitled document named itself before its first save (html: from the first AI request) */
  setTabTitleFor(webContentsId: number, title: string): void {
    const tab = this.tabs.find((t) => t.view?.webContents.id === webContentsId)
    if (!tab || tab.filePath || tab.title === title) return
    tab.title = title
    this.onChanged()
  }

  /** a file was renamed on disk (rename from the Home list) — sync any open tab's title/path;
   *  returns the affected views so callers can notify the embedded editors */
  renameTabFile(
    oldPath: string,
    newPath: string,
  ): Array<{ kind: TabKind; webContents: WebContents }> {
    const affected: Array<{ kind: TabKind; webContents: WebContents }> = []
    for (const tab of this.tabs) {
      if (tab.filePath !== oldPath) continue
      tab.filePath = newPath
      tab.title = basename(newPath)
      if (tab.view) affected.push({ kind: tab.kind, webContents: tab.view.webContents })
    }
    if (affected.length > 0) this.onChanged()
    return affected
  }

  /** sheets tabs whose renderer reports unsaved journal edits (shell-close guard) */
  dirtySheetsTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter(
        (t) => t.kind === 'sheets' && t.view && sheetsPendingEditCount(t.view.webContents.id) > 0,
      )
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** pdf tabs whose renderer reports unsaved markups/form edits (shell-close guard) */
  dirtyPdfTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'pdf' && t.view && pdfIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** markdown tabs whose renderer reports unsaved edits (shell-close guard) */
  dirtyMarkdownTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'markdown' && t.view && markdownIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** html tabs whose renderer reports unsaved edits (shell-close guard) */
  dirtyHtmlTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'html' && t.view && htmlIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** mind map tabs whose renderer reports unsaved edits (shell-close guard) */
  dirtyMindmapTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'mindmap' && t.view && mindmapIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** drawing tabs whose renderer reports unsaved edits (shell-close guard) */
  dirtyExcalidrawTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'excalidraw' && t.view && excalidrawIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** hwp tabs whose renderer reports unsaved edits (shell-close guard) */
  dirtyHwpTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'hwp' && t.view && hwpIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** slides tabs whose main-process session has unsaved edits (shell-close guard) */
  dirtySlidesTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'slides' && t.view && slidesIsDirty(t.view.webContents.id))
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** all live docs tabs — dirtiness lives renderer-side, caller queries async (shell-close guard) */
  docsTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'docs' && t.view)
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** all live slides tabs (MCP bridge resolves its new tab's webContents through this) */
  slidesTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'slides' && t.view)
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** all live sheets tabs (MCP bridge resolves its new tab's webContents through this) */
  sheetsTabs(): Array<{ id: string; webContents: WebContents }> {
    return this.tabs
      .filter((t) => t.kind === 'sheets' && t.view)
      .map((t) => ({ id: t.id, webContents: t.view!.webContents }))
  }

  /** closes whichever tab is currently active; no-op for Home (Cmd+W target) */
  closeActiveTab(): void {
    void this.closeTab(this.activeId)
  }

  async closeTab(id: string): Promise<void> {
    if (id === HOME_ID) return
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || this.closingIds.has(id)) return
    let closeGuard =
      tab.view &&
      (tab.kind === 'sheets' && sheetsPendingEditCount(tab.view.webContents.id) > 0
        ? requestSheetsClose
        : tab.kind === 'pdf' && pdfIsDirty(tab.view.webContents.id)
          ? requestPdfClose
          : tab.kind === 'markdown' && markdownIsDirty(tab.view.webContents.id)
            ? requestMarkdownClose
            : tab.kind === 'html' && htmlIsDirty(tab.view.webContents.id)
              ? requestHtmlClose
              : tab.kind === 'hwp' && hwpIsDirty(tab.view.webContents.id)
                ? requestHwpClose
                : tab.kind === 'slides' && slidesIsDirty(tab.view.webContents.id)
                  ? requestSlidesClose
                  : null)
    if (!closeGuard && tab.kind === 'mindmap' && tab.view) {
      if (mindmapIsDirty(tab.view.webContents.id)) closeGuard = requestMindmapClose
    }
    if (!closeGuard && tab.kind === 'excalidraw' && tab.view) {
      if (excalidrawIsDirty(tab.view.webContents.id)) closeGuard = requestExcalidrawClose
    }
    // docs dirty state lives in the renderer and needs an async query; skip the guard when clean (avoids a flash activation)
    if (!closeGuard && tab.kind === 'docs' && tab.view) {
      this.closingIds.add(id)
      try {
        if (await docsQueryDirty(tab.view.webContents)) closeGuard = requestDocsClose
      } finally {
        this.closingIds.delete(id)
      }
    }
    if (closeGuard && tab.view) {
      // Bring the tab into view for the prompt — and put the arrangement back
      // exactly as it was afterwards: the temporarily shown tab was never a
      // real pane member, so a cancel (or the close itself) must not leave the
      // split disturbed.
      this.beginExclusivePrompt()
      if (this.activeId !== id) this.activateTab(id)
      this.closingIds.add(id)
      try {
        if (!(await closeGuard(tab.view.webContents, this.shellWindow))) return
      } finally {
        this.closingIds.delete(id)
        this.endExclusivePrompt()
      }
    }
    this.removeTab(id)
  }

  /**
   * Close a tab with no save prompt. The caller must have already settled the
   * document's unsaved changes (the MCP close tool saves or discards first):
   * this is the plain removal step of `closeTab`, so a dialog never appears in
   * a flow the user did not start.
   * Returns false when there is no such tab (already closed) or one is mid-prompt.
   */
  closeTabWithoutPrompt(id: string): boolean {
    if (id === HOME_ID) return false
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || this.closingIds.has(id)) return false
    this.removeTab(id)
    return true
  }

  /** detach + drop one tab and re-activate a neighbour (no guards, no prompts) */
  private removeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    if (this.htmlFullScreenId === id) this.htmlFullScreenId = null
    const [removed] = this.tabs.splice(idx, 1)
    const split = this.split
    const survivor = split ? splitSurvivor(split, id) : null
    if (survivor !== null) {
      // removing a pane document drops the split; the other pane's document
      // takes the whole window (or stays backgrounded under a cover tab)
      this.split = null
      if (this.activeId === id && this.tabs.some((t) => t.id === survivor.tabId)) {
        this.activateTab(survivor.tabId)
      } else {
        this.layout()
        this.refreshActiveTargets()
        this.onChanged()
      }
      this.notifySplitChanged()
    } else if (this.activeId === id) {
      const fallback = this.tabs[idx - 1] ?? this.tabs[0]
      this.activateTab(fallback.id)
    } else {
      this.onChanged()
    }
    if (removed.view) {
      // a generate request the tab never took goes with the tab
      dropGenerateHandoff(removed.view.webContents.id)
      removed.view.setVisible(false)
      this.shellWindow.contentView.removeChildView(removed.view)
      if (removed.kind === 'docs') {
        // webContents.close()/.destroy() on a closed docs tab wedges Electron's whole
        // UI thread in a native modal run loop (reproduced consistently; survives
        // close() vs destroy(), teardown ordering, deferring, and disabling
        // accessibility support — looks like an upstream WebContentsView/Chromium
        // issue, not something fixable from here). Detaching without destroying
        // avoids the freeze; the orphaned webContents object stays until the app
        // quits, but its renderer process is ended now so its memory comes back.
        teardownDocsRenderer(removed.view.webContents)
        releaseClosedRenderer(removed.view.webContents)
      } else {
        removed.view.webContents.close()
      }
    }
  }

  /** Remove a tab from the strip WITHOUT destroying its WebContentsView and
   *  hand it to the caller ("Open in New Window" — the live document, unsaved
   *  edits included, moves into a detached editor window). Null while a close
   *  prompt is pending on the tab. */
  detachTab(id: string): DetachedTab | null {
    if (id === HOME_ID) return null
    const idx = this.tabs.findIndex((t) => t.id === id)
    const tab = idx >= 0 ? this.tabs[idx] : undefined
    if (!tab?.view || tab.present || this.closingIds.has(id)) return null
    this.tabs.splice(idx, 1)
    if (this.htmlFullScreenId === id) this.htmlFullScreenId = null
    const view = tab.view
    view.setVisible(false)
    this.shellWindow.contentView.removeChildView(view)
    const split = this.split
    const survivor = split ? splitSurvivor(split, id) : null
    if (survivor !== null) {
      // a pane document leaves for its own window: the split drops and the
      // remaining pane takes the shell window
      this.split = null
      if (this.activeId === id && this.tabs.some((t) => t.id === survivor.tabId)) {
        this.activateTab(survivor.tabId)
      } else {
        this.layout()
        this.refreshActiveTargets()
        this.onChanged()
      }
      this.notifySplitChanged()
    } else if (this.activeId === id) {
      const fallback = this.tabs[idx - 1] ?? this.tabs[0]
      this.activateTab(fallback.id)
    } else {
      this.onChanged()
    }
    return { view, kind: tab.kind, title: tab.title, filePath: tab.filePath }
  }

  /** Whether a tab can leave the strip for its own window (tear-off / Open in
   *  New Window): every document tab except a chrome-free Present tab. */
  canDetachTab(id: string): boolean {
    const tab = this.tabs.find((t) => t.id === id)
    return !!tab?.view && !tab.present && !this.closingIds.has(id)
  }

  /**
   * The inverse of detachTab: a live view coming back from a detached window
   * (dock by dragging the window onto the strip, or a tear-off that returned
   * mid-gesture) becomes a tab again at `index` — Home stays pinned at 0, an
   * out-of-range or omitted index appends — and is activated. The document,
   * unsaved edits included, is untouched: only the view's parent changes.
   * With `activate` false the tab comes back quietly for a caller that sets
   * the state itself (a split drop re-homes the tab into a pane); the strip
   * is still told about the new tab.
   */
  attachTab(record: DetachedTab, index?: number, activate = true): string {
    const id = `t${this.nextId++}`
    const { view } = record
    this.shellWindow.contentView.addChildView(view)
    view.setVisible(false)
    this.trackHtmlFullScreen(view)
    this.trackPaneFocus(view)
    const slot =
      index === undefined || !Number.isFinite(index)
        ? this.tabs.length
        : Math.min(Math.max(Math.trunc(index), 1), this.tabs.length)
    this.tabs.splice(slot, 0, {
      id,
      kind: record.kind,
      view,
      title: record.title,
      filePath: record.filePath,
    })
    if (activate) this.activateTab(id)
    else this.onChanged()
    return id
  }

  /** the editor tab showing this file, whichever module owns it (path compared after resolving links) */
  findTabByPath(
    path?: string,
  ): { id: string; kind: TabKind; webContents: WebContents } | undefined {
    const wanted = canonicalPath(path)
    const tab = this.tabs.find(
      (t) => t.view && t.filePath && !t.present && canonicalPath(t.filePath) === wanted,
    )
    return tab?.view ? { id: tab.id, kind: tab.kind, webContents: tab.view.webContents } : undefined
  }

  webContentsForTab(id: string): WebContents | undefined {
    return this.tabs.find((t) => t.id === id)?.view?.webContents
  }

  private findTabOfKindByPath(kind: TabKind, path?: string): string | undefined {
    const wanted = canonicalPath(path)
    return this.tabs.find(
      (t) =>
        t.kind === kind &&
        t.view &&
        t.filePath &&
        !t.present &&
        canonicalPath(t.filePath) === wanted,
    )?.id
  }

  findDocsTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('docs', path)
  }

  findSheetsTab(): string | undefined {
    return this.tabs.find((t) => t.kind === 'sheets')?.id
  }

  findSheetsTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('sheets', path)
  }

  findSlidesTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('slides', path)
  }

  findPdfTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('pdf', path)
  }

  findMarkdownTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('markdown', path)
  }

  findHtmlTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('html', path)
  }

  findMindmapTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('mindmap', path)
  }

  /** the active tab's mind map view, if the active tab is a mind map (mind map menu target) */
  activeMindmapTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'mindmap' && tab.view
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }

  findExcalidrawTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('excalidraw', path)
  }

  /** the active tab's drawing view, if the active tab is a drawing (drawing menu target) */
  activeExcalidrawTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'excalidraw' && tab.view
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }

  findHwpTabByPath(path?: string): string | undefined {
    return this.findTabOfKindByPath('hwp', path)
  }

  /** the active tab's hwp view, if the active tab is hwp (hwp menu target) */
  activeHwpTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'hwp' && tab.view
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }

  /** the active tab's html view, if the active tab is html (html menu target) */
  activeHtmlTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'html' && tab.view && !tab.present
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }

  /** the active tab's markdown view, if the active tab is markdown (markdown menu target) */
  activeMarkdownTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'markdown' && tab.view
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }

  /** the active tab's pdf view, if the active tab is a pdf (pdf menu target) */
  activePdfTab(): { id: string; webContents: WebContents; filePath?: string } | undefined {
    const tab = this.tabs.find((t) => t.id === this.activeId)
    return tab?.kind === 'pdf' && tab.view
      ? { id: tab.id, webContents: tab.view.webContents, filePath: tab.filePath }
      : undefined
  }
}

export function canonicalPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/** The manual shares the shell's renderer bundle and preload: the view is just
    the shell renderer at ?mode=help. Dev serves it from the dev server, the
    packaged app from the `help` scheme root registered in shell main. */
function createHelpView(topic?: string): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  view.webContents.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url)
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  void view.webContents.loadURL(helpViewUrl(topic))
  return view
}

/** A topic id the manual's URL may carry: the registry's id shape, nothing else */
export function helpTopicParam(topic: unknown): string | undefined {
  return typeof topic === 'string' && /^[a-z0-9-]{1,64}$/.test(topic) ? topic : undefined
}

/** The manual's URL, at one topic when given (the help screen reads `topic`) */
export function helpViewUrl(topic?: string): string {
  const query: Record<string, string> = { mode: 'help' }
  const wanted = helpTopicParam(topic)
  if (wanted) query.topic = wanted
  return rendererUrl(process.env.ELECTRON_RENDERER_URL, 'help', query)
}
