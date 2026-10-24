/**
 * The document overview of the open file (reading-assist spec 4.8, 5.2, 5.5):
 * read from the result store when the document opens (per UI language), made
 * by one model call or by a `summary` document job, and written back to the
 * store with the fingerprints of every page whose text was sent.
 *
 * Nothing here sends by itself: `prepare` builds the document tree (a
 * structure job, no AI) and the runs happen only when the screen calls them
 * after a person pressed "Create overview" and the send gate or the job's
 * start confirmation let it through. Opening the document reads the store.
 *
 * After an in-app save changed the document hash, the store carries the entry
 * over only when every page it was made from is still in the file. When it
 * did not, the entry made before the save is shown as stale ("the document has
 * changed"); a later "Regenerate" replaces it.
 */
import type { AgentStreamRequest } from '@genoffice/agent-core'
import { applyStoredAiReadings } from '../../../../../../packages/pdf-structure/src/ai-read'
import type { InsightsEntry } from '../../../../../../packages/pdf-structure/src/store/reading'
import {
  JobUnitFailure,
  startDocumentJob,
  type DocumentJobRegistry,
  type JobProgressEvent,
} from '../../../../../../packages/pdf-structure/src/jobs'
import type { JobRecordInput } from '../../../../../../packages/pdf-structure/src/store/store'
import type { DocumentTree } from '../../../../../../packages/pdf-structure/src/tree/types'
import type { PdfStoreApi, PdfStructureApi } from '../../../shared/ipc'
import type { StartDocumentJob } from '../../doc-jobs/job-session'
import {
  insightsMergeRequest,
  insightsPartialRequest,
  insightsRequest,
  parseInsightsAnswer,
  parsePartialAnswer,
  type InsightsContent,
  type InsightsPartial,
} from './insights-prompt'
import { insightsPages, planInsights, type InsightsBatch, type InsightsPlan } from './insights-text'

export type InsightsStoreApi = Pick<
  PdfStoreApi,
  'docHash' | 'insights' | 'pageFingerprints' | 'write' | 'unfinishedJobs' | 'aiReadPages'
>
export type InsightsStructureApi = Pick<PdfStructureApi, 'tree' | 'cancel'>

/** the open file as the store and structure channels take it */
export interface InsightsFile {
  path: string
  password?: string
}

export interface InsightsSnapshot {
  docHash: string | null
  /** the language the overview is read and written in (the UI language) */
  lang: string
  entry: InsightsEntry | null
  /** the entry was made before a save changed pages it was made from */
  stale: boolean
}

/** a press of "Create overview", ready to send: what goes out and how */
export interface PreparedInsights {
  docHash: string
  plan: InsightsPlan
  /** fingerprints of the pages whose text is sent, page order */
  fingerprints: string[]
}

export type PrepareInsightsOutcome =
  | { ok: true; prepared: PreparedInsights }
  | { ok: false; reason: 'unavailable' | 'analyze-failed' | 'no-text' }

/** one tool-less model call: the answer and who gave it */
export type InsightsAsk = (
  request: AgentStreamRequest,
  signal: AbortSignal,
) => Promise<{ text: string; provider: string; model: string }>

/** the answer of a run could not be used */
export class InsightsAnswerError extends Error {
  constructor() {
    super('the answer was not an overview')
    this.name = 'InsightsAnswerError'
  }
}

/** one unit of a summary job: a batch, or the merge that comes last */
export type SummaryUnit =
  { kind: 'part'; index: number; batch: InsightsBatch } | { kind: 'merge'; pages: number[] }

const EMPTY = (lang: string): InsightsSnapshot => ({
  docHash: null,
  lang,
  entry: null,
  stale: false,
})

let treeSeq = 0
const newTreeJobId = (): string =>
  `insights-tree-${Date.now().toString(36)}-${(++treeSeq).toString(36)}`

export class DocumentInsights {
  private readonly store: InsightsStoreApi | null
  private readonly structure: InsightsStructureApi | null
  private readonly file: () => InsightsFile | null
  private readonly now: () => number
  private state: InsightsSnapshot
  private readonly listeners = new Set<() => void>()
  private loadSeq = 0

  constructor(o: {
    store: InsightsStoreApi | null
    structure: InsightsStructureApi | null
    file: () => InsightsFile | null
    lang: string
    now?: () => number
  }) {
    this.store = o.store
    this.structure = o.structure
    this.file = o.file
    this.now = o.now ?? Date.now
    this.state = EMPTY(o.lang)
  }

  /** whether the store and structure channels exist (not in a standalone pdf window) */
  get available(): boolean {
    return this.store !== null && this.structure !== null
  }

  snapshot = (): InsightsSnapshot => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** the UI language changed: read the overview of that language */
  async setLang(lang: string): Promise<void> {
    if (lang === this.state.lang) return
    this.set({ ...EMPTY(lang), docHash: this.state.docHash })
    await this.load()
  }

