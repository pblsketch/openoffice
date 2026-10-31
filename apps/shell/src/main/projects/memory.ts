import { productName } from '@genoffice/i18n'
import type { ProjectMemoryOp, ProjectMemoryRefusal } from '@genoffice/project-store'

/**
 * `memory.md` text (spec 3, 5.6): a comment line explaining the file, then one
 * entry per line, `- text (YYYY-MM-DD)`. People may edit it freely, so every
 * operation keeps the lines it does not touch exactly as they were.
 */

/** Memory above this many characters is still sent whole; the panel offers "[consolidate]" */
export const MEMORY_SOFT_LIMIT_CHARS = 8_000

/** The explanation line a new `memory.md` starts with, in the screen language */
export function memoryHeader(language: string): string {
  const base = language.trim().toLowerCase().split(/[-_]/)[0]
  if (base === 'ko') {
    return `<!-- ${productName('ko')}가 쌓는 기억. 고치거나 지워도 됩니다. -->`
  }
  return `<!-- Memory kept by ${productName('en')}. You may edit or delete it. -->`
}

const DATED = /\s\(\d{4}-\d{2}-\d{2}\)$/
const ENTRY_LINE = /^\s*-\s+(.*\S)\s*$/

/** The text of an entry line without its `- ` marker, or null for another kind of line */
function entryOf(line: string): string | null {
  const match = ENTRY_LINE.exec(line)
  return match ? match[1]! : null
}

/**
 * Whether the memory text says anything: a file holding only blank lines and
 * whole-line HTML comments (the header) is empty, and is neither sent nor shown
 * in the trust prompt.
 */
export function memoryHasContent(text: string | null): boolean {
  if (text === null) return false
  return text.split(/\r?\n/).some((line) => line.trim() !== '' && !/^\s*<!--.*-->\s*$/.test(line))
}

/** Entry texts in file order (header, blank and other lines left out) */
export function memoryEntries(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const entry = entryOf(line)
    if (entry !== null) out.push(entry)
  }
  return out
}

/** One entry as given by the AI or a person: one line, `- ` marker dropped; null when unusable */
function cleanEntry(text: string): string | null {
  if (typeof text !== 'string' || /[\r\n]/.test(text.trim())) return null
  const clean = text.trim().replace(/^-\s*/, '').trim()
  return clean === '' ? null : clean
}

function withDate(text: string, today: string): string {
  return DATED.test(text) ? text : `${text} (${today})`
}

/** Comparable form of an entry: without its date, spaces collapsed */
function entryKey(text: string): string {
  return text.replace(DATED, '').replace(/\s+/g, ' ').trim()
}

function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function joinLines(lines: string[]): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

export interface MemoryOpContext {
  /** Local date `YYYY-MM-DD` stamped on added and replaced entries */
  today: string
  /** Header for a file that does not exist yet */
  header: string
}

export type MemoryOpResult =
  | { ok: true; text: string; change: ProjectMemoryOp }
  | { ok: false; reason: Extract<ProjectMemoryRefusal, 'not-found' | 'invalid'> }

/**
 * Apply one change to the current text (null when the file is absent). The
 * result's `change` carries the entry texts as written, for the memory lines.
 */
export function applyMemoryOp(
  current: string | null,
  op: ProjectMemoryOp,
  ctx: MemoryOpContext,
): MemoryOpResult {
  const lines = current === null ? [ctx.header] : linesOf(current)
  const findIndex = (text: string): number => {
    const key = entryKey(text)
    return lines.findIndex((line) => {
      const entry = entryOf(line)
      return entry !== null && entryKey(entry) === key
    })
  }

  if (op.op === 'add') {
    const clean = cleanEntry(op.text)
    if (clean === null) return { ok: false, reason: 'invalid' }
    const existing = findIndex(clean)
    if (existing >= 0) {
      const entry = entryOf(lines[existing]!)!
      return { ok: true, text: current ?? joinLines(lines), change: { op: 'add', text: entry } }
    }
    const entry = withDate(clean, ctx.today)
    lines.push(`- ${entry}`)
    return { ok: true, text: joinLines(lines), change: { op: 'add', text: entry } }
  }

  if (op.op === 'replace') {
    const old = cleanEntry(op.old)
    const next = cleanEntry(op.new)
    if (old === null || next === null) return { ok: false, reason: 'invalid' }
    const index = findIndex(old)
    if (index < 0) return { ok: false, reason: 'not-found' }
    const before = entryOf(lines[index]!)!
    const entry = withDate(next, ctx.today)
    lines[index] = `- ${entry}`
    return { ok: true, text: joinLines(lines), change: { op: 'replace', old: before, new: entry } }
  }

  const target = cleanEntry(op.text)
  if (target === null) return { ok: false, reason: 'invalid' }
  const index = findIndex(target)
  if (index < 0) return { ok: false, reason: 'not-found' }
  const removed = entryOf(lines[index]!)!
  lines.splice(index, 1)
  return { ok: true, text: joinLines(lines), change: { op: 'remove', text: removed } }
}

/** The whole file for a consolidated list: header, then one dated entry per line */
export function buildMemoryText(entries: readonly string[], header: string, today: string): string {
  const lines = [header]
  for (const raw of entries) {
    // An entry that arrives with line breaks becomes one entry per line, never lost.
    for (const line of raw.split(/\r?\n/)) {
      const clean = cleanEntry(line)
      if (clean !== null) lines.push(`- ${withDate(clean, today)}`)
    }
  }
  return joinLines(lines)
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** Local date `YYYY-MM-DD` */
export function localDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `memory.<YYYYMMDD-HHmmss>.bak.md` in local time */
export function memoryBackupName(date: Date): string {
  const day = `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `memory.${day}-${time}.bak.md`
}
