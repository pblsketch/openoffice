/**
 * What the AI's five book tools do (spec §7): read_book, read_chapter,
 * find_text, edit_blocks and start_book_translation.
 *
 * The book stays in the main process; these read it chapter by chapter
 * through the same calls the reading screen uses, after the edit controller
 * has sent what was typed. Chapters are numbered from 1 in spine order (the
 * `index` of read_book); block ids are the main process's, unique within
 * their chapter, the same ids the chapter frame and the edit controller use.
 *
 * edit_blocks goes through the edit controller (`applyEditGroups`, atomic),
 * so one call is one entry of the tab's history and is all or nothing. Every
 * op is checked here first, so a refused call names every refused op, not
 * only the first one the main process would meet.
 */
import type { BlockKind, ChapterBlock, NotationContext, OpenChapter } from '@genoffice/epub-engine'
import { isLang, LANGS, type Lang } from '@genoffice/i18n'
import { findInText } from '@genoffice/ui'
import type { EpubBookSummary, EpubChapterResult, EpubReadOnlyReason } from '../../shared/ipc'
import type { EditGroup, EditGroupsOutcome, FailedEdit, OkEdit } from '../edit/controller'
import { blockReadingText } from '../edit/block-text'
import { normalizeQuery } from '../reader/book-search'
import {
  blockNotation,
  blockPlainText,
  checkNotation,
  escapeNotationText,
  newBlockNotationToXhtml,
  openChapter,
} from './engine'

type OkChapter = Extract<EpubChapterResult, { ok: true }>

/** The edit controller as the tools use it. */
export interface BookAiEditor {
  /** this tab's book translation runs: edits are refused */
  readonly isLocked: boolean
  /** sends what was typed; reads after it see it */
  flush(): Promise<void>
  applyEditGroups(
    groups: readonly EditGroup[],
    options?: { atomic?: boolean },
  ): Promise<EditGroupsOutcome>
}

/** What is on screen now, for the per-turn context. */
export interface BookAiView {
  /** the chapter shown (spine index, from 0) */
  spineIndex: number
  /** the blocks in view: first and last id, their positions (from 0) among the drawn blocks */
  visible: { firstId: string; lastId: string; first: number; last: number; total: number } | null
  /** the text selected in the chapter; '' when none */
  selection: string
}

/** A request to open the book-translation window. */
export interface BookTranslationRequest {
  /** the target language */
  lang: Lang
  /** spine indices (from 0) the user named; null for the whole book */
  chapters: number[] | null
}

/**
 * How the request ended: the window opened, a translation of this tab runs
 * already (nothing new was started), or this window has no book translation.
 */
export type BookTranslationAnswer =
  { opened: true } | { running: { done: number; total: number } } | { unavailable: true }

export type StartBookTranslation = (
  request: BookTranslationRequest,
) => BookTranslationAnswer | Promise<BookTranslationAnswer>

/** The editor as the AI's tools see it. */
export interface BookAiHost {
  /** the open book; null while none is open */
  book(): EpubBookSummary | null
  readChapter(spineIndex: number): Promise<EpubChapterResult>
  editor(): BookAiEditor
  /** null while no chapter is shown */
  view(): BookAiView | null
  /** opens the book-translation window (the translating screen); absent where there is none */
  startBookTranslation?: StartBookTranslation | null
}

/** How much one call reads or finds; both can be tuned. */
export interface BookToolLimits {
  /** the most blocks one read_chapter call gives */
  chapterBlocks: number
  /** read_chapter stops after the block that reaches this many characters of text */
  chapterChars: number
  /** the most matches one find_text call lists */
  findResults: number
  /** characters of context on each side of a match */
  findContext: number
}

export const DEFAULT_BOOK_TOOL_LIMITS: BookToolLimits = {
  chapterBlocks: 120,
  chapterChars: 20_000,
  findResults: 50,
  findContext: 40,
}

