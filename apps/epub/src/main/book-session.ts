/**
 * One open book in the main process, Electron-free (the main module binds it
 * to a view; the tests drive it directly).
 *
 * The session holds the only copy of the book's bytes, the book the engine
 * opened from them, and for every chapter read so far its stored text, its
 * current text and the range replacements between the two. Edits arrive as
 * engine block edits or as range replacements; either way the chapter is
 * re-read for its blocks and the replacements are composed against the stored
 * text, so a save rewrites only the edited ranges (spec §6, §12.1).
 *
 * Refused here, whatever the renderer asks: any edit while the tab's book
 * translation runs (spec §5), any edit of a fixed-layout book or chapter or of
 * a broken chapter (spec §3), replacements against a version of the chapter
 * that is no longer current, and replacements that reach outside the blocks'
 * inner ranges without taking the chapter back to a text it already had in
 * this session (what undo, redo and rollback send).
 *
 * The book reads from the session's bytes themselves (the engine is handed
 * them, not given a copy), and a save writes from the opened book, so the
 * main process holds one copy of each book.
 */
import { createHash } from 'node:crypto'
import {
  applyBlockEdits,
  applyReplacements,
  composeReplacements,
  epubDocumentHash,
  extractChapterText,
  openChapter,
  openEpub,
  remapChapter,
  saveEpub,
  validateReplacements,
  type BlockEdit,
  type ChapterMap,
  type EpubBook,
  type EpubRefusalReason,
  type EpubSaveResult,
  type OpenChapter,
  type RangeReplacement,
} from '@genoffice/epub-engine'
import type {
  EpubBlockInfo,
  EpubBookSummary,
  EpubChapterResult,
  EpubEditResult,
  EpubReadOnlyReason,
} from '../shared/ipc'

interface ChapterState {
  path: string
  /** the text as stored in the session's bytes */
  stored: string
  /** the current text with the block map; a broken chapter never changes */
  map: ChapterMap
  /** current = applyReplacements(stored, replacements) */
  replacements: RangeReplacement[]
  /** false when the entry is not valid in its encoding: read only, like a broken chapter */
  valid: boolean
  version: number
  /** digests of every text the chapter has had in this session: where range replacements may take it back */
  seen: Set<string>
}

/** What a save would write, and the chapter texts it was made from. */
export interface PreparedSave {
  result: EpubSaveResult
  /** every chapter's text when the save was prepared, by entry path */
  snapshot: Map<string, string>
}

export type OpenSessionResult =
  { ok: true; session: EpubBookSession } | { ok: false; reason: EpubRefusalReason }

const BLOCK_EDIT_OPS = new Set([
  'replace',
  'insert_after',
  'delete',
  'split',
  'merge',
  'line_break',
  'toggle_mark',
])

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isOffset = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0

/** A block edit as it came over IPC, checked field by field; null when it is not one. */
export function blockEditOf(v: unknown): BlockEdit | null {
  if (!isRecord(v) || typeof v.op !== 'string' || !BLOCK_EDIT_OPS.has(v.op)) return null
  if (typeof v.blockId !== 'string' || v.blockId.length === 0 || v.blockId.length > 64) return null
  const blockId = v.blockId
  switch (v.op) {
    case 'replace':
      if (typeof v.text !== 'string') return null
      if (v.dropRuby !== undefined && typeof v.dropRuby !== 'boolean') return null
      return {
        op: 'replace',
        blockId,
        text: v.text,
        ...(v.dropRuby !== undefined ? { dropRuby: v.dropRuby } : {}),
      }
    case 'insert_after':
      return typeof v.text === 'string' ? { op: 'insert_after', blockId, text: v.text } : null
    case 'delete':
      return { op: 'delete', blockId }
    case 'split':
      return isOffset(v.offset) ? { op: 'split', blockId, offset: v.offset } : null
    case 'merge':
      return v.with === 'previous' || v.with === 'next'
        ? { op: 'merge', blockId, with: v.with }
        : null
    case 'line_break':
      return isOffset(v.offset) ? { op: 'line_break', blockId, offset: v.offset } : null
    case 'toggle_mark':
      if (v.mark !== 'bold' && v.mark !== 'italic') return null
      if (!isOffset(v.start) || !isOffset(v.end) || v.end < v.start) return null
      return { op: 'toggle_mark', blockId, mark: v.mark, start: v.start, end: v.end }
  }
  return null
}

