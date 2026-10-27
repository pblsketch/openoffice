/**
 * The editing calls of `window.epubApi`, routed for co-editing (decision 0073).
 *
 * A guest's tab is a window onto the book of the person sharing it: chapter
 * reads and every edit go to the host's tab, which runs them through its own
 * book. A guest's edit is then exactly a host edit, the host's book becomes
 * changed the usual way, and the host's save writes what it always would.
 * (Replaying edits on each guest's own copy would not work: chapter versions
 * count per book session, and a copy opened from saved bytes numbers its
 * blocks afresh.) The host runs its own calls as before and reports every
 * change, so the others can follow.
 */
import type {
  EpubApi,
  EpubApplyEditsRequest,
  EpubBlockInfo,
  EpubChapterResult,
  EpubEditResult,
  EpubReplaceRangesRequest,
} from '../../shared/ipc'
import type { RemoteChapter } from '../edit/controller'

export const TOPIC = {
  /** guest → host: read a chapter */
  read: 'epub:read',
  /** guest → host: block edits */
  apply: 'epub:apply',
  /** guest → host: range replacements (undo, redo) */
  ranges: 'epub:ranges',
  /** host → everyone: a chapter as an edit left it (`RemoteEdit`) */
  edit: 'epub:edit',
  /** host → everyone: the host's book translation locks editing (`{ locked }`) */
  lock: 'epub:lock',
  /** host → a guest that joined: what it needs besides the chapters it reads (`Catchup`) */
  catchup: 'epub:catchup',
} as const

export type OkEdit = Extract<EpubEditResult, { ok: true }>

/** Someone's edit as the host reports it. */
export interface RemoteEdit {
  /** the relay peer id of whoever made it */
  by: string
  chapter: RemoteChapter
}

export interface Catchup {
  locked: boolean
  /** every chapter the session changed so far, as it is now */
  chapters: RemoteChapter[]
}

/** Where the editing calls go. */
export type EditRoute =
  | { kind: 'local' }
  /** hosting: this tab's own calls as usual, every change and lock reported */
  | { kind: 'host'; changed(result: OkEdit): void; locked(locked: boolean): void }
  /** a guest: reads and edits go to the host */
  | {
      kind: 'guest'
      request(topic: string, payload: unknown): Promise<unknown>
      changed(result: OkEdit): void
    }
  /** a guest whose session just ended: nothing goes anywhere until its copy took over */
  | { kind: 'closed' }

export interface RoutedApi {
  /** the preload's api with the editing calls routed */
  api: EpubApi
  /** the preload's own api, for the host's answers to guests */
  base: EpubApi
  setRoute(route: EditRoute): void
}

const failure = (message: string) => ({ ok: false as const, error: 'failed' as const, message })

export function chapterOf(result: OkEdit): RemoteChapter {
  return {
    spineIndex: result.spineIndex,
    path: result.path,
    source: result.source,
    version: result.version,
    blocks: result.blocks,
  }
}

export function routedApi(base: EpubApi): RoutedApi {
  let route: EditRoute = { kind: 'local' }

  /** a guest's call to the host; a lost session or a refused request is a failed call, never a throw */
  const ask = async <T>(
    r: Extract<EditRoute, { kind: 'guest' }>,
    topic: string,
    payload: unknown,
  ): Promise<T | ReturnType<typeof failure>> => {
    try {
      const answer = await r.request(topic, payload)
      return isRecord(answer) ? (answer as T) : failure('the host sent no answer')
    } catch (err) {
      return failure(err instanceof Error ? err.message : String(err))
    }
  }

  const edit = async (
    topic: string,
    payload: EpubApplyEditsRequest | EpubReplaceRangesRequest,
    local: () => Promise<EpubEditResult>,
  ): Promise<EpubEditResult> => {
    const r = route
    if (r.kind === 'closed') return failure('the co-editing session ended')
    if (r.kind !== 'guest') {
      const result = await local()
      if (result.ok && r.kind === 'host' && result.replacements.length > 0) r.changed(result)
      return result
    }
    const result = await ask<EpubEditResult>(r, topic, payload)
    if (!result.ok) return result
    if (result.replacements.length > 0) r.changed(result)
    // the host's book is the one with unsaved changes, not this copy
    return { ...result, dirty: false }
  }

  const api: EpubApi = {
    ...base,
    readChapter: async (spineIndex): Promise<EpubChapterResult> => {
      const r = route
      if (r.kind === 'closed') return failure('the co-editing session ended')
      if (r.kind === 'guest') return ask<EpubChapterResult>(r, TOPIC.read, spineIndex)
      return base.readChapter(spineIndex)
    },
    applyEdits: (request) => edit(TOPIC.apply, request, () => base.applyEdits(request)),
    replaceRanges: (request) => edit(TOPIC.ranges, request, () => base.replaceRanges(request)),
    setTranslationLock: async (locked) => {
      const r = route
      // a guest follows the host's lock; its own book is not the one being edited
      if (r.kind === 'guest') return locked
      const now = await base.setTranslationLock(locked)
      if (r.kind === 'host') r.locked(now)
      return now
    },
  }

  return {
    api,
    base,
    setRoute: (next) => {
      route = next
    },
  }
}

