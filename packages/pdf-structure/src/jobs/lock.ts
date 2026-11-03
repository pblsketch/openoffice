/**
 * One document job at a time per document (spec §9), inside this process.
 * The lock is keyed by the document hash and taken synchronously, so two
 * starts in the same tick cannot both get it.
 */
import type { JobProgress } from '../store/store'
import { DocumentJobBusyError, type RunningDocumentJob } from './errors'

/** 'interrupted' when the tab, app or server ends; 'cancelled' when the user stops */
export type JobCancelReason = 'cancelled' | 'interrupted'

interface Entry {
  info: RunningDocumentJob
  cancel: (reason: JobCancelReason) => void
}

export interface DocumentJobLease {
  /** keep the progress other callers see up to date */
  update(progress: JobProgress): void
  release(): void
}

export class DocumentJobRegistry {
  private readonly jobs = new Map<string, Entry>()

  /** the job running on this document, or null */
  running(docHash: string): RunningDocumentJob | null {
    const e = this.jobs.get(docHash)
    return e ? snapshot(e.info) : null
  }

  /** documents with a running job */
  documents(): string[] {
    return [...this.jobs.keys()]
  }

  /** stop the document's job; false when none is running */
  cancel(docHash: string, reason: JobCancelReason = 'cancelled'): boolean {
    const e = this.jobs.get(docHash)
    if (!e) return false
    e.cancel(reason)
    return true
  }

  /** take the document; throws DocumentJobBusyError when a job holds it */
  acquire(info: RunningDocumentJob, cancel: (reason: JobCancelReason) => void): DocumentJobLease {
    const held = this.jobs.get(info.docHash)
    if (held) throw new DocumentJobBusyError(snapshot(held.info))
    const entry: Entry = { info: snapshot(info), cancel }
    this.jobs.set(info.docHash, entry)
    return {
      update: (progress) => {
        entry.info.progress = { done: progress.done, total: progress.total }
      },
      release: () => {
        if (this.jobs.get(info.docHash) === entry) this.jobs.delete(info.docHash)
      },
    }
  }
}

function snapshot(info: RunningDocumentJob): RunningDocumentJob {
  const out: RunningDocumentJob = {
    docHash: info.docHash,
    kind: info.kind,
    progress: { ...info.progress },
  }
  if (info.lang !== undefined) out.lang = info.lang
  if (info.runId !== undefined) out.runId = info.runId
  if (info.mode === 'easy') out.mode = 'easy'
  return out
}

/** the process-wide registry the job starters use unless given another */
export const documentJobs = new DocumentJobRegistry()
