/**
 * Drive files on this PC (decision 0033): a Drive file opens as a local copy
 * in the data folder's `drive-cache`, any editor saves it like a normal file,
 * and a watcher on that folder uploads each save back to Drive.
 *
 * - The watcher is the one place that learns of saves, so no editor needs to
 *   know about Drive: every editor writes the file by path.
 * - Before replacing a Drive file the service checks that it still holds what
 *   this copy was made from (its content hash). If someone changed it, or the
 *   account may not edit it, the person chooses: overwrite, save a copy to
 *   Drive, or keep the change on this PC only.
 * - A Google document is never overwritten. Its first save makes an Office
 *   file beside it, and later saves of that copy go there.
 * - A save that could not go up stays on this PC and is retried: later in
 *   this run, when Drive reconnects, and at the next start.
 */
import { createHash } from 'node:crypto'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, unlink } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  MAX_OPEN_BYTES,
  localFileName,
  officeCopyName,
  openPlan,
  uploadMime,
  type DriveApi,
  type DriveError,
  type DriveFile,
} from '@genoffice/google-drive'
import { atomicWriteFile } from '../atomic-write'

export interface CacheEntry {
  /** the Drive file the person opened */
  sourceId: string
  /** the source is a Google document (opened as an Office export) */
  google: boolean
  /** the source's Drive name */
  name: string
  /** the folder the source sits in, where a new Office file or a copy goes */
  parentId: string | null
  localPath: string
  /** hash of the bytes Drive holds for the target as of the last download or upload */
  syncedSha: string
  /** where saves go; null for a Google document not saved yet */
  targetId: string | null
  /** the target's Drive content hash as last seen; null when Drive gives none */
  targetMd5: string | null
  /** the target's Drive change time as last seen: the check when there is no hash */
  targetModified: string | null
  /** the source's Drive change time when the copy was made */
  sourceModified: string
  /** the person chose to keep this copy's changes on this PC only */
  detached: boolean
  /** epoch ms of the last open, for pruning */
  openedAt: number
}

export type SyncQuestion =
  | { kind: 'changed'; name: string }
  | { kind: 'read-only'; name: string }
  | { kind: 'gone'; name: string }

export type SyncAnswer = 'overwrite' | 'copy' | 'local'

export type SyncNotice =
  | { kind: 'saved-office-copy'; name: string; copyName: string }
  | { kind: 'saved-copy'; name: string; copyName: string }
  | { kind: 'upload-failed'; name: string }

export interface DriveFilesDeps {
  api: () => DriveApi
  connected: () => boolean
  cacheDir: string
  /** opens a local file in its editor tab (an open tab is brought forward) */
  openPath: (path: string) => boolean
  /** a tab shows this file */
  isOpen: (path: string) => boolean
  ask: (question: SyncQuestion) => Promise<SyncAnswer>
  notify: (notice: SyncNotice) => void
  /** "{name} (copy)" in the UI language */
  copyName: (name: string) => string
  debounceMs?: number
  retryDelaysMs?: readonly number[]
  now?: () => number
  /** test seam: the folder watcher */
  watch?: (dir: string, onChange: (path: string) => void) => () => void
}

export type OpenOutcome =
  { ok: true } | { ok: false; kind: DriveError['kind'] | 'unsupported' | 'disk' }

