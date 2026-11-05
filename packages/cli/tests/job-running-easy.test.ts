import { afterEach, describe, expect, it } from 'vitest'
import { documentJobs } from '../../pdf-structure/src'
import { JOB_KINDS, ResultStore, type JobRecordInput } from '../../pdf-structure/src/store'
import { assertNoRunningJob } from '../src/commands/pdf-job'
import { CliError } from '../src/result'
import { tempDir } from './helpers'

// The "a job is running" refusal (spec 6.3): `detail.job` has `mode: "easy"` only for an easy
// explanation's job, from another process's record or from this process's lock, and the message
// says it is one. The kinds are the same five; a plain job's refusal is what it was.

const DOC = 'd'.repeat(64)
const releases: Array<() => void> = []

afterEach(() => {
  for (const release of releases.splice(0)) release()
})

async function refusal(store: ResultStore, statusCommand?: string): Promise<CliError> {
  try {
    await assertNoRunningJob(store, DOC, statusCommand)
  } catch (err) {
    if (err instanceof CliError) return err
    throw err
  }
  throw new Error('no refusal')
}

async function withRecord(record: JobRecordInput): Promise<CliError> {
  const store = new ResultStore(tempDir())
  await store.writeJob(DOC, record)
  return refusal(store)
}

describe('document-job-running for an easy explanation', () => {
  it('a running easy record elsewhere: detail.job.mode "easy" and an easy message', async () => {
    const err = await withRecord({
      kind: 'translate',
      lang: 'ko',
      mode: 'easy',
      state: 'running',
      progress: { done: 1, total: 4 },
    })
    expect(err.detail).toEqual({
      errorCode: 'document-job-running',
      job: { kind: 'translate', lang: 'ko', mode: 'easy', progress: { done: 1, total: 4 } },
    })
    expect(err.message).toBe('an easy explanation (ko) is already running on this document (1/4)')
  })

  it('an easy page job keeps its kind and says it is an easy explanation', async () => {
    const err = await withRecord({
      kind: 'translate-page',
      lang: 'en',
      mode: 'easy',
      state: 'running',
    })
    expect(err.detail?.job).toMatchObject({ kind: 'translate-page', lang: 'en', mode: 'easy' })
    expect(err.message).toContain('an easy explanation of a page (en)')
  })

  it('an easy job in this process: the lock entry gives the mode', async () => {
    const lease = documentJobs.acquire(
      {
        docHash: DOC,
        kind: 'translate',
        lang: 'fr',
        mode: 'easy',
        progress: { done: 0, total: 2 },
      },
      () => undefined,
    )
    releases.push(() => lease.release())
    const err = await refusal(new ResultStore(tempDir()), 'epub status')
    expect(err.detail).toEqual({
      errorCode: 'document-job-running',
      job: { kind: 'translate', lang: 'fr', mode: 'easy', progress: { done: 0, total: 2 } },
    })
    expect(err.message).toContain('an easy explanation (fr)')
    expect(err.suggestion).toContain('epub status')
  })

  it('a plain job has no mode and its message is unchanged', async () => {
    const err = await withRecord({ kind: 'translate', lang: 'ko', state: 'running' })
    expect(err.detail).toEqual({
      errorCode: 'document-job-running',
      job: { kind: 'translate', lang: 'ko' },
    })
    expect(err.message).toBe('a translation (ko) is already running on this document')
    const page = await withRecord({ kind: 'translate-page', lang: 'de', state: 'running' })
    expect(page.detail?.job).not.toHaveProperty('mode')
    expect(page.message).toContain('a page translation (de)')

    const lease = documentJobs.acquire(
      { docHash: DOC, kind: 'translate', lang: 'fr', progress: { done: 0, total: 2 } },
      () => undefined,
    )
    releases.push(() => lease.release())
    const here = await refusal(new ResultStore(tempDir()))
    expect(here.detail?.job).toEqual({
      kind: 'translate',
      lang: 'fr',
      progress: { done: 0, total: 2 },
    })
    expect(here.message).toContain('a translation (fr)')
  })

  it('the kinds are the same five', () => {
    expect([...JOB_KINDS]).toEqual([
      'ai-read',
      'translate',
      'translate-page',
      'highlight',
      'summary',
    ])
  })
})