export type AiReadOnlyReason = 'broken' | 'fixed-layout'

/** One block as the tools give it (spec §7). */
export interface AiBlock {
  id: string
  kind: string
  /** the block's text in the notation */
  text: string
  readOnly: boolean
}

/** A block with what the tools need to check an edit against it. */
interface BlockEntry extends AiBlock {
  flowing: boolean
  /** null for the blocks of a broken chapter (they have no notation) */
  context: NotationContext | null
  /** the text as the in-book search reads it */
  reading: string
  /** characters of text (read_book's count) */
  chars: number
}

interface ChapterView {
  spineIndex: number
  path: string
  version: number
  title: string | null
  readOnlyReason: AiReadOnlyReason | null
  blocks: BlockEntry[]
  /** characters of text in the chapter */
  chars: number
}

/** The outcome of one tool. `detail` feeds the activity line. */
export interface BookToolResult {
  output: string
  isError?: boolean
  mutated?: boolean
  detail?: Record<string, string | number>
}

const BLOCK_TAGS = new Set<string>([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'td',
  'th',
  'figcaption',
  'dt',
  'dd',
  'div',
])

function readOnlyReasonOf(
  reason: EpubReadOnlyReason | null,
  book: EpubBookSummary,
): AiReadOnlyReason | null {
  if (book.fixedLayout) return 'fixed-layout'
  if (reason === 'broken-chapter') return 'broken'
  if (reason === 'fixed-layout-book' || reason === 'fixed-layout-chapter') return 'fixed-layout'
  return null
}

const READ_ONLY_TEXT: Record<AiReadOnlyReason, string> = {
  broken: 'the chapter is broken (not well-formed): it can be read but not changed',
  'fixed-layout': 'the chapter has a fixed layout: it can be read but not changed',
}

/** The title the table of contents gives a spine item; null when it gives none. */
export function chapterTitle(book: EpubBookSummary, spineIndex: number): string | null {
  for (const entry of book.toc.entries) {
    if (entry.spineIndex === spineIndex && entry.title.trim()) return entry.title.trim()
  }
  return null
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * The blocks of a chapter the engine could not read, as an HTML parser sees
 * them: the innermost block elements, read only, numbered `r1`, `r2`, …
 */
function brokenBlocks(source: string): BlockEntry[] {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const out: BlockEntry[] = []
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = el.localName
    if (!BLOCK_TAGS.has(tag)) continue
    const nested = Array.from(el.querySelectorAll('*')).some((d) => BLOCK_TAGS.has(d.localName))
    if (nested) continue
    const reading = collapse(el.textContent ?? '')
    if (!reading) continue
    out.push({
      id: `r${out.length + 1}`,
      kind: tag,
      text: escapeNotationText(reading),
      readOnly: true,
      flowing: false,
      context: null,
      reading,
      chars: reading.length,
    })
  }
  return out
}

/** Main-process block ids matched to the engine's blocks by where they start. */
function blockEntries(chapter: OkChapter & { broken: false }, readOnly: boolean): BlockEntry[] {
  const map = openChapter(chapter.source)
  if (map.broken) return []
  const byStart = new Map<number, ChapterBlock>(map.blocks.map((b) => [b.outer.start, b]))
  const out: BlockEntry[] = []
  for (const info of chapter.blocks) {
    const block = byStart.get(info.outer.start)
    if (!block) continue
    const notation = blockNotation(map as OpenChapter, block)
    out.push({
      id: info.id,
      kind: info.kind as BlockKind,
      text: notation.text,
      readOnly,
      flowing: info.flowing,
      context: notation.context,
      reading: blockReadingText(block).text,
      chars: blockPlainText(map as OpenChapter, block).length,
    })
  }
  return out
}

const json = (value: unknown): string => JSON.stringify(value)

function err(output: string, detail?: Record<string, string | number>): BookToolResult {
  return { output, isError: true, ...(detail ? { detail } : {}) }
}

