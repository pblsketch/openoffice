/**
 * Editing a book (spec §5): what the user does in the chapter frame, turned
 * into the engine's block edits and sent to the main process, which holds
 * the book.
 *
 * - Only the blocks (`data-epub-block`) of a chapter that may be edited are
 *   `contenteditable`, and only while this tab's book translation is not
 *   running. A block whose drawing does not follow its source one for one is
 *   left alone.
 * - Typing changes the drawn block; a short while later (and before any
 *   other edit, a save, a close, a chapter change) the block is read back
 *   into the notation and sent as one `replace` edit. The main process keeps
 *   every original inline element; until the edit is sent the book counts
 *   as changed (`setDirty`).
 * - Enter splits a flowing block, Shift+Enter writes a line break, Backspace
 *   at the start and Delete at the end merge with the neighbouring block,
 *   bold and italic toggle marks. After each of these the chapter is drawn
 *   again from the text the main process answered with, so the screen and
 *   the block ids always match the book.
 * - One history per tab: every change pushes the replacements that undo it.
 *   An entry may span chapters (replace all, an AI batch). Undoing a change
 *   in another chapter goes there.
 *
 * Everything that talks to the main process runs one after the other.
 */
import type { BlockEdit, ChapterBlock, OpenChapter, RangeReplacement } from '@genoffice/epub-engine'
import type { Params } from '@genoffice/i18n'
import type {
  EpubApplyEditsRequest,
  EpubBlockInfo,
  EpubChapterResult,
  EpubEditResult,
  EpubReplaceRangesRequest,
} from '../../shared/ipc'
import type { StringKey } from '../i18n/locale'
import { normalizeQuery } from '../reader/book-search'
import { BLOCK_ATTR } from '../reader/chapter-html'
import { blockMatches, countMatches, plainOffsetAtSource, replacedNotation } from './block-text'
import { blockPlainText, openChapter } from './engine'
import {
  domNotation,
  domPlainText,
  inlineRoleTree,
  offsetAt,
  pairRoles,
  pointAt,
  type PlaceholderInfo,
  type RoleMap,
} from './inline-roles'

export type OkChapter = Extract<EpubChapterResult, { ok: true }>
export type OkEdit = Extract<EpubEditResult, { ok: true }>
export type FailedEdit = Exclude<EpubEditResult, { ok: true }>

/** The main-process calls editing needs (a part of `window.epubApi`). */
export interface EditApi {
  readChapter(spineIndex: number): Promise<EpubChapterResult>
  applyEdits(request: EpubApplyEditsRequest): Promise<EpubEditResult>
  replaceRanges(request: EpubReplaceRangesRequest): Promise<EpubEditResult>
  setTranslationLock(locked: boolean): Promise<boolean>
  setDirty?(dirty: boolean): void
}

export interface EditNotice {
  key: StringKey
  params?: Params
}

export interface EditHost {
  api: EditApi
  /** the drawing copy of a chapter, as the reading screen builds it */
  chapterHtml(chapter: { source: string; path: string; blocks: readonly EpubBlockInfo[] }): string
  /** the reading text of a chapter (what the in-book search counts) */
  readingText(chapter: OkChapter): string
  /** shows a chapter, at a block when one is given */
  showChapter(spineIndex: number, blockId: string | null): void
  notify(notice: EditNotice): void
  /** dirty, lock, history or editability changed */
  changed(): void
}

export interface EditState {
  /** the book differs from the saved file, or typed text is not sent yet */
  dirty: boolean
  /** this tab's book translation runs: no editing, no AI edits, no replacing */
  locked: boolean
  canUndo: boolean
  canRedo: boolean
  /** the chapter on screen takes edits now */
  editable: boolean
}

/** Block edits on one chapter. */
export interface EditGroup {
  spineIndex: number
  edits: BlockEdit[]
}

export type EditGroupsOutcome =
  | { ok: true; results: OkEdit[] }
  | {
      ok: false
      /** which group failed */
      index: number
      failure: FailedEdit
      /** groups that stayed applied (none when atomic) */
      results: OkEdit[]
    }

export interface ReplaceAllOutcome {
  replaced: number
  /** matches in chapters that cannot be edited */
  skipped: number
  /** matches in chapters the main process refused to change */
  failed: number
}

interface HistoryPart {
  spineIndex: number
  path: string
  /** the replacements that undo the change, against the chapter text right after it */
  inverse: RangeReplacement[]
}

interface HistoryEntry {
  parts: HistoryPart[]
}

interface BlockState {
  info: EpubBlockInfo
  el: HTMLElement
  xml: ChapterBlock
  roles: RoleMap
  placeholders: PlaceholderInfo[]
  /** the block's text has a no-break space of its own */
  nbsp: boolean
  /** drawn one for one with its source: may be edited */
  ok: boolean
}

interface LiveChapter {
  spineIndex: number
  path: string
  source: string
  version: number
  blocks: EpubBlockInfo[]
  readOnly: boolean
  doc: Document
  map: OpenChapter | null
  states: Map<string, BlockState>
}

