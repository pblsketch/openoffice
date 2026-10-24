/**
 * What the editors' AI gets from Drive (decision 0033): a search that lists
 * files, and a paged read of one file's text. A read downloads the file to a
 * private temporary folder, parses it with parseFileToText (so parts hidden
 * from AI stay hidden, decision 0016) and deletes the download. Parsed text
 * is kept in memory for a few minutes so paging does not download again.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FOLDER_MIME,
  MAX_READ_BYTES,
  localFileName,
  openPlan,
  type DriveApi,
  type DriveError,
  type DriveFile,
} from '@genoffice/google-drive'
import type { DriveEntryType } from '../../shared/drive-api'

export const DRIVE_READ_CHUNK_CHARS = 24_000
const TEXT_CACHE_MS = 10 * 60 * 1000
const TEXT_CACHE_MAX = 4

export type ParseToText = (
  path: string,
) => Promise<{ ok: boolean; kind?: string; text?: string; error?: string }>

export interface DriveAiDeps {
  api: () => DriveApi
  parse: ParseToText
  now?: () => number
}

/** The model reads these; English, short, no file content */
const ERROR_TEXT: Record<DriveError['kind'] | 'unsupported' | 'unreadable' | 'folder', string> = {
  'not-connected': 'Google Drive is not connected.',
  'not-found': 'No such Drive file, or this account cannot see it.',
  forbidden: 'This account may not download that Drive file.',
  'too-large': 'The Drive file is too large to read here.',
  'rate-limit': 'Google Drive asked to slow down; try again shortly.',
  network: 'Google Drive could not be reached.',
  unsupported: 'That kind of Drive file cannot be read as text.',
  unreadable: 'The Drive file could not be read as text.',
  folder: 'That is a folder; search inside it with drive_search instead.',
}

export function driveErrorText(kind: keyof typeof ERROR_TEXT): string {
  return ERROR_TEXT[kind]
}

export function entryType(file: { name: string; mimeType: string }): DriveEntryType {
  if (file.mimeType === FOLDER_MIME) return 'folder'
  const plan = openPlan(file)
  if (plan.kind === 'none') return 'other'
  switch (plan.extension) {
    case '.docx':
      return 'document'
    case '.xlsx':
    case '.xlsm':
    case '.xls':
    case '.csv':
    case '.tsv':
      return 'spreadsheet'
    case '.pptx':
      return 'presentation'
    case '.pdf':
      return 'pdf'
    case '.md':
    case '.markdown':
    case '.txt':
    case '.json':
      return 'markdown'
    case '.html':
    case '.htm':
      return 'html'
    case '.xmind':
      return 'mindmap'
    case '.hwp':
    case '.hwpx':
      return 'hwp'
    case '.epub':
      return 'epub'
    default:
      return 'other'
  }
}

export type AiResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export class DriveAi {
  private texts = new Map<string, { version: string; name: string; text: string; at: number }>()

  constructor(private readonly deps: DriveAiDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  async search(
    query: string,
    limit: number,
  ): Promise<AiResult<{ hits: { id: string; name: string; type: string; modified: string }[] }>> {
    const text = query.trim().slice(0, 200)
    if (!text) return { ok: false, error: 'query must not be empty' }
    const result = await this.deps.api().list({ kind: 'search', text }, { pageSize: limit })
    if (!result.ok) return { ok: false, error: ERROR_TEXT[result.kind] }
    return {
      ok: true,
      hits: result.files.slice(0, limit).map((f) => ({
        id: f.id,
        name: f.name,
        type: entryType(f),
        modified: f.modifiedTime,
      })),
    }
  }

  async read(
    fileId: string,
    offset: number,
  ): Promise<
    AiResult<{ page: { name: string; text: string; totalChars: number; offset: number } }>
  > {
    const loaded = await this.text(fileId)
    if (!loaded.ok) return loaded
    const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    return {
      ok: true,
      page: {
        name: loaded.name,
        text: loaded.text.slice(start, start + DRIVE_READ_CHUNK_CHARS),
        totalChars: loaded.text.length,
        offset: start,
      },
    }
  }

  private async text(fileId: string): Promise<AiResult<{ name: string; text: string }>> {
    const api = this.deps.api()
    const meta = await api.file(fileId)
    if (!meta.ok) return { ok: false, error: ERROR_TEXT[meta.kind] }
    let file: DriveFile = meta.file
    if (file.shortcutTarget) {
      const target = await api.file(file.shortcutTarget.id)
      if (!target.ok) return { ok: false, error: ERROR_TEXT[target.kind] }
      file = target.file
    }
    if (file.mimeType === FOLDER_MIME) return { ok: false, error: ERROR_TEXT.folder }
    const version = `${file.md5Checksum ?? ''}|${file.modifiedTime}`
    const cached = this.texts.get(file.id)
    if (cached && cached.version === version && this.now() - cached.at < TEXT_CACHE_MS) {
      return { ok: true, name: cached.name, text: cached.text }
    }
    const plan = openPlan(file)
    if (plan.kind === 'none') return { ok: false, error: ERROR_TEXT.unsupported }
    const got =
      plan.kind === 'export'
        ? await api.export(file.id, plan.mime, MAX_READ_BYTES)
        : await api.download(file.id, MAX_READ_BYTES)
    if (!got.ok) return { ok: false, error: ERROR_TEXT[got.kind] }

    // the download lives only as long as the parse
    let dir: string | null = null
    try {
      dir = await mkdtemp(join(tmpdir(), 'ieumoffice-drive-'))
      const path = join(dir, localFileName(file.name, plan.extension))
      await writeFile(path, got.bytes)
      const parsed = await this.deps.parse(path)
      if (!parsed.ok || parsed.kind !== 'text' || typeof parsed.text !== 'string') {
        return { ok: false, error: ERROR_TEXT.unreadable }
      }
      this.texts.set(file.id, { version, name: file.name, text: parsed.text, at: this.now() })
      while (this.texts.size > TEXT_CACHE_MAX) {
        this.texts.delete(this.texts.keys().next().value!)
      }
      return { ok: true, name: file.name, text: parsed.text }
    } catch {
      return { ok: false, error: ERROR_TEXT.unreadable }
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Forget everything read (on disconnect) */
  clear(): void {
    this.texts.clear()
  }
}