/** The chapter numbers (from 1) of a value, or an error naming the bad ones. */
function chapterNumbers(value: unknown, count: number): number[] | string {
  if (!Array.isArray(value)) return 'chapters must be a list of chapter numbers'
  const bad = value.filter((n) => !Number.isInteger(n) || n < 1 || n > count)
  if (bad.length > 0) {
    return `chapter number(s) ${bad.map(String).join(', ')} out of range: the book has chapters 1 to ${count} (read_book lists them)`
  }
  return [...new Set(value as number[])].sort((a, b) => a - b)
}

type EditOp =
  | { op: 'replace'; chapter: number; blockId: string; text: string }
  | { op: 'insert_after'; chapter: number; blockId: string; text: string }
  | { op: 'delete'; chapter: number; blockId: string }

const EDIT_OP_NAMES = ['replace', 'insert_after', 'delete'] as const

/** Why the main process refused an edit, in words for the model. */
function failureText(failure: FailedEdit): string {
  switch (failure.error) {
    case 'locked':
      return 'locked: a book translation runs in this tab; nothing can be changed until it ends'
    case 'read-only':
      return `read-only chapter (${failure.readOnly ?? 'read only'})`
    case 'refused': {
      const refusal = failure.refusal
      switch (refusal?.code) {
        case 'unknown-block':
          return `unknown block: ${refusal.message}`
        case 'not-flowing':
          return 'not flowing: insert_after and delete work only on p, h1–h6, li, blockquote and div blocks'
        case 'invalid-notation':
          return `placeholder mismatch: ${refusal.message}`
        case 'no-anchor-host':
          return 'no anchor host: the block carries an id that links point to, and it has no flowing neighbour under the same parent to keep it; it cannot be deleted'
        default:
          return refusal ? `${refusal.code}: ${refusal.message}` : (failure.message ?? 'refused')
      }
    }
    default:
      return failure.message ?? failure.error
  }
}

/**
 * The five tools over one host. Chapter reads are kept per chapter text
 * version, so paging through a chapter does not parse it again.
 */
export class BookTools {
  private readonly cache = new Map<number, ChapterView>()

  constructor(
    private readonly host: () => BookAiHost,
    private readonly limits: BookToolLimits = DEFAULT_BOOK_TOOL_LIMITS,
  ) {}

  /** A chapter as the tools see it; a string says why it cannot be read. */
  private async chapter(book: EpubBookSummary, spineIndex: number): Promise<ChapterView | string> {
    const result = await this.host()
      .readChapter(spineIndex)
      .catch((e: unknown) => ({ ok: false as const, error: 'failed' as const, message: String(e) }))
    if (!result.ok) return result.message ?? result.error
    const cached = this.cache.get(spineIndex)
    if (cached && cached.path === result.path && cached.version === result.version) return cached
    const readOnlyReason = readOnlyReasonOf(result.readOnly, book)
    const blocks = result.broken
      ? brokenBlocks(result.source)
      : blockEntries(result, readOnlyReason !== null)
    const chars = blocks.reduce((sum, b) => sum + b.chars, 0)
    const view: ChapterView = {
      spineIndex,
      path: result.path,
      version: result.version,
      title: chapterTitle(book, spineIndex),
      readOnlyReason,
      blocks,
      chars,
    }
    this.cache.set(spineIndex, view)
    return view
  }

  private openBook(): EpubBookSummary | null {
    return this.host().book()
  }

  // ---- read_book ----