interface TypedBatch {
  spineIndex: number
  path: string
  edits: BlockEdit[]
}

/** The longest history kept per tab. */
const HISTORY_LIMIT = 300
/** Rest after typing before the typed text is sent. */
export const FLUSH_DELAY_MS = 500
const EDIT_STYLE_ID = 'genoffice-epub-edit'
const EDIT_CSS = `[${BLOCK_ATTR}][contenteditable="true"] { cursor: text; }
[${BLOCK_ATTR}][contenteditable="true"]:focus { outline: none; }`

const sameText = (a: string, b: string): boolean =>
  a === b || a.replace(/\u00a0/g, ' ') === b.replace(/\u00a0/g, ' ')

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function findBlockElement(root: ParentNode, id: string): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll(`[${BLOCK_ATTR}]`))) {
    if (el.getAttribute(BLOCK_ATTR) === id) return el as HTMLElement
  }
  return null
}

/** Where a change ends in the text after it: the first replacement's end. */
function changeEnd(result: OkEdit): number | null {
  const sorted = [...result.replacements].sort((a, b) => a.start - b.start)
  const first = sorted[0]
  return first ? first.start + first.text.length : null
}

function blockAt(blocks: readonly EpubBlockInfo[], position: number): EpubBlockInfo | null {
  return blocks.find((b) => b.outer.start <= position && position <= b.outer.end) ?? null
}

export class EpubEditController {
  private live: LiveChapter | null = null
  private bookReadOnly = false
  private locked = false
  private backendDirty = false
  private readonly pending = new Set<string>()
  private composingNow = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  /** the main process's version of every chapter text known here, by path */
  private readonly versions = new Map<string, number>()
  private changes = 0
  private detachDoc: (() => void) | null = null

  constructor(
    private readonly host: EditHost,
    private readonly flushDelay = FLUSH_DELAY_MS,
  ) {}

  // ---- state ----

  state(): EditState {
    return {
      dirty: this.dirty,
      locked: this.locked,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      editable: this.editableNow(),
    }
  }

  get dirty(): boolean {
    return this.backendDirty || this.pending.size > 0
  }

  /** An input method is composing text in the chapter. */
  get composing(): boolean {
    return this.composingNow
  }

  get isLocked(): boolean {
    return this.locked
  }

  /** The whole book is read only (fixed layout). */
  setBookReadOnly(readOnly: boolean): void {
    this.bookReadOnly = readOnly
    this.applyEditable()
    this.host.changed()
  }

  private editableNow(): boolean {
    const live = this.live
    return !!live && !live.readOnly && !!live.map && !this.bookReadOnly && !this.locked
  }

  // ---- the chapter on screen ----

  /** A chapter frame is ready: make its blocks editable (when the chapter may be edited). */
  attach(doc: Document, chapter: OkChapter): void {
    const leaving = this.capture()
    if (leaving) void this.run(() => this.send(leaving))
    this.detach()
    const map = chapter.broken ? null : openChapter(chapter.source)
    const known = this.versions.get(chapter.path)
    const stale = known !== undefined && known > chapter.version
    if (!stale) this.versions.set(chapter.path, chapter.version)
    this.live = {
      spineIndex: chapter.spineIndex,
      path: chapter.path,
      source: chapter.source,
      version: chapter.version,
      blocks: chapter.broken ? [] : [...chapter.blocks],
      readOnly: chapter.broken || chapter.readOnly !== null,
      doc,
      map: map && !map.broken ? map : null,
      states: new Map(),
    }
    this.listen(doc)
    if (doc.head && !doc.getElementById(EDIT_STYLE_ID)) {
      const style = doc.createElement('style')
      style.id = EDIT_STYLE_ID
      style.textContent = EDIT_CSS
      doc.head.appendChild(style)
    }
    this.setupBlocks()
    this.host.changed()
    if (stale) {
      // edits reached the main process after this copy was read
      void this.run(async () => {
        const fresh = await this.host.api.readChapter(chapter.spineIndex).catch(() => null)
        if (!fresh || !fresh.ok || fresh.broken || this.live?.doc !== doc) return
        this.takeChapter(fresh)
        this.renderBody()
      })
    }
  }

  /** The frame went away. */
  detach(): void {
    this.detachDoc?.()
    this.detachDoc = null
  }

