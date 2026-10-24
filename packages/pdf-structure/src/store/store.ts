/**
 * The result store (spec §6): AI-read pages, translations and unfinished job
 * records kept on this PC until the user deletes them. The app and the
 * terminal command share one store and may write it at the same time.
 *
 * Layout under `<userData>/pdf-store/`:
 *
 *   docs/<docHash>/ai-read/<pageFp>.json
 *   docs/<docHash>/translations/<lang>/translation.json          provider, model
 *   docs/<docHash>/translations/<lang>/blocks/<pageFp>/<textHash>.<occurrence>.json
 *   docs/<docHash>/jobs/ai-read.json | translate.<lang>.json | translate-page.<lang>.json
 *                       | highlight.<runId>.json | summary.<lang>.json
 *   docs/<docHash>/passages/, highlights/, insights/        see reading.ts
 *   note-links.json                                          see note-links.ts
 *
 * Every file is one entry, written whole and atomically (files.ts); the same
 * entry is last-writer-wins. An entry that cannot be read or does not have the
 * expected shape counts as absent, so the job simply produces it again.
 */
import { isAbsolute, join } from 'node:path'
import type { InlineRun } from '../tree/types'
import {
  fileExists,
  folderSize,
  listNames,
  readJson,
  removeEntry,
  removeFolder,
  writeJsonAtomic,
} from './files'
import { blockKeyString, type TranslationBlockKey } from './keys'
import {
  NOTE_LINKS_FILE,
  asNoteLinks,
  noteLinkKey,
  type FoundNoteLink,
  type NoteLink,
  type NoteLinks,
} from './note-links'
import {
  asHighlightBlock,
  asHighlightRun,
  asInsights,
  asPassageCard,
  type HighlightBlockEntry,
  type HighlightBlockInput,
  type HighlightRun,
  type HighlightSuggestionState,
  type InsightsEntry,
  type PassageCard,
  type PassageCardInput,
} from './reading'

/** the store's folder inside the user-data folder */
export const STORE_DIR_NAME = 'pdf-store'

/** a job record refreshed this recently counts as running (spec §10) */
export const JOB_RUNNING_WINDOW_MS = 30_000

const FORMAT = 1

// ── entry types ──

/** the AI's reading of one page, as the page-reading job produces it (opaque here) */
export interface AiReadPayload {
  /** payload format version, owned by the producer */
  version: number
  [key: string]: unknown
}

export interface AiReadPageEntry {
  pageFingerprint: string
  payload: AiReadPayload
  provider?: string
  model?: string
  /** epoch ms of the write */
  savedAt: number
}

export interface TranslationMetaInput {
  /** AI provider id that translates this document into the language */
  provider: string
  model: string
}

/** translated: `text` (and optionally `runs`) replace the source; failed: the source stays */
export type TranslationBlockStatus = 'translated' | 'failed'

export interface TranslationBlockInput {
  key: TranslationBlockKey
  status: TranslationBlockStatus
  /** translated text; required when status is 'translated' */
  text?: string
  /** translated text with its marks restored, when the producer has them */
  runs?: InlineRun[]
  /** why the block stayed in the source language */
  reason?: string
  /**
   * a person edited this block: `text` is the edited plain text, `runs` is
   * absent and status is 'translated'. A job counts it as done.
   */
  edited?: true
}

export interface TranslationBlockEntry extends TranslationBlockInput {
  savedAt: number
}

export interface StoredTranslation {
  lang: string
  /** null when the translation's own record is missing or unreadable */
  provider: string | null
  model: string | null
  /** keyed by blockKeyString(key) */
  blocks: Map<string, TranslationBlockEntry>
}

import { JOB_KINDS, jobKeyField, type JobKind } from './job-keys'

export { JOB_KINDS, jobKeyField, jobKeyOf, type JobKind } from './job-keys'

const isJobKind = (v: unknown): v is JobKind => (JOB_KINDS as readonly unknown[]).includes(v)

export type JobState = 'idle' | 'running' | 'stopped' | 'complete'
/** spec §10: rate-limit | cancelled | failures | interrupted | an existing errorCode */
export type JobLastError = 'rate-limit' | 'cancelled' | 'failures' | 'interrupted' | (string & {})

export interface JobProgress {
  done: number
  total: number
}

export interface JobRecordInput {
  kind: JobKind
  /** target language; required for 'translate', 'translate-page' and 'summary' */
  lang?: string
  /** the highlight run; required for 'highlight' */
  runId?: string
  /** what the job says about itself; 'idle' is only ever derived */
  state: Exclude<JobState, 'idle'>
  last_error?: JobLastError
  /** epoch ms when a rate limit lifts */
  resetsAt?: number
  /** result files the job wrote */
  outputs?: string[]
  progress?: JobProgress
}

export interface JobStatus {
  kind: JobKind
  lang?: string
  runId?: string
  /**
   * idle: no record. running: recorded as running and refreshed within the
   * running window. A running record gone stale is a job whose process ended
   * without saying so: stopped, last_error 'interrupted'.
   */
  state: JobState
  last_error?: JobLastError
  resetsAt?: number
  outputs: string[]
  progress?: JobProgress
  /** epoch ms of the last write (the heartbeat) */
  updatedAt?: number
}

export interface MigrateInput {
  /** hash of the file bytes before the in-app save */
  oldDocHash: string
  /** hash of the saved file bytes */
  newDocHash: string
  /** page fingerprints of the saved document, any order */
  pageFingerprints: readonly string[]
  /**
   * When given, only the translation blocks with one of these keys move (the
   * other results still go by page fingerprint alone). Left out: every
   * translation block of a surviving page moves.
   */
  keepBlockKeys?: readonly TranslationBlockKey[]
}

