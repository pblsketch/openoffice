import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { AgentProvider } from '../shared/agent-api'

/**
 * A small crash record kept on this PC only. When a renderer, the GPU process
 * or another child process ends abnormally, or the main process meets an
 * uncaught error, one JSON line goes to `<userData>/crash-log.jsonl`: the time,
 * what ended, Chromium's reason word, the exit code, and which editor it was,
 * plus a few memory figures in whole megabytes. A `low-memory` line records the
 * same figures when the PC runs short of memory while an AI request is running.
 * An `agent-start` line records an agent session that did not start: the
 * program, the failure's code, and the thrown error's class and code.
 * Nothing else is accepted — no document text, path, file name, URL or error
 * message (those can carry a path) — and nothing is ever sent anywhere.
 */

export const CRASH_LOG_FILE = 'crash-log.jsonl'
/** past this size the oldest lines are dropped, keeping about half */
export const CRASH_LOG_MAX_BYTES = 64 * 1024

export type CrashKind =
  'renderer' | 'child-process' | 'main-exception' | 'main-rejection' | 'low-memory' | 'agent-start'

/** memory at the time of the entry; whole numbers only */
export interface CrashMemory {
  /** working set of all the app's own processes, MB */
  appMB?: number
  /** free physical memory of the PC, MB */
  freeMB?: number
  /** physical memory of the PC, MB */
  totalMB?: number
  /** AI requests in flight */
  aiStreams?: number
  /** subscription CLI processes the app is running */
  cliChildren?: number
}

export interface CrashEntry extends CrashMemory {
  kind: CrashKind
  /** Chromium's reason word ('crashed', 'oom', …) or an error class name */
  reason?: string
  exitCode?: number
  /** editor family of the renderer ('docs', 'sheets', …, 'home', 'other') */
  editor?: string
  /** child-process type ('GPU', 'Utility', …) */
  process?: string
  program?: AgentProvider
  /** `errorReason` of what was thrown */
  cause?: string
}

// short identifier-like words only: anything else (a message, a path) is dropped
const SAFE_WORD = /^[A-Za-z0-9][A-Za-z0-9 _.:-]{0,47}$/

function safeWord(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_WORD.test(value) ? value : undefined
}

const MEMORY_FIELDS = ['appMB', 'freeMB', 'totalMB', 'aiStreams', 'cliChildren'] as const

/** one log line, holding only the allowed fields */
export function crashLine(entry: CrashEntry, now: Date = new Date()): string {
  const line: Record<string, string | number> = { at: now.toISOString(), kind: entry.kind }
  const reason = safeWord(entry.reason)
  if (reason) line.reason = reason
  if (typeof entry.exitCode === 'number' && Number.isInteger(entry.exitCode)) {
    line.exitCode = entry.exitCode
  }
  const editor = safeWord(entry.editor)
  if (editor) line.editor = editor
  const proc = safeWord(entry.process)
  if (proc) line.process = proc
  const program = safeWord(entry.program)
  if (program) line.program = program
  const cause = safeWord(entry.cause)
  if (cause) line.cause = cause
  for (const key of MEMORY_FIELDS) {
    const value = entry[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) line[key] = value
  }
  return `${JSON.stringify(line)}\n`
}

/** the error's class name and code (`TypeError`, `Error:ENOENT`), never its message */
export function errorReason(error: unknown): string {
  if (!(error instanceof Error)) return typeof error
  const name = safeWord(error.name) ?? 'Error'
  const code = safeWord((error as { code?: unknown }).code)
  return code ? `${name}:${code}` : name
}

/** the newest lines of `text` that fit in `budget` bytes */
function tailLines(text: string, budget: number): string {
  const lines = text.split('\n').filter((l) => l.length > 0)
  const kept: string[] = []
  let size = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const bytes = Buffer.byteLength(lines[i]) + 1
    if (size + bytes > budget) break
    kept.unshift(lines[i])
    size += bytes
  }
  return kept.map((l) => `${l}\n`).join('')
}

/** append one entry, trimming the oldest lines once the file passes the cap;
 *  never throws (a crash record must not make things worse) */
export function appendCrashLog(
  filePath: string,
  entry: CrashEntry,
  maxBytes: number = CRASH_LOG_MAX_BYTES,
  now: Date = new Date(),
): void {
  const line = crashLine(entry, now)
  try {
    let size = 0
    try {
      size = statSync(filePath).size
    } catch {
      /* no log yet */
    }
    if (size + Buffer.byteLength(line) > maxBytes) {
      let kept = ''
      try {
        kept = tailLines(readFileSync(filePath, 'utf8'), Math.floor(maxBytes / 2))
      } catch {
        /* unreadable: start over */
      }
      writeFileSync(filePath, kept + line)
    } else {
      appendFileSync(filePath, line)
    }
  } catch {
    /* best effort */
  }
}