  private listen(doc: Document): void {
    const offs: Array<() => void> = []
    const on = (type: string, handler: (e: Event) => void): void => {
      doc.addEventListener(type, handler, true)
      offs.push(() => doc.removeEventListener(type, handler, true))
    }
    on('keydown', (e) => this.onKeyDown(e as KeyboardEvent))
    on('beforeinput', (e) => this.onBeforeInput(e as InputEvent))
    on('input', (e) => this.onInput(e))
    on('paste', (e) => this.onPaste(e as ClipboardEvent))
    on('drop', (e) => {
      if (this.blockOf(e.target)) e.preventDefault()
    })
    on('compositionstart', () => {
      this.composingNow = true
    })
    on('compositionend', (e) => {
      this.composingNow = false
      this.onInput(e)
    })
    // a press on a link inside an editable block puts the caret there; Ctrl+press follows it
    const win = doc.defaultView
    if (win) {
      const onClick = (e: MouseEvent): void => {
        if (e.ctrlKey || e.metaKey || !this.editableNow()) return
        const target = e.target as Node | null
        const el = (target?.nodeType === 1 ? target : target?.parentNode) as Element | null
        const anchor = el?.closest?.('a')
        if (!anchor || !this.blockOf(anchor)) return
        e.preventDefault()
        e.stopPropagation()
      }
      win.addEventListener('click', onClick, true)
      offs.push(() => win.removeEventListener('click', onClick, true))
    }
    this.detachDoc = () => offs.forEach((off) => off())
  }

  private setupBlocks(): void {
    const live = this.live
    if (!live) return
    const elements = new Map<string, HTMLElement>()
    for (const el of Array.from(live.doc.querySelectorAll(`[${BLOCK_ATTR}]`))) {
      elements.set(el.getAttribute(BLOCK_ATTR) ?? '', el as HTMLElement)
    }
    const byStart = new Map((live.map?.blocks ?? []).map((b) => [b.outer.start, b]))
    live.states = new Map()
    for (const info of live.blocks) {
      const el = elements.get(info.id)
      const xml = byStart.get(info.outer.start)
      if (!el || !xml || !live.map) continue
      live.states.set(info.id, this.blockState(live.map, info, el, xml))
    }
    this.applyEditable()
  }

  private blockState(
    map: OpenChapter,
    info: EpubBlockInfo,
    el: HTMLElement,
    xml: ChapterBlock,
  ): BlockState {
    const tree = inlineRoleTree(xml)
    const roles: RoleMap = new Map()
    const plain = blockPlainText(map, xml)
    let ok = !tree.cdata && pairRoles(tree.nodes, el, roles)
    // text typed while the last edit was on its way is checked when it is sent
    if (ok && !this.pending.has(info.id)) ok = sameText(domPlainText(el, roles), plain)
    return {
      info,
      el,
      xml,
      roles,
      placeholders: tree.placeholders,
      nbsp: plain.includes('\u00a0'),
      ok,
    }
  }

  private applyEditable(): void {
    const live = this.live
    if (!live) return
    const editable = this.editableNow()
    for (const state of live.states.values()) this.applyEditableTo(state, editable)
  }

  private applyEditableTo(state: BlockState, editable = this.editableNow()): void {
    if (editable && state.ok) {
      state.el.setAttribute('contenteditable', 'true')
      state.el.setAttribute('spellcheck', 'false')
    } else {
      state.el.removeAttribute('contenteditable')
      state.el.removeAttribute('spellcheck')
    }
  }

  /** Takes a chapter text the main process answered with. */
  private takeChapter(chapter: {
    path: string
    source: string
    version: number
    blocks: EpubBlockInfo[]
  }): void {
    const live = this.live
    if (!live || live.path !== chapter.path) return
    live.source = chapter.source
    live.version = chapter.version
    live.blocks = [...chapter.blocks]
    const map = openChapter(chapter.source)
    live.map = map.broken ? null : map
  }

  /** Draws the whole chapter again from its current text, keeping the scroll position. */
  private renderBody(): void {
    const live = this.live
    if (!live) return
    const doc = live.doc
    const fresh = parseHtml(this.host.chapterHtml(live))
    const scroller = doc.scrollingElement ?? doc.documentElement
    const top = scroller?.scrollTop ?? 0
    doc.body.replaceChildren(...Array.from(fresh.body.childNodes, (n) => doc.importNode(n, true)))
    if (scroller) scroller.scrollTop = top
    this.setupBlocks()
  }

  /** Draws one block again from the current text. */
  private renderBlock(id: string): void {
    const live = this.live
    const state = live?.states.get(id)
    if (!live || !state || !live.map) return
    const drawn = findBlockElement(parseHtml(this.host.chapterHtml(live)), id)
    if (!drawn) {
      this.renderBody()
      return
    }
    const copy = live.doc.importNode(drawn, true) as HTMLElement
    state.el.replaceWith(copy)
    const next = this.blockState(live.map, state.info, copy, state.xml)
    live.states.set(id, next)
    this.applyEditableTo(next)
  }

  /** After a text change: every block pairs with its new source again; a block that does not is drawn again. */
  private repair(): void {
    const live = this.live
    if (!live) return
    const caret = this.selectionIn()
    const caretAt = caret?.collapsed ? { id: caret.state.info.id, offset: caret.start } : null
    this.setupBlocks()
    for (const [id, state] of live.states) {
      if (state.ok) continue
      this.renderBlock(id)
      if (caretAt?.id === id) this.placeCaret(id, caretAt.offset)
    }
  }

  // ---- what the user does ----

