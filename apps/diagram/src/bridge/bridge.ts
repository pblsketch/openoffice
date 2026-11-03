/**
 * Our one script inside the draw.io frame (spec 4, 6, 10). The protocol
 * handler puts it first in draw.io's `index.html`; draw.io's own files are
 * never changed. Before draw.io loads it:
 *
 * - fixes draw.io's configuration (`DRAWIO_CONFIG`, which draw.io's own
 *   PreConfig would otherwise reset): no draw.io AI, no web fonts, no export
 *   server, the menus the app takes out;
 * - hides draw.io's logo and links to its web pages;
 * - catches `App.main` to reach the editor object once draw.io made it;
 * - keeps draw.io's live libavoid routing uninstalled, its core not being in
 *   the bundle (`libavoid-guard.ts`).
 *
 * With the editor object it hides actions, sends the ones the app does itself
 * (help, print, the picture and PDF exports, save) to the host, keeps the app's
 * shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+P), opens only the links a person
 * clicked (through the host), tracks unsaved changes against the undo
 * history, and answers the host's requests: the pages as model XML, the
 * selection, primitive changes and whole AI tool calls (with Mermaid drawings
 * converted by draw.io's own converter) as one undo step, taking an AI
 * call's step back, Visio drawings converted by draw.io's own importer, the dark view, page
 * compression, and page pictures for exports.
 *
 * Messages: only from the parent window and the parent's origin; ours go to
 * that origin only.
 */
import {
  DRAWIO_MENU_ACTIONS,
  isFromHost,
  parseBridgeMessage,
  type BridgeEvent,
  type BridgeOps,
  type BridgeRequestMessage,
  type PageInfo,
} from '../shared/bridge-protocol'
import { DRAWIO_CONFIG, HIDDEN_ACTIONS, HIDE_CSS, REDIRECTED_ACTIONS } from '../shared/drawio-start'
import { applyPrimitivesLive, applyStepsLive } from './apply-primitives'
import { lastContentEdit } from './dirty'
import { liveDiagram, readPageXmls, type DrawioUi } from './drawio-adapter'
import { clickedLinkUrl, createLinkGate, isInPageHref } from './link-clicks'
import { guardAutoRouting } from './libavoid-guard'
import { convertMermaid } from './mermaid'
import { isAppShortcut, isHelpKey } from './shortcuts'
import { importVisio } from './visio'

declare const mxEvent: any
declare const mxUtils: any
declare const mxConstants: any
declare const Graph: any
declare const Editor: any
declare const mxResources: any

const w = window as any
const hostOrigin: string = (() => {
  try {
    return location.ancestorOrigins?.[0] ?? ''
  } catch {
    return ''
  }
})()

function emit(event: BridgeEvent): void {
  if (!hostOrigin || window.parent === window) return
  window.parent.postMessage({ ieum: 1, kind: 'event', ...event }, hostOrigin)
}

/** One click, one link handed to the host, whichever way the click reached us. */
const linkGate = createLinkGate()
function handOverLink(url: string): void {
  if (linkGate(url)) emit({ name: 'openLink', url })
}

// ---- before draw.io loads ----

// draw.io's PreConfig.js assigns `window.DRAWIO_CONFIG = null`; the property
// keeps ours (an assignment to a getter-only property is ignored outside strict mode)
const config = JSON.parse(JSON.stringify(DRAWIO_CONFIG)) as Record<string, unknown>
Object.defineProperty(w, 'DRAWIO_CONFIG', {
  configurable: false,
  enumerable: true,
  get: () => config,
  set: () => {},
})

// libavoid's routing core is not in the bundle: draw.io's live auto-routing,
// which would call it on every shape move, stays uninstalled until it is
guardAutoRouting(w, () => typeof w.AvoidRouting !== 'undefined')

const hideStyle = document.createElement('style')
hideStyle.textContent = HIDE_CSS
;(document.head ?? document.documentElement).appendChild(hideStyle)

/** draw.io's globals that change what it reaches for, set once its code is there. */
function patchDrawio(): void {
  try {
    Editor.enableServiceWorker = false
    Editor.enableWebFonts = false
    Editor.enableRealtime = false
    Editor.enableExportUrl = false
    Editor.enableAi = false
    Editor.gptUrl = null
  } catch {
    // an older or newer draw.io without one of these: the configuration still applies
  }
  // A link opens only when a person clicked it, and only through the host,
  // which applies the same rule as the mind map editor. Nothing else leaves.
  Graph.prototype.openLink = function (href: unknown): null {
    const url = typeof Graph.sanitizeLink === 'function' ? Graph.sanitizeLink(href) : href
    const clicked = (navigator as any).userActivation?.isActive === true
    const target = clicked && typeof url === 'string' ? clickedLinkUrl(url, location.href) : null
    if (target) handOverLink(target)
    return null
  }
}

