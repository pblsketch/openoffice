/**
 * The document jobs of one PDF tab (spec §9): at most one job per document,
 * bound to the tab. The session starts a job only when its caller asks
 * (after the user confirmed), keeps what the progress strip shows, stops a
 * job on "Stop" ('cancelled') and stops every job when the tab goes away
 * ('interrupted'; the shell ends the streams of a closed tab and with them
 * the subscription programs they started). Nothing here ever starts or
 * resumes a job by itself.
 *
 * Generic over the job kind: AI page reading and translation share it.
 */
import {
  DocumentJobBusyError,
  documentJobs,
  type DocumentJobHandle,
  type DocumentJobRegistry,
  type JobProgressEvent,
  type JobSummary,
  type RunningDocumentJob,
} from '../../../../../packages/pdf-structure/src/jobs'
import type { JobStatus } from '../../../../../packages/pdf-structure/src/store/store'
// the store's own record-key rule, from its Node-free module (reading-assist spec 5.3)
import { jobKeyOf, type JobKind } from '../../../../../packages/pdf-structure/src/store/job-keys'

export interface DocumentJobView {
  /** session-unique */
  id: number
  docHash: string
  kind: JobKind
  lang?: string
  /** the AI highlight run of a 'highlight' job */
  runId?: string
  /** the provider id the job sends to */
  provider: string
  /** the provider and model as the confirmation showed them (for the progress strip) */
  aiLabel?: string
  state: 'running' | 'complete' | 'stopped' | 'failed'
  /** items (pages, blocks) done, including those done before this run */
  done: number
  total: number
  failed: number
  /** the 1-based page in flight, when the kind knows it */
  currentPage: number | null
  /** Stop was pressed; the job is winding down */
  stopping: boolean
  summary?: JobSummary<unknown>
  /** state 'failed': why the job could not be planned or run */
  error?: string
}

export interface StartDocumentJob<U> {
  docHash: string
  kind: JobKind
  /** target language of a translate, translate-page or summary job */
  lang?: string
  /** the AI highlight run of a 'highlight' job */
  runId?: string
  provider: string
  /** the provider and model as the confirmation showed them (for the progress strip) */
  aiLabel?: string
  /** start the engine job with this signal, registry and progress sink */
  launch(options: {
    signal: AbortSignal
    registry: DocumentJobRegistry
    onProgress: (event: JobProgressEvent<U>) => void
  }): DocumentJobHandle<U>
  /** the page a unit in flight is on */
  pageOf?(unit: U): number | null
  /** the job ended (complete, stopped or failed); its last view */
  onEnd?(view: DocumentJobView): void
}

const recordKey = (docHash: string, kind: JobKind, key?: string): string =>
  JSON.stringify([docHash, kind, key ?? null])

export type StartJobOutcome =
  { ok: true; view: DocumentJobView } | { ok: false; running: RunningDocumentJob }

export class DocumentJobSession {
  private readonly views = new Map<string, DocumentJobView>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly listeners = new Set<() => void>()
  private nextId = 1
  private snapshot: readonly DocumentJobView[] = []
  /** job records this session's jobs wrote (document hash, kind, second key) */
  private readonly ran = new Set<string>()
  /** copies of those records an in-app save carried to another hash, and when */
  private readonly carried = new Map<string, number>()

  constructor(private readonly registry: DocumentJobRegistry = documentJobs) {}

  /** the job running on this document in this process (any tab), or null */
  running(docHash: string): RunningDocumentJob | null {
    return this.registry.running(docHash)
  }