  private blockOf(target: EventTarget | Node | null): BlockState | null {
    const live = this.live
    if (!live || !target) return null
    const node = target as Node
    const el = (node.nodeType === 1 ? node : node.parentNode) as Element | null
    const block = el?.closest?.(`[${BLOCK_ATTR}]`)
    if (!block) return null
    const state = live.states.get(block.getAttribute(BLOCK_ATTR) ?? '')
    return state && state.el === block && state.ok ? state : null
  }

  /** The selection, when it lies inside one editable block. */
  private selectionIn(): {
    state: BlockState
    start: number
    end: number
    collapsed: boolean
    range: Range
  } | null {
    const live = this.live
    const selection = live?.doc.getSelection()
    if (!live || !selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const state = this.blockOf(range.startContainer)
    if (!state || this.blockOf(range.endContainer) !== state) return null
    const start = offsetAt(state.el, state.roles, range.startContainer, range.startOffset)
    const end = offsetAt(state.el, state.roles, range.endContainer, range.endOffset)
    return { state, start, end, collapsed: range.collapsed, range }
  }

  private placeCaret(id: string, start: number, end = start, after = false): void {
    const live = this.live
    const state = live?.states.get(id)
    if (!live || !state) return
    state.el.focus?.({ preventScroll: true })
    const selection = live.doc.getSelection()
    if (!selection) return
    const from = pointAt(state.el, state.roles, start, after || end !== start)
    const to = end === start ? from : pointAt(state.el, state.roles, end)
    const range = live.doc.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    selection.removeAllRanges()
    selection.addRange(range)
    state.el.scrollIntoView?.({ block: 'nearest' })
  }

  private onInput(e: Event): void {
    const state = this.blockOf(e.target)
    if (!state || !this.editableNow()) return
    this.markPending(state.info.id)
  }

  private markPending(id: string): void {
    const first = this.pending.size === 0
    this.pending.add(id)
    this.changes++
    if (first) {
      this.host.api.setDirty?.(true)
      this.host.changed()
    }
    this.schedule()
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      // the input method's text is sent once it is committed
      if (this.composingNow) this.schedule()
      else void this.flush()
    }, this.flushDelay)
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.isComposing || e.keyCode === 229) return
    const state = this.blockOf(e.target)
    if (!state || !this.editableNow()) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        void (e.shiftKey ? this.lineBreak() : this.split())
        return
      case 'Backspace': {
        const sel = this.selectionIn()
        if (sel?.collapsed && sel.start === 0) {
          e.preventDefault()
          void this.merge('previous')
        }
        return
      }
      case 'Delete': {
        const sel = this.selectionIn()
        if (sel?.collapsed && sel.start === domPlainText(sel.state.el, sel.state.roles).length) {
          e.preventDefault()
          void this.merge('next')
        }
        return
      }
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowRight':
      case 'ArrowDown':
        if (!e.shiftKey && this.stepOut(e.key)) e.preventDefault()
        return
    }
  }

  /** Arrow keys at the edge of a block go on into the next editable block. */
  private stepOut(key: string): boolean {
    const live = this.live
    const sel = this.selectionIn()
    if (!live || !sel || !sel.collapsed) return false
    const backward = key === 'ArrowLeft' || key === 'ArrowUp'
    const length = domPlainText(sel.state.el, sel.state.roles).length
    const vertical = key === 'ArrowUp' || key === 'ArrowDown'
    const atEdge = backward
      ? sel.start === 0 || (vertical && this.onEdgeLine(sel.range, sel.state.el, false))
      : sel.start === length || (vertical && this.onEdgeLine(sel.range, sel.state.el, true))
    if (!atEdge) return false
    const order = [...live.states.values()].filter((s) => s.ok)
    const index = order.indexOf(sel.state)
    const next = order[index + (backward ? -1 : 1)]
    if (!next) return false
    const offset = backward ? domPlainText(next.el, next.roles).length : 0
    this.placeCaret(next.info.id, offset)
    return true
  }

  /** The caret is on the block's first (or last) line. */
  private onEdgeLine(range: Range, el: Element, last: boolean): boolean {
    const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : null
    const caret = rects && rects.length > 0 ? rects[0]! : null
    if (!caret || caret.height === 0) return false
    const box = el.getBoundingClientRect()
    return last
      ? box.bottom - caret.bottom < caret.height * 0.75
      : caret.top - box.top < caret.height * 0.75
  }

  private onBeforeInput(e: InputEvent): void {
    const state = this.blockOf(e.target)
    if (!state) return
    if (!this.editableNow()) {
      e.preventDefault()
      return
    }
    const type = e.inputType ?? ''
    if (type === 'historyUndo' || type === 'historyRedo') {
      e.preventDefault()
      void (type === 'historyUndo' ? this.undo() : this.redo())
      return
    }
    if (type.startsWith('format')) {
      e.preventDefault()
      if (type === 'formatBold') void this.toggleMark('bold')
      else if (type === 'formatItalic') void this.toggleMark('italic')
      return
    }
    switch (type) {
      case 'insertParagraph':
        e.preventDefault()
        void this.split()
        return
      case 'insertLineBreak':
        e.preventDefault()
        void this.lineBreak()
        return
      case 'insertFromPaste':
      case 'insertFromPasteAsQuotation':
      case 'insertFromDrop':
      case 'insertFromYank':
      case 'deleteByDrag':
        e.preventDefault()
        return
    }
    // a change reaching past the block (a selection over several blocks) is not made
    if (!this.selectionIn()) e.preventDefault()
  }

  private onPaste(e: ClipboardEvent): void {
    const state = this.blockOf(e.target)
    if (!state) return
    // never the clipboard's markup: only its plain text
    e.preventDefault()
    if (!this.editableNow()) return
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?|\n/g, ' ')
    if (text) this.insertText(text)
  }

  /** Puts plain text at the caret, replacing the selection (inside one block). */
  insertText(text: string): void {
    const live = this.live
    const sel = this.selectionIn()
    if (!live || !sel || !this.editableNow()) return
    const doc = live.doc as Document & {
      execCommand?: (command: string, ui?: boolean, value?: string) => boolean
    }
    // the browser's own insertion keeps its undo-free typing path and fires `input`
    if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text)) return
    const range = sel.range
    range.deleteContents()
    const node = doc.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    const selection = doc.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    this.markPending(sel.state.info.id)
  }

  // ---- sending ----

  /** Reads the typed blocks back into edits (now, while their drawing is there). */
  private capture(): TypedBatch | null {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const live = this.live
    if (!live || this.pending.size === 0) return null
    const selection = live.doc.getSelection()
    const caret =
      selection && selection.rangeCount > 0 && selection.focusNode
        ? { node: selection.focusNode, offset: selection.focusOffset }
        : null
    const edits: BlockEdit[] = []
    for (const id of this.pending) {
      const state = live.states.get(id)
      if (!state) continue
      const text = domNotation(state.el, state.roles, state.placeholders, {
        caret,
        nbspToSpace: !state.nbsp,
      })
      edits.push({ op: 'replace', blockId: id, text })
    }
    this.pending.clear()
    return { spineIndex: live.spineIndex, path: live.path, edits }
  }

  private async send(batch: TypedBatch | null): Promise<boolean> {
    if (!batch || batch.edits.length === 0) {
      this.typedDone()
      return true
    }
    const result = await this.host.api
      .applyEdits({ spineIndex: batch.spineIndex, edits: batch.edits })
      .catch((err): EpubEditResult => ({ ok: false, error: 'failed', message: String(err) }))
    if (result.ok) {
      this.note(result)
      this.push(this.partsOf([result]))
      if (this.live?.path === result.path) {
        this.takeChapter(result)
        this.repair()
      }
    } else {
      this.refused(result)
      // the screen goes back to what the book holds
      const fresh = await this.host.api.readChapter(batch.spineIndex).catch(() => null)
      if (fresh?.ok && !fresh.broken && this.live?.path === fresh.path) {
        this.versions.set(fresh.path, fresh.version)
        this.takeChapter(fresh)
        this.renderBody()
      }
    }
    this.typedDone()
    return result.ok
  }

  private typedDone(): void {
    if (this.pending.size === 0) this.host.api.setDirty?.(false)
    this.host.changed()
  }

  /** Sends the typed text that is not sent yet. Saves, closes and AI reads call this first. */
  flush(): Promise<void> {
    // read when its turn comes, so edits queued before it see the text they were made on
    return this.run(() => this.send(this.capture())).then(() => undefined)
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task)
    this.chain = next.catch(() => undefined)
    return next
  }

  private note(result: OkEdit): void {
    this.versions.set(result.path, result.version)
    this.backendDirty = result.dirty
    this.changes++
  }

  private partsOf(results: readonly OkEdit[]): HistoryPart[] {
    return results
      .filter((r) => r.replacements.length > 0)
      .map((r) => ({ spineIndex: r.spineIndex, path: r.path, inverse: r.inverse }))
  }

  private push(parts: HistoryPart[]): void {
    if (parts.length === 0) return
    this.undoStack.push({ parts })
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
  }

  private refused(result: FailedEdit, quiet = false): void {
    if (result.error === 'locked') {
      this.locked = true
      this.applyEditable()
      this.host.notify({ key: 'editLocked' })
    } else if (!quiet) {
      this.host.notify({ key: 'editRefused' })
    }
    this.host.changed()
  }

  /** One list of block edits on the chapter on screen; one history entry. */
  private async applyHere(edits: BlockEdit[], quiet = false): Promise<OkEdit | null> {
    const live = this.live
    if (!live) return null
    const result = await this.host.api
      .applyEdits({ spineIndex: live.spineIndex, edits })
      .catch((err): EpubEditResult => ({ ok: false, error: 'failed', message: String(err) }))
    if (!result.ok) {
      this.refused(result, quiet)
      return null
    }
    this.note(result)
    this.push(this.partsOf([result]))
    this.takeChapter(result)
    this.host.changed()
    return result
  }

  // ---- block edits ----

  /** Enter: split a flowing block at the caret. Structural blocks (td, th, figcaption, dt, dd) do nothing. */
  async split(): Promise<void> {
    const sel = this.selectionIn()
    if (!sel || !this.editableNow() || !sel.state.info.flowing) return
    if (!sel.collapsed) {
      sel.range.deleteContents()
      this.markPending(sel.state.info.id)
    }
    const id = sel.state.info.id
    const offset = sel.start
    await this.run(async () => {
      await this.send(this.capture())
      const result = await this.applyHere([{ op: 'split', blockId: id, offset }])
      if (!result || this.live?.path !== result.path) return
      this.renderBody()
      const created = result.created[0]
      if (created) this.placeCaret(created, 0)
    })
  }

  /** Shift+Enter: a line break at the caret (any editable block). */
  async lineBreak(): Promise<void> {
    const sel = this.selectionIn()
    if (!sel || !this.editableNow()) return
    if (!sel.collapsed) {
      sel.range.deleteContents()
      this.markPending(sel.state.info.id)
    }
    const id = sel.state.info.id
    const offset = sel.start
    await this.run(async () => {
      await this.send(this.capture())
      const result = await this.applyHere([{ op: 'line_break', blockId: id, offset }])
      if (!result || this.live?.path !== result.path) return
      this.renderBody()
      const state = this.live.states.get(id)
      // a break at the very end needs a second one on screen to show its empty line
      if (state && offset === domPlainText(state.el, state.roles).length) {
        state.el.appendChild(state.el.ownerDocument.createElement('br'))
      }
      this.placeCaret(id, offset, offset, true)
    })
  }

  /** The editable block next to this one under the same parent (only white space between), as the engine merges. */
  private neighbour(state: BlockState, side: 'previous' | 'next'): BlockState | null {
    const live = this.live
    const parent = state.xml.element.parent
    if (!live || !parent) return null
    const siblings = parent.children
    const step = side === 'next' ? 1 : -1
    for (
      let i = siblings.indexOf(state.xml.element) + step;
      i >= 0 && i < siblings.length;
      i += step
    ) {
      const node = siblings[i]!
      if (node.type === 'text' && node.value.trim() === '' && !node.cdata) continue
      if (node.type !== 'element') return null
      for (const other of live.states.values()) if (other.xml.element === node) return other
      return null
    }
    return null
  }

  /** Backspace at the start (`previous`) or Delete at the end (`next`): merge flowing neighbours, else nothing. */
  async merge(side: 'previous' | 'next'): Promise<void> {
    const sel = this.selectionIn()
    if (!sel || !this.editableNow() || !sel.state.info.flowing) return
    const id = sel.state.info.id
    await this.run(async () => {
      await this.send(this.capture())
      const live = this.live
      const state = live?.states.get(id)
      if (!live || !state || !live.map) return
      const other = this.neighbour(state, side)
      if (!other || !other.info.flowing) return
      const caretBlock = side === 'previous' ? other : state
      const caretId = caretBlock.info.id
      const caretOffset = blockPlainText(live.map, caretBlock.xml).length
      const result = await this.applyHere([{ op: 'merge', blockId: id, with: side }], true)
      if (!result || this.live?.path !== result.path) return
      this.renderBody()
      this.placeCaret(caretId, caretOffset)
    })
  }

  /** Bold or italic on, or off, over the selection (in every editable block it covers). */
  async toggleMark(mark: 'bold' | 'italic'): Promise<void> {
    const live = this.live
    const selection = live?.doc.getSelection()
    if (!live || !selection || selection.rangeCount === 0 || !this.editableNow()) return
    const range = selection.getRangeAt(0)
    if (range.collapsed) return
    const spans: Array<{ id: string; start: number; end: number }> = []
    for (const state of live.states.values()) {
      if (!state.ok || !range.intersectsNode(state.el)) continue
      const start = state.el.contains(range.startContainer)
        ? offsetAt(state.el, state.roles, range.startContainer, range.startOffset)
        : 0
      const end = state.el.contains(range.endContainer)
        ? offsetAt(state.el, state.roles, range.endContainer, range.endOffset)
        : domPlainText(state.el, state.roles).length
      if (end > start) spans.push({ id: state.info.id, start, end })
    }
    if (spans.length === 0) return
    await this.run(async () => {
      await this.send(this.capture())
      const result = await this.applyHere(
        spans.map((s) => ({
          op: 'toggle_mark' as const,
          blockId: s.id,
          mark,
          start: s.start,
          end: s.end,
        })),
      )
      if (!result || this.live?.path !== result.path) return
      this.renderBody()
      const first = spans[0]!
      const last = spans[spans.length - 1]!
      this.selectAcross(first.id, first.start, last.id, last.end)
    })
  }

  private selectAcross(fromId: string, from: number, toId: string, to: number): void {
    const live = this.live
    const a = live?.states.get(fromId)
    const b = live?.states.get(toId)
    if (!live || !a || !b) return
    if (a === b) {
      this.placeCaret(fromId, from, to)
      return
    }
    a.el.focus?.({ preventScroll: true })
    const start = pointAt(a.el, a.roles, from, true)
    const end = pointAt(b.el, b.roles, to)
    const range = live.doc.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const selection = live.doc.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  // ---- history ----

  undo(): Promise<void> {
    return this.history('undo')
  }

  redo(): Promise<void> {
    return this.history('redo')
  }

  private async history(which: 'undo' | 'redo'): Promise<void> {
    if (this.locked) {
      this.host.notify({ key: 'editLocked' })
      return
    }
    await this.run(async () => {
      await this.send(this.capture())
      const from = which === 'undo' ? this.undoStack : this.redoStack
      const entry = from.pop()
      if (!entry) return
      const done = await this.revert(entry)
      if (!done) {
        this.undoStack = []
        this.redoStack = []
        this.host.notify({ key: 'editHistoryFailed' })
        this.host.changed()
        return
      }
      ;(which === 'undo' ? this.redoStack : this.undoStack).push(done.entry)
      this.show(done.results, true)
      this.host.changed()
    })
  }

  /** Applies an entry's inverses, last part first; the entry that reverts this is returned. */
  private async revert(
    entry: HistoryEntry,
  ): Promise<{ entry: HistoryEntry; results: OkEdit[] } | null> {
    const results: OkEdit[] = []
    for (const part of [...entry.parts].reverse()) {
      const result = await this.host.api
        .replaceRanges({
          spineIndex: part.spineIndex,
          version: this.versions.get(part.path) ?? -1,
          replacements: part.inverse,
        })
        .catch((err): EpubEditResult => ({ ok: false, error: 'failed', message: String(err) }))
      if (!result.ok) {
        if (result.error === 'locked') this.refused(result)
        await this.rollback(results)
        return null
      }
      this.note(result)
      results.push(result)
    }
    const parts = results.map((r) => ({
      spineIndex: r.spineIndex,
      path: r.path,
      inverse: r.inverse,
    }))
    return { entry: { parts }, results }
  }

  /** Takes back changes just made, last first (an entry or a batch that could not be made whole). */
  private async rollback(results: readonly OkEdit[]): Promise<void> {
    for (const result of [...results].reverse()) {
      if (result.replacements.length === 0) continue
      const back = await this.host.api
        .replaceRanges({
          spineIndex: result.spineIndex,
          version: this.versions.get(result.path) ?? -1,
          replacements: result.inverse,
        })
        .catch(() => null)
      if (back?.ok) this.note(back)
    }
  }

  /** Brings the screen up to date with changes; with `go`, a change elsewhere is shown there. */
  private show(results: readonly OkEdit[], go: boolean): void {
    const live = this.live
    const here = live ? results.filter((r) => r.path === live.path) : []
    if (live && here.length > 0) {
      const latest = here[here.length - 1]!
      this.takeChapter(latest)
      this.renderBody()
      if (go) this.caretAtChange(latest)
      return
    }
    const elsewhere = results[results.length - 1]
    if (go && elsewhere) {
      const end = changeEnd(elsewhere)
      const block = end === null ? null : blockAt(elsewhere.blocks, end)
      this.host.showChapter(elsewhere.spineIndex, block?.id ?? null)
    }
  }

  private caretAtChange(result: OkEdit): void {
    const live = this.live
    const end = changeEnd(result)
    if (!live || end === null) return
    const info = blockAt(live.blocks, end)
    const state = info ? live.states.get(info.id) : undefined
    if (!info || !state) return
    this.placeCaret(info.id, plainOffsetAtSource(state.xml, end))
  }

  // ---- edits from elsewhere: the AI panel, find and replace ----

  /**
   * Block edits on one or more chapters as one history entry (the AI
   * panel's batches). Each group is all or nothing; with `atomic`, a group
   * that fails takes back the groups before it.
   */
  async applyEditGroups(
    groups: readonly EditGroup[],
    options: { atomic?: boolean } = {},
  ): Promise<EditGroupsOutcome> {
    if (this.locked) {
      return {
        ok: false,
        index: 0,
        failure: { ok: false, error: 'locked', message: 'the book translation of this tab runs' },
        results: [],
      }
    }
    return this.run(async () => {
      await this.send(this.capture())
      let results: OkEdit[] = []
      let failed: { index: number; failure: FailedEdit } | null = null
      for (const [index, group] of groups.entries()) {
        const result = await this.host.api
          .applyEdits({ spineIndex: group.spineIndex, edits: group.edits })
          .catch((err): EpubEditResult => ({ ok: false, error: 'failed', message: String(err) }))
        if (!result.ok) {
          if (result.error === 'locked') this.refused(result, true)
          failed ??= { index, failure: result }
          if (options.atomic) {
            await this.rollback(results)
            results = []
            break
          }
          continue
        }
        this.note(result)
        results.push(result)
      }
      this.push(this.partsOf(results))
      this.show(results, false)
      this.host.changed()
      return failed ? { ok: false, ...failed, results } : { ok: true, results }
    })
  }

  /** Block edits on one chapter, all or nothing, as one history entry. */
  async applyEdits(spineIndex: number, edits: BlockEdit[]): Promise<EpubEditResult> {
    const outcome = await this.applyEditGroups([{ spineIndex, edits }], { atomic: true })
    return outcome.ok ? outcome.results[0]! : outcome.failure
  }

  /** Replaces one match on screen (a DOM range of the chapter frame). False when it cannot be replaced there. */
  async replaceRange(range: Range, replacement: string): Promise<boolean> {
    if (!this.editableNow()) return false
    const state = this.blockOf(range.startContainer)
    if (!state || this.blockOf(range.endContainer) !== state) return false
    const start = offsetAt(state.el, state.roles, range.startContainer, range.startOffset)
    const end = offsetAt(state.el, state.roles, range.endContainer, range.endOffset)
    if (end <= start) return false
    const id = state.info.id
    return this.run(async () => {
      await this.send(this.capture())
      const current = this.live?.states.get(id)
      if (!current) return false
      const text = replacedNotation(current.xml, [{ start, end, text: replacement }])
      const result = await this.applyHere([{ op: 'replace', blockId: id, text }])
      if (!result || this.live?.path !== result.path) return false
      this.renderBody()
      this.placeCaret(id, start + replacement.length)
      return true
    })
  }

  /**
   * Replaces every match in the book, chapter by chapter (each chapter all
   * or nothing), as one history entry. Chapters that cannot be edited are
   * skipped and their matches counted: the matches inside a block, the only
   * ones replacing reaches (a match never spans two blocks). A chapter without
   * blocks (a damaged one) counts what the search lists for it.
   */
  async replaceAll(
    query: string,
    replacement: string,
    chapterCount: number,
  ): Promise<ReplaceAllOutcome | null> {
    if (!normalizeQuery(query)) return null
    if (this.locked) {
      this.host.notify({ key: 'editLocked' })
      return null
    }
    return this.run(async () => {
      await this.send(this.capture())
      const outcome: ReplaceAllOutcome = { replaced: 0, skipped: 0, failed: 0 }
      const results: OkEdit[] = []
      const seen = new Set<string>()
      for (let i = 0; i < chapterCount; i++) {
        const chapter = await this.host.api.readChapter(i).catch(() => null)
        if (!chapter?.ok || seen.has(chapter.path)) continue
        seen.add(chapter.path)
        if (chapter.broken || chapter.readOnly !== null || this.bookReadOnly) {
          outcome.skipped += this.skippedMatches(chapter, query)
          continue
        }
        if (!this.versions.has(chapter.path)) this.versions.set(chapter.path, chapter.version)
        const map = openChapter(chapter.source)
        if (map.broken) continue
        const byStart = new Map(map.blocks.map((b) => [b.outer.start, b]))
        const edits: BlockEdit[] = []
        let count = 0
        for (const info of chapter.blocks) {
          const xml = byStart.get(info.outer.start)
          if (!xml) continue
          const matches = blockMatches(xml, query)
          if (matches.length === 0) continue
          const text = replacedNotation(
            xml,
            matches.map((m) => ({ ...m, text: replacement })),
          )
          edits.push({ op: 'replace', blockId: info.id, text })
          count += matches.length
        }
        if (edits.length === 0) continue
        const result = await this.host.api
          .applyEdits({ spineIndex: i, edits })
          .catch((err): EpubEditResult => ({ ok: false, error: 'failed', message: String(err) }))
        if (!result.ok) {
          outcome.failed += count
          if (result.error === 'locked') {
            this.refused(result, true)
            break
          }
          continue
        }
        this.note(result)
        results.push(result)
        outcome.replaced += count
      }
      this.push(this.partsOf(results))
      this.show(results, false)
      this.host.changed()
      return outcome
    })
  }

  /**
   * The matches replace all leaves in a chapter that cannot be edited: those
   * inside its blocks, as in an editable chapter. A damaged chapter has no
   * blocks: what the search lists for it.
   */
  private skippedMatches(chapter: OkChapter, query: string): number {
    const map = chapter.broken ? null : openChapter(chapter.source)
    if (chapter.broken || !map || map.broken) {
      return countMatches(this.host.readingText(chapter), query)
    }
    const byStart = new Map(map.blocks.map((b) => [b.outer.start, b]))
    let count = 0
    for (const info of chapter.blocks) {
      const xml = byStart.get(info.outer.start)
      if (xml) count += blockMatches(xml, query).length
    }
    return count
  }

  // ---- lock and saving ----

  /** This tab's book translation starts (true) or ends (false). Typed text is sent before the lock. */
  async setTranslationLock(locked: boolean): Promise<boolean> {
    if (locked) await this.flush()
    const now = await this.host.api.setTranslationLock(locked)
    this.locked = now
    this.applyEditable()
    this.host.changed()
    return now
  }

  /** A mark to pass to `saved` once a save started now has ended. */
  saveMark(): number {
    return this.changes
  }

  /** A save ended well: the book is clean unless it changed while saving. */
  saved(mark: number): void {
    if (this.changes === mark && this.pending.size === 0) this.backendDirty = false
    this.host.changed()
  }
}