let ui: DrawioUi = null

// draw.io assigns `App = function…` and then `App.main = …`; both are caught
// so that the editor object is handed to us the moment `App.main` makes it.
let appClass: any
Object.defineProperty(w, 'App', {
  configurable: true,
  get: () => appClass,
  set: (value: any) => {
    appClass = value
    if (typeof value !== 'function') return
    let main: any
    Object.defineProperty(value, 'main', {
      configurable: true,
      get: () =>
        function (this: unknown, callback?: (made: DrawioUi) => void, factory?: unknown) {
          patchDrawio()
          return main.call(
            this,
            (made: DrawioUi) => {
              attach(made)
              callback?.(made)
            },
            factory,
          )
        },
      set: (fn: any) => {
        main = fn
      },
    })
  },
})

// ---- the editor object ----

let savedTop: unknown = null
let forcedDirty = false
let revision = 0
let lastDirty = false
/** the last step at each recent revision, so a save can mark the state it wrote */
const topAtRevision = new Map<number, unknown>()
/** a state no undo position can match: a save of content that is gone from the history */
const STALE = Symbol('stale')

function topEdit(): unknown {
  const manager = ui?.editor?.undoManager
  if (!manager || manager.indexOfNextAdd <= 0) return null
  return manager.history[manager.indexOfNextAdd - 1] ?? null
}

/** The step that stands for the content: view-only steps (showing another page) are skipped. */
function contentTop(): unknown {
  return lastContentEdit(ui?.editor?.undoManager)
}

function reportDirty(): void {
  const dirty = forcedDirty || contentTop() !== savedTop
  if (dirty !== lastDirty) {
    lastDirty = dirty
    emit({ name: 'dirty', dirty })
  }
}

function reportChange(): void {
  revision++
  topAtRevision.set(revision, contentTop())
  if (topAtRevision.size > 200) topAtRevision.delete(topAtRevision.keys().next().value as number)
  emit({ name: 'changed', revision })
  reportDirty()
}

let selectionTimer: ReturnType<typeof setTimeout> | null = null
function selectedIds(): string[] {
  const cells: any[] = ui?.editor?.graph?.getSelectionCells?.() ?? []
  return cells.map((cell) => String(cell.id))
}

function currentPageId(): string | null {
  return ui?.currentPage ? String(ui.currentPage.getId()) : null
}

function attach(made: DrawioUi): void {
  ui = made
  for (const name of HIDDEN_ACTIONS) {
    const action = ui.actions.get(name)
    if (action) action.visible = false
  }
  for (const [name, command] of Object.entries(REDIRECTED_ACTIONS)) {
    const action = ui.actions.get(name)
    if (!action) continue
    action.funct = () => emit({ name: 'command', command })
    action.isEnabled = () => true
  }
  showHelpInHelpMenu(ui)
  const manager = ui.editor.undoManager
  for (const name of [mxEvent.ADD, mxEvent.UNDO, mxEvent.REDO, mxEvent.CLEAR]) {
    manager.addListener(name, reportChange)
  }
  ui.editor.graph.getSelectionModel().addListener(mxEvent.CHANGE, () => {
    if (selectionTimer) clearTimeout(selectionTimer)
    selectionTimer = setTimeout(() => emit({ name: 'selection', ids: selectedIds() }), 50)
  })
  ui.editor.addListener('pageSelected', () => emit({ name: 'currentPage', id: currentPageId() }))
  emit({ name: 'ready' })
}

/**
 * draw.io's Help menu offline holds only its keyboard shortcuts and "about"
 * (hidden): it gets the app's help first. Its keyboard shortcuts picture,
 * which draw.io would open as a new window (refused), is shown in a draw.io
 * dialog instead, as draw.io's desktop app does.
 */
function showHelpInHelpMenu(made: DrawioUi): void {
  const shortcuts = made.actions.get('keyboardShortcuts')
  if (shortcuts) {
    shortcuts.funct = () => {
      const ratio = 1165 / 1427
      let width = Math.max(200, Math.min(1427, window.innerWidth - 120))
      let height = Math.round(width * ratio)
      const room = Math.max(150, window.innerHeight - 120)
      if (height > room) {
        height = room
        width = Math.round(height / ratio)
      }
      const picture = document.createElement('img')
      picture.setAttribute('src', 'shortcuts.svg')
      picture.setAttribute('alt', String(mxResources.get('keyboardShortcuts')))
      picture.style.display = 'block'
      picture.style.width = `${width}px`
      picture.style.height = `${height}px`
      made.showDialog(picture, width, height, true, true, null, true)
    }
  }
  const menu = made.menus?.get?.('help')
  if (menu) {
    menu.funct = (popup: unknown, parent: unknown) =>
      made.menus.addMenuItems(popup, ['help', 'keyboardShortcuts'], parent)
  }
}