/** Range replacements as they came over IPC; null when any is not one. */
export function replacementsOf(v: unknown): RangeReplacement[] | null {
  if (!Array.isArray(v)) return null
  const out: RangeReplacement[] = []
  for (const r of v) {
    if (!isRecord(r) || !isOffset(r.start) || !isOffset(r.end) || typeof r.text !== 'string') {
      return null
    }
    out.push({ start: r.start, end: r.end, text: r.text })
  }
  return out
}

/**
 * The replacements that undo `replacements` (made on `before`), in the
 * coordinates of the text they produced.
 */
export function invertReplacements(
  before: string,
  replacements: readonly RangeReplacement[],
): RangeReplacement[] {
  const sorted = [...replacements].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: RangeReplacement[] = []
  let delta = 0
  for (const r of sorted) {
    const start = r.start + delta
    out.push({ start, end: start + r.text.length, text: before.slice(r.start, r.end) })
    delta += r.text.length - (r.end - r.start)
  }
  return out
}

/** One replacement turning `from` into `to`: the span between their common prefix and suffix. */
export function diffReplacement(from: string, to: string): RangeReplacement {
  let head = 0
  const max = Math.min(from.length, to.length)
  while (head < max && from.charCodeAt(head) === to.charCodeAt(head)) head++
  let tail = 0
  while (
    tail < max - head &&
    from.charCodeAt(from.length - 1 - tail) === to.charCodeAt(to.length - 1 - tail)
  ) {
    tail++
  }
  return { start: head, end: from.length - tail, text: to.slice(head, to.length - tail) }
}

/** The digest a chapter text is remembered by in `ChapterState.seen`. */
function textDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('base64')
}

/** Whether every replacement lies inside the inner range of one of the chapter's blocks. */
function insideBlocks(map: OpenChapter, replacements: readonly RangeReplacement[]): boolean {
  return replacements.every((r) =>
    map.blocks.some((b) => b.inner.start <= r.start && r.end <= b.inner.end),
  )
}

function blockInfo(map: OpenChapter): EpubBlockInfo[] {
  return map.blocks.map((b) => ({
    id: b.id,
    kind: b.kind,
    tag: b.tag,
    flowing: b.flowing,
    outer: { start: b.outer.start, end: b.outer.end },
    inner: { start: b.inner.start, end: b.inner.end },
  }))
}

/** The plain data of a book the renderer gets on open. */
export function bookSummary(book: EpubBook): EpubBookSummary {
  return {
    opfPath: book.opfPath,
    version: book.version,
    metadata: book.metadata,
    manifest: book.manifest.map((m) => ({
      id: m.id,
      href: m.href,
      path: m.path,
      mediaType: m.mediaType,
      properties: [...m.properties],
    })),
    spine: book.spine.items.map((i) => ({
      index: i.index,
      idref: i.idref,
      path: i.path,
      mediaType: i.mediaType,
      linear: i.linear,
      properties: [...i.properties],
      layout: i.layout,
      fixedLayout: i.fixedLayout,
    })),
    pageProgressionDirection: book.spine.pageProgressionDirection,
    toc: { source: book.toc.source, entries: book.toc.entries.map((e) => ({ ...e })) },
    fixedLayout: book.fixedLayout,
    verticalWriting: book.verticalWriting,
  }
}

export class EpubBookSession {
  private chapters = new Map<string, ChapterState>()
  private translationLocked = false

  private constructor(
    private currentBytes: Uint8Array,
    private currentBook: EpubBook,
    private currentDocHash: string,
  ) {}

  /**
   * Opens `bytes` through the engine (and so the zip gate). The session takes
   * the bytes over: the caller must not change them afterwards.
   */
  static async open(bytes: Uint8Array): Promise<OpenSessionResult> {
    const opened = await openEpub(bytes, { takeOwnership: true })
    if (!opened.ok) return { ok: false, reason: opened.reason }
    return {
      ok: true,
      session: new EpubBookSession(bytes, opened.book, await epubDocumentHash(bytes)),
    }
  }

  /** the bytes the book was opened from or last saved as */
  get bytes(): Uint8Array {
    return this.currentBytes
  }

  get book(): EpubBook {
    return this.currentBook
  }

  /** the store key of `bytes` */
  get docHash(): string {
    return this.currentDocHash
  }

  get locked(): boolean {
    return this.translationLocked
  }

  setLocked(locked: boolean): void {
    this.translationLocked = locked
  }

  summary(): EpubBookSummary {
    return bookSummary(this.currentBook)
  }

  /** the whole book's read-only reason, or null */
  bookReadOnly(): EpubReadOnlyReason | null {
    return this.currentBook.fixedLayout ? 'fixed-layout-book' : null
  }

