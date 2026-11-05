import type { StringKey } from '../i18n/locale'

/**
 * A docked card holds the run until the person acts on it: the questionnaire
 * (`answer`), the page brief (`confirm`) or the partial-page choice (`choice`).
 * While it does, the panel says so instead of counting seconds as if the AI
 * were still working.
 */
export type PanelWait = 'answer' | 'confirm' | 'choice'

/** Short label: the tool group title and the time-free marker in the reply */
export const WAIT_LABEL: Record<PanelWait, StringKey> = {
  answer: 'aiWaitingAnswer',
  confirm: 'aiWaitingConfirm',
  choice: 'aiWaitingChoice',
}

/** The card the composer slot shows, in its order: questionnaire, then brief, then partial page */
export function panelWaitOf(clarify: unknown, brief: unknown, partial: unknown): PanelWait | null {
  if (clarify) return 'answer'
  if (brief) return 'confirm'
  if (partial) return 'choice'
  return null
}

interface StepLike {
  name: string
  summary: string
  running?: boolean
  waiting?: PanelWait
}

/** Marks the running tool step as waiting on the person, with `summary` as its row text */
export function markRunningWait<T extends StepLike>(
  tools: T[] | undefined,
  wait: PanelWait,
  summary: string,
): T[] | undefined {
  return tools?.map((tl) => (tl.running ? { ...tl, summary, waiting: wait } : tl))
}

/** The person acted: the waiting step goes back to `label(name)` while its tool finishes */
export function clearRunningWait<T extends StepLike>(
  tools: T[] | undefined,
  label: (name: string) => string,
): T[] | undefined {
  return tools?.map((tl) => {
    if (!tl.running || !tl.waiting) return tl
    const next = { ...tl, summary: label(tl.name) }
    delete next.waiting
    return next
  })
}

/** What a step list is waiting on, if any of its running steps waits */
export function stepsWaitOf(tools: readonly StepLike[]): PanelWait | null {
  return tools.find((tl) => tl.running && tl.waiting)?.waiting ?? null
}