// No link click takes the frame away from draw.io: every one is stopped
// here. A web or mail link a person clicked (under a shape, in a label, in a
// dialog) goes to the host, which opens it in the browser. draw.io's own
// handling of its custom links (a page link, an action) still runs.
document.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null
    const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (isInPageHref(href, location.href)) return
    event.preventDefault()
    const url = event.isTrusted ? clickedLinkUrl(href, location.href) : null
    if (url) handOverLink(url)
  },
  true,
)

// The app's own shortcuts work while draw.io has the keyboard; draw.io keeps
// the rest. F1 opens the app's help on the diagram page, like draw.io's Help.
window.addEventListener(
  'keydown',
  (event) => {
    if (isHelpKey(event)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      emit({ name: 'command', command: 'help' })
      return
    }
    const key = isAppShortcut(event)
    if (!key) return
    event.preventDefault()
    event.stopImmediatePropagation()
    emit({ name: 'shortcut', key })
  },
  true,
)

// ---- AI batches and taking them back ----

/** The undo step each applied batch became, by the token handed to the host. */
const batchEdits = new Map<string, unknown>()
let batchSeq = 0

function applyBatch(steps: unknown): BridgeOps['applyBatch']['reply'] {
  if (!Array.isArray(steps)) throw new Error('steps must be a list')
  const graph = ui.editor.graph
  if (graph.isEditing()) graph.stopEditing(false)
  const manager = ui.editor.undoManager
  const before = manager.history.length
  const result = applyStepsLive(liveDiagram(ui), steps)
  let token: string | null = null
  const edit = topEdit()
  if (manager.history.length > before && edit !== null) {
    token = `b${++batchSeq}`
    batchEdits.set(token, edit)
    if (batchEdits.size > 200) batchEdits.delete(batchEdits.keys().next().value as string)
  }
  return { ...result, token }
}

/** Undoes the named batches newest first while each is the newest step of the history. */
function undoBatches(tokens: unknown): BridgeOps['undoBatches']['reply'] {
  if (!Array.isArray(tokens)) throw new Error('tokens must be a list')
  const graph = ui.editor.graph
  if (graph.isEditing()) graph.stopEditing(false)
  let undone = 0
  for (const token of [...tokens].reverse()) {
    const edit = typeof token === 'string' ? batchEdits.get(token) : undefined
    if (edit === undefined || topEdit() !== edit) break
    ui.editor.undoManager.undo()
    batchEdits.delete(token as string)
    undone++
  }
  return { undone }
}

// ---- pictures of pages ----

/** Runs `use` with a graph showing the page (the live graph for the page on screen). */
async function withPageGraph<T>(
  pageId: string,
  use: (graph: any, page: any) => Promise<T>,
): Promise<T> {
  const page = ui.getPageById(pageId)
  if (!page) throw new Error(`no page ${pageId}`)
  if (page === ui.currentPage) return use(ui.editor.graph, page)
  const graph = ui.createTemporaryGraph(ui.editor.graph.getStylesheet())
  ui.updatePageRoot(page)
  if (page.viewState) {
    graph.background = page.viewState.background
    graph.shadowVisible = page.viewState.shadowVisible
  }
  document.body.appendChild(graph.container)
  try {
    graph.model.setRoot(page.root)
    return await use(graph, page)
  } finally {
    graph.container.parentNode?.removeChild(graph.container)
  }
}

