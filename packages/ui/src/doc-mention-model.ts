import { attachmentFolderLabel } from './attachment-folder'
import type {
  DocMentionGroup,
  DocMentionItem,
  DocMentionListResult,
  DocMentionState,
} from './doc-mention-types'

/**
 * The rules of the AI input's `@` document list as plain functions: when the
 * list opens, the mentions picked from it, what it lists and how it filters,
 * which rows the keys land on, and the text a pick puts in the input.
 * Components only lay these out.
 */

// ---- the bridge every editor's preload exposes -------------------------

/** The `list()` call of this window's `aiOfficeDocs`, or null (no shell behind the editor) */
export function docMentionListCall(): (() => Promise<DocMentionListResult>) | null {
  const b = (globalThis as { aiOfficeDocs?: { list?: unknown } }).aiOfficeDocs
  const list = b?.list
  return typeof list === 'function'
    ? () => (list as () => Promise<DocMentionListResult>).call(b)
    : null
}

const GROUPS: readonly DocMentionGroup[] = ['pane', 'open', 'project', 'recent']
const STATES: readonly DocMentionState[] = ['ok', 'modified', 'unsaved']

function isItem(value: unknown): value is DocMentionItem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    (v.path === null || typeof v.path === 'string') &&
    typeof v.name === 'string' &&
    v.name !== '' &&
    typeof v.dir === 'string' &&
    GROUPS.includes(v.group as DocMentionGroup) &&
    STATES.includes(v.state as DocMentionState)
  )
}

/** The rows of the shell's answer; null when there is no list (unavailable, junk) */
export function docMentionListOf(raw: unknown): DocMentionItem[] | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!r || r.ok !== true || !Array.isArray(r.items)) return null
  return r.items.filter(isItem).map((item) => ({ ...item }))
}

// ---- opening ------------------------------------------------------------

/**
 * Longest text between the `@` and the caret that still filters the list.
 * Tunable: past it there is no trigger.
 */
export const DOC_MENTION_QUERY_MAX = 80

/** The `@query` the caret sits at the end of */
export interface DocMentionTrigger {
  /** index of the `@` */
  start: number
  /** the caret: the typed text runs from `start` to here */
  end: number
  /** what follows the `@`, the filter (spaces included) */
  query: string
}

/** A mention picked from the list: the text put in (without the space after it) and where */
export interface DocMentionSpan {
  start: number
  text: string
}

export interface DocMentionTriggerOptions {
  /** the picked mentions in the input: no list opens in or right after one */
  mentions?: readonly DocMentionSpan[] | undefined
  /** an input-method composition (Hangul) is running: never open */
  composing?: boolean | undefined
  /** defaults to DOC_MENTION_QUERY_MAX */
  maxQuery?: number | undefined
}

function inSpan(spans: readonly DocMentionSpan[], index: number): boolean {
  return spans.some((s) => index >= s.start && index < s.start + s.text.length)
}

/**
 * Whether the document list opens at `caret`. Looking back from the caret on
 * the same line, the base `@` is the nearest one at the start of the input or
 * right after whitespace that is not part of a picked mention; any other `@`
 * (`a@b`, `[@`, `=@`) is skipped. Spaces may follow the `@`. None when the
 * caret is inside or right after a picked mention, or the typed text is longer
 * than the longest query.
 */
export function docMentionTriggerAt(
  value: string,
  caret: number,
  options: DocMentionTriggerOptions = {},
): DocMentionTrigger | null {
  if (options.composing) return null
  if (!Number.isInteger(caret) || caret < 1 || caret > value.length) return null
  const spans = options.mentions ?? []
  if (spans.some((s) => caret > s.start && caret <= s.start + s.text.length)) return null
  const max = options.maxQuery ?? DOC_MENTION_QUERY_MAX
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = value.charAt(i)
    if (ch === '\n' || ch === '\r') return null
    if (caret - i - 1 > max) return null
    if (ch !== '@') continue
    if (i > 0 && !/\s/.test(value.charAt(i - 1))) continue
    if (inSpan(spans, i)) continue
    return { start: i, end: caret, query: value.slice(i + 1, caret) }
  }
  return null
}

/**
 * The picked mentions after the input changed from `prev` to `next`: one
 * before the edited part keeps its place, one after it moves by the length
 * change, and one the edit touched (even one character) is no longer a picked
 * mention. A mention whose text is not where it should be is dropped.
 */