const INDEX_FILE = 'index.json'
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_RETRIES = [30_000, 2 * 60_000, 10 * 60_000]

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function samePath(a: string, b: string): boolean {
  const x = resolve(a)
  const y = resolve(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

function defaultWatch(dir: string, onChange: (path: string) => void): () => void {
  let watcher: FSWatcher | null = null
  try {
    watcher = watch(dir, { recursive: true }, (_event, file) => {
      if (file) onChange(join(dir, file.toString()))
    })
    watcher.on('error', () => {})
  } catch {
    // no watcher: saves still go up at the next start
  }
  return () => watcher?.close()
}

export class DriveFiles {
  private entries = new Map<string, CacheEntry>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private running = new Map<string, Promise<void>>()
  private rerun = new Set<string>()
  private failures = new Map<string, number>()
  private unwatch: (() => void) | null = null
  private loaded: Promise<void> | null = null

  constructor(private readonly deps: DriveFilesDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** Read the index, drop what is gone, start watching, queue saves left from last time */
  start(): Promise<void> {
    this.loaded ??= (async () => {
      await mkdir(this.deps.cacheDir, { recursive: true })
      try {
        const raw = JSON.parse(await readFile(join(this.deps.cacheDir, INDEX_FILE), 'utf8')) as {
          entries?: CacheEntry[]
        }
        for (const entry of raw.entries ?? []) {
          if (entry && typeof entry.sourceId === 'string' && this.inCache(entry.localPath)) {
            this.entries.set(entry.sourceId, entry)
          }
        }
      } catch {
        // no index yet
      }
      await this.prune()
      this.unwatch = (this.deps.watch ?? defaultWatch)(this.deps.cacheDir, (path) =>
        this.changed(path),
      )
      for (const entry of this.entries.values()) void this.syncIfChanged(entry.sourceId)
    })()
    return this.loaded
  }

  stop(): void {
    this.unwatch?.()
    this.unwatch = null
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  /** Drive came back: try every save that is still waiting */
  reconnected(): void {
    this.failures.clear()
    for (const entry of this.entries.values()) void this.syncIfChanged(entry.sourceId)
  }

  /** The cache entry a local path belongs to */
  entryFor(path: string): CacheEntry | undefined {
    for (const entry of this.entries.values()) if (samePath(entry.localPath, path)) return entry
    return undefined
  }

  /** a path inside the cache folder (anything else is never touched) */
  inCache(path: unknown): path is string {
    if (typeof path !== 'string' || !path) return false
    const rel = relative(resolve(this.deps.cacheDir), resolve(path))
    return Boolean(rel) && !rel.startsWith('..') && !rel.includes(`..${sep}`)
  }

  private async saveIndex(): Promise<void> {
    const body = JSON.stringify({ entries: [...this.entries.values()] }, null, 2)
    await atomicWriteFile(join(this.deps.cacheDir, INDEX_FILE), Buffer.from(body, 'utf8')).catch(
      () => {},
    )
  }

  private async localSha(entry: CacheEntry): Promise<string | null> {
    try {
      return sha(await readFile(entry.localPath))
    } catch {
      return null
    }
  }

  /** Copies not opened for a month and holding nothing unsent are removed */
  private async prune(): Promise<void> {
    const cutoff = this.now() - PRUNE_AFTER_MS
    for (const entry of [...this.entries.values()]) {
      const exists = existsSync(entry.localPath)
      const stale = entry.openedAt < cutoff && !this.deps.isOpen(entry.localPath)
      if (exists && !stale) continue
      if (exists && (await this.localSha(entry)) !== entry.syncedSha && !entry.detached) continue
      this.entries.delete(entry.sourceId)
      await rm(dirname(entry.localPath), { recursive: true, force: true }).catch(() => {})
    }
    await this.saveIndex()
  }

  /** Open a Drive file: fetch it unless the local copy is current or holds unsent changes */
  async open(fileId: string, signal?: AbortSignal): Promise<OpenOutcome> {
    await this.start()
    const api = this.deps.api()
    const meta = await api.file(fileId, signal)
    if (!meta.ok) return meta
    let file: DriveFile = meta.file
    if (file.shortcutTarget) {
      const target = await api.file(file.shortcutTarget.id, signal)
      if (!target.ok) return target
      file = target.file
    }
    const plan = openPlan(file)
    if (plan.kind === 'none') return { ok: false, kind: 'unsupported' }

    const existing = this.entries.get(file.id)
    if (existing && existsSync(existing.localPath)) {
      const dirty = (await this.localSha(existing)) !== existing.syncedSha
      const current = file.modifiedTime === existing.sourceModified
      if (this.deps.isOpen(existing.localPath) || dirty || current) {
        existing.openedAt = this.now()
        await this.saveIndex()
        if (dirty && !existing.detached) void this.syncIfChanged(existing.sourceId)
        return this.deps.openPath(existing.localPath) ? { ok: true } : { ok: false, kind: 'disk' }
      }
    }

    const got =
      plan.kind === 'export'
        ? await api.export(file.id, plan.mime, MAX_OPEN_BYTES, signal)
        : await api.download(file.id, MAX_OPEN_BYTES, signal)
    if (!got.ok) return got
    const folder = join(this.deps.cacheDir, file.id.replace(/[^A-Za-z0-9_-]/g, '_'))
    const localPath = join(folder, localFileName(file.name, plan.extension))
    try {
      await mkdir(folder, { recursive: true })
      if (existing && !samePath(existing.localPath, localPath)) {
        await unlink(existing.localPath).catch(() => {})
      }
      await atomicWriteFile(localPath, got.bytes)
    } catch {
      return { ok: false, kind: 'disk' }
    }
    const google = plan.kind === 'export'
    this.entries.set(file.id, {
      sourceId: file.id,
      google,
      name: file.name,
      parentId: file.parents?.[0] ?? null,
      localPath,
      syncedSha: sha(got.bytes),
      // every open of a Google document starts over: its first save makes a new Office file
      targetId: google ? null : file.id,
      targetMd5: google ? null : (file.md5Checksum ?? null),
      targetModified: google ? null : file.modifiedTime,
      sourceModified: file.modifiedTime,
      detached: false,
      openedAt: this.now(),
    })
    await this.saveIndex()
    return this.deps.openPath(localPath) ? { ok: true } : { ok: false, kind: 'disk' }
  }

  private changed(path: string): void {
    const entry = this.entryFor(path)
    if (!entry || entry.detached) return
    const id = entry.sourceId
    clearTimeout(this.timers.get(id))
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        void this.syncIfChanged(id)
      }, this.deps.debounceMs ?? 2_500),
    )
  }

  /** One upload at a time per file; a save during an upload runs another pass after it */
  syncIfChanged(sourceId: string): Promise<void> {
    const pending = this.running.get(sourceId)
    if (pending) {
      this.rerun.add(sourceId)
      return pending
    }
    const run = this.syncOnce(sourceId)
      .catch(() => {})
      .finally(() => {
        this.running.delete(sourceId)
        if (this.rerun.delete(sourceId)) void this.syncIfChanged(sourceId)
      })
    this.running.set(sourceId, run)
    return run
  }

  private retryLater(entry: CacheEntry): void {
    const delays = this.deps.retryDelaysMs ?? DEFAULT_RETRIES
    const count = (this.failures.get(entry.sourceId) ?? 0) + 1
    this.failures.set(entry.sourceId, count)
    if (count === delays.length) this.deps.notify({ kind: 'upload-failed', name: entry.name })
    const delay = delays[Math.min(count - 1, delays.length - 1)]!
    clearTimeout(this.timers.get(entry.sourceId))
    this.timers.set(
      entry.sourceId,
      setTimeout(() => {
        this.timers.delete(entry.sourceId)
        void this.syncIfChanged(entry.sourceId)
      }, delay),
    )
  }

  private async syncOnce(sourceId: string): Promise<void> {
    const entry = this.entries.get(sourceId)
    if (!entry || entry.detached) return
    let bytes: Uint8Array
    try {
      if (!(await stat(entry.localPath)).isFile()) return
      bytes = await readFile(entry.localPath)
    } catch {
      return
    }
    const hash = sha(bytes)
    if (hash === entry.syncedSha) return
    // not connected: wait for reconnected()
    if (!this.deps.connected()) return
    const api = this.deps.api()
    const mime = uploadMime(entry.localPath)

    if (!entry.targetId) {
      // a Google document's first save: an Office file beside it
      const copyName = officeCopyName(entry.name, extensionOfPath(entry.localPath))
      const made = await this.create(api, entry, copyName, bytes, mime)
      if (!made) return
      entry.targetId = made.id
      entry.targetMd5 = made.md5Checksum ?? null
      entry.targetModified = made.modifiedTime || null
      entry.syncedSha = hash
      this.failures.delete(sourceId)
      await this.saveIndex()
      this.deps.notify({ kind: 'saved-office-copy', name: entry.name, copyName })
      return
    }

    const meta = await api.file(entry.targetId)
    let question: SyncQuestion | null = null
    if (!meta.ok) {
      if (meta.kind !== 'not-found') return this.retryOrStop(entry, meta)
      question = { kind: 'gone', name: entry.name }
    } else if (!meta.file.canEdit) {
      question = { kind: 'read-only', name: entry.name }
    } else if (changedSince(entry, meta.file)) {
      question = { kind: 'changed', name: entry.name }
    }

    let answer: SyncAnswer = 'overwrite'
    if (question) {
      answer = await this.deps.ask(question)
      // "overwrite" is only offered for a changed file
      if (answer === 'overwrite' && question.kind !== 'changed') answer = 'local'
    }
    if (answer === 'local') {
      entry.detached = true
      await this.saveIndex()
      return
    }
    if (answer === 'copy') {
      const copyName = this.deps.copyName(meta.ok ? meta.file.name : entry.name)
      const made = await this.create(api, entry, copyName, bytes, mime)
      if (!made) return
      entry.targetId = made.id
      entry.targetMd5 = made.md5Checksum ?? null
      entry.targetModified = made.modifiedTime || null
      entry.syncedSha = hash
      this.failures.delete(sourceId)
      await this.saveIndex()
      this.deps.notify({ kind: 'saved-copy', name: entry.name, copyName })
      return
    }
    const put = await api.upload({ existingId: entry.targetId }, bytes, mime)
    if (!put.ok) return this.retryOrStop(entry, put)
    entry.targetMd5 = put.file.md5Checksum ?? null
    entry.targetModified = put.file.modifiedTime || null
    entry.syncedSha = hash
    this.failures.delete(sourceId)
    await this.saveIndex()
  }

  private async create(
    api: DriveApi,
    entry: CacheEntry,
    name: string,
    bytes: Uint8Array,
    mime: string,
  ): Promise<DriveFile | null> {
    let made = await api.upload({ name, parentId: entry.parentId ?? undefined }, bytes, mime)
    // no right to add to that folder (a shared folder), or the folder is not one the app may
    // see (drive.file covers picked files, not the folders they sit in): My Drive instead
    if (!made.ok && (made.kind === 'forbidden' || made.kind === 'not-found') && entry.parentId) {
      made = await api.upload({ name }, bytes, mime)
    }
    if (!made.ok) {
      this.retryOrStop(entry, made)
      return null
    }
    return made.file
  }

  private retryOrStop(entry: CacheEntry, error: DriveError): void {
    // not-connected waits for reconnected(); everything else is tried again later
    if (error.kind === 'not-connected') return
    if (error.kind === 'forbidden' || error.kind === 'too-large') {
      this.deps.notify({ kind: 'upload-failed', name: entry.name })
      return
    }
    this.retryLater(entry)
  }

  /** test seam: the entries as stored */
  snapshot(): CacheEntry[] {
    return [...this.entries.values()].map((e) => ({ ...e }))
  }

  /** test seam: the cache folder's files */
  async files(): Promise<string[]> {
    return readdir(this.deps.cacheDir, { recursive: true }).catch(() => [])
  }
}

/** Drive holds something other than what this copy was last in step with */
function changedSince(entry: CacheEntry, remote: DriveFile): boolean {
  if (entry.targetMd5 && remote.md5Checksum) return remote.md5Checksum !== entry.targetMd5
  if (entry.targetModified && remote.modifiedTime) {
    return remote.modifiedTime !== entry.targetModified
  }
  return false
}

function extensionOfPath(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot > path.lastIndexOf(sep) ? path.slice(dot).toLowerCase() : ''
}
