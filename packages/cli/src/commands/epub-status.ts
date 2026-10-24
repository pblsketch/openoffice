/**
 * `epub status <file.epub>` (spec §9): the translations the result store
 * holds for the book, each with the state of its job. Reads only; nothing is
 * sent and the book is not opened beyond hashing its bytes.
 */
import { basename } from 'node:path'
import { epubDocumentHash } from '@genoffice/epub-engine'
import { documentJobs } from '../../../pdf-structure/src'
import type { JobStatus } from '../../../pdf-structure/src/store'
import type { ParsedArgs } from '../args'
import { resultStore } from '../formats/pdf-structure'
import { readInput } from '../fs'
import type { CommandContext } from '../registry'
import type { CommandResult } from '../result'
import { jobView } from './pdf-job'

export async function epubStatus(
  path: string,
  _args: ParsedArgs,
  ctx: CommandContext,
): Promise<CommandResult> {
  const docHash = await epubDocumentHash(readInput(path))
  const store = resultStore(ctx.env)
  const here = documentJobs.running(docHash)
  // a job of this process knows its progress better than its last heartbeat
  const live = (status: JobStatus): JobStatus =>
    here && here.kind === status.kind && here.lang === status.lang && status.state === 'running'
      ? { ...status, progress: { ...here.progress } }
      : status

  const jobs = await store.listJobs(docHash)
  const langs = [
    ...new Set([
      ...(await store.listTranslations(docHash)),
      ...jobs.filter((j) => j.kind === 'translate' && j.lang).map((j) => j.lang!),
    ]),
  ].sort()
  const translations = []
  for (const lang of langs) {
    const stored = await store.readTranslation(docHash, lang)
    const job = live(await store.readJob(docHash, 'translate', lang))
    const storedBlocks = stored?.blocks.size ?? 0
    translations.push({
      lang,
      provider: stored?.provider ?? null,
      model: stored?.model ?? null,
      // the job's own count covers its chapters; without a record, what the store holds
      done_blocks: job.progress?.done ?? storedBlocks,
      total_blocks: job.progress?.total ?? storedBlocks,
      complete: job.state === 'complete',
      job: jobView(job),
    })
  }

  const running = translations.filter((t) => t.job.state === 'running').length
  return {
    summary: `${basename(path)}: ${translations.length} translation(s)${running ? `, ${running} job(s) running` : ''}`,
    detail: { translations },
  }
}
