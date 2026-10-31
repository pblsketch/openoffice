/**
 * Material status for the generate window: size, whether the file can be
 * read (and if not, why), its text length, and whether it is open somewhere
 * with unsaved changes.
 *
 * Text is read only through `parseFileToText`, which hands back each withheld
 * span as its `{{label}}` marker and fails closed on a mark it cannot process.
 * The text is used for one thing — its length, for the two notices — and is
 * dropped right here: it never leaves this module and is never sent anywhere
 * (only the number is remembered). A failed read makes the file "unreadable"
 * (with that reason), never a partial read.
 *
 * A file open with unsaved changes is not read at all: a withholding mark
 * only reaches the file on save, so its length is measured once it is saved.
 */
import { stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { attachableMaxBytes, parseFileToText, type ParsedFile } from '@genoffice/file-parse'
import { fileHasUnsavedChanges } from '@genoffice/electron-utils/unsaved-files'
import type { AiTargetKind, MaterialProblem } from '../../shared/generate-api'
import {
  LONG_MATERIAL_NOTICE_CHARS,
  MAX_IMAGE_MATERIAL_BYTES,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS,
  USAGE_NOTICE_CHARS,
} from './limits'

/** pictures: handed over as images, no text to measure */
export const IMAGE_MATERIAL_EXTS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
])

/**
 * The largest material of this extension: pictures to the receiving editors'
 * cap, formats whose size is pictures (zip-based documents, PDF) at any size,
 * the rest to `MAX_MATERIAL_BYTES`.
 */
export function materialMaxBytes(ext: string): number {
  if (IMAGE_MATERIAL_EXTS.has(ext)) return MAX_IMAGE_MATERIAL_BYTES
  return Number.isFinite(attachableMaxBytes(ext)) ? MAX_MATERIAL_BYTES : Number.POSITIVE_INFINITY
}

/**
 * What a material can be: exactly what `parseFileToText` reads (its text,
 * office, pdf, mind map and image types). Every receiving editor accepts all
 * of these as attachments; anything else would come back from it unread.
 */
export const SUPPORTED_MATERIAL_EXTS: ReadonlySet<string> = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'py',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xlsx',
  'xlsm',
  'pdf',
  'xmind',
  ...IMAGE_MATERIAL_EXTS,
])

export interface MaterialStatus {
  /** the path, or `untitled:<webContentsId>` for a document never saved */
  key: string
  name: string
  path?: string
  /** lowercased extension without the dot ('' when none) */
  ext: string
  sizeBytes?: number
  /** set when the file is left out of the materials */
  problem?: MaterialProblem
  /** open in a tab with unsaved changes (or the host could not say): blocks "make" */
  unsaved: boolean
  /** characters of text the file reads as; 0 for pictures and for files not read */
  textLength: number
}

export interface InspectDeps {
  stat?: (path: string) => Promise<{ isFile(): boolean; size: number; mtimeMs?: number }>
  /** an injected parser bypasses the length cache below */
  parse?: (path: string) => Promise<ParsedFile>
  hasUnsavedChanges?: (path: string) => Promise<boolean>
}

/**
 * Text lengths by path + size + mtime, so reopening the status (window focus,
 * a save elsewhere, "make") does not parse every file again. Holds numbers
 * only — never text.
 */
const lengthCache = new Map<string, number>()
const LENGTH_CACHE_MAX = 64

function rememberLength(key: string, length: number): void {
  lengthCache.delete(key)
  lengthCache.set(key, length)
  if (lengthCache.size > LENGTH_CACHE_MAX) {
    const oldest = lengthCache.keys().next().value
    if (oldest !== undefined) lengthCache.delete(oldest)
  }
}

export function extOf(path: string): string {
  return extname(path).slice(1).toLowerCase()
}