function pageSvg(pageId: string, theme: 'light' | 'auto'): Promise<BridgeOps['pageSvg']['reply']> {
  return withPageGraph(
    pageId,
    (graph, page) =>
      new Promise((resolve, reject) => {
        try {
          const lookup = Object.create(null)
          const imageExport = graph.createSvgImageExport(false)
          const background = graph.background === mxConstants.NONE ? null : graph.background
          const svg = ui.getSvgWithFontLookup(lookup, imageExport, () =>
            graph.getSvg(
              background,
              1,
              0,
              null,
              null,
              null,
              null,
              imageExport,
              null,
              graph.shadowVisible,
              null,
              theme,
            ),
          )
          if (graph.shadowVisible) graph.addSvgShadow(svg)
          if (page?.getAlt) Graph.addSvgTitle(svg, page.getAlt())
          ui.embedFonts(
            svg,
            (withFonts: any) =>
              ui.editor.convertImages(withFonts, (done: any) =>
                resolve({
                  svg: mxUtils.getXml(done),
                  width: parseFloat(done.getAttribute('width')) || 0,
                  height: parseFloat(done.getAttribute('height')) || 0,
                }),
              ),
            false,
            lookup,
          )
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }),
  )
}

function pagePng(pageId: string): Promise<BridgeOps['pagePng']['reply']> {
  return withPageGraph(
    pageId,
    (graph) =>
      new Promise((resolve, reject) => {
        try {
          // light colors whatever the app's theme: PNG and PDF are the same in both
          ui.editor.exportToCanvas(
            (canvas: HTMLCanvasElement) => {
              canvasPngBytes(canvas).then((bytes) => resolve({ bytes }), reject)
            },
            null,
            null,
            null,
            (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
            null,
            true,
            1,
            false,
            graph.shadowVisible,
            null,
            graph,
            0,
            null,
            false,
            'light',
          )
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }),
  )
}

/**
 * The PNG file of a canvas, then the canvas's pixels let go at once: a large
 * page is hundreds of megabytes of pixels that would otherwise wait for the
 * garbage collector. No base64 text on the way.
 */
async function canvasPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  try {
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
    if (!blob) throw new Error('the page could not be drawn as PNG')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** The buffers a reply hands over instead of copying (the bytes of a picture). */
function transferablesOf(value: unknown): Transferable[] {
  const bytes = (value as { bytes?: unknown } | null)?.bytes
  return bytes instanceof Uint8Array &&
    bytes.byteOffset === 0 &&
    bytes.buffer instanceof ArrayBuffer
    ? [bytes.buffer]
    : []
}

function pageInfo(): BridgeOps['pageInfo']['reply'] {
  const file = ui.getXmlFileData(true, false, true)
  const diagrams = file.getElementsByTagName('diagram')
  const pages: PageInfo[] = []
  for (let i = 0; i < diagrams.length; i++) {
    const diagram = diagrams[i]
    const model = diagram.getElementsByTagName('mxGraphModel')[0]
    const number = (name: string, fallback: number): number => {
      const value = parseFloat(model?.getAttribute(name) ?? '')
      return Number.isFinite(value) && value > 0 ? value : fallback
    }
    pages.push({
      id: String(diagram.getAttribute('id') ?? `page-${i + 1}`),
      name: String(diagram.getAttribute('name') ?? `Page-${i + 1}`),
      pageWidth: number('pageWidth', 827),
      pageHeight: number('pageHeight', 1169),
    })
  }
  return { pages, currentPage: currentPageId() }
}

// ---- requests from the host ----

async function answer(request: BridgeRequestMessage): Promise<unknown> {
  if (!ui) throw new Error('the editor is still starting')
  const args = request.args as any
  switch (request.op) {
    case 'readPages':
      return { pages: readPageXmls(ui), currentPage: currentPageId(), selected: selectedIds() }
    case 'selection':
      return { ids: selectedIds() }
    case 'pageInfo':
      return pageInfo()
    case 'applyPrimitives': {
      if (!Array.isArray(args.primitives)) throw new Error('primitives must be a list')
      const graph = ui.editor.graph
      if (graph.isEditing()) graph.stopEditing(false)
      return applyPrimitivesLive(liveDiagram(ui), args.primitives)
    }
    case 'applyBatch':
      return applyBatch(args.steps)
    case 'convertMermaid':
      return convertMermaid(ui, String(args.text ?? ''))
    case 'importVisio':
      return importVisio(ui, args.bytes)
    case 'undoBatches':
      return undoBatches(args.tokens)
    case 'setDark':
      ui.setDarkMode(args.dark === true)
      return {}
    case 'setCompressed':
      Editor.defaultCompressed = args.compressed === true
      return {}
    case 'markSaved': {
      const at = typeof args.revision === 'number' ? args.revision : revision
      savedTop =
        at === revision ? contentTop() : topAtRevision.has(at) ? topAtRevision.get(at) : STALE
      forcedDirty = false
      reportDirty()
      return {}
    }
    case 'markUnsaved':
      forcedDirty = true
      reportDirty()
      return {}
    case 'pageSvg':
      return pageSvg(String(args.pageId), args.theme === 'light' ? 'light' : 'auto')
    case 'pagePng':
      return pagePng(String(args.pageId))
    case 'runAction': {
      const name = String(args.action)
      if (!(DRAWIO_MENU_ACTIONS as readonly string[]).includes(name)) {
        throw new Error(`not an action the app runs: ${name}`)
      }
      ui.actions.get(name)?.funct()
      return {}
    }
  }
}

window.addEventListener('message', (event) => {
  if (!isFromHost(event, window.parent, hostOrigin)) return
  const message = parseBridgeMessage(event.data)
  if (!message || message.kind !== 'request') return
  const reply = (body: { ok: true; value: unknown } | { ok: false; error: string }): void =>
    window.parent.postMessage(
      { ieum: 1, kind: 'reply', id: message.id, ...body },
      hostOrigin,
      body.ok ? transferablesOf(body.value) : [],
    )
  answer(message).then(
    (value) => reply({ ok: true, value }),
    (err: unknown) => reply({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  )
})