  async readBook(): Promise<BookToolResult> {
    const book = this.openBook()
    if (!book) return err('no book is open')
    await this.host().editor().flush()
    const chapters = []
    for (const item of book.spine) {
      const view = await this.chapter(book, item.index)
      const readOnlyReason =
        typeof view === 'string'
          ? book.fixedLayout || item.fixedLayout
            ? 'fixed-layout'
            : 'broken'
          : view.readOnlyReason
      chapters.push({
        index: item.index + 1,
        href: item.path,
        title: chapterTitle(book, item.index),
        chars: typeof view === 'string' ? 0 : view.chars,
        readOnly: readOnlyReason !== null,
        ...(readOnlyReason ? { readOnlyReason } : {}),
      })
    }
    const out = {
      title: book.metadata.title,
      authors: [...book.metadata.creators],
      language: book.metadata.languages[0] ?? '',
      layout: book.fixedLayout ? 'pre-paginated' : 'reflowable',
      chapters,
      toc: book.toc.entries.map((entry) => ({
        title: entry.title,
        chapterIndex: entry.spineIndex === null ? null : entry.spineIndex + 1,
        depth: entry.depth,
      })),
    }
    return { output: json(out), detail: { chapters: chapters.length } }
  }

  // ---- read_chapter ----

  async readChapter(input: Record<string, unknown>): Promise<BookToolResult> {
    const book = this.openBook()
    if (!book) return err('no book is open')
    const count = book.spine.length
    const number = input.chapter
    if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > count) {
      return err(`chapter must be a chapter number from 1 to ${count} (the index read_book gives)`)
    }
    const n = number as number
    const offsetIn = input.offset ?? 0
    if (!Number.isInteger(offsetIn) || (offsetIn as number) < 0) {
      return err('offset must be a block position from 0', { n })
    }
    const offset = offsetIn as number
    await this.host().editor().flush()
    const view = await this.chapter(book, n - 1)
    if (typeof view === 'string') return err(`chapter ${n} could not be read: ${view}`, { n })
    const blocks: AiBlock[] = []
    let chars = 0
    let at = offset
    while (at < view.blocks.length && blocks.length < this.limits.chapterBlocks) {
      if (blocks.length > 0 && chars >= this.limits.chapterChars) break
      const block = view.blocks[at]!
      blocks.push({ id: block.id, kind: block.kind, text: block.text, readOnly: block.readOnly })
      chars += block.text.length
      at++
    }
    const out = {
      chapter: n,
      title: view.title,
      readOnly: view.readOnlyReason !== null,
      ...(view.readOnlyReason ? { readOnlyReason: view.readOnlyReason } : {}),
      totalBlocks: view.blocks.length,
      offset,
      blocks,
      nextOffset: at < view.blocks.length ? at : null,
    }
    return { output: json(out), detail: { n } }
  }

  // ---- find_text ----

  async findText(input: Record<string, unknown>): Promise<BookToolResult> {
    const book = this.openBook()
    if (!book) return err('no book is open')
    const query = typeof input.query === 'string' ? input.query : ''
    const needle = normalizeQuery(query)
    if (!needle) return err('query must not be empty', { query: '', count: 0 })
    await this.host().editor().flush()
    const results: Array<{
      chapter: number
      blockId: string
      before: string
      match: string
      after: string
    }> = []
    let truncated = false
    const context = this.limits.findContext
    outer: for (const item of book.spine) {
      const view = await this.chapter(book, item.index)
      if (typeof view === 'string') continue
      for (const block of view.blocks) {
        const hits = findInText(block.reading, needle, { matchCase: false, wholeWord: false })
        for (const at of hits) {
          if (results.length >= this.limits.findResults) {
            truncated = true
            break outer
          }
          const end = at + needle.length
          results.push({
            chapter: item.index + 1,
            blockId: block.id,
            before: block.reading.slice(Math.max(0, at - context), at),
            match: block.reading.slice(at, end),
            after: block.reading.slice(end, end + context),
          })
        }
      }
    }
    const out = truncated
      ? {
          results,
          truncated: true,
          note: `only the first ${this.limits.findResults} matches are listed; search for a longer phrase to narrow them down`,
        }
      : { results }
    return { output: json(out), detail: { query: needle, count: results.length } }
  }

  // ---- edit_blocks ----

  async editBlocks(input: Record<string, unknown>): Promise<BookToolResult> {
    const book = this.openBook()
    if (!book) return err('no book is open', { done: 0 })
    if (book.fixedLayout) {
      return err(
        'refused: this book has a fixed layout; its text cannot be changed. Nothing was changed.',
        { done: 0 },
      )
    }
    const editor = this.host().editor()
    if (editor.isLocked) {
      return err(
        'refused: locked — a book translation runs in this tab; nothing can be changed until it ends. Nothing was changed.',
        { done: 0 },
      )
    }
    const raw = input.ops
    if (!Array.isArray(raw) || raw.length === 0) {
      return err('ops must be a non-empty list of edits', { done: 0 })
    }
    const count = book.spine.length
    // the shape of every op first
    const ops: EditOp[] = []
    const shapeProblems: string[] = []
    raw.forEach((value: unknown, i) => {
      const op = (value ?? {}) as Record<string, unknown>
      const name = op.op
      const label = `op ${i + 1}`
      if (!EDIT_OP_NAMES.includes(name as never)) {
        shapeProblems.push(`${label}: op must be one of ${EDIT_OP_NAMES.join(', ')}`)
        return
      }
      if (
        !Number.isInteger(op.chapter) ||
        (op.chapter as number) < 1 ||
        (op.chapter as number) > count
      ) {
        shapeProblems.push(`${label}: chapter must be a chapter number from 1 to ${count}`)
        return
      }
      if (typeof op.blockId !== 'string' || op.blockId === '') {
        shapeProblems.push(`${label}: blockId is missing`)
        return
      }
      if (name !== 'delete' && typeof op.text !== 'string') {
        shapeProblems.push(`${label}: text is missing`)
        return
      }
      ops.push(
        name === 'delete'
          ? { op: 'delete', chapter: op.chapter as number, blockId: op.blockId }
          : {
              op: name as 'replace' | 'insert_after',
              chapter: op.chapter as number,
              blockId: op.blockId,
              text: op.text as string,
            },
      )
    })
    if (shapeProblems.length > 0) {
      return err(`Refused; nothing was changed.\n${shapeProblems.join('\n')}`, { done: 0 })
    }

    // then every op against the book as it is
    await editor.flush()
    const problems: string[] = []
    const deleted = new Map<number, Set<string>>()
    for (const [i, op] of ops.entries()) {
      const label = `op ${i + 1} (${op.op}, chapter ${op.chapter}, block ${op.blockId})`
      const view = await this.chapter(book, op.chapter - 1)
      if (typeof view === 'string') {
        problems.push(`${label}: the chapter could not be read (${view})`)
        continue
      }
      if (view.readOnlyReason) {
        problems.push(`${label}: read-only chapter — ${READ_ONLY_TEXT[view.readOnlyReason]}`)
        continue
      }
      const gone = deleted.get(op.chapter)
      if (gone?.has(op.blockId)) {
        problems.push(`${label}: unknown block — an earlier op of this call deletes it`)
        continue
      }
      const block = view.blocks.find((b) => b.id === op.blockId)
      if (!block || !block.context) {
        problems.push(`${label}: unknown block — chapter ${op.chapter} has no block with this id`)
        continue
      }
      if (op.op !== 'replace' && !block.flowing) {
        problems.push(
          `${label}: not flowing — a ${block.kind} block takes only replace; insert_after and delete work on p, h1–h6, li, blockquote and div blocks`,
        )
        continue
      }
      if (op.op === 'replace') {
        const check = checkNotation(op.text, block.context)
        if (!check.ok) problems.push(`${label}: placeholder mismatch — ${check.error}`)
      } else if (op.op === 'insert_after') {
        const check = newBlockNotationToXhtml(op.text)
        if (!check.ok) {
          problems.push(
            `${label}: invalid text for a new block — only <b>, <i> and <br/> may be used (${check.error})`,
          )
        }
      } else {
        if (!gone) deleted.set(op.chapter, new Set([op.blockId]))
        else gone.add(op.blockId)
      }
    }
    if (problems.length > 0) {
      return err(`Refused; nothing was changed.\n${problems.join('\n')}`, { done: 0 })
    }

    // consecutive ops on one chapter go as one group; the order of the call is kept
    const groups: EditGroup[] = []
    const opOf: number[][] = []
    for (const [i, op] of ops.entries()) {
      const spineIndex = op.chapter - 1
      const last = groups[groups.length - 1]
      const edit =
        op.op === 'delete'
          ? { op: 'delete' as const, blockId: op.blockId }
          : { op: op.op, blockId: op.blockId, text: op.text }
      if (last && last.spineIndex === spineIndex) {
        last.edits.push(edit)
        opOf[opOf.length - 1]!.push(i)
      } else {
        groups.push({ spineIndex, edits: [edit] })
        opOf.push([i])
      }
    }
    const outcome = await editor.applyEditGroups(groups, { atomic: true })
    if (!outcome.ok) {
      const failure = outcome.failure
      const opIndex = opOf[outcome.index]?.[failure.index ?? 0] ?? opOf[outcome.index]?.[0] ?? 0
      const op = ops[opIndex]!
      return err(
        `Refused; nothing was changed.\nop ${opIndex + 1} (${op.op}, chapter ${op.chapter}, block ${op.blockId}): ${failureText(failure)}`,
        { done: 0 },
      )
    }
    return {
      output: this.appliedText(ops.length, outcome.results),
      mutated: true,
      detail: { done: ops.length },
    }
  }

  private appliedText(count: number, results: readonly OkEdit[]): string {
    const lines = [
      `Applied ${count} edit(s) as one step; the user can take the whole call back with Ctrl+Z. The book is not saved until the user saves it.`,
    ]
    for (const result of results) {
      if (result.created.length > 0) {
        lines.push(
          `New block id(s) in chapter ${result.spineIndex + 1}: ${result.created.join(', ')}`,
        )
      }
    }
    return lines.join('\n')
  }

  // ---- start_book_translation ----

  async startTranslation(input: Record<string, unknown>): Promise<BookToolResult> {
    const book = this.openBook()
    if (!book) return err('no book is open')
    const lang = input.lang
    if (typeof lang !== 'string' || !isLang(lang)) {
      return err(
        `lang must be one of ${LANGS.join(', ')}; tell the user which languages are available`,
      )
    }
    if (book.fixedLayout) {
      return err(
        'Refused: this book has a fixed layout, and fixed-layout books cannot be translated. Tell the user.',
      )
    }
    let chapters: number[] | null = null
    if (input.chapters !== undefined && input.chapters !== null) {
      const numbers = chapterNumbers(input.chapters, book.spine.length)
      if (typeof numbers === 'string') return err(numbers)
      chapters = numbers.map((n) => n - 1)
    }
    const start = this.host().startBookTranslation
    const answer: BookTranslationAnswer = start
      ? await Promise.resolve(start({ lang, chapters })).catch((): BookTranslationAnswer => ({
          unavailable: true,
        }))
      : { unavailable: true }
    if ('unavailable' in answer) {
      return err('Book translation is not available in this window; tell the user.')
    }
    if ('running' in answer) {
      const { done, total } = answer.running
      return {
        output: `A translation of this book is already running in this tab (${done}/${total}); its progress is shown in the editor. Nothing new was started.`,
      }
    }
    return {
      output:
        `Opened the book-translation window with ${lang} preselected` +
        (chapters ? ` and chapter(s) ${chapters.map((i) => i + 1).join(', ')} chosen` : '') +
        '. The user now checks the chapters and the output and confirms the provider and the number of calls; nothing has been sent and nothing is translated until they press Start. ' +
        'The translation then runs as a separate job and writes a new EPUB file. Tell the user briefly what to do in the window; do not wait for it, do not claim the book was translated, and do not translate it yourself.',
    }
  }
}
