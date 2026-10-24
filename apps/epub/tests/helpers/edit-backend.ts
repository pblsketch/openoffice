/**
 * An in-memory stand-in for the main process's book, for the editing tests:
 * the same engine calls and the same answers as the book session (block
 * edits all or nothing, range replacements against a version and only
 * inside blocks or back to an earlier text, the translation lock, read-only
 * chapters), without a zip.
 */
import {
  applyBlockEdits,
  applyReplacements,
  openChapter,
  remapChapter,
  validateReplacements,
  type ChapterMap,
  type OpenChapter,
  type RangeReplacement,
} from '@genoffice/epub-engine'
import { invertReplacements } from '../../src/main/book-session'
import type {
  EpubApplyEditsRequest,
  EpubBlockInfo,
  EpubChapterResult,
  EpubEditResult,
  EpubReadOnlyReason,
  EpubReplaceRangesRequest,
} from '../../src/shared/ipc'
import { xhtml } from './book'

export interface ChapterSpec {
  body: string
  readOnly?: EpubReadOnlyReason | null
}

interface Chapter {
  path: string
  stored: string
  map: ChapterMap
  version: number
  readOnly: EpubReadOnlyReason | null
  /** every text the chapter has had */
  seen: Set<string>
}

function blockInfo(map: OpenChapter): EpubBlockInfo[] {
  return map.blocks.map((b) => ({
    id: b.id,
    kind: b.kind,
    tag: b.tag,
    flowing: b.flowing,
    outer: { ...b.outer },
    inner: { ...b.inner },
  }))
}

export class FakeBook {
  readonly chapters: Chapter[]
  locked = false
  readonly calls: Array<{ kind: 'apply' | 'ranges'; spineIndex: number }> = []
  readonly dirtyCalls: boolean[] = []

  constructor(specs: readonly ChapterSpec[]) {
    this.chapters = specs.map((spec, i) => {
      const stored = xhtml(`Chapter ${i + 1}`, spec.body)
      return {
        path: `OEBPS/text/c${i + 1}.xhtml`,
        stored,
        map: openChapter(stored),
        version: 0,
        readOnly: spec.readOnly ?? null,
        seen: new Set([stored]),
      }
    })
  }

  source(i: number): string {
    return this.chapters[i]!.map.source
  }

  get dirty(): boolean {
    return this.chapters.some((c) => c.map.source !== c.stored)
  }

  readChapter = async (i: number): Promise<EpubChapterResult> => {
    const c = this.chapters[i]
    if (!c) return { ok: false, error: 'invalid-request' }
    const base = { ok: true as const, spineIndex: i, path: c.path, source: c.map.source }
    if (c.map.broken) {
      return {
        ...base,
        version: c.version,
        broken: true,
        error: c.map.error,
        readOnly: 'broken-chapter',
      }
    }
    return {
      ...base,
      version: c.version,
      broken: false,
      blocks: blockInfo(c.map),
      readOnly: c.readOnly,
    }
  }

  private editable(i: number): Chapter | EpubEditResult {
    const c = this.chapters[i]
    if (!c) return { ok: false, error: 'invalid-request' }
    if (this.locked) return { ok: false, error: 'locked' }
    if (c.readOnly || c.map.broken) {
      return { ok: false, error: 'read-only', readOnly: c.readOnly ?? 'broken-chapter' }
    }
    return c
  }

  private commit(
    i: number,
    c: Chapter,
    next: OpenChapter,
    replacements: RangeReplacement[],
    created: string[],
  ): EpubEditResult {
    const before = c.map.source
    if (replacements.length > 0) {
      c.map = next
      c.version++
      c.seen.add(next.source)
    }
    return {
      ok: true,
      spineIndex: i,
      path: c.path,
      source: c.map.source,
      version: c.version,
      blocks: blockInfo(next),
      created,
      replacements,
      inverse: invertReplacements(before, replacements),
      dirty: this.dirty,
    }
  }

  applyEdits = async (request: EpubApplyEditsRequest): Promise<EpubEditResult> => {
    this.calls.push({ kind: 'apply', spineIndex: request.spineIndex })
    const target = this.editable(request.spineIndex)
    if ('ok' in target) return target
    const map = target.map as OpenChapter
    const applied = applyBlockEdits(map, request.edits)
    if (!applied.ok) {
      return {
        ok: false,
        error: 'refused',
        refusal: applied.refusal,
        index: applied.index,
        message: applied.refusal.message,
      }
    }
    return this.commit(
      request.spineIndex,
      target,
      applied.map,
      applied.replacements,
      applied.created,
    )
  }

  replaceRanges = async (request: EpubReplaceRangesRequest): Promise<EpubEditResult> => {
    this.calls.push({ kind: 'ranges', spineIndex: request.spineIndex })
    const target = this.editable(request.spineIndex)
    if ('ok' in target) return target
    if (request.version !== target.version) return { ok: false, error: 'stale' }
    const map = target.map as OpenChapter
    const problem = validateReplacements(request.replacements, map.source.length)
    if (problem) return { ok: false, error: 'invalid-request', message: problem }
    const text = applyReplacements(map.source, request.replacements)
    const inside = request.replacements.every((r) =>
      map.blocks.some((b) => b.inner.start <= r.start && r.end <= b.inner.end),
    )
    if (text !== map.source && !inside && !target.seen.has(text)) {
      return { ok: false, error: 'invalid-request', message: 'outside the blocks' }
    }
    const next = remapChapter(map, text, request.replacements)
    if (next.broken) return { ok: false, error: 'refused', message: next.error }
    const before = new Set(map.blocks.map((b) => b.id))
    const created = next.blocks.filter((b) => !before.has(b.id)).map((b) => b.id)
    return this.commit(request.spineIndex, target, next, request.replacements, created)
  }

  setTranslationLock = async (locked: boolean): Promise<boolean> => {
    this.locked = locked
    return locked
  }

  setDirty = (dirty: boolean): void => {
    this.dirtyCalls.push(dirty)
  }
}