  /** start a confirmed job; refused with the running job's progress when the document has one */
  start<U>(spec: StartDocumentJob<U>): StartJobOutcome {
    const busy = this.registry.running(spec.docHash)
    if (busy) return { ok: false, running: busy }
    const controller = new AbortController()
    const view: DocumentJobView = {
      id: this.nextId++,
      docHash: spec.docHash,
      kind: spec.kind,
      ...(spec.lang !== undefined ? { lang: spec.lang } : {}),
      ...(spec.runId !== undefined ? { runId: spec.runId } : {}),
      provider: spec.provider,
      ...(spec.aiLabel !== undefined ? { aiLabel: spec.aiLabel } : {}),
      state: 'running',
      done: 0,
      total: 0,
      failed: 0,
      currentPage: null,
      stopping: false,
    }
    let handle: DocumentJobHandle<U>
    try {
      handle = spec.launch({
        signal: controller.signal,
        registry: this.registry,
        onProgress: (event) =>
          this.update(view.id, spec.docHash, {
            done: event.done,
            total: event.total,
            failed: event.failed,
            currentPage: event.current && spec.pageOf ? spec.pageOf(event.current) : null,
          }),
      })
    } catch (err) {
      if (err instanceof DocumentJobBusyError) return { ok: false, running: err.running }
      throw err
    }
    this.views.set(spec.docHash, view)
    this.controllers.set(spec.docHash, controller)
    this.ran.add(recordKey(spec.docHash, spec.kind, jobKeyOf(spec)))
    this.emit()
    const end = (patch: Partial<DocumentJobView>) => {
      if (this.controllers.get(spec.docHash) === controller) this.controllers.delete(spec.docHash)
      const last = this.update(view.id, spec.docHash, { ...patch, stopping: false })
      if (last) spec.onEnd?.(last)
    }
    handle.result.then(
      (summary) =>
        end({
          state: summary.state,
          summary: summary as JobSummary<unknown>,
          done: summary.progress.done,
          total: summary.progress.total,
          failed: summary.failedUnits.length,
          currentPage: null,
        }),
      (err: unknown) =>
        end({ state: 'failed', error: err instanceof Error ? err.message : String(err) }),
    )
    return { ok: true, view: { ...view } }
  }

  /**
   * An in-app save carried the job records of `from` to `to`: the copies of
   * this session's records there are its own, not a job running elsewhere.
   */
  adopt(from: string, to: string): void {
    if (from === to) return
    const at = Date.now()
    const own = [...this.ran, ...this.carried.keys()]
    for (const key of own) {
      const [docHash, kind, second] = JSON.parse(key) as [string, JobKind, string | null]
      if (docHash === from) this.carried.set(recordKey(to, kind, second ?? undefined), at)
    }
  }

  /**
   * A job another process (the terminal, another window) runs on the
   * document, from the store's records: a fresh 'running' record that is not
   * a copy of this session's own job carried over by a save. A record
   * written after the carry is someone else's.
   */
  runningElsewhere(docHash: string, records: readonly JobStatus[]): JobStatus | undefined {
    return records.find((job) => {
      if (job.state !== 'running') return false
      const carriedAt = this.carried.get(recordKey(docHash, job.kind, jobKeyOf(job)))
      return carriedAt === undefined || job.updatedAt === undefined || job.updatedAt > carriedAt
    })
  }

  /** "Stop": the job ends after the calls in flight are cancelled */
  stop(docHash: string): void {
    const controller = this.controllers.get(docHash)
    if (!controller) return
    const view = this.views.get(docHash)
    if (view) this.update(view.id, docHash, { stopping: true })
    controller.abort('cancelled')
  }

  /** the tab or the app is going away: every job of this session stops */
  stopAll(): void {
    for (const controller of this.controllers.values()) controller.abort('interrupted')
    this.controllers.clear()
  }

  /** hide an ended job's strip */
  dismiss(docHash: string): void {
    const view = this.views.get(docHash)
    if (!view || view.state === 'running') return
    this.views.delete(docHash)
    this.emit()
  }

  /** the job views, newest state (stable array between changes) */
  list(): readonly DocumentJobView[] {
    return this.snapshot
  }

  view(docHash: string): DocumentJobView | null {
    const v = this.views.get(docHash)
    return v ? { ...v } : null
  }

  isRunning(docHash: string): boolean {
    return this.controllers.has(docHash)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(
    id: number,
    docHash: string,
    patch: Partial<DocumentJobView>,
  ): DocumentJobView | null {
    const current = this.views.get(docHash)
    if (!current || current.id !== id) return null
    const next = { ...current, ...patch }
    this.views.set(docHash, next)
    this.emit()
    return { ...next }
  }

  private emit(): void {
    this.snapshot = [...this.views.values()].map((v) => ({ ...v }))
    for (const listener of this.listeners) listener()
  }
}
