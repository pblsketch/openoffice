/**
 * Document-job plumbing for the reading assistant (reading-assist spec 5.3):
 * the IPC store wrapper keeps edited blocks on a restart and keys job
 * records by language or run id; the resume offer shows only AI reading,
 * translation and AI highlights, each with its own line, and never a page
 * translation or a summary; the session tells its own highlight run from
 * another run.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { DocumentJobRegistry } from '../../../packages/pdf-structure/src/jobs'
import type { JobStatus } from '../../../packages/pdf-structure/src/store/store'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import { createIpcJobStore, JobStoreCallError } from '../src/renderer/doc-jobs/ipc-store'
import { ResumeOffer, resumableJobs, resumeOfferText } from '../src/renderer/doc-jobs/ResumeOffer'
import * as jobSessionModule from '../src/renderer/doc-jobs/job-session'
import { jobKeyOf } from '../../../packages/pdf-structure/src/store/job-keys'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)
const tKo: TFunc = (key, params) => translate('ko', key, params)

const DOC = 'a'.repeat(64)

const job = (over: Partial<JobStatus> & Pick<JobStatus, 'kind'>): JobStatus => ({
  state: 'stopped',
  outputs: [],
  progress: { done: 1, total: 4 },
  ...over,
})

function fakeApi(answer: (r: PdfStoreWriteRequest) => object = () => ({ ok: true })) {
  const writes: PdfStoreWriteRequest[] = []
  return {
    writes,
    api: {
      aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
      translation: vi.fn(async () => ({ ok: true as const, translation: null })),
      write: vi.fn(async (request: PdfStoreWriteRequest) => {
        writes.push(request)
        return answer(request) as { ok: true }
      }),
    },
  }
}

describe('createIpcJobStore', () => {
  it('keeps the edited blocks on a restart through its own write kind', async () => {
    const { api, writes } = fakeApi((r) =>
      r.kind === 'deleteTranslationExceptEdited' ? { ok: true, removed: 3 } : { ok: true },
    )
    const store = createIpcJobStore(api)
    expect(typeof store.deleteTranslationExceptEdited).toBe('function')
    await expect(store.deleteTranslationExceptEdited!(DOC, 'en')).resolves.toBe(3)
    expect(writes).toEqual([{ kind: 'deleteTranslationExceptEdited', docHash: DOC, lang: 'en' }])
  })

  it('throws when the shell refuses it', async () => {
    const { api } = fakeApi(() => ({ ok: false, error: 'not-granted' }))
    await expect(createIpcJobStore(api).deleteTranslationExceptEdited!(DOC, 'en')).rejects.toThrow(
      JobStoreCallError,
    )
  })

  it('passes the run id of a highlight job record on', async () => {
    const { api, writes } = fakeApi()
    await createIpcJobStore(api).writeJob(DOC, {
      kind: 'highlight',
      runId: 'run1',
      state: 'running',
    })
    expect(writes).toEqual([
      { kind: 'job', docHash: DOC, job: { kind: 'highlight', runId: 'run1', state: 'running' } },
    ])
  })
})

describe('resume offer', () => {
  const all = [
    job({ kind: 'ai-read' }),
    job({ kind: 'translate', lang: 'fr' }),
    job({ kind: 'translate-page', lang: 'fr' }),
    job({ kind: 'highlight', runId: 'run1' }),
    job({ kind: 'summary', lang: 'en' }),
    job({ kind: 'ai-read', state: 'running' }),
  ]

  it('offers only stopped AI reading, translation and highlight jobs', () => {
    expect(resumableJobs(all, { translate: true, highlight: true }).map((j) => j.kind)).toEqual([
      'ai-read',
      'translate',
      'highlight',
    ])
    // the screens that cannot continue a kind do not offer it
    expect(resumableJobs(all, { translate: false, highlight: false }).map((j) => j.kind)).toEqual([
      'ai-read',
    ])
    // a record without its key cannot be continued
    expect(
      resumableJobs([job({ kind: 'highlight' }), job({ kind: 'translate' })], {
        translate: true,
        highlight: true,
      }),
    ).toEqual([])
  })

  it('labels each kind for what it is', () => {
    const name = (code: string) => `<${code}>`
    expect(resumeOfferText(job({ kind: 'ai-read' }), t, name)).toBe(
      t('jobResumeAiRead', { percent: 25 }),
    )
    expect(resumeOfferText(job({ kind: 'translate', lang: 'fr' }), t, name)).toBe(
      t('jobResumeTranslate', { language: '<fr>', percent: 25 }),
    )
    const highlight = resumeOfferText(job({ kind: 'highlight', runId: 'run1' }), tKo, name)
    expect(highlight).toBe(tKo('jobResumeHighlight', { percent: 25 }))
    expect(highlight).toContain('AI 핵심 표시')
    expect(highlight).not.toContain('AI 읽기')
    expect(resumeOfferText(job({ kind: 'translate-page', lang: 'fr' }), t, name)).toBeNull()
    expect(resumeOfferText(job({ kind: 'summary', lang: 'fr' }), t, name)).toBeNull()
    // an easy explanation is offered as one, apart from the translation of its language
    const easy = resumeOfferText(job({ kind: 'translate', lang: 'fr', mode: 'easy' }), tKo, name)
    expect(easy).toBe(tKo('trResumeEasy', { language: '<fr>', percent: 25 }))
    expect(easy).toContain('쉬운 풀이')
    expect(easy).not.toBe(resumeOfferText(job({ kind: 'translate', lang: 'fr' }), tKo, name))
    expect(
      resumeOfferText(job({ kind: 'translate-page', lang: 'fr', mode: 'easy' }), t, name),
    ).toBeNull()
  })

  it('a session tells its own easy job record from the plain one of the same language', () => {
    const session = new jobSessionModule.DocumentJobSession(new DocumentJobRegistry())
    const outcome = session.start({
      docHash: 'old',
      kind: 'translate',
      lang: 'fr',
      mode: 'easy',
      provider: 'claude-code',
      launch: () =>
        ({ result: new Promise(() => {}) }) as unknown as ReturnType<
          Parameters<typeof session.start>[0]['launch']
        >,
    })
    expect(outcome.ok && outcome.view.mode).toBe('easy')
    session.adopt('old', 'new')
    const running = (mode?: 'easy'): JobStatus =>
      ({
        kind: 'translate',
        lang: 'fr',
        state: 'running',
        outputs: [],
        updatedAt: Date.now() - 60_000,
        ...(mode ? { mode } : {}),
      }) as JobStatus
    // the carried easy record is this session's own; the plain one is someone else's
    expect(session.runningElsewhere('new', [running('easy')])).toBeUndefined()
    expect(session.runningElsewhere('new', [running()])?.kind).toBe('translate')
  })

  describe('the strip', () => {
    let root: Root | null = null
    let container: HTMLDivElement | null = null
    beforeAll(() => {
      ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
    })
    afterEach(async () => {
      if (root) await act(async () => root?.unmount())
      container?.remove()
      root = null
    })

    async function render(jobs: JobStatus[]) {
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      const onContinue = vi.fn()
      await act(async () =>
        root!.render(
          createElement(ResumeOffer, {
            jobs,
            t,
            languageName: (c: string) => c,
            onContinue,
            onDismiss: vi.fn(),
          }),
        ),
      )
      return { el: container, onContinue }
    }

    it('never shows a page translation or a summary, even when handed one', async () => {
      const { el } = await render([
        job({ kind: 'translate-page', lang: 'fr' }),
        job({ kind: 'summary', lang: 'fr' }),
      ])
      expect(el.querySelector('[data-resume-kind]')).toBeNull()
    })

    it('shows a highlight run with its run id and continues it on request only', async () => {
      const highlight = job({ kind: 'highlight', runId: 'run1' })
      const { el, onContinue } = await render([job({ kind: 'summary', lang: 'en' }), highlight])
      const strip = el.querySelector('[data-resume-kind]') as HTMLElement
      expect(strip.dataset.resumeKind).toBe('highlight')
      expect(strip.dataset.resumeRun).toBe('run1')
      expect(strip.textContent).toContain(t('jobResumeHighlight', { percent: 25 }))
      expect(onContinue).not.toHaveBeenCalled()
      await act(async () => (el.querySelector('[data-action="resume-job"]') as HTMLElement).click())
      expect(onContinue).toHaveBeenCalledWith(highlight)
    })
  })
})

describe('job session keys', () => {
  it('keys records by language or run id, and none for AI reading', () => {
    expect(jobKeyOf({ kind: 'ai-read', lang: 'en' })).toBeUndefined()
    expect(jobKeyOf({ kind: 'translate', lang: 'en' })).toBe('en')
    expect(jobKeyOf({ kind: 'translate-page', lang: 'en' })).toBe('en')
    expect(jobKeyOf({ kind: 'summary', lang: 'en' })).toBe('en')
    expect(jobKeyOf({ kind: 'highlight', lang: 'en', runId: 'run1' })).toBe('run1')
  })

  it('the session uses the store rule itself, from its Node-free module (no renderer copy)', async () => {
    expect('jobRecordKey' in jobSessionModule).toBe(false)
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(__dirname, '..', 'src', 'renderer', 'doc-jobs', 'job-session.ts'),
      'utf8',
    )
    expect(source).toContain("from '../../../../../packages/pdf-structure/src/store/job-keys'")
    expect(source).not.toMatch(/^import \{[^}]*\} from '[^']*store\/store'/m)
  })

  it('tells its own carried highlight record from another run', () => {
    const session = new jobSessionModule.DocumentJobSession(new DocumentJobRegistry())
    const never = new Promise<never>(() => {})
    const started = session.start({
      docHash: DOC,
      kind: 'highlight',
      runId: 'run1',
      provider: 'codex',
      launch: () => ({ result: never }) as never,
    })
    expect(started.ok).toBe(true)
    if (started.ok) expect(started.view.runId).toBe('run1')
    const saved = 'b'.repeat(64)
    session.adopt(DOC, saved)
    const at = Date.now() - 1
    const own = job({ kind: 'highlight', runId: 'run1', state: 'running', updatedAt: at })
    const other = job({ kind: 'highlight', runId: 'run2', state: 'running', updatedAt: at })
    expect(session.runningElsewhere(saved, [own])).toBeUndefined()
    expect(session.runningElsewhere(saved, [own, other])).toBe(other)
  })
})
