/**
 * `pdf status <file.pdf>` (spec §10): what the result store holds for the
 * document, with the state of its AI page reading and of each translation.
 * Reads only; nothing is sent and the PDF is not analyzed beyond its page
 * fingerprints.
 */
import { basename } from 'node:path'
import { documentJobs } from '../../../pdf-structure/src'
import type { JobStatus } from '../../../pdf-structure/src/store'
import type { ParsedArgs } from '../args'
import { documentHash, pageFingerprints, pdfFacts, resultStore } from '../formats/pdf-structure'
import { readInput } from '../fs'
import type { CommandContext } from '../registry'
import type { CommandResult } from '../result'
import { jobView } from './pdf-job'

export async function pdfStatus(
  path: string,
  _args: ParsedArgs,
  ctx: CommandContext,
): Promise<CommandResult> {
  const bytes = readInput(path)
  const docHash = documentHash(bytes)
  const store = resultStore(ctx.env)
  // an easy explanation is not shown (spec 6.3): its job never stands in for
  // a translation's, and its records and results make no translation entry
  const inProcess = documentJobs.running(docHash)
  const here = inProcess?.mode === 'easy' ? null : inProcess
  // a job of this process knows its progress better than its last heartbeat
  const live = (status: JobStatus): JobStatus =>
    here && here.kind === status.kind && here.lang === status.lang && status.state === 'running'
      ? { ...status, progress: { ...here.progress } }
      : status

  const readings = await store.readAiReadPages(docHash)
  let pages: number[] = []
  if (readings.size > 0) {
    try {
      const facts = await pdfFacts(bytes, undefined)
      const all = Array.from({ length: facts.pages }, (_, i) => i + 1)
      const prints = await pageFingerprints(bytes, undefined, all)
      pages = all.filter((_, i) => readings.has(prints[i]!))
    } catch {
      ctx.warn({
        code: 'pages_unknown',
        message:
          'the PDF cannot be opened without its password, so the pages already read are not named',
        suggestion: 'ai-read with --password still skips them',
      })
    }
  }
  const aiReadJob = live(await store.readJob(docHash, 'ai-read'))

  const jobs = await store.listJobs(docHash)
  const langs = [
    ...new Set([
      ...(await store.listTranslations(docHash)),
      ...jobs
        .filter((j) => j.kind === 'translate' && j.lang && j.mode !== 'easy')
        .map((j) => j.lang!),
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
      // the job's own count covers its page range; without a record, what the store holds
      done_blocks: job.progress?.done ?? storedBlocks,
      total_blocks: job.progress?.total ?? storedBlocks,
      complete: job.state === 'complete',
      job: jobView(job),
    })
  }

  const running = [aiReadJob, ...translations.map((t) => t.job)].filter(
    (j) => j.state === 'running',
  ).length
  return {
    summary: `${basename(path)}: ${pages.length} page(s) read by AI, ${translations.length} translation(s)${running ? `, ${running} job(s) running` : ''}`,
    detail: {
      ai_read: { pages, job: jobView(aiReadJob) },
      translations,
    },
  }
}
