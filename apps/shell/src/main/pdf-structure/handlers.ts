/**
 * Logic behind the pdf structure and result-store channels, Electron-free
 * (pdf-structure-ipc.ts binds it to ipcMain; the tests call it directly).
 *
 * Permission rules, the same as the pdf editor's own handlers
 * (apps/pdf/AGENTS.md): a job reads only a file granted to the calling view
 * (its open file), and writes only to a target the main process's dialog
 * picked for that view (pickTarget), never to a granted source file. A store
 * call takes only a document hash the main process computed for that view.
 *
 * Every handler answers an outcome and never throws.
 */
import { dirname, extname, basename, join, resolve } from 'node:path'
import {
  JOB_KINDS,
  StoreWriteError,
  jobKeyOf,
  type HighlightBlockEntry,
  type HighlightRun,
  type InsightsEntry,
  type JobKind,
  type PassageCard,
  type ResultStore,
  type TranslationBlockKey,
} from '../../../../../packages/pdf-structure/src/store'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type { PageFingerprint } from '../../../../../packages/pdf-structure/src/tree/extract'
import type {
  PdfStoreDeleteCounts,
  PdfStoreMigrateRequest,
  PdfStoreMigrateResult,
  PdfStorePageFingerprintsRequest,
  PdfStoredTranslation,
  PdfStoreWriteRequest,
  PdfStoreWriteResult,
  PdfTranslationRecency,
  PdfStructureConvertRequest,
  PdfStructureConvertResult,
  PdfStructureEpubOptions,
  PdfStructureFailure,
  PdfStructureImagesRequest,
  PdfStructureImagesResult,
  PdfStructureOutcome,
  PdfStructurePickTargetRequest,
  PdfStructureProgress,
  PdfStructureSource,
  PdfStructureTargetKind,
  PdfStructureTextRequest,
  PdfStructureTextResult,
  PdfStructureTreeRequest,
  PdfStructureTreeResult,
  PdfStructureWriteBackRequest,
  PdfStructureWriteBackResult,
} from '../../../../pdf/src/shared/ipc'
import { migrateJobRecords } from './job-migration'
import type {
  EpubJobValue,
  FingerprintsJobValue,
  ImagesJobValue,
  JobSource,
  MarkdownJobValue,
  StructuredTextJobValue,
  StructureJob,
  TranslationInput,
  TreeJobValue,
  WriteBackJobValue,
} from './protocol'
import type { JobRunOutcome, StructureJobRunner } from './runner'

export interface PickPathRequest {
  kind: PdfStructureTargetKind
  /** absolute: a file suggestion, or the folder for 'folder' */
  defaultPath: string
  title?: string
}

export interface StructureHandlerDeps {
  runner: Pick<StructureJobRunner, 'run' | 'cancel' | 'cancelOwner'>
  /** created on first use (userData is final by then) */
  store: () => ResultStore
  /** the pdf editor's grant table (pdfPathGranted) */
  isGranted: (owner: number, path: string) => boolean
  /** the main-process save / folder dialog; null = cancelled */
  pickPath: (owner: number, request: PickPathRequest) => Promise<string | null>
  /** SHA-256 hex of a file's bytes (documentHashOfFile) */
  hashFile: (path: string) => Promise<string>
  /** case-insensitive paths (win32, darwin) */
  caseInsensitivePaths?: boolean
}

/** per-call context: which view asks, and where its progress events go */
export interface CallContext {
  owner: number
  progress: (progress: PdfStructureProgress) => void
}

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/
/** document hashes and other store keys (store segment rule) */
const KEY = /^[A-Za-z0-9_-]{1,128}$/
const MAX_PAGES = 100_000
const MAX_PAGE_NUMBER = 10_000_000
const MAX_TEXT = 2_000
const MAX_PASSWORD = 1_024
/** a person's edit of one translated block */
const MAX_EDITED_TEXT = 200_000
/** suggestion states changed in one call */
const MAX_STATES = 10_000
const SUGGESTION_STATES: readonly unknown[] = ['pending', 'accepted', 'dismissed']