  private async state(path: string): Promise<ChapterState> {
    const known = this.chapters.get(path)
    if (known) return known
    const decoded = await this.currentBook.readText(path)
    const stored = decoded?.text ?? ''
    const valid = decoded?.valid ?? false
    const state: ChapterState = {
      path,
      stored,
      map: openChapter(stored),
      replacements: [],
      valid,
      version: 0,
      seen: new Set([textDigest(stored)]),
    }
    // a second read may have finished first: keep the one already there
    const raced = this.chapters.get(path)
    if (raced) return raced
    this.chapters.set(path, state)
    return state
  }

  private readOnlyOf(state: ChapterState): EpubReadOnlyReason | null {
    if (this.currentBook.fixedLayout) return 'fixed-layout-book'
    const path = state.path
    // a chapter listed twice in the spine is read only when either listing is fixed layout
    if (this.currentBook.spine.items.some((i) => i.path === path && i.fixedLayout)) {
      return 'fixed-layout-chapter'
    }
    if (state.map.broken || !state.valid) return 'broken-chapter'
    return null
  }

  private spineItem(spineIndex: unknown) {
    if (!Number.isSafeInteger(spineIndex)) return null
    return this.currentBook.spine.items[spineIndex as number] ?? null
  }

  async readChapter(spineIndex: unknown): Promise<EpubChapterResult> {
    const item = this.spineItem(spineIndex)
    if (!item) return { ok: false, error: 'invalid-request', message: 'no such chapter' }
    const state = await this.state(item.path)
    const base = {
      ok: true as const,
      spineIndex: item.index,
      path: item.path,
      source: state.map.source,
      version: state.version,
    }
    if (state.map.broken) {
      return { ...base, broken: true, error: state.map.error, readOnly: 'broken-chapter' }
    }
    if (!state.valid) {
      return {
        ...base,
        broken: true,
        error: 'not valid in its encoding',
        readOnly: 'broken-chapter',
      }
    }
    return {
      ...base,
      broken: false,
      blocks: blockInfo(state.map),
      readOnly: this.readOnlyOf(state),
    }
  }

  /** The common refusals of every edit; the chapter's state when it may be edited. */
  private async editable(
    spineIndex: unknown,
  ): Promise<{ state: ChapterState & { map: OpenChapter }; index: number } | EpubEditResult> {
    const item = this.spineItem(spineIndex)
    if (!item) return { ok: false, error: 'invalid-request', message: 'no such chapter' }
    if (this.translationLocked) {
      return { ok: false, error: 'locked', message: 'the book translation of this tab runs' }
    }
    const state = await this.state(item.path)
    const readOnly = this.readOnlyOf(state)
    if (readOnly || state.map.broken) {
      return {
        ok: false,
        error: 'read-only',
        readOnly: readOnly ?? 'broken-chapter',
        message: `the chapter is read only (${readOnly ?? 'broken-chapter'})`,
      }
    }
    return { state: state as ChapterState & { map: OpenChapter }, index: item.index }
  }

  private commitEdit(
    state: ChapterState,
    index: number,
    next: OpenChapter,
    replacements: RangeReplacement[],
    created: string[],
  ): EpubEditResult {
    const before = state.map.source
    if (replacements.length > 0) {
      state.replacements = composeReplacements(state.stored, state.replacements, replacements)
      state.map = next
      state.version++
      state.seen.add(textDigest(next.source))
    }
    return {
      ok: true,
      spineIndex: index,
      path: state.path,
      source: state.map.source,
      version: state.version,
      blocks: blockInfo(next),
      created,
      replacements,
      inverse: invertReplacements(before, replacements),
      dirty: this.isDirty(),
    }
  }