  /**
   * Read the open file's document hash and its overview in the current
   * language. An entry shown before whose file was saved since and that the
   * store did not carry over is checked against the saved file's pages.
   */
  async load(): Promise<void> {
    const seq = ++this.loadSeq
    const file = this.file()
    const before = this.state
    if (!this.store || !file) {
      this.set(EMPTY(before.lang))
      return
    }
    const hash = await this.store.docHash(file.path).catch(() => null)
    if (seq !== this.loadSeq) return
    if (!hash?.ok) {
      this.set(EMPTY(before.lang))
      return
    }
    const read = await this.store.insights(hash.docHash, before.lang).catch(() => null)
    if (seq !== this.loadSeq) return
    const entry = read?.ok ? read.insights : null
    if (entry) {
      this.set({ docHash: hash.docHash, lang: before.lang, entry, stale: false })
      return
    }
    const earlier =
      before.entry && before.docHash !== hash.docHash && before.entry.lang === before.lang
        ? before.entry
        : null
    this.set({ ...EMPTY(before.lang), docHash: hash.docHash })
    if (earlier) await this.carry(earlier, seq)
  }

  /**
   * An entry made for an earlier version of the open file: kept (and written
   * under the file's hash) when every page it was made from is still there,
   * else shown as stale.
   */
  private async carry(entry: InsightsEntry, seq: number): Promise<void> {
    const file = this.file()
    if (!this.store || !file) return
    const out = await this.store
      .pageFingerprints({
        path: file.path,
        ...(file.password !== undefined ? { password: file.password } : {}),
      })
      .catch(() => null)
    if (seq !== this.loadSeq || !out?.ok) return
    const present = insightsStillMatch(entry, out.fingerprints)
    this.set({ docHash: out.docHash, lang: this.state.lang, entry, stale: !present })
    if (present) {
      await this.store.write({ kind: 'insights', docHash: out.docHash, entry }).catch(() => null)
    }
  }

