/**
 * Carry job records to the new document hash after an in-app save (spec §6,
 * §9): the store's migrateDocument copies results but not job records, and
 * without them the "continue the unfinished job?" offer would not appear for
 * the saved file. Built on the store's public API only.
 *
 * Every record moves, complete ones included: a job that was running at the
 * save and finished later must carry its final state over when its tab runs
 * the migration again, or the earlier 'running' copy would go stale and read
 * as an interrupted job.
 *
 * A record already in the new document wins when it is at least as recent
 * (same rule as the result migration), so running this again is harmless.
 * A job still running elsewhere stays 'running' and, unless its owner moves
 * its heartbeat to the new hash, turns 'stopped' / 'interrupted' once the
 * running window passes.
 *
 * Every job kind moves by this rule (reading-assist spec 5.5); a record is
 * found by its kind and second key (jobKeyOf: language or run id) and, for an
 * easy explanation's job, its mode: that record moves to the easy record of
 * the new hash, never onto the plain one.
 */
import {
  jobKeyOf,
  type JobRecordInput,
  type JobStatus,
  type ResultStore,
} from '../../../../../packages/pdf-structure/src/store'

/** times one record is copied again because its job wrote it while it was being copied */
const COPY_ATTEMPTS = 3

function recordOf(job: JobStatus): JobRecordInput {
  const record: JobRecordInput = {
    kind: job.kind,
    state: job.state === 'idle' ? 'stopped' : job.state,
    outputs: job.outputs,
  }
  if (job.lang !== undefined) record.lang = job.lang
  if (job.runId !== undefined) record.runId = job.runId
  if (job.mode === 'easy') record.mode = 'easy'
  if (job.last_error !== undefined) record.last_error = job.last_error
  if (job.resetsAt !== undefined) record.resetsAt = job.resetsAt
  if (job.progress !== undefined) record.progress = job.progress
  return record
}

export async function migrateJobRecords(
  store: Pick<ResultStore, 'listJobs' | 'readJob' | 'writeJob'>,
  oldDocHash: string,
  newDocHash: string,
): Promise<number> {
  if (oldDocHash === newDocHash) return 0
  let moved = 0
  for (const job of await store.listJobs(oldDocHash)) {
    // found by (kind, key): the language, or the run id of a highlight job
    const key = jobKeyOf(job)
    const mode = job.mode === 'easy' ? 'easy' : 'translate'
    const current = await store.readJob(newDocHash, job.kind, key, mode)
    if (current.state !== 'idle' && (current.updatedAt ?? 0) >= (job.updatedAt ?? 0)) continue
    // the copy is stamped with the time of the copy, so a write the job made
    // while it was being copied would lose to it later: copy that write too
    let source = job
    for (let attempt = 0; attempt < COPY_ATTEMPTS; attempt++) {
      await store.writeJob(newDocHash, recordOf(source))
      const again = await store.readJob(oldDocHash, job.kind, key, mode)
      if (again.state === 'idle' || again.updatedAt === source.updatedAt) break
      source = again
    }
    moved++
  }
  return moved
}