export function relocateDocMentions(
  prev: string,
  next: string,
  spans: readonly DocMentionSpan[],
): DocMentionSpan[] {
  if (prev === next) return [...spans]
  let head = 0
  const shortest = Math.min(prev.length, next.length)
  while (head < shortest && prev.charCodeAt(head) === next.charCodeAt(head)) head += 1
  let tail = 0
  while (
    tail < shortest - head &&
    prev.charCodeAt(prev.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
  ) {
    tail += 1
  }
  const editedEnd = prev.length - tail
  const shift = next.length - prev.length
  const out: DocMentionSpan[] = []
  for (const span of spans) {
    const spanEnd = span.start + span.text.length
    let start: number
    if (spanEnd <= head) start = span.start
    else if (span.start >= editedEnd) start = span.start + shift
    else continue
    if (next.slice(start, start + span.text.length) === span.text) {
      out.push({ start, text: span.text })
    }
  }
  return out
}

// ---- what the list shows ----------------------------------------------

function fold(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase()
}

/**
 * The rows matching what was typed after `@`, by file name, case-folded:
 * names that start with it first, then names that contain it; within each,
 * pane → open → project → recent and the shell's order. Greyed rows (modified, unsaved)
 * match like the others.
 */
export function filterDocMentions(
  items: readonly DocMentionItem[],
  query: string,
): DocMentionItem[] {
  const q = fold(query)
  const ranked: Array<{ item: DocMentionItem; rank: number; group: number; index: number }> = []
  items.forEach((item, index) => {
    const name = fold(item.name)
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1
    if (rank >= 0) ranked.push({ item, rank, group: GROUPS.indexOf(item.group), index })
  })
  ranked.sort((a, b) => a.rank - b.rank || a.group - b.group || a.index - b.index)
  return ranked.map((r) => r.item)
}

/** A row that can be picked: a saved document with no unsaved changes */
export function isDocMentionPickable(item: DocMentionItem): boolean {
  return item.state === 'ok' && item.path !== null
}

function pickableAt(rows: readonly DocMentionItem[], index: number): boolean {
  if (index === rows.length) return true
  const row = rows[index]
  return !!row && isDocMentionPickable(row)
}

/** The row highlighted first: the first pickable one, else "Find more…" (`rows.length`) */
export function docMentionFirstRow(rows: readonly DocMentionItem[]): number {
  const index = rows.findIndex(isDocMentionPickable)
  return index >= 0 ? index : rows.length
}

/** The next (1) or previous (-1) pickable row, wrapping through "Find more…" (`rows.length`) */
export function docMentionStepRow(
  rows: readonly DocMentionItem[],
  active: number,
  step: 1 | -1,
): number {
  const count = rows.length + 1
  let index = active
  for (let i = 0; i < count; i += 1) {
    index = (index + step + count) % count
    if (pickableAt(rows, index)) return index
  }
  return rows.length
}

// ---- the inserted text --------------------------------------------------

/** A document as the collision rule sees it */
export interface DocMentionDoc {
  path: string | null
  name: string
}

/** The file name at the end of a path; both `\` and `/` separate */
export function docFileName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? path
}

function pathKey(path: string): string {
  return path.replace(/\\/g, '/').toLocaleLowerCase()
}

/** Whether two paths name the same file (separators and case aside) */
export function sameDocPath(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && pathKey(a) === pathKey(b)
}

/**
 * The mention for a picked document: `@<name>`, or `@<name>(<folder>)` when
 * `pool` (the latest list and the attachments) holds another path with the
 * same file name, case-insensitively. No parentheses when the folder label is ''.
 */
export function docMentionLabel(
  picked: { path: string; name: string },
  pool: readonly DocMentionDoc[],
): string {
  const name = fold(picked.name)
  const repeats = pool.some((d) => fold(d.name) === name && !sameDocPath(d.path, picked.path))
  const folder = repeats ? attachmentFolderLabel(picked.path) : ''
  return folder ? `@${picked.name}(${folder})` : `@${picked.name}`
}

/**
 * The input with the typed `@query` replaced by the mentions of the attached
 * documents, each followed by one space, the caret after them, and the spans
 * to remember. The documents themselves count in the collision pool.
 */
export function insertDocMentions(
  value: string,
  at: { start: number; end: number },
  docs: ReadonlyArray<{ path: string; name: string }>,
  pool: readonly DocMentionDoc[],
): { value: string; caret: number; spans: DocMentionSpan[] } {
  const all = [...pool, ...docs]
  const spans: DocMentionSpan[] = []
  let text = ''
  for (const d of docs) {
    const label = docMentionLabel(d, all)
    spans.push({ start: at.start + text.length, text: label })
    text += `${label} `
  }
  return {
    value: value.slice(0, at.start) + text + value.slice(at.end),
    caret: at.start + text.length,
    spans,
  }
}
