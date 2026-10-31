import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'

import { ZodError } from 'zod'

/**
 * The save-failure record (`sheets-save-failures.jsonl` in the data folder).
 *
 * A save is written to a staging file and reopened by the sidecar before the
 * user's file is touched. When that reopen fails the user only saw
 * "the saved result could not be reopened", and the reason went to a console
 * nobody reads, so reports of it could not be told apart. One line per failure
 * keeps the reason on this PC, and the same short reason is shown after the
 * message so a pasted report carries it.
 *
 * A line holds the time, the source format, the size of the staged output and
 * the reason with any path replaced. No cell values: schema problems are named
 * by their location in the reply, never by the value found there. The file
 * stays on this PC and is kept under SAVE_FAILURE_LOG_MAX_BYTES by dropping
 * its older half.
 */

export const SAVE_FAILURE_LOG_FILE = 'sheets-save-failures.jsonl'
export const SAVE_FAILURE_LOG_MAX_BYTES = 64 * 1024
const DETAIL_MAX_CHARS = 240
const SCHEMA_ISSUES_SHOWN = 4

export type ReopenFailureKind =
  /** the sidecar read the file and refused it */
  | 'unreadable'
  /** the sidecar answered, but the reply did not match what the app expects */
  | 'reply-shape'
  /** no answer within the request limit */
  | 'timeout'
  /** the sidecar process ended or could not be reached */
  | 'sidecar-ended'

export interface ReopenFailure {
  readonly kind: ReopenFailureKind
  readonly detail: string
}

/**
 * Windows (`C:\…`, `\\server\…`) and POSIX absolute paths, to the next space,
 * quote or closing bracket. A slash after `<` is an XML end tag (`</fonts>`),
 * which names the broken part and stays.
 */
const PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\|(?<![\w.<])\/(?=[^\s/]))[^\s'"`<>|)\]]*/g

export function scrubDetail(text: string): string {
  const oneLine = text
    .replace(/\s+/g, ' ')
    .trim()
    // punctuation closing the sentence stays outside the path
    .replace(PATH_PATTERN, (path) => `<path>${/[.,;:]+$/.exec(path)?.[0] ?? ''}`)
  return oneLine.length > DETAIL_MAX_CHARS ? `${oneLine.slice(0, DETAIL_MAX_CHARS - 1)}…` : oneLine
}

export function describeReopenFailure(error: unknown): ReopenFailure {
  if (error instanceof ZodError) {
    const shown = error.issues
      .slice(0, SCHEMA_ISSUES_SHOWN)
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'} ${issue.code}`)
    const more = error.issues.length - shown.length
    return {
      kind: 'reply-shape',
      detail: scrubDetail(shown.join('; ') + (more > 0 ? `; +${more}` : '')),
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'XLSX sidecar request timed out.') return { kind: 'timeout', detail: '' }
  if (/^XLSX sidecar (?:exited|stopped|stdin failed|failed to start)/.test(message)) {
    return { kind: 'sidecar-ended', detail: scrubDetail(message) }
  }
  return { kind: 'unreadable', detail: scrubDetail(message) }
}

/** The bracketed tail shown after the localized message. */
export function reopenFailureNote(failure: ReopenFailure): string {
  return failure.detail ? `[${failure.kind}: ${failure.detail}]` : `[${failure.kind}]`
}

/** The parts of a sheets session that tell what it was opened from. */
export interface SessionSource {
  readonly path: string
  readonly csvSourcePath?: string
  readonly csvImport?: boolean
  readonly unsavedNew?: boolean
  readonly suggestSaveAs?: string
  readonly importTempDir?: string
  readonly password?: string
}

/**
 * `csv`, `new` (the shell's blank workbook), `converted` (an .xls or another
 * legacy file opened through a converted copy), else the file's extension;
 * `+encrypted` when the file has a password.
 */
export function sessionSourceFormat(session: SessionSource): string {
  const base =
    session.csvSourcePath !== undefined || session.csvImport === true
      ? 'csv'
      : session.unsavedNew === true
        ? 'new'
        : session.suggestSaveAs !== undefined && session.importTempDir !== undefined
          ? 'converted'
          : (/\.([A-Za-z0-9]{1,5})$/.exec(session.path)?.[1]?.toLowerCase() ?? 'unknown')
  return session.password !== undefined ? `${base}+encrypted` : base
}

export interface SaveFailureEntry {
  readonly failure: ReopenFailure
  /** lower-case extension of the file the session was opened from, e.g. `xlsx`, `xls`, `csv` */
  readonly sourceFormat: string
  readonly stagedBytes: number | null
  readonly appVersion: string
}

function trim(file: string, maxBytes: number): void {
  let size: number
  try {
    size = statSync(file).size
  } catch {
    return
  }
  if (size <= maxBytes) return
  const text = readFileSync(file, 'utf8')
  const half = text.slice(Math.floor(text.length / 2))
  const firstBreak = half.indexOf('\n')
  writeFileSync(file, firstBreak === -1 ? '' : half.slice(firstBreak + 1))
}

/** Best effort: a record that cannot be written never turns into a second error. */
export function appendSaveFailure(
  file: string,
  entry: SaveFailureEntry,
  now: Date = new Date(),
  maxBytes: number = SAVE_FAILURE_LOG_MAX_BYTES,
): void {
  try {
    const line = JSON.stringify({
      time: now.toISOString(),
      app: entry.appVersion,
      source: entry.sourceFormat,
      bytes: entry.stagedBytes,
      kind: entry.failure.kind,
      detail: entry.failure.detail,
    })
    appendFileSync(file, `${line}\n`)
    trim(file, maxBytes)
  } catch {
    // The data folder may be unwritable; the message still carries the reason.
  }
}
