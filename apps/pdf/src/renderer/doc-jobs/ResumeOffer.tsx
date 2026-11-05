/**
 * "Unfinished 〈translation (language) / AI reading / AI highlights〉 N% —
 * continue?" (spec §9, reading-assist spec 5.3), shown once when a document
 * opens with unfinished job records. It only offers: nothing starts unless
 * the user presses Continue, and Continue leads to the job's own pre-start
 * window. Only AI reading, translation and AI highlights are ever offered; a
 * page translation and a summary are not jobs to continue. An easy
 * explanation's record is offered on its own and its line says so.
 */
import type { ReactElement } from 'react'
import type { JobKind, JobStatus } from '../../../../../packages/pdf-structure/src/store/store'
import type { TFunc } from '../i18n/locale'
import { jobPercent } from './job-text'

/** the job kinds the resume offer can show */
export const RESUMABLE_JOB_KINDS: readonly JobKind[] = ['ai-read', 'translate', 'highlight']

/** which kinds besides AI reading the screen showing the offer can continue */
export interface ResumableKinds {
  translate: boolean
  highlight: boolean
}

/**
 * The jobs to offer, in record order: stopped AI reading, and stopped
 * translation / highlight jobs that carry their key when the screen can
 * continue that kind. Running records (another process) are never offered.
 */
export function resumableJobs(jobs: readonly JobStatus[], kinds: ResumableKinds): JobStatus[] {
  return jobs.filter((j) => {
    if (j.state !== 'stopped') return false
    if (j.kind === 'ai-read') return true
    if (j.kind === 'translate') return kinds.translate && !!j.lang
    if (j.kind === 'highlight') return kinds.highlight && !!j.runId
    return false
  })
}

export interface ResumeOfferProps {
  /** the unfinished jobs on offer, first shown first */
  jobs: readonly JobStatus[]
  t: TFunc
  /** a translation's target language as the user reads it */
  languageName: (lang: string) => string
  onContinue: (job: JobStatus) => void
  onDismiss: (job: JobStatus) => void
}

/** the offer line of one unfinished job; null for a kind that is never offered */
export function resumeOfferText(
  job: JobStatus,
  t: TFunc,
  languageName: (lang: string) => string,
): string | null {
  const percent = jobPercent(job.progress)
  switch (job.kind) {
    case 'ai-read':
      return t('jobResumeAiRead', { percent })
    case 'translate':
      return job.mode === 'easy'
        ? t('trResumeEasy', { language: languageName(job.lang ?? ''), percent })
        : t('jobResumeTranslate', { language: languageName(job.lang ?? ''), percent })
    case 'highlight':
      return t('jobResumeHighlight', { percent })
    default:
      return null
  }
}

export function ResumeOffer({
  jobs,
  t,
  languageName,
  onContinue,
  onDismiss,
}: ResumeOfferProps): ReactElement | null {
  const job = jobs.find((j) => RESUMABLE_JOB_KINDS.includes(j.kind))
  if (!job) return null
  const text = resumeOfferText(job, t, languageName)
  if (text === null) return null
  return (
    <div
      className="pdf-job-strip pdf-job-resume"
      role="status"
      data-resume-kind={job.kind}
      {...(job.lang ? { 'data-resume-lang': job.lang } : {})}
      {...(job.mode === 'easy' ? { 'data-resume-mode': 'easy' } : {})}
      {...(job.runId ? { 'data-resume-run': job.runId } : {})}
    >
      <div className="pdf-job-strip-text">
        <span className="pdf-job-strip-title">{text}</span>
      </div>
      <button
        type="button"
        className="pdf-modal-btn primary"
        data-action="resume-job"
        onClick={() => onContinue(job)}
      >
        {t('jobResumeContinue')}
      </button>
      <button
        type="button"
        className="pdf-modal-btn"
        data-action="dismiss-resume"
        onClick={() => onDismiss(job)}
      >
        {t('jobResumeLater')}
      </button>
    </div>
  )
}
