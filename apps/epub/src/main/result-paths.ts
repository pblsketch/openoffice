/**
 * Where a result book may be written (spec §8 "Result files"): never over the
 * book itself, never over a file a tab of the app has open, and only as an
 * `.epub` file. Pure; the main module supplies "is this path open in a tab".
 */
import { isAbsolute, resolve } from 'node:path'
import type { EpubResultPathCheck } from '../shared/ipc'

export interface ResultPathContext {
  /** the book's own file */
  sourcePath: string
  /** whether a tab of the app (this editor's or any other) has the file open */
  isOpenInTab: (path: string) => boolean
  /** compare paths ignoring case (Windows, macOS); the platform's when left out */
  caseInsensitive?: boolean
}

const defaultCaseInsensitive = (): boolean =>
  process.platform === 'win32' || process.platform === 'darwin'

/** One spelling per path: resolved, case-folded where the disk ignores case. */
export function pathKey(path: string, caseInsensitive = defaultCaseInsensitive()): string {
  const resolved = resolve(path)
  return caseInsensitive ? resolved.toLowerCase() : resolved
}

export function samePath(a: string, b: string, caseInsensitive?: boolean): boolean {
  return pathKey(a, caseInsensitive) === pathKey(b, caseInsensitive)
}

/** Whether a result book may be written to `path`. */
export function checkResultPath(path: unknown, context: ResultPathContext): EpubResultPathCheck {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096 || !isAbsolute(path)) {
    return { ok: false, reason: 'invalid' }
  }
  if (!/\.epub$/i.test(path)) return { ok: false, reason: 'not-epub' }
  if (samePath(path, context.sourcePath, context.caseInsensitive)) {
    return { ok: false, reason: 'source' }
  }
  if (context.isOpenInTab(path)) return { ok: false, reason: 'open-in-tab' }
  return { ok: true }
}