  /**
   * Build the document tree of the open file (a structure job; no AI), put
   * the stored AI page readings in place, and plan what to send: one call, or
   * a summary job.
   */
  async prepare(signal?: AbortSignal): Promise<PrepareInsightsOutcome> {
    const file = this.file()
    if (!this.store || !this.structure || !file) return { ok: false, reason: 'unavailable' }
    const jobId = newTreeJobId()
    const onAbort = () => void this.structure?.cancel(jobId)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const out = await this.structure
        .tree({
          jobId,
          path: file.path,
          ...(file.password !== undefined ? { password: file.password } : {}),
        })
        .catch(() => null)
      if (!out?.ok) return { ok: false, reason: 'analyze-failed' }
      const pages = insightsPages(await this.withAiReadings(out.docHash, out.tree))
      if (pages.length === 0) return { ok: false, reason: 'no-text' }
      const byPage = new Map(out.fingerprints.map((f) => [f.page, f.fingerprint]))
      const fingerprints = pages.map((p) => byPage.get(p.page)).filter((f) => f !== undefined)
      if (fingerprints.length !== pages.length) return { ok: false, reason: 'analyze-failed' }
      return {
        ok: true,
        prepared: { docHash: out.docHash, plan: planInsights(pages), fingerprints },
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /**
   * The tree with the stored AI page readings in place, as the bilingual view
   * and the shell's jobs read the document: a scanned page read by AI sends
   * its AI-read text instead of being left out. Without readings (or when
   * they cannot be read) the tree as analyzed.
   */
  private async withAiReadings(docHash: string, tree: DocumentTree): Promise<DocumentTree> {
    const out = await this.store?.aiReadPages(docHash).catch(() => null)
    if (!out?.ok || out.pages.length === 0) return tree
    const readings = new Map(out.pages.map((p) => [p.pageFingerprint, { payload: p.payload }]))
    return applyStoredAiReadings(tree, readings)
  }

  /** one call for a document that fits it; the overview is stored and shown */
  async runSingle(
    prepared: PreparedInsights,
    ask: InsightsAsk,
    signal: AbortSignal,
  ): Promise<InsightsEntry> {
    const { plan } = prepared
    if (plan.mode !== 'single') throw new Error('the document needs a summary job')
    const lang = this.state.lang
    const reply = await ask(insightsRequest({ text: plan.text, language: lang }), signal)
    if (signal.aborted) throw signal.reason ?? new DOMException('stopped', 'AbortError')
    const content = parseInsightsAnswer(reply.text, plan.pages)
    if (!content) throw new InsightsAnswerError()
    return this.save(prepared, lang, content, reply.provider, reply.model)
  }

  /**
   * The summary job of a long document, for the tab's job session: the
   * batches one at a time, then the merge. A batch whose answer is unusable
   * fails as a unit and the merge then fails too: the overview is stored only
   * when every part made it. Nothing is resumed later; a new press starts over.
   */
  summaryJob(o: {
    prepared: PreparedInsights
    provider: string
    model: string
    /** the provider and model as the confirmation showed them (for the progress strip) */
    aiLabel?: string
    call: (request: AgentStreamRequest, signal: AbortSignal) => Promise<string>
    onEnd?: StartDocumentJob<SummaryUnit>['onEnd']
  }): StartDocumentJob<SummaryUnit> {
    const { prepared, provider, model, call } = o
    const { plan, docHash } = prepared
    if (plan.mode !== 'job') throw new Error('the document fits one call')
    const store = this.store
    if (!store) throw new Error('the result store is not available')
    const lang = this.state.lang
    const units: SummaryUnit[] = [
      ...plan.batches.map((batch, index) => ({ kind: 'part' as const, index, batch })),
      { kind: 'merge', pages: plan.pages },
    ]
    const partials: (InsightsPartial | undefined)[] = []
    const writeJob = async (hash: string, job: JobRecordInput) => {
      const out = await store.write({ kind: 'job', docHash: hash, job })
      if (!out.ok) throw new Error(out.message ?? out.error)
    }
    const callModel = async (unit: SummaryUnit, signal: AbortSignal) => {
      if (unit.kind === 'part') {
        const text = await call(
          insightsPartialRequest({
            text: unit.batch.text,
            language: lang,
            part: unit.index + 1,
            parts: plan.batches.length,
          }),
          signal,
        )
        const partial = parsePartialAnswer(text, unit.batch.pages)
        if (!partial) throw new JobUnitFailure('malformed-answer')
        return partial
      }
      const done = plan.batches.map((_, i) => partials[i])
      if (done.some((p) => p === undefined)) throw new JobUnitFailure('missing-parts')
      const text = await call(
        insightsMergeRequest({ partials: done as InsightsPartial[], language: lang }),
        signal,
      )
      const content = parseInsightsAnswer(text, unit.pages)
      if (!content) throw new JobUnitFailure('malformed-answer')
      return content
    }
    const persist = async (unit: SummaryUnit, result: InsightsPartial | InsightsContent) => {
      if (unit.kind === 'part') {
        partials[unit.index] = result as InsightsPartial
        return
      }
      await this.save(prepared, lang, result as InsightsContent, provider, model)
    }
    return {
      docHash,
      kind: 'summary',
      lang,
      provider,
      ...(o.aiLabel ? { aiLabel: o.aiLabel } : {}),
      launch: ({
        signal,
        registry,
        onProgress,
      }: {
        signal: AbortSignal
        registry: DocumentJobRegistry
        onProgress: (event: JobProgressEvent<SummaryUnit>) => void
      }) =>
        startDocumentJob<SummaryUnit, InsightsPartial | InsightsContent>(
          // one at a time: the merge must come after every batch
          { docHash, kind: 'summary', lang, signal, registry, onProgress, concurrency: 1 },
          async () => ({
            store: { writeJob },
            units,
            callModel,
            persist,
            total: units.length,
          }),
        ),
      pageOf: (unit) => (unit.kind === 'part' ? (unit.batch.pages[0] ?? null) : null),
      ...(o.onEnd ? { onEnd: o.onEnd } : {}),
    }
  }

  /** store an overview made from `prepared` and show it */
  private async save(
    prepared: PreparedInsights,
    lang: string,
    content: InsightsContent,
    provider: string,
    model: string,
  ): Promise<InsightsEntry> {
    const store = this.store
    if (!store) throw new Error('the result store is not available')
    const entry: InsightsEntry = {
      lang,
      summary3: [...content.summary3],
      summary: content.summary,
      terms: content.terms.map((term) => ({ ...term })),
      provider,
      model,
      createdAt: this.now(),
      pageFingerprints: [...prepared.fingerprints],
    }
    const out = await store.write({ kind: 'insights', docHash: prepared.docHash, entry })
    if (!out.ok) throw new Error(out.message ?? out.error)
    if (this.state.lang !== lang) return entry
    if (this.state.docHash === null || this.state.docHash === prepared.docHash) {
      this.set({ docHash: prepared.docHash, lang, entry, stale: false })
    } else {
      // the file was saved while this ran: the entry follows it when its pages are all still there
      this.set({ ...this.state, entry, docHash: prepared.docHash })
      await this.load()
    }
    return entry
  }

  private set(next: InsightsSnapshot): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** every page the overview was made from is still in the file */
export function insightsStillMatch(
  entry: Pick<InsightsEntry, 'pageFingerprints'>,
  fingerprints: readonly string[],
): boolean {
  const now = new Set(fingerprints)
  return entry.pageFingerprints.every((fp) => now.has(fp))
}