/** one spelling per file, for de-duplicating the list (case-folded on Windows) */
export function materialKey(path: string): string {
  const resolved = resolve(path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** a document that was never saved: it cannot be material until it is */
export function untitledMaterial(webContentsId: number, title: string): MaterialStatus {
  return {
    key: `untitled:${webContentsId}`,
    name: title,
    ext: '',
    problem: 'untitled',
    unsaved: false,
    textLength: 0,
  }
}

export async function inspectMaterial(
  path: string,
  deps: InspectDeps = {},
): Promise<MaterialStatus> {
  const ext = extOf(path)
  const base: MaterialStatus = {
    key: path,
    name: basename(path) || path,
    path,
    ext,
    unsaved: false,
    textLength: 0,
  }
  if (!isAbsolute(path)) return { ...base, problem: 'missing' }
  if (!SUPPORTED_MATERIAL_EXTS.has(ext)) return { ...base, problem: 'unsupported' }

  let size: number
  let mtimeMs: number | undefined
  try {
    const st = await (deps.stat ?? stat)(path)
    if (!st.isFile()) return { ...base, problem: 'missing' }
    size = st.size
    mtimeMs = st.mtimeMs
  } catch {
    return { ...base, problem: 'missing' }
  }
  const sized = { ...base, sizeBytes: size }
  if (size > materialMaxBytes(ext)) return { ...sized, problem: 'too-large' }

  // before any read: a file with unsaved changes is not read until saved
  if (await (deps.hasUnsavedChanges ?? fileHasUnsavedChanges)(path)) {
    return { ...sized, unsaved: true }
  }

  const cacheKey =
    !deps.parse && mtimeMs !== undefined ? `${materialKey(path)}|${size}|${mtimeMs}` : null
  const cached = cacheKey ? lengthCache.get(cacheKey) : undefined
  if (cached !== undefined) return { ...sized, textLength: cached }

  let parsed: ParsedFile
  try {
    parsed = await (deps.parse ?? parseFileToText)(path)
  } catch {
    return { ...sized, problem: 'unreadable' }
  }
  if (!parsed.ok) return { ...sized, problem: 'unreadable' }
  if (parsed.kind === 'image') return sized
  if (parsed.kind !== 'text' || typeof parsed.text !== 'string') {
    return { ...sized, problem: 'unreadable' }
  }
  // the length is all that is kept; the text goes out of scope here
  const textLength = parsed.text.length
  if (cacheKey) rememberLength(cacheKey, textLength)
  return { ...sized, textLength }
}

/**
 * 8.7: two notices, neither blocks "make". Thresholds are exclusive: exactly
 * at the value is not "above" it.
 */
export function generateNotices(
  kind: AiTargetKind,
  totalTextLength: number,
): { usage: boolean; longMaterial: boolean } {
  return {
    usage: totalTextLength > USAGE_NOTICE_CHARS,
    longMaterial:
      (kind === 'slides' || kind === 'html') && totalTextLength > LONG_MATERIAL_NOTICE_CHARS,
  }
}

export interface MaterialSummary {
  ready: MaterialStatus[]
  unsaved: MaterialStatus[]
  excluded: MaterialStatus[]
  totalBytes: number
  totalTextLength: number
  notices: { usage: boolean; longMaterial: boolean }
  /** more listed rows than the cap (excluded rows do not count: they are not sent) */
  tooMany: boolean
  /** at least one readable material, none unsaved, not too many */
  canMake: boolean
}

export function summarizeMaterials(
  statuses: readonly MaterialStatus[],
  kind: AiTargetKind,
): MaterialSummary {
  const unsaved = statuses.filter((s) => !s.problem && s.unsaved)
  const ready = statuses.filter((s) => !s.problem && !s.unsaved)
  const excluded = statuses.filter((s) => s.problem)
  const totalBytes = ready.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0)
  const totalTextLength = ready.reduce((sum, s) => sum + s.textLength, 0)
  const tooMany = ready.length + unsaved.length > MAX_MATERIALS
  return {
    ready,
    unsaved,
    excluded,
    totalBytes,
    totalTextLength,
    notices: generateNotices(kind, totalTextLength),
    tooMany,
    canMake: ready.length > 0 && unsaved.length === 0 && !tooMany,
  }
}