const fail = (error: PdfStructureFailure['error'], message?: string): PdfStructureFailure => ({
  ok: false,
  error,
  ...(message ? { message } : {}),
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const optText = (v: unknown, max = MAX_TEXT): v is string | undefined =>
  v === undefined || (typeof v === 'string' && v.length <= max)

const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/

const isKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v)

/** a block key (translation and highlight blocks), checked field by field */
function blockKeyOf(v: unknown): TranslationBlockKey | null {
  if (!isRecord(v) || !isKey(v.pageFingerprint) || !isKey(v.textHash)) return null
  const occurrence = v.occurrence
  if (!Number.isSafeInteger(occurrence) || (occurrence as number) < 0) return null
  return {
    pageFingerprint: v.pageFingerprint,
    textHash: v.textHash,
    occurrence: occurrence as number,
  }
}

type SuggestionState = 'pending' | 'accepted' | 'dismissed'

/** suggestion id -> state, or null when any entry is not one */
function suggestionStatesOf(v: unknown): Record<string, SuggestionState> | null {
  if (!isRecord(v)) return null
  const entries = Object.entries(v)
  if (entries.length > MAX_STATES) return null
  const out: Record<string, SuggestionState> = {}
  for (const [id, state] of entries) {
    if (id.length === 0 || id.length > 200 || !SUGGESTION_STATES.includes(state)) return null
    out[id] = state as SuggestionState
  }
  return out
}

const isJobKind = (v: unknown): v is JobKind => (JOB_KINDS as readonly unknown[]).includes(v)

const TARGET_EXT: Record<Exclude<PdfStructureTargetKind, 'folder'>, string> = {
  md: '.md',
  epub: '.epub',
  pdf: '.pdf',
}
const TARGET_FILTER: Record<Exclude<PdfStructureTargetKind, 'folder'>, string> = {
  md: 'Markdown',
  epub: 'EPUB',
  pdf: 'PDF',
}
export const targetFilterName = (kind: Exclude<PdfStructureTargetKind, 'folder'>): string =>
  TARGET_FILTER[kind]
export const targetExtension = (kind: Exclude<PdfStructureTargetKind, 'folder'>): string =>
  TARGET_EXT[kind].slice(1)

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** failure for a store call that threw */
function storeFailure(err: unknown): PdfStructureFailure {
  if (err instanceof StoreWriteError) return fail('store-write-failed', err.message)
  if (err instanceof TypeError) return fail('invalid-request', err.message)
  return fail('failed', messageOf(err))
}

/** the page fingerprints of one view's file bytes */
interface CachedFingerprints {
  docHash: string
  fingerprints: string[]
}

interface CachedTree {
  docHash: string
  pagesKey: string
  tree: DocumentTree
  fingerprints: PageFingerprint[]
}

/** picture bytes left out (the AI read path and the screens do not need them) */
export function withoutImageData(tree: DocumentTree): DocumentTree {
  const empty = new Uint8Array(0)
  return {
    ...tree,
    blocks: tree.blocks.map((b) =>
      b.kind === 'image' || b.kind === 'pageImage' ? { ...b, data: empty } : b,
    ),
  }
}

/** highlight runs, newest first (the panel and the preview show only the first) */
function newestFirst(runs: HighlightRun[]): HighlightRun[] {
  return [...runs].sort((a, b) => b.createdAt - a.createdAt || a.runId.localeCompare(b.runId))
}

export function createPdfStructureHandlers(deps: StructureHandlerDeps) {
  /** dialog-picked targets per view: path -> kind (held until a job using it succeeds) */
  const targets = new Map<number, Map<string, PdfStructureTargetKind>>()
  /** targets a running job writes to */
  const targetsInUse = new Set<string>()
  /** document hashes the main process computed for each view */
  const knownHashes = new Map<number, Set<string>>()
  /** one cached tree per view: same file bytes and pages answer without a new job */
  const treeCache = new Map<number, CachedTree>()
  /** one fingerprint list per view: same file bytes answer without a new job */
  const fingerprintCache = new Map<number, CachedFingerprints>()
  let internalJobs = 0

  const pathKey = (p: string): string =>
    deps.caseInsensitivePaths ? resolve(p).toLowerCase() : resolve(p)

  const know = (owner: number, docHash: string): void => {
    const set = knownHashes.get(owner) ?? new Set<string>()
    set.add(docHash)
    knownHashes.set(owner, set)
  }
  const knows = (owner: number, docHash: unknown): docHash is string =>
    typeof docHash === 'string' && !!knownHashes.get(owner)?.has(docHash)

  /** the request's source, checked; a failure when it is not this view's file */
  function sourceOf(
    owner: number,
    req: unknown,
  ): { source: JobSource; pagesKey: string } | PdfStructureFailure {
    if (!isRecord(req)) return fail('invalid-request', 'request must be an object')
    const { path, password, pages } = req as Partial<PdfStructureSource>
    if (typeof path !== 'string' || !deps.isGranted(owner, path)) {
      return fail('not-granted', 'pdf: path not granted to this view')
    }
    if (!optText(password, MAX_PASSWORD)) return fail('invalid-request', 'bad password')
    if (pages !== undefined) {
      if (
        !Array.isArray(pages) ||
        pages.length === 0 ||
        pages.length > MAX_PAGES ||
        !pages.every((p) => Number.isSafeInteger(p) && p >= 1 && p <= MAX_PAGE_NUMBER)
      ) {
        return fail('invalid-request', 'pages must be 1-based page numbers')
      }
    }
    const source: JobSource = { pdfPath: path }
    if (password !== undefined) source.password = password
    let pagesKey = 'all'
    if (pages !== undefined) {
      source.pages = [...pages]
      pagesKey = [...new Set(pages)].sort((a, b) => a - b).join(',')
    }
    return { source, pagesKey }
  }

  const jobIdOf = (req: unknown): string | null =>
    isRecord(req) && typeof req.jobId === 'string' && JOB_ID.test(req.jobId) ? req.jobId : null

  /** an output target picked for this view and kind, not a source file, not in use */
  function claimTarget(
    owner: number,
    sourcePath: string,
    outPath: unknown,
    kind: PdfStructureTargetKind,
  ): string | PdfStructureFailure {
    if (typeof outPath !== 'string' || targets.get(owner)?.get(pathKey(outPath)) !== kind) {
      return fail('not-granted', 'pdf: target not picked for this view')
    }
    if (pathKey(outPath) === pathKey(sourcePath) || deps.isGranted(owner, outPath)) {
      return fail('invalid-target', 'the source document is never written')
    }
    const key = `${owner}:${pathKey(outPath)}`
    if (targetsInUse.has(key)) return fail('busy', 'another job writes to this target')
    targetsInUse.add(key)
    return outPath
  }

  function releaseTarget(owner: number, outPath: string, used: boolean): void {
    targetsInUse.delete(`${owner}:${pathKey(outPath)}`)
    if (used) targets.get(owner)?.delete(pathKey(outPath))
  }

  /** the cached tree for this view when the file bytes and pages are unchanged */
  async function cachedTree(owner: number, path: string, pagesKey: string) {
    const cached = treeCache.get(owner)
    if (!cached || cached.pagesKey !== pagesKey) return { cached: null, docHash: null }
    let docHash: string
    try {
      docHash = await deps.hashFile(path)
    } catch {
      return { cached: null, docHash: null }
    }
    know(owner, docHash)
    return { cached: cached.docHash === docHash ? cached : null, docHash }
  }

  function run(ctx: CallContext, jobId: string, job: StructureJob): Promise<JobRunOutcome> {
    return deps.runner.run(ctx.owner, jobId, job, (done, total) =>
      ctx.progress({ jobId, done, total }),
    )
  }

  function translationOf(v: unknown): TranslationInput | undefined | null {
    if (v === undefined) return undefined
    if (!isRecord(v) || typeof v.lang !== 'string' || !KEY.test(v.lang)) return null
    if (typeof v.bilingual !== 'boolean') return null
    // no units: the job reads the stored translation of the file's document hash
    if (v.units === undefined) return { lang: v.lang, bilingual: v.bilingual }
    if (!Array.isArray(v.units)) return null
    for (const u of v.units) {
      if (!isRecord(u) || typeof u.key !== 'string' || !Array.isArray(u.runs)) return null
      if (!u.runs.every(isRecord)) return null
    }
    return v as unknown as TranslationInput
  }

  /** a translated-PDF payload names the target language and whether it is bilingual; nothing else is passed on */
  function writeBackPayloadOf(v: unknown): { lang: string; bilingual?: true } | null {
    if (!isRecord(v) || typeof v.lang !== 'string' || !LANGUAGE_TAG.test(v.lang)) return null
    if (v.bilingual !== undefined && typeof v.bilingual !== 'boolean') return null
    return { lang: v.lang, ...(v.bilingual === true ? { bilingual: true as const } : {}) }
  }

  function epubOptionsOf(v: unknown): PdfStructureEpubOptions | null {
    if (!isRecord(v) || typeof v.title !== 'string' || v.title.length > MAX_TEXT) return null
    if (!optText(v.author) || !optText(v.pageImageAlt, 200)) return null
    if (v.cover !== undefined && typeof v.cover !== 'boolean') return null
    for (const tag of [v.language, v.uiLanguage]) {
      if (tag !== undefined && (typeof tag !== 'string' || !LANGUAGE_TAG.test(tag))) return null
    }
    const out: PdfStructureEpubOptions = { title: v.title }
    if (v.author !== undefined) out.author = v.author
    if (v.cover !== undefined) out.cover = v.cover
    if (v.language !== undefined) out.language = v.language as string
    if (v.uiLanguage !== undefined) out.uiLanguage = v.uiLanguage as string
    if (v.pageImageAlt !== undefined) out.pageImageAlt = v.pageImageAlt
    return out
  }

  return {
    async pickTarget(owner: number, req: PdfStructurePickTargetRequest): Promise<string | null> {
      if (!isRecord(req)) return null
      const { kind, path, defaultName, title } = req
      if (kind !== 'md' && kind !== 'epub' && kind !== 'pdf' && kind !== 'folder') return null
      if (typeof path !== 'string' || !deps.isGranted(owner, path)) return null
      if (!optText(defaultName, 255) || !optText(title, 200)) return null
      let defaultPath = dirname(path)
      if (kind !== 'folder') {
        const ext = TARGET_EXT[kind]
        const stem = (defaultName ? basename(defaultName) : basename(path, extname(path))).replace(
          // eslint-disable-next-line no-control-regex -- stripping control chars is the point here
          /[\\/:*?"<>|\u0000-\u001f]/g,
          '_',
        )
        const name = stem.toLowerCase().endsWith(ext) ? stem : `${stem || 'document'}${ext}`
        defaultPath = join(dirname(path), name)
      }
      const picked = await deps.pickPath(owner, {
        kind,
        defaultPath,
        ...(title ? { title } : {}),
      })
      if (!picked) return null
      // the source is read only: never hand it out as a write target
      if (kind !== 'folder' && (pathKey(picked) === pathKey(path) || deps.isGranted(owner, picked)))
        return null
      const map = targets.get(owner) ?? new Map<string, PdfStructureTargetKind>()
      map.set(pathKey(picked), kind)
      targets.set(owner, map)
      return picked
    },

    async tree(
      ctx: CallContext,
      req: PdfStructureTreeRequest,
    ): Promise<PdfStructureOutcome<PdfStructureTreeResult>> {
      const jobId = jobIdOf(req)
      if (!jobId) return fail('invalid-request', 'bad job id')
      const src = sourceOf(ctx.owner, req)
      if ('ok' in src) return src
      const imageData = req.imageData === true
      const shape = (c: CachedTree, cached: boolean) => ({
        ok: true as const,
        docHash: c.docHash,
        tree: imageData ? c.tree : withoutImageData(c.tree),
        fingerprints: c.fingerprints,
        cached,
      })
      const hit = await cachedTree(ctx.owner, src.source.pdfPath, src.pagesKey)
      if (hit.cached) return shape(hit.cached, true)
      const out = await run(ctx, jobId, { op: 'tree', source: src.source })
      if (!out.ok) return out
      const value = out.value as TreeJobValue
      const entry: CachedTree = { ...value, pagesKey: src.pagesKey }
      treeCache.set(ctx.owner, entry)
      know(ctx.owner, value.docHash)
      return shape(entry, false)
    },

    async text(
      ctx: CallContext,
      req: PdfStructureTextRequest,
    ): Promise<PdfStructureOutcome<PdfStructureTextResult>> {
      const jobId = jobIdOf(req)
      if (!jobId) return fail('invalid-request', 'bad job id')
      const src = sourceOf(ctx.owner, req)
      if ('ok' in src) return src
      const hit = await cachedTree(ctx.owner, src.source.pdfPath, src.pagesKey)
      const out = await run(ctx, jobId, {
        op: 'structuredText',
        source: src.source,
        ...(hit.cached ? { tree: hit.cached.tree } : {}),
      })
      if (!out.ok) return out
      const value = out.value as StructuredTextJobValue
      if (value.extracted) {
        treeCache.set(ctx.owner, {
          docHash: value.docHash,
          pagesKey: src.pagesKey,
          ...value.extracted,
        })
      }
      know(ctx.owner, value.docHash)
      return { ok: true, docHash: value.docHash, pages: value.pages }
    },

    async convert(
      ctx: CallContext,
      req: PdfStructureConvertRequest,
    ): Promise<PdfStructureOutcome<PdfStructureConvertResult>> {
      const jobId = jobIdOf(req)
      if (!jobId) return fail('invalid-request', 'bad job id')
      const src = sourceOf(ctx.owner, req)
      if ('ok' in src) return src
      const format = req.format
      if (format !== 'md' && format !== 'epub') return fail('invalid-request', 'bad format')
      const translation = translationOf(req.translation)
      if (translation === null) return fail('invalid-request', 'bad translation')
      let epub: PdfStructureEpubOptions | null = null
      if (format === 'epub') {
        epub = epubOptionsOf(req.epub)
        if (!epub) return fail('invalid-request', 'bad EPUB options')
      }
      const outPath = claimTarget(ctx.owner, src.source.pdfPath, req.outPath, format)
      if (typeof outPath !== 'string') return outPath
      let ok = false
      try {
        const hit = await cachedTree(ctx.owner, src.source.pdfPath, src.pagesKey)
        const common = {
          source: src.source,
          outPath,
          ...(hit.cached ? { tree: hit.cached.tree } : {}),
          ...(translation ? { translation } : {}),
        }
        const out = await run(
          ctx,
          jobId,
          epub ? { op: 'epub', ...common, epub } : { op: 'markdown', ...common },
        )
        if (!out.ok) return out
        ok = true
        if (format === 'md') {
          const value = out.value as MarkdownJobValue
          know(ctx.owner, value.docHash)
          return { ok: true, ...value }
        }
        const value = out.value as EpubJobValue
        know(ctx.owner, value.docHash)
        return { ok: true, ...value, warnings: [], assetsWritten: 0, assetsReused: 0 }
      } finally {
        releaseTarget(ctx.owner, outPath, ok)
      }
    },

    async extractImages(
      ctx: CallContext,
      req: PdfStructureImagesRequest,
    ): Promise<PdfStructureOutcome<PdfStructureImagesResult>> {
      const jobId = jobIdOf(req)
      if (!jobId) return fail('invalid-request', 'bad job id')
      const src = sourceOf(ctx.owner, req)
      if ('ok' in src) return src
      if (!optText(req.baseName, 200)) return fail('invalid-request', 'bad base name')
      const minImagePx = req.minImagePx
      if (
        minImagePx !== undefined &&
        (!Number.isSafeInteger(minImagePx) || minImagePx < 1 || minImagePx > 10_000)
      ) {
        return fail('invalid-request', 'bad minimum image size')
      }
      const outDir = claimTarget(ctx.owner, src.source.pdfPath, req.outDir, 'folder')
      if (typeof outDir !== 'string') return outDir
      let ok = false
      try {
        const pdfPath = src.source.pdfPath
        const out = await run(ctx, jobId, {
          op: 'images',
          source: src.source,
          outDir,
          baseName: req.baseName || basename(pdfPath, extname(pdfPath)),
          ...(minImagePx !== undefined ? { minImagePx } : {}),
        })
        if (!out.ok) return out
        ok = true
        const value = out.value as ImagesJobValue
        know(ctx.owner, value.docHash)
        return { ok: true, ...value }
      } finally {
        releaseTarget(ctx.owner, outDir, ok)
      }
    },

    async writeBack(
      ctx: CallContext,
      req: PdfStructureWriteBackRequest,
    ): Promise<PdfStructureOutcome<PdfStructureWriteBackResult>> {
      const jobId = jobIdOf(req)
      if (!jobId) return fail('invalid-request', 'bad job id')
      const src = sourceOf(ctx.owner, req)
      if ('ok' in src) return src
      const outPath = claimTarget(ctx.owner, src.source.pdfPath, req.outPath, 'pdf')
      if (typeof outPath !== 'string') return outPath
      let ok = false
      try {
        const payload = writeBackPayloadOf(req.payload)
        if (!payload) return fail('invalid-request', 'bad translated PDF payload')
        const hit = await cachedTree(ctx.owner, src.source.pdfPath, src.pagesKey)
        const out = await run(ctx, jobId, {
          op: 'writeBack',
          source: src.source,
          ...(hit.cached ? { tree: hit.cached.tree } : {}),
          outPath,
          payload,
        })
        if (!out.ok) return out
        ok = true
        const value = out.value as WriteBackJobValue
        know(ctx.owner, value.docHash)
        return { ok: true, ...value }
      } finally {
        releaseTarget(ctx.owner, outPath, ok)
      }
    },

    cancel(owner: number, jobId: unknown): boolean {
      return typeof jobId === 'string' && JOB_ID.test(jobId) && deps.runner.cancel(owner, jobId)
    },

    // ── result store ──

    async storeDocHash(
      owner: number,
      path: unknown,
    ): Promise<PdfStructureOutcome<{ docHash: string }>> {
      if (typeof path !== 'string' || !deps.isGranted(owner, path)) {
        return fail('not-granted', 'pdf: path not granted to this view')
      }
      try {
        const docHash = await deps.hashFile(path)
        know(owner, docHash)
        return { ok: true, docHash }
      } catch (err) {
        return fail('failed', messageOf(err))
      }
    },

    async storeAiReadPages(owner: number, docHash: unknown) {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        const pages = [...(await deps.store().readAiReadPages(docHash)).values()]
        return { ok: true as const, pages }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeTranslations(owner: number, docHash: unknown) {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true as const, langs: await deps.store().listTranslations(docHash) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeTranslation(
      owner: number,
      docHash: unknown,
      lang: unknown,
    ): Promise<PdfStructureOutcome<{ translation: PdfStoredTranslation | null }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      if (typeof lang !== 'string' || !KEY.test(lang))
        return fail('invalid-request', 'bad language')
      try {
        const stored = await deps.store().readTranslation(docHash, lang)
        return {
          ok: true,
          translation: stored && { ...stored, blocks: [...stored.blocks.values()] },
        }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeUnfinishedJobs(owner: number, docHash: unknown) {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true as const, jobs: await deps.store().unfinishedJobs(docHash) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeWrite(
      owner: number,
      req: PdfStoreWriteRequest,
    ): Promise<PdfStructureOutcome<PdfStoreWriteResult>> {
      if (!isRecord(req)) return fail('invalid-request', 'request must be an object')
      if (!knows(owner, req.docHash)) return fail('not-granted', 'unknown document hash')
      const store = deps.store()
      try {
        switch (req.kind) {
          case 'aiReadPage':
            if (!optText(req.provider, 200) || !optText(req.model, 200)) break
            await store.writeAiReadPage(req.docHash, req.pageFingerprint, req.payload, {
              ...(req.provider !== undefined ? { provider: req.provider } : {}),
              ...(req.model !== undefined ? { model: req.model } : {}),
            })
            return { ok: true }
          case 'translationMeta':
            await store.writeTranslationMeta(req.docHash, req.lang, {
              provider: req.provider,
              model: req.model,
            })
            return { ok: true }
          case 'translationBlocks':
            if (!Array.isArray(req.blocks) || !req.blocks.every(isRecord)) break
            await store.writeTranslationBlocks(req.docHash, req.lang, req.blocks)
            return { ok: true }
          case 'deleteTranslation':
            await store.deleteTranslation(req.docHash, req.lang)
            return { ok: true }
          case 'job':
            if (!isRecord(req.job)) break
            await store.writeJob(req.docHash, req.job)
            return { ok: true }
          case 'heartbeat': {
            if (!isJobKind(req.job) || !optText(req.lang, 128) || !optText(req.runId, 128)) break
            const key = jobKeyOf({
              kind: req.job,
              ...(req.lang !== undefined ? { lang: req.lang } : {}),
              ...(req.runId !== undefined ? { runId: req.runId } : {}),
            })
            return (await store.heartbeatJob(req.docHash, req.job, key))
              ? { ok: true }
              : fail('failed', 'no running job record')
          }
          case 'passage':
            if (!isRecord(req.card)) break
            await store.writePassage(req.docHash, req.card)
            return { ok: true }
          case 'deletePassage':
            if (!isKey(req.id)) break
            await store.deletePassage(req.docHash, req.id)
            return { ok: true }
          case 'highlightRun':
            if (!isRecord(req.run)) break
            await store.writeHighlightRun(req.docHash, req.run)
            return { ok: true }
          case 'highlightBlocks':
            if (!isKey(req.runId) || !Array.isArray(req.blocks)) break
            if (!req.blocks.every((b) => isRecord(b) && blockKeyOf(b.key))) break
            await store.writeHighlightBlocks(req.docHash, req.runId, req.blocks)
            return { ok: true }
          case 'highlightSuggestionStates': {
            const key = blockKeyOf(req.key)
            const states = suggestionStatesOf(req.states)
            if (!isKey(req.runId) || !key || !states) break
            return (await store.setHighlightSuggestionStates(req.docHash, req.runId, key, states))
              ? { ok: true }
              : fail('failed', 'no such highlight block')
          }
          case 'deleteHighlightRun':
            if (!isKey(req.runId)) break
            await store.deleteHighlightRun(req.docHash, req.runId)
            return { ok: true }
          case 'insights':
            if (!isRecord(req.entry)) break
            await store.writeInsights(req.docHash, req.entry)
            return { ok: true }
          case 'editedTranslationBlock': {
            const key = blockKeyOf(req.key)
            if (!isKey(req.lang) || !key) break
            if (typeof req.text !== 'string' || req.text.length > MAX_EDITED_TEXT) break
            await store.writeEditedTranslationBlock(req.docHash, req.lang, key, req.text)
            return { ok: true }
          }
          case 'deleteTranslationExceptEdited':
            if (!isKey(req.lang)) break
            return {
              ok: true,
              removed: await store.deleteTranslationExceptEdited(req.docHash, req.lang),
            }
        }
        return fail('invalid-request', 'bad store write')
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storePassages(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<{ cards: PassageCard[] }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true, cards: await deps.store().readPassages(docHash) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeHighlightRuns(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<{ runs: HighlightRun[] }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true, runs: newestFirst(await deps.store().listHighlightRuns(docHash)) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeHighlightBlocks(
      owner: number,
      docHash: unknown,
      runId: unknown,
    ): Promise<PdfStructureOutcome<{ blocks: HighlightBlockEntry[] }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      if (!isKey(runId)) return fail('invalid-request', 'bad run id')
      try {
        return {
          ok: true,
          blocks: [...(await deps.store().readHighlightBlocks(docHash, runId)).values()],
        }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeLatestHighlight(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<{ run: HighlightRun | null; blocks: HighlightBlockEntry[] }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        const store = deps.store()
        const run = newestFirst(await store.listHighlightRuns(docHash))[0] ?? null
        const blocks = run
          ? [...(await store.readHighlightBlocks(docHash, run.runId)).values()]
          : []
        return { ok: true, run, blocks }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeInsights(
      owner: number,
      docHash: unknown,
      lang: unknown,
    ): Promise<PdfStructureOutcome<{ insights: InsightsEntry | null }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      if (!isKey(lang)) return fail('invalid-request', 'bad language')
      try {
        return { ok: true, insights: await deps.store().readInsights(docHash, lang) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeDeleteCounts(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<PdfStoreDeleteCounts>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        const store = deps.store()
        return {
          ok: true,
          editedTranslationBlocks: await store.countEditedTranslationBlocks(docHash),
          passages: await store.countPassages(docHash),
        }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeTranslationRecency(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<{ langs: PdfTranslationRecency[] }>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        const store = deps.store()
        const langs: PdfTranslationRecency[] = []
        for (const lang of await store.listTranslations(docHash)) {
          const stored = await store.readTranslation(docHash, lang)
          let savedAt: number | null = null
          for (const b of stored?.blocks.values() ?? []) {
            if (savedAt === null || b.savedAt > savedAt) savedAt = b.savedAt
          }
          langs.push({ lang, savedAt })
        }
        // newest first; languages without a block last
        langs.sort((a, b) => (b.savedAt ?? -Infinity) - (a.savedAt ?? -Infinity))
        return { ok: true, langs }
      } catch (err) {
        return storeFailure(err)
      }
    },

    /**
     * The open file's page fingerprints in page order (reading-assist spec
     * 5.1): the fingerprint job the migration uses, never the document tree.
     * Same file bytes answer from this view's cache (or its whole-file tree).
     */
    async storePageFingerprints(
      ctx: CallContext,
      req: PdfStorePageFingerprintsRequest,
    ): Promise<PdfStructureOutcome<{ docHash: string; fingerprints: string[] }>> {
      if (!isRecord(req)) return fail('invalid-request', 'request must be an object')
      const src = sourceOf(ctx.owner, { path: req.path, password: req.password })
      if ('ok' in src) return src
      let docHash: string
      try {
        docHash = await deps.hashFile(src.source.pdfPath)
      } catch (err) {
        return fail('failed', messageOf(err))
      }
      know(ctx.owner, docHash)
      const cached = fingerprintCache.get(ctx.owner)
      if (cached?.docHash === docHash) {
        return { ok: true, docHash, fingerprints: [...cached.fingerprints] }
      }
      const tree = treeCache.get(ctx.owner)
      if (tree?.docHash === docHash && tree.pagesKey === 'all') {
        const fingerprints = [...tree.fingerprints]
          .sort((a, b) => a.page - b.page)
          .map((f) => f.fingerprint)
        fingerprintCache.set(ctx.owner, { docHash, fingerprints })
        return { ok: true, docHash, fingerprints: [...fingerprints] }
      }
      const out = await deps.runner.run(ctx.owner, `_fingerprints-${++internalJobs}`, {
        op: 'fingerprints',
        source: src.source,
      })
      if (!out.ok) return out
      const value = out.value as FingerprintsJobValue
      // the file changed again while it was read: answer what was read
      know(ctx.owner, value.docHash)
      fingerprintCache.set(ctx.owner, {
        docHash: value.docHash,
        fingerprints: [...value.fingerprints],
      })
      return { ok: true, docHash: value.docHash, fingerprints: [...value.fingerprints] }
    },

    async storeMigrate(
      ctx: CallContext,
      req: PdfStoreMigrateRequest,
    ): Promise<PdfStructureOutcome<PdfStoreMigrateResult>> {
      if (!isRecord(req)) return fail('invalid-request', 'request must be an object')
      if (!knows(ctx.owner, req.oldDocHash)) return fail('not-granted', 'unknown document hash')
      const src = sourceOf(ctx.owner, { path: req.path, password: req.password })
      if ('ok' in src) return src
      let newDocHash: string
      try {
        newDocHash = await deps.hashFile(src.source.pdfPath)
      } catch (err) {
        return fail('failed', messageOf(err))
      }
      know(ctx.owner, newDocHash)
      const none = { aiReadPages: 0, translationBlocks: 0, languages: [], jobs: 0 }
      if (newDocHash === req.oldDocHash) return { ok: true, docHash: newDocHash, ...none }
      const out = await deps.runner.run(ctx.owner, `_migrate-${++internalJobs}`, {
        op: 'fingerprints',
        source: src.source,
      })
      if (!out.ok) return out
      const value = out.value as FingerprintsJobValue
      // the file changed again while it was read: migrate to what was read
      know(ctx.owner, value.docHash)
      try {
        const store = deps.store()
        const moved = await store.migrateDocument({
          oldDocHash: req.oldDocHash,
          newDocHash: value.docHash,
          pageFingerprints: value.fingerprints,
        })
        const jobs = await migrateJobRecords(store, req.oldDocHash, value.docHash)
        return { ok: true, docHash: value.docHash, ...moved, jobs }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async storeDeleteDocument(
      owner: number,
      docHash: unknown,
    ): Promise<PdfStructureOutcome<object>> {
      if (!knows(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        await deps.store().deleteDocument(docHash)
        // a cached tree is not a store entry; it stays valid for the same bytes
        return { ok: true }
      } catch (err) {
        return storeFailure(err)
      }
    },

    /** the view is gone: end its jobs and drop everything granted to it */
    forgetOwner(owner: number): void {
      deps.runner.cancelOwner(owner)
      targets.delete(owner)
      knownHashes.delete(owner)
      treeCache.delete(owner)
      fingerprintCache.delete(owner)
      for (const key of [...targetsInUse]) {
        if (key.startsWith(`${owner}:`)) targetsInUse.delete(key)
      }
    },
  }
}

export type PdfStructureHandlers = ReturnType<typeof createPdfStructureHandlers>