export interface MigrateResult {
  aiReadPages: number
  translationBlocks: number
  /** languages that received anything */
  languages: string[]
  /** passage cards moved; present only when some were */
  passages?: number
  /** highlight blocks moved; present only when some were */
  highlightBlocks?: number
  /** insights entries moved; present only when some were */
  insights?: number
}

export interface ResultStoreOptions {
  /** clock for savedAt / heartbeats, epoch ms */
  now?: () => number
  /** see JOB_RUNNING_WINDOW_MS */
  runningWindowMs?: number
}

// ── validation ──

const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/

/** a key used as a path segment: letters, digits, '-', '_' only */
function seg(value: string, what: string): string {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new TypeError(`result store: invalid ${what} ${JSON.stringify(value)}`)
  }
  return value
}

const isValidSeg = (value: unknown): value is string =>
  typeof value === 'string' && SEGMENT.test(value)

/** `<pageFp>`, `<textHash>.<occurrence>.json`: where a keyed block lives below its folder */
function keyedFile(key: TranslationBlockKey): [string, string] {
  if (!Number.isInteger(key.occurrence) || key.occurrence < 0) {
    throw new TypeError(`result store: invalid block occurrence ${key.occurrence}`)
  }
  return [
    seg(key.pageFingerprint, 'page fingerprint'),
    `${seg(key.textHash, 'text hash')}.${key.occurrence}.json`,
  ]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const optStr = (v: unknown) => v === undefined || isStr(v)
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

function asAiRead(raw: unknown, pageFp: string): AiReadPageEntry | null {
  if (!isRecord(raw) || raw.format !== FORMAT || raw.pageFingerprint !== pageFp) return null
  if (!isRecord(raw.payload) || !isNum(raw.payload.version) || !isNum(raw.savedAt)) return null
  if (!optStr(raw.provider) || !optStr(raw.model)) return null
  const entry: AiReadPageEntry = {
    pageFingerprint: pageFp,
    payload: raw.payload as AiReadPayload,
    savedAt: raw.savedAt,
  }
  if (isStr(raw.provider)) entry.provider = raw.provider
  if (isStr(raw.model)) entry.model = raw.model
  return entry
}

function asMeta(raw: unknown, lang: string): (TranslationMetaInput & { savedAt: number }) | null {
  if (!isRecord(raw) || raw.format !== FORMAT || raw.lang !== lang) return null
  if (!isStr(raw.provider) || !isStr(raw.model) || !isNum(raw.savedAt)) return null
  return { provider: raw.provider, model: raw.model, savedAt: raw.savedAt }
}

function asBlock(raw: unknown, expect: TranslationBlockKey): TranslationBlockEntry | null {
  if (!isRecord(raw) || raw.format !== FORMAT || !isRecord(raw.key) || !isNum(raw.savedAt)) {
    return null
  }
  const k = raw.key
  if (
    k.pageFingerprint !== expect.pageFingerprint ||
    k.textHash !== expect.textHash ||
    k.occurrence !== expect.occurrence
  ) {
    return null
  }
  if (raw.status !== 'translated' && raw.status !== 'failed') return null
  if (raw.status === 'translated' && !isStr(raw.text)) return null
  if (!optStr(raw.text) || !optStr(raw.reason)) return null
  if (raw.runs !== undefined && !Array.isArray(raw.runs)) return null
  const entry: TranslationBlockEntry = {
    key: { ...expect },
    status: raw.status,
    savedAt: raw.savedAt,
  }
  // an edit is plain text: marks left beside it do not belong to it
  const edited = raw.edited === true && raw.status === 'translated'
  if (isStr(raw.text)) entry.text = raw.text
  if (Array.isArray(raw.runs) && !edited) entry.runs = raw.runs as InlineRun[]
  if (isStr(raw.reason)) entry.reason = raw.reason
  if (edited) entry.edited = true
  return entry
}

interface StoredJob extends JobRecordInput {
  outputs: string[]
  updatedAt: number
}

function asJob(raw: unknown, kind: JobKind, key: string | undefined): StoredJob | null {
  if (!isRecord(raw) || raw.format !== FORMAT || raw.kind !== kind) return null
  const field = jobKeyField(kind)
  if (field === 'lang' ? raw.lang !== key : raw.lang !== undefined) return null
  if (field === 'runId' ? raw.runId !== key : raw.runId !== undefined) return null
  if (raw.state !== 'running' && raw.state !== 'stopped' && raw.state !== 'complete') return null
  if (!isNum(raw.updatedAt) || !isStringArray(raw.outputs) || !optStr(raw.last_error)) return null
  if (raw.resetsAt !== undefined && !isNum(raw.resetsAt)) return null
  const p = raw.progress
  if (p !== undefined && !(isRecord(p) && isNum(p.done) && isNum(p.total))) return null
  const job: StoredJob = { kind, state: raw.state, outputs: raw.outputs, updatedAt: raw.updatedAt }
  if (field !== null && key !== undefined) job[field] = key
  if (isStr(raw.last_error)) job.last_error = raw.last_error
  if (isNum(raw.resetsAt)) job.resetsAt = raw.resetsAt
  if (isRecord(p)) job.progress = { done: p.done as number, total: p.total as number }
  return job
}

const BLOCK_FILE = /^([A-Za-z0-9_-]{1,128})\.(\d{1,9})\.json$/
/** names of job record files: `ai-read.json`, `<kind>.<key>.json` for the other kinds */
export const JOB_FILE =
  /^(?:ai-read|(translate|translate-page|highlight|summary)\.([A-Za-z0-9_-]{1,128}))\.json$/
const PASSAGE_FILE = /^([A-Za-z0-9_-]{1,128})\.json$/
const RUN_FILE = 'run.json'

/**
 * In-process turns of a read-modify-write, by entry path: the note links, a
 * highlight block's suggestion states, a translation block kept or removed by
 * a restart. Without them two changes in flight read the same entry and the
 * later write drops the earlier change.
 */
const entryTurns = new Map<string, Promise<unknown>>()

/** run `change` after every earlier change of the entry at `path` in this process */
async function inTurn<T>(path: string, change: () => Promise<T>): Promise<T> {
  const turn = (entryTurns.get(path) ?? Promise.resolve()).catch(() => undefined).then(change)
  entryTurns.set(path, turn)
  try {
    return await turn
  } finally {
    if (entryTurns.get(path) === turn) entryTurns.delete(path)
  }
}

// ── the store ──

/**
 * Root of the store. Pass the user-data folder of THIS program:
 * - the app: Electron `app.getPath('userData')`
 * - the terminal command and MCP server: `genofficeUserDataDir(env)` from
 *   packages/cli/src/gui.ts (the folder `aiDataDir(env)` in cloud.ts also
 *   resolves to), so both write the same store.
 * Never `~/.genoffice`: that folder belongs to the original program and is
 * neither read nor written; the constructor refuses it.
 *
 * The store lives in one subfolder (`STORE_DIR_NAME`); deleteAll removes only
 * that subfolder, never the user-data folder around it.
 */
export class ResultStore {
  /** absolute path of the store folder */
  readonly dir: string
  private readonly now: () => number
  private readonly runningWindowMs: number

  constructor(userDataDir: string, options: ResultStoreOptions = {}) {
    if (!isAbsolute(userDataDir)) {
      throw new TypeError(`result store: the user-data folder must be absolute: ${userDataDir}`)
    }
    if (userDataDir.split(/[\\/]/).some((part) => part.toLowerCase() === '.genoffice')) {
      throw new TypeError('result store: ~/.genoffice belongs to the original program')
    }
    this.dir = join(userDataDir, STORE_DIR_NAME)
    this.now = options.now ?? Date.now
    this.runningWindowMs = options.runningWindowMs ?? JOB_RUNNING_WINDOW_MS
  }

  // ── paths (exposed for diagnostics and tests) ──

  documentDir(docHash: string): string {
    return join(this.dir, 'docs', seg(docHash, 'document hash'))
  }

  aiReadPagePath(docHash: string, pageFp: string): string {
    return join(this.documentDir(docHash), 'ai-read', `${seg(pageFp, 'page fingerprint')}.json`)
  }

  translationDir(docHash: string, lang: string): string {
    return join(this.documentDir(docHash), 'translations', seg(lang, 'language'))
  }

  translationMetaPath(docHash: string, lang: string): string {
    return join(this.translationDir(docHash, lang), 'translation.json')
  }

  translationBlockPath(docHash: string, lang: string, key: TranslationBlockKey): string {
    if (!Number.isInteger(key.occurrence) || key.occurrence < 0) {
      throw new TypeError(`result store: invalid block occurrence ${key.occurrence}`)
    }
    return join(
      this.translationDir(docHash, lang),
      'blocks',
      seg(key.pageFingerprint, 'page fingerprint'),
      `${seg(key.textHash, 'text hash')}.${key.occurrence}.json`,
    )
  }

  /** `key`: the language, or the run id of a 'highlight' job; none for 'ai-read' */
  jobPath(docHash: string, kind: JobKind, key?: string): string {
    if (!isJobKind(kind)) throw new TypeError(`result store: invalid job kind ${String(kind)}`)
    const field = jobKeyField(kind)
    const name =
      field === null ? kind : `${kind}.${seg(key ?? '', field === 'lang' ? 'language' : 'run id')}`
    return join(this.documentDir(docHash), 'jobs', `${name}.json`)
  }

  passagePath(docHash: string, id: string): string {
    return join(this.documentDir(docHash), 'passages', `${seg(id, 'card id')}.json`)
  }

  highlightRunDir(docHash: string, runId: string): string {
    return join(this.documentDir(docHash), 'highlights', seg(runId, 'run id'))
  }

  highlightBlockPath(docHash: string, runId: string, key: TranslationBlockKey): string {
    return join(this.highlightRunDir(docHash, runId), 'blocks', ...keyedFile(key))
  }

  insightsPath(docHash: string, lang: string): string {
    return join(this.documentDir(docHash), 'insights', `${seg(lang, 'language')}.json`)
  }

  noteLinksPath(): string {
    return join(this.dir, NOTE_LINKS_FILE)
  }

  // ── AI-read pages ──

  async writeAiReadPage(
    docHash: string,
    pageFp: string,
    payload: AiReadPayload,
    meta: { provider?: string; model?: string } = {},
  ): Promise<void> {
    if (!isRecord(payload) || !isNum(payload.version)) {
      throw new TypeError('result store: an AI-read payload needs a numeric version')
    }
    await this.putAiRead(docHash, {
      pageFingerprint: pageFp,
      payload,
      ...meta,
      savedAt: this.now(),
    })
  }

  async readAiReadPage(docHash: string, pageFp: string): Promise<AiReadPageEntry | null> {
    if (!isValidSeg(docHash) || !isValidSeg(pageFp)) return null
    return asAiRead(await readJson(this.aiReadPagePath(docHash, pageFp)), pageFp)
  }

  /** every readable AI-read page of the document, keyed by page fingerprint */
  async readAiReadPages(docHash: string): Promise<Map<string, AiReadPageEntry>> {
    const out = new Map<string, AiReadPageEntry>()
    if (!isValidSeg(docHash)) return out
    for (const name of await listNames(join(this.documentDir(docHash), 'ai-read'), 'file')) {
      const fp = name.endsWith('.json') ? name.slice(0, -5) : ''
      if (!isValidSeg(fp)) continue
      const entry = await this.readAiReadPage(docHash, fp)
      if (entry) out.set(fp, entry)
    }
    return out
  }

  private async putAiRead(docHash: string, entry: AiReadPageEntry): Promise<void> {
    const path = this.aiReadPagePath(docHash, entry.pageFingerprint)
    await writeJsonAtomic(path, { format: FORMAT, ...entry })
  }

  // ── translations ──

  /** record (or replace) who translates this document into `lang` */
  async writeTranslationMeta(
    docHash: string,
    lang: string,
    meta: TranslationMetaInput,
  ): Promise<void> {
    if (!isStr(meta.provider) || !isStr(meta.model)) {
      throw new TypeError('result store: a translation needs provider and model')
    }
    await this.putMeta(docHash, lang, { ...meta, savedAt: this.now() })
  }

  async writeTranslationBlock(
    docHash: string,
    lang: string,
    block: TranslationBlockInput,
  ): Promise<void> {
    if (block.status !== 'translated' && block.status !== 'failed') {
      throw new TypeError(`result store: invalid block status ${String(block.status)}`)
    }
    if (block.status === 'translated' && !isStr(block.text)) {
      throw new TypeError('result store: a translated block needs its text')
    }
    if (block.edited !== undefined) {
      if (block.edited !== true || block.status !== 'translated' || block.runs !== undefined) {
        throw new TypeError('result store: an edited block is translated plain text without runs')
      }
      if (!isStr(block.text) || block.text.trim() === '') {
        throw new TypeError('result store: an edited block needs its text')
      }
    }
    await this.putBlock(docHash, lang, { ...block, savedAt: this.now() })
  }

  /** store a person's edit of a block: plain text that replaces the translation */
  async writeEditedTranslationBlock(
    docHash: string,
    lang: string,
    key: TranslationBlockKey,
    text: string,
  ): Promise<void> {
    await this.writeTranslationBlock(docHash, lang, {
      key,
      status: 'translated',
      text,
      edited: true,
    })
  }

  /** each block is its own entry; on failure the earlier ones stay written */
  async writeTranslationBlocks(
    docHash: string,
    lang: string,
    blocks: readonly TranslationBlockInput[],
  ): Promise<void> {
    for (const b of blocks) await this.writeTranslationBlock(docHash, lang, b)
  }

  /** the stored translation into `lang`, or null when there is none */
  async readTranslation(docHash: string, lang: string): Promise<StoredTranslation | null> {
    if (!isValidSeg(docHash) || !isValidSeg(lang)) return null
    if (!(await this.listTranslations(docHash)).includes(lang)) return null
    const meta = asMeta(await readJson(this.translationMetaPath(docHash, lang)), lang)
    const blocks = new Map<string, TranslationBlockEntry>()
    for (const b of await this.readBlocks(docHash, lang)) {
      blocks.set(blockKeyString(b.key), b)
    }
    return { lang, provider: meta?.provider ?? null, model: meta?.model ?? null, blocks }
  }

  /** languages this document has a stored translation for */
  async listTranslations(docHash: string): Promise<string[]> {
    if (!isValidSeg(docHash)) return []
    const names = await listNames(join(this.documentDir(docHash), 'translations'), 'dir')
    return names.filter(isValidSeg)
  }

  /** drop the translation into `lang` ("처음부터 다시 번역" replaces it) */
  async deleteTranslation(docHash: string, lang: string): Promise<void> {
    await removeFolder(this.translationDir(docHash, lang))
  }

  /**
   * "처음부터 다시 번역" keeping the person's edits: every block entry of the
   * translation into `lang` except the edited ones is removed (unreadable
   * entries too); the provider record stays. Returns the entries removed.
   */
  async deleteTranslationExceptEdited(docHash: string, lang: string): Promise<number> {
    const root = join(this.translationDir(docHash, lang), 'blocks')
    let removed = 0
    for (const fp of await listNames(root, 'dir')) {
      if (!isValidSeg(fp)) continue
      for (const name of await listNames(join(root, fp), 'file')) {
        const m = BLOCK_FILE.exec(name)
        if (!m) continue
        const key = { pageFingerprint: fp, textHash: m[1]!, occurrence: Number(m[2]) }
        const path = join(root, fp, name)
        // an edit written meanwhile is read before the removal, never after it
        const gone = await inTurn(path, async () => {
          if (asBlock(await readJson(path), key)?.edited) return false
          await removeEntry(path)
          return true
        })
        if (gone) removed++
      }
    }
    return removed
  }

  /** blocks a person edited, in one language or in all of them (the delete confirmation) */
  async countEditedTranslationBlocks(docHash: string, lang?: string): Promise<number> {
    if (!isValidSeg(docHash)) return 0
    const langs = lang === undefined ? await this.listTranslations(docHash) : [lang]
    let count = 0
    for (const l of langs) {
      if (!isValidSeg(l)) continue
      count += (await this.readBlocks(docHash, l)).filter((b) => b.edited).length
    }
    return count
  }

  private async putMeta(
    docHash: string,
    lang: string,
    meta: TranslationMetaInput & { savedAt: number },
  ): Promise<void> {
    await writeJsonAtomic(this.translationMetaPath(docHash, lang), {
      format: FORMAT,
      lang,
      provider: meta.provider,
      model: meta.model,
      savedAt: meta.savedAt,
    })
  }

  private async putBlock(docHash: string, lang: string, b: TranslationBlockEntry): Promise<void> {
    const path = this.translationBlockPath(docHash, lang, b.key)
    const entry: Record<string, unknown> = {
      format: FORMAT,
      key: {
        pageFingerprint: b.key.pageFingerprint,
        textHash: b.key.textHash,
        occurrence: b.key.occurrence,
      },
      status: b.status,
      savedAt: b.savedAt,
    }
    if (b.text !== undefined) entry.text = b.text
    if (b.runs !== undefined && b.edited !== true) entry.runs = b.runs
    if (b.reason !== undefined) entry.reason = b.reason
    if (b.edited === true) entry.edited = true
    await inTurn(path, () => writeJsonAtomic(path, entry))
  }

  private async readBlocks(
    docHash: string,
    lang: string,
    onlyPages?: ReadonlySet<string>,
  ): Promise<TranslationBlockEntry[]> {
    const out: TranslationBlockEntry[] = []
    const root = join(this.translationDir(docHash, lang), 'blocks')
    for (const fp of await listNames(root, 'dir')) {
      if (!isValidSeg(fp) || (onlyPages && !onlyPages.has(fp))) continue
      for (const name of await listNames(join(root, fp), 'file')) {
        const m = BLOCK_FILE.exec(name)
        if (!m) continue
        const key = { pageFingerprint: fp, textHash: m[1]!, occurrence: Number(m[2]) }
        const entry = asBlock(await readJson(join(root, fp, name)), key)
        if (entry) out.push(entry)
      }
    }
    return out
  }

  // ── job records ──

  /** write the job's record; every write is also its heartbeat */
  async writeJob(docHash: string, job: JobRecordInput): Promise<void> {
    if (!isJobKind(job.kind)) {
      throw new TypeError(`result store: invalid job kind ${String(job.kind)}`)
    }
    const field = jobKeyField(job.kind)
    if (field === 'lang' && !isValidSeg(job.lang)) {
      throw new TypeError(`result store: a ${job.kind} job needs a valid language`)
    }
    if (field === 'runId' && !isValidSeg(job.runId)) {
      throw new TypeError(`result store: a ${job.kind} job needs a valid run id`)
    }
    if (job.state !== 'running' && job.state !== 'stopped' && job.state !== 'complete') {
      throw new TypeError(`result store: invalid job state ${String(job.state)}`)
    }
    const key = field === null ? undefined : job[field]
    const record: Record<string, unknown> = {
      format: FORMAT,
      kind: job.kind,
      state: job.state,
      outputs: [...(job.outputs ?? [])],
      updatedAt: this.now(),
    }
    if (field !== null) record[field] = key
    if (job.last_error !== undefined) record.last_error = job.last_error
    if (job.resetsAt !== undefined) record.resetsAt = job.resetsAt
    if (job.progress !== undefined) {
      record.progress = { done: job.progress.done, total: job.progress.total }
    }
    await writeJsonAtomic(this.jobPath(docHash, job.kind, key), record)
  }

  /**
   * refresh a running job's heartbeat. False (and nothing written) when the
   * record is missing, unreadable or not running. `key` as in jobPath.
   */
  async heartbeatJob(docHash: string, kind: JobKind, key?: string): Promise<boolean> {
    const stored = await this.readStoredJob(docHash, kind, key)
    if (!stored || stored.state !== 'running') return false
    const { updatedAt: _ignored, ...rest } = stored
    await this.writeJob(docHash, rest)
    return true
  }

  /** `key`: the language, or the run id of a 'highlight' job; none for 'ai-read' */
  async readJob(docHash: string, kind: JobKind, key?: string): Promise<JobStatus> {
    const stored = await this.readStoredJob(docHash, kind, key)
    if (stored) return this.resolveJob(stored)
    const idle: JobStatus = { kind, state: 'idle', outputs: [] }
    const field = isJobKind(kind) ? jobKeyField(kind) : null
    if (field !== null && key !== undefined) idle[field] = key
    return idle
  }

  /** every readable job record of the document */
  async listJobs(docHash: string): Promise<JobStatus[]> {
    if (!isValidSeg(docHash)) return []
    const out: JobStatus[] = []
    for (const name of await listNames(join(this.documentDir(docHash), 'jobs'), 'file')) {
      const m = JOB_FILE.exec(name)
      if (!m) continue
      const kind = (m[1] as JobKind | undefined) ?? 'ai-read'
      const stored = await this.readStoredJob(docHash, kind, m[2])
      if (stored) out.push(this.resolveJob(stored))
    }
    return out
  }

  /** jobs not complete (running elsewhere, or stopped) — the source of the resume offer */
  async unfinishedJobs(docHash: string): Promise<JobStatus[]> {
    return (await this.listJobs(docHash)).filter((j) => j.state !== 'complete')
  }

  private async readStoredJob(
    docHash: string,
    kind: JobKind,
    key: string | undefined,
  ): Promise<StoredJob | null> {
    if (!isValidSeg(docHash) || !isJobKind(kind)) return null
    const field = jobKeyField(kind)
    if (field !== null && !isValidSeg(key)) return null
    const effectiveKey = field === null ? undefined : key
    return asJob(await readJson(this.jobPath(docHash, kind, effectiveKey)), kind, effectiveKey)
  }

  private resolveJob(stored: StoredJob): JobStatus {
    const status: JobStatus = {
      kind: stored.kind,
      state: stored.state,
      outputs: stored.outputs,
      updatedAt: stored.updatedAt,
    }
    if (stored.lang !== undefined) status.lang = stored.lang
    if (stored.runId !== undefined) status.runId = stored.runId
    if (stored.last_error !== undefined) status.last_error = stored.last_error
    if (stored.resetsAt !== undefined) status.resetsAt = stored.resetsAt
    if (stored.progress !== undefined) status.progress = stored.progress
    if (stored.state === 'running' && this.now() - stored.updatedAt > this.runningWindowMs) {
      status.state = 'stopped'
      status.last_error ??= 'interrupted'
    }
    return status
  }

  // ── passage cards ──

  /** write (or replace) a card; savedAt is the time of this write */
  async writePassage(docHash: string, card: PassageCardInput): Promise<void> {
    const entry = asPassageCard({ ...card, savedAt: this.now() })
    if (!entry) throw new TypeError('result store: invalid passage card')
    await this.putPassage(docHash, entry)
  }

  async readPassage(docHash: string, id: string): Promise<PassageCard | null> {
    if (!isValidSeg(docHash) || !isValidSeg(id)) return null
    const raw = await readJson(this.passagePath(docHash, id))
    if (!isRecord(raw) || raw.format !== FORMAT) return null
    const card = asPassageCard(raw)
    return card && card.id === id ? card : null
  }

  /** every readable card of the document */
  async readPassages(docHash: string): Promise<PassageCard[]> {
    if (!isValidSeg(docHash)) return []
    const out: PassageCard[] = []
    for (const name of await listNames(join(this.documentDir(docHash), 'passages'), 'file')) {
      const m = PASSAGE_FILE.exec(name)
      if (!m) continue
      const card = await this.readPassage(docHash, m[1]!)
      if (card) out.push(card)
    }
    return out
  }

  async deletePassage(docHash: string, id: string): Promise<void> {
    await removeEntry(this.passagePath(docHash, id))
  }

  /** readable cards of the document (the delete confirmation) */
  async countPassages(docHash: string): Promise<number> {
    return (await this.readPassages(docHash)).length
  }

  private async putPassage(docHash: string, card: PassageCard): Promise<void> {
    await writeJsonAtomic(this.passagePath(docHash, card.id), { format: FORMAT, ...card })
  }

  // ── AI highlights ──

  /** write (or replace) a run's record */
  async writeHighlightRun(docHash: string, run: HighlightRun): Promise<void> {
    const entry = asHighlightRun(run)
    if (!entry) throw new TypeError('result store: invalid highlight run')
    await this.putRun(docHash, entry, this.now())
  }

  async readHighlightRun(docHash: string, runId: string): Promise<HighlightRun | null> {
    return (await this.readStoredRun(docHash, runId))?.run ?? null
  }

  /** every readable run of the document */
  async listHighlightRuns(docHash: string): Promise<HighlightRun[]> {
    const out: HighlightRun[] = []
    for (const runId of await this.listHighlightRunIds(docHash)) {
      const run = await this.readHighlightRun(docHash, runId)
      if (run) out.push(run)
    }
    return out
  }

  async writeHighlightBlock(
    docHash: string,
    runId: string,
    block: HighlightBlockInput,
  ): Promise<void> {
    const entry = asHighlightBlock({ ...block, savedAt: this.now() }, block.key)
    if (!entry) throw new TypeError('result store: invalid highlight block')
    const path = this.highlightBlockPath(docHash, runId, block.key)
    await inTurn(path, () => this.putHighlightBlock(docHash, runId, entry))
  }

  /** each block is its own entry; on failure the earlier ones stay written */
  async writeHighlightBlocks(
    docHash: string,
    runId: string,
    blocks: readonly HighlightBlockInput[],
  ): Promise<void> {
    for (const b of blocks) await this.writeHighlightBlock(docHash, runId, b)
  }

  async readHighlightBlock(
    docHash: string,
    runId: string,
    key: TranslationBlockKey,
  ): Promise<HighlightBlockEntry | null> {
    if (!isValidSeg(docHash) || !isValidSeg(runId)) return null
    if (!isValidSeg(key.pageFingerprint) || !isValidSeg(key.textHash)) return null
    if (!Number.isInteger(key.occurrence) || key.occurrence < 0) return null
    const raw = await readJson(this.highlightBlockPath(docHash, runId, key))
    return isRecord(raw) && raw.format === FORMAT ? asHighlightBlock(raw, key) : null
  }

  /** every readable block of the run, keyed by blockKeyString(key) */
  async readHighlightBlocks(
    docHash: string,
    runId: string,
  ): Promise<Map<string, HighlightBlockEntry>> {
    const out = new Map<string, HighlightBlockEntry>()
    for (const b of await this.readHighlightBlockList(docHash, runId)) {
      out.set(blockKeyString(b.key), b)
    }
    return out
  }

  /**
   * Change the state of suggestions of one block (accepted after a save,
   * dismissed at once). Unknown ids are ignored. False when the block is
   * missing or unreadable.
   */
  async setHighlightSuggestionStates(
    docHash: string,
    runId: string,
    key: TranslationBlockKey,
    states: Readonly<Record<string, HighlightSuggestionState>>,
  ): Promise<boolean> {
    // also checks the key: an invalid one has no entry path
    if (!(await this.readHighlightBlock(docHash, runId, key))) return false
    // read and write in one turn: two changes in flight both land
    return inTurn(this.highlightBlockPath(docHash, runId, key), async () => {
      const current = await this.readHighlightBlock(docHash, runId, key)
      if (!current) return false
      const suggestions = current.suggestions.map((s) =>
        Object.hasOwn(states, s.id) ? { ...s, state: states[s.id]! } : s,
      )
      const entry = asHighlightBlock(
        { key, status: current.status, suggestions, savedAt: this.now() },
        key,
      )
      if (!entry) throw new TypeError('result store: invalid highlight block')
      await this.putHighlightBlock(docHash, runId, entry)
      return true
    })
  }

  /** remove a run: its folder and its job record `highlight.<runId>.json` */
  async deleteHighlightRun(docHash: string, runId: string): Promise<void> {
    await removeFolder(this.highlightRunDir(docHash, runId))
    await removeEntry(this.jobPath(docHash, 'highlight', runId))
  }

  private async listHighlightRunIds(docHash: string): Promise<string[]> {
    if (!isValidSeg(docHash)) return []
    const names = await listNames(join(this.documentDir(docHash), 'highlights'), 'dir')
    return names.filter(isValidSeg)
  }

  private async readStoredRun(
    docHash: string,
    runId: string,
  ): Promise<{ run: HighlightRun; savedAt: number } | null> {
    if (!isValidSeg(docHash) || !isValidSeg(runId)) return null
    const raw = await readJson(join(this.highlightRunDir(docHash, runId), RUN_FILE))
    if (!isRecord(raw) || raw.format !== FORMAT || !isNum(raw.savedAt)) return null
    const run = asHighlightRun(raw)
    return run && run.runId === runId ? { run, savedAt: raw.savedAt } : null
  }

  private async putRun(docHash: string, run: HighlightRun, savedAt: number): Promise<void> {
    const path = join(this.highlightRunDir(docHash, run.runId), RUN_FILE)
    await writeJsonAtomic(path, { format: FORMAT, ...run, savedAt })
  }

  private async putHighlightBlock(
    docHash: string,
    runId: string,
    b: HighlightBlockEntry,
  ): Promise<void> {
    await writeJsonAtomic(this.highlightBlockPath(docHash, runId, b.key), {
      format: FORMAT,
      key: {
        pageFingerprint: b.key.pageFingerprint,
        textHash: b.key.textHash,
        occurrence: b.key.occurrence,
      },
      status: b.status,
      suggestions: b.suggestions,
      savedAt: b.savedAt,
    })
  }

  private async readHighlightBlockList(
    docHash: string,
    runId: string,
    onlyPages?: ReadonlySet<string>,
  ): Promise<HighlightBlockEntry[]> {
    const out: HighlightBlockEntry[] = []
    if (!isValidSeg(docHash) || !isValidSeg(runId)) return out
    const root = join(this.highlightRunDir(docHash, runId), 'blocks')
    for (const fp of await listNames(root, 'dir')) {
      if (!isValidSeg(fp) || (onlyPages && !onlyPages.has(fp))) continue
      for (const name of await listNames(join(root, fp), 'file')) {
        const m = BLOCK_FILE.exec(name)
        if (!m) continue
        const key = { pageFingerprint: fp, textHash: m[1]!, occurrence: Number(m[2]) }
        const raw = await readJson(join(root, fp, name))
        const entry = isRecord(raw) && raw.format === FORMAT ? asHighlightBlock(raw, key) : null
        if (entry) out.push(entry)
      }
    }
    return out
  }

  // ── insights ──

  /** write (or replace) the overview in its language */
  async writeInsights(docHash: string, entry: InsightsEntry): Promise<void> {
    const checked = asInsights(entry)
    if (!checked) throw new TypeError('result store: invalid insights entry')
    await this.putInsights(docHash, checked, this.now())
  }

  async readInsights(docHash: string, lang: string): Promise<InsightsEntry | null> {
    return (await this.readStoredInsights(docHash, lang))?.entry ?? null
  }

  /** languages this document has insights in */
  async listInsights(docHash: string): Promise<string[]> {
    if (!isValidSeg(docHash)) return []
    const out: string[] = []
    for (const name of await listNames(join(this.documentDir(docHash), 'insights'), 'file')) {
      const m = PASSAGE_FILE.exec(name)
      if (m) out.push(m[1]!)
    }
    return out
  }

  async deleteInsights(docHash: string, lang: string): Promise<void> {
    await removeEntry(this.insightsPath(docHash, lang))
  }

  private async readStoredInsights(
    docHash: string,
    lang: string,
  ): Promise<{ entry: InsightsEntry; savedAt: number } | null> {
    if (!isValidSeg(docHash) || !isValidSeg(lang)) return null
    const raw = await readJson(this.insightsPath(docHash, lang))
    if (!isRecord(raw) || raw.format !== FORMAT || !isNum(raw.savedAt)) return null
    const entry = asInsights(raw)
    return entry && entry.lang === lang ? { entry, savedAt: raw.savedAt } : null
  }

  private async putInsights(docHash: string, entry: InsightsEntry, savedAt: number): Promise<void> {
    await writeJsonAtomic(this.insightsPath(docHash, entry.lang), {
      format: FORMAT,
      ...entry,
      savedAt,
    })
  }

  // ── note links ──

  /** every readable link; none when the file is missing or unreadable */
  async readNoteLinks(): Promise<NoteLinks> {
    return asNoteLinks(await readJson(this.noteLinksPath()))
  }

  /**
   * The note of a PDF: the link of its path, else the most recent link of
   * the same document hash. A link whose note file is gone counts as absent.
   */
  async findNoteLink(pdfPath: string, docHash: string): Promise<FoundNoteLink | null> {
    const { links } = await this.readNoteLinks()
    const pdfKey = noteLinkKey(pdfPath)
    const byPath = links[pdfKey]
    if (byPath && (await fileExists(byPath.notePath))) {
      return { ...byPath, pdfKey, matchedBy: 'path' }
    }
    if (!isValidSeg(docHash)) return null
    const sameDoc = Object.entries(links)
      .filter(([key, link]) => key !== pdfKey && link.docHash === docHash)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    for (const [key, link] of sameDoc) {
      if (await fileExists(link.notePath)) return { ...link, pdfKey: key, matchedBy: 'docHash' }
    }
    return null
  }

  /** link a PDF to the note the person chose in a save dialog */
  async setNoteLink(pdfPath: string, link: Pick<NoteLink, 'notePath' | 'docHash'>): Promise<void> {
    if (typeof link.notePath !== 'string' || !isAbsolute(link.notePath)) {
      throw new TypeError('result store: a note path must be absolute')
    }
    seg(link.docHash, 'document hash')
    const pdfKey = noteLinkKey(pdfPath)
    await this.changeNoteLinks((links) => {
      links[pdfKey] = { notePath: link.notePath, docHash: link.docHash, updatedAt: this.now() }
      return true
    })
  }

  /** after a save changed the PDF's hash; false when the path has no link */
  async updateNoteLinkDocHash(pdfPath: string, docHash: string): Promise<boolean> {
    seg(docHash, 'document hash')
    const pdfKey = noteLinkKey(pdfPath)
    return this.changeNoteLinks((links) => {
      const link = links[pdfKey]
      if (!link) return false
      links[pdfKey] = { ...link, docHash, updatedAt: this.now() }
      return true
    })
  }

  /** read, change and write the links, one change at a time in this process */
  private async changeNoteLinks(
    change: (links: Record<string, NoteLink>) => boolean,
  ): Promise<boolean> {
    const path = this.noteLinksPath()
    return inTurn(path, async () => {
      const current = await this.readNoteLinks()
      if (!change(current.links)) return false
      await writeJsonAtomic(path, current)
      return true
    })
  }

  // ── migration on in-app save ──

  /**
   * After an in-app save changed the file hash, copy the AI-read pages and
   * translation blocks whose page fingerprint the saved document still has.
   * Matching is by fingerprint, so reordered pages carry over too; with
   * `keepBlockKeys`, a translation block must also be listed there. An entry
   * already in the new document is replaced only by a newer one, so this can
   * run again when a job that started before the save finishes. Old entries
   * stay; job records are not copied.
   */
  async migrateDocument(input: MigrateInput): Promise<MigrateResult> {
    const result: MigrateResult = { aiReadPages: 0, translationBlocks: 0, languages: [] }
    const { oldDocHash, newDocHash } = input
    seg(newDocHash, 'document hash')
    if (!isValidSeg(oldDocHash) || oldDocHash === newDocHash) return result
    const pages = new Set(input.pageFingerprints.filter(isValidSeg))
    const keep = input.keepBlockKeys ? new Set(input.keepBlockKeys.map(blockKeyString)) : null

    for (const [fp, entry] of await this.readAiReadPages(oldDocHash)) {
      if (!pages.has(fp)) continue
      const current = await this.readAiReadPage(newDocHash, fp)
      if (current && current.savedAt >= entry.savedAt) continue
      await this.putAiRead(newDocHash, entry)
      result.aiReadPages++
    }

    for (const lang of await this.listTranslations(oldDocHash)) {
      let touched = false
      const meta = asMeta(await readJson(this.translationMetaPath(oldDocHash, lang)), lang)
      if (meta) {
        const current = asMeta(await readJson(this.translationMetaPath(newDocHash, lang)), lang)
        if (!current || current.savedAt < meta.savedAt) {
          await this.putMeta(newDocHash, lang, meta)
          touched = true
        }
      }
      for (const block of await this.readBlocks(oldDocHash, lang, pages)) {
        if (keep && !keep.has(blockKeyString(block.key))) continue
        const current = asBlock(
          await readJson(this.translationBlockPath(newDocHash, lang, block.key)),
          block.key,
        )
        if (current && current.savedAt >= block.savedAt) continue
        await this.putBlock(newDocHash, lang, block)
        result.translationBlocks++
        touched = true
      }
      if (touched) result.languages.push(lang)
    }

    const reading = await this.migrateReading(oldDocHash, newDocHash, pages)
    if (reading.passages > 0) result.passages = reading.passages
    if (reading.highlightBlocks > 0) result.highlightBlocks = reading.highlightBlocks
    if (reading.insights > 0) result.insights = reading.insights
    return result
  }

  /**
   * The reading entries of migrateDocument: cards of surviving pages, every
   * highlight run with the blocks of surviving pages, and insights whose
   * pages all survive. The newer entry wins, as for the other results.
   */
  private async migrateReading(
    oldDocHash: string,
    newDocHash: string,
    pages: ReadonlySet<string>,
  ): Promise<{ passages: number; highlightBlocks: number; insights: number }> {
    const moved = { passages: 0, highlightBlocks: 0, insights: 0 }

    for (const card of await this.readPassages(oldDocHash)) {
      if (!pages.has(card.pageFingerprint)) continue
      const current = await this.readPassage(newDocHash, card.id)
      if (current && current.savedAt >= card.savedAt) continue
      await this.putPassage(newDocHash, card)
      moved.passages++
    }

    for (const runId of await this.listHighlightRunIds(oldDocHash)) {
      const run = await this.readStoredRun(oldDocHash, runId)
      if (run) {
        const current = await this.readStoredRun(newDocHash, runId)
        if (!current || current.savedAt < run.savedAt) {
          await this.putRun(newDocHash, run.run, run.savedAt)
        }
      }
      for (const block of await this.readHighlightBlockList(oldDocHash, runId, pages)) {
        const current = asHighlightBlock(
          await readJson(this.highlightBlockPath(newDocHash, runId, block.key)),
          block.key,
        )
        if (current && current.savedAt >= block.savedAt) continue
        await this.putHighlightBlock(newDocHash, runId, block)
        moved.highlightBlocks++
      }
    }

    for (const lang of await this.listInsights(oldDocHash)) {
      const stored = await this.readStoredInsights(oldDocHash, lang)
      if (!stored || !stored.entry.pageFingerprints.every((fp) => pages.has(fp))) continue
      const current = await this.readStoredInsights(newDocHash, lang)
      if (current && current.savedAt >= stored.savedAt) continue
      await this.putInsights(newDocHash, stored.entry, stored.savedAt)
      moved.insights++
    }
    return moved
  }

  // ── delete and size ──

  /** remove everything stored for one document */
  async deleteDocument(docHash: string): Promise<void> {
    await removeFolder(this.documentDir(docHash))
  }

  /** remove the whole store folder (and nothing outside it) */
  async deleteAll(): Promise<void> {
    await removeFolder(this.dir)
  }

  /** bytes on disk, for one document or for the whole store */
  async size(docHash?: string): Promise<number> {
    if (docHash === undefined) return folderSize(this.dir)
    return isValidSeg(docHash) ? folderSize(this.documentDir(docHash)) : 0
  }
}
