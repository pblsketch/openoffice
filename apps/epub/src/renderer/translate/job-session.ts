/**
 * The book translation job of one EPUB tab (spec §8, the document job rules
 * of docs/business-rules.md): at most one job per book, bound to the tab.
 * The session starts a job only when its caller asks (after the user
 * confirmed), keeps what the progress strip shows, stops the job on "Stop"
 * ('cancelled') and stops it when the tab goes away ('interrupted'; the shell
 * ends the streams of a closed tab and with them the subscription programs
 * they started). Nothing here ever starts or resumes a job by itself.
 *
 * The book's lock is the job engine's registry (one job per document hash in
 * this page); a job another process runs on the same book shows as a fresh
 * 'running' record in the store (`runningElsewhere`). The tab's own records
 * are never 'running' when no job of the tab runs: the engine writes the
 * final state when its job ends.
 */
import type {
  DocumentJobHandle,
  DocumentJobRegistry,
  JobProgressEvent,
  JobSummary,
  RunningDocumentJob,
} from '@genoffice/pdf-structure'
import type { JobStatus } from '@genoffice/pdf-structure/store'
import { DocumentJobBusyError, documentJobs } from './engine'

export interface BookJobView {
  /** session-unique */
  id: number
  docHash: string
  lang: string
  /** the provider id the job sends to */
  provider: string
  state: 'running' | 'complete' | 'stopped' | 'failed'
  /** blocks done, including those done before this run */
  done: number
  total: number
  failed: number
  /** the spine index in flight (EPUB_METADATA_PAGE for the title and contents), when known */
  currentPage: number | null
  /** Stop was pressed; the job is winding down */
  stopping: boolean
  summary?: JobSummary<unknown>
  /** state 'failed': why the job could not be planned or run */
  error?: string
}

export interface StartBookJob<U> {
  docHash: string
  lang: string
  provider: string
  /** start the engine job with this signal, registry and progress sink */
  launch(options: {
    signal: AbortSignal
    registry: DocumentJobRegistry
    onProgress: (event: JobProgressEvent<U>) => void
  }): DocumentJobHandle<U>
  /** the page (spine index) a unit in flight is on */
  pageOf?(unit: U): number | null
  /** the job ended (complete, stopped or failed); its last view */
  onEnd?(view: BookJobView): void
}

export type StartBookJobOutcome =
  { ok: true; view: BookJobView } | { ok: false; running: RunningDocumentJob }

export class BookJobSession {
  private current: BookJobView | null = null
  private controller: AbortController | null = null
  private readonly listeners = new Set<() => void>()
  private nextId = 1
  private snapshot: BookJobView | null = null

  constructor(private readonly registry: DocumentJobRegistry = documentJobs) {}

  /** the job running on this book in this page (any tab), or null */
  running(docHash: string): RunningDocumentJob | null {
    return this.registry.running(docHash)
  }

  /** start a confirmed job; refused with the running job's progress when the book has one */
  start<U>(spec: StartBookJob<U>): StartBookJobOutcome {
    const busy = this.registry.running(spec.docHash)
    if (busy) return { ok: false, running: busy }
    const controller = new AbortController()
    const view: BookJobView = {
      id: this.nextId++,
      docHash: spec.docHash,
      lang: spec.lang,
      provider: spec.provider,
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
          this.update(view.id, {
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
    this.current = view
    this.controller = controller
    this.emit()
    const end = (patch: Partial<BookJobView>) => {
      if (this.controller === controller) this.controller = null
      const last = this.update(view.id, { ...patch, stopping: false })
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
   * A job another process (the terminal, another window) runs on the book,
   * from the store's records: a fresh 'running' translation record.
   */
  runningElsewhere(records: readonly JobStatus[]): JobStatus | undefined {
    return records.find((job) => job.state === 'running')
  }

  /** "Stop": the job ends after the calls in flight are cancelled */
  stop(): void {
    const controller = this.controller
    if (!controller || !this.current) return
    this.update(this.current.id, { stopping: true })
    controller.abort('cancelled')
  }

  /** the tab or the app is going away: the job stops */
  stopAll(): void {
    this.controller?.abort('interrupted')
    this.controller = null
  }

  /** hide an ended job's strip */
  dismiss(): void {
    if (!this.current || this.current.state === 'running') return
    this.current = null
    this.emit()
  }

  /** the tab's job as the strip shows it (stable object between changes) */
  view(): BookJobView | null {
    return this.snapshot
  }

  isRunning(): boolean {
    return this.controller !== null
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(id: number, patch: Partial<BookJobView>): BookJobView | null {
    if (!this.current || this.current.id !== id) return null
    this.current = { ...this.current, ...patch }
    this.emit()
    return { ...this.current }
  }

  private emit(): void {
    this.snapshot = this.current ? { ...this.current } : null
    for (const listener of this.listeners) listener()
  }
}