  /** Engine block edits on one chapter, all or nothing. */
  async applyEdits(spineIndex: unknown, rawEdits: unknown): Promise<EpubEditResult> {
    if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
      return { ok: false, error: 'invalid-request', message: 'edits must be a non-empty list' }
    }
    const edits: BlockEdit[] = []
    for (const raw of rawEdits) {
      const edit = blockEditOf(raw)
      if (!edit) return { ok: false, error: 'invalid-request', message: 'not a block edit' }
      edits.push(edit)
    }
    const target = await this.editable(spineIndex)
    if ('ok' in target) return target
    const { state, index } = target
    let applied: ReturnType<typeof applyBlockEdits>
    try {
      applied = applyBlockEdits(state.map, edits)
    } catch (err) {
      return { ok: false, error: 'invalid-request', message: messageOf(err) }
    }
    if (!applied.ok) {
      return {
        ok: false,
        error: 'refused',
        refusal: applied.refusal,
        index: applied.index,
        message: applied.refusal.message,
      }
    }
    return this.commitEdit(state, index, applied.map, applied.replacements, applied.created)
  }

  /** Range replacements on one chapter, against the version they were made on. */
  async replaceRanges(
    spineIndex: unknown,
    version: unknown,
    rawReplacements: unknown,
  ): Promise<EpubEditResult> {
    const replacements = replacementsOf(rawReplacements)
    if (!replacements || !Number.isSafeInteger(version)) {
      return { ok: false, error: 'invalid-request', message: 'bad replacements' }
    }
    const target = await this.editable(spineIndex)
    if ('ok' in target) return target
    const { state, index } = target
    if (version !== state.version) {
      return { ok: false, error: 'stale', message: `the chapter is at version ${state.version}` }
    }
    const source = state.map.source
    const problem = validateReplacements(replacements, source.length)
    if (problem) return { ok: false, error: 'invalid-request', message: problem }
    const text = applyReplacements(source, replacements)
    if (text === source) {
      return this.commitEdit(state, index, state.map, [], [])
    }
    // The page edits text inside blocks only; anything else must be a way back
    // (undo, redo, rollback) to a text this chapter has had.
    if (!insideBlocks(state.map, replacements) && !state.seen.has(textDigest(text))) {
      return {
        ok: false,
        error: 'invalid-request',
        message: 'the replacements reach outside the blocks',
      }
    }
    const next = remapChapter(state.map, text, replacements)
    if (next.broken) {
      return {
        ok: false,
        error: 'refused',
        refusal: {
          code: 'not-well-formed',
          message: `the edit would break the chapter: ${next.error}`,
        },
        message: 'the edit would break the chapter',
      }
    }
    const before = new Set(state.map.blocks.map((b) => b.id))
    const created = next.blocks.filter((b) => !before.has(b.id)).map((b) => b.id)
    return this.commitEdit(state, index, next, replacements, created)
  }

  /** Whether any chapter differs from the stored text. */
  isDirty(): boolean {
    for (const state of this.chapters.values()) {
      if (state.map.source !== state.stored) return true
    }
    return false
  }

  /** The range replacements per entry path a save applies, against the stored texts. */
  editsForSave(): Map<string, RangeReplacement[]> {
    const edits = new Map<string, RangeReplacement[]>()
    for (const state of this.chapters.values()) {
      if (state.replacements.length > 0 && state.map.source !== state.stored) {
        edits.set(state.path, state.replacements)
      }
    }
    return edits
  }

  /**
   * The bytes a save would write (or that nothing changed), with the chapter
   * texts they were made from. Nothing is written here.
   */
  async prepareSave(options: { now?: () => Date } = {}): Promise<PreparedSave> {
    const snapshot = new Map<string, string>()
    for (const state of this.chapters.values()) snapshot.set(state.path, state.map.source)
    const result = await saveEpub(this.currentBook, this.editsForSave(), options)
    return { result, snapshot }
  }

  /**
   * The saved bytes are now the book's (handed over, like the bytes a session
   * opens): the book is opened from them, every
   * chapter's text as `prepareSave` saw it becomes its stored text (block ids
   * stay; an edit that arrived while the save ran stays unsaved), and the new
   * document hash is returned.
   */
  async rebase(
    saved: Uint8Array,
    snapshot: ReadonlyMap<string, string>,
  ): Promise<{ oldDocHash: string; newDocHash: string }> {
    const opened = await openEpub(saved, { takeOwnership: true })
    if (!opened.ok) throw new Error(`the saved book does not open (${opened.reason})`)
    const oldDocHash = this.currentDocHash
    const newDocHash = await epubDocumentHash(saved)
    this.currentBytes = saved
    this.currentBook = opened.book
    this.currentDocHash = newDocHash
    for (const state of this.chapters.values()) {
      const stored = snapshot.get(state.path) ?? state.stored
      state.stored = stored
      state.replacements =
        state.map.source === stored ? [] : [diffReplacement(stored, state.map.source)]
    }
    return { oldDocHash, newDocHash }
  }

  /**
   * The book's text in spine order, unsaved edits included: every chapter
   * once, headings as `#` lines, chapters apart by a blank line.
   */
  async readText(): Promise<string> {
    const parts: string[] = []
    const seen = new Set<string>()
    for (const item of this.currentBook.spine.items) {
      if (seen.has(item.path)) continue
      seen.add(item.path)
      const state = await this.state(item.path)
      const text = extractChapterText(state.map.source).trim()
      if (text) parts.push(text)
    }
    return parts.join('\n\n')
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