// ---- what arrives from other peers (checked: it came over the network) ----

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isIndex = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0

const isSpan = (v: unknown): v is { start: number; end: number } =>
  isRecord(v) && isIndex(v.start) && isIndex(v.end) && v.end >= v.start

function blocksOf(v: unknown): EpubBlockInfo[] | null {
  if (!Array.isArray(v)) return null
  const out: EpubBlockInfo[] = []
  for (const b of v) {
    if (!isRecord(b) || typeof b.id !== 'string' || typeof b.tag !== 'string') return null
    if (typeof b.kind !== 'string' || typeof b.flowing !== 'boolean') return null
    if (!isSpan(b.outer) || !isSpan(b.inner)) return null
    out.push({
      id: b.id,
      kind: b.kind as EpubBlockInfo['kind'],
      tag: b.tag,
      flowing: b.flowing,
      outer: { start: b.outer.start, end: b.outer.end },
      inner: { start: b.inner.start, end: b.inner.end },
    })
  }
  return out
}

export function remoteChapterOf(v: unknown): RemoteChapter | null {
  if (!isRecord(v) || !isIndex(v.spineIndex) || !isIndex(v.version)) return null
  if (typeof v.path !== 'string' || typeof v.source !== 'string') return null
  const blocks = blocksOf(v.blocks)
  if (!blocks) return null
  return { spineIndex: v.spineIndex, path: v.path, source: v.source, version: v.version, blocks }
}

export function remoteEditOf(v: unknown): RemoteEdit | null {
  if (!isRecord(v) || typeof v.by !== 'string') return null
  const chapter = remoteChapterOf(v.chapter)
  return chapter ? { by: v.by, chapter } : null
}

export function catchupOf(v: unknown): Catchup | null {
  if (!isRecord(v) || typeof v.locked !== 'boolean' || !Array.isArray(v.chapters)) return null
  const chapters: RemoteChapter[] = []
  for (const c of v.chapters) {
    const chapter = remoteChapterOf(c)
    if (chapter) chapters.push(chapter)
  }
  return { locked: v.locked, chapters }
}

/** A guest's block edits as the host's book takes them (the main process checks each edit). */
export function applyRequestOf(v: unknown): EpubApplyEditsRequest | null {
  if (!isRecord(v) || !isIndex(v.spineIndex) || !Array.isArray(v.edits)) return null
  return { spineIndex: v.spineIndex, edits: v.edits as EpubApplyEditsRequest['edits'] }
}

/** A guest's range replacements as the host's book takes them (the main process checks them). */
export function rangesRequestOf(v: unknown): EpubReplaceRangesRequest | null {
  if (!isRecord(v) || !isIndex(v.spineIndex) || !Number.isSafeInteger(v.version)) return null
  if (!Array.isArray(v.replacements)) return null
  return {
    spineIndex: v.spineIndex,
    version: v.version as number,
    replacements: v.replacements as EpubReplaceRangesRequest['replacements'],
  }
}

/**
 * The chapters a session changed, each as its latest edit left it: what a
 * guest's copy takes over when the session ends, and what the host hands a
 * guest that joins late.
 */
export class ChangedChapters {
  private readonly byPath = new Map<string, RemoteChapter>()

  take(chapter: RemoteChapter): void {
    const known = this.byPath.get(chapter.path)
    if (!known || chapter.version > known.version) this.byPath.set(chapter.path, chapter)
  }

  all(): RemoteChapter[] {
    return [...this.byPath.values()]
  }

  clear(): void {
    this.byPath.clear()
  }
}
