import React from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  ProjectEditor,
  ProjectMemoryOp,
  ProjectNotice,
  ProjectScreenSection,
  UnregisteredProjectHint,
} from '@genoffice/project-store'
import {
  projectConsolidatedText,
  projectEditorLabel,
  projectMemoryEventText,
  projectNoticeActionLabel,
  projectNoticeView,
  projectProblemText,
  projectToolSummaryText,
  type ProjectProblem,
} from './project-panel-model'
import { IconClose, IconProjectEditor, IconProjectFolder } from './project-icons'
import { projectPanelText } from './strings-project-panel'
import './project-panel.css'

function DismissButton({ lang, onDismiss }: { lang: Lang; onDismiss: () => void }) {
  const label = projectPanelText(lang, 'dismiss')
  return (
    <button
      type="button"
      className="ai-project-notice-close"
      aria-label={label}
      title={label}
      onClick={onDismiss}
    >
      <IconClose size={12} />
    </button>
  )
}

/**
 * One project notice in the AI panel: instructions or memory changed
 * outside the app ("[View]"), memory grown long ("[Tidy up]"), instructions
 * cut, the folder cannot be written, or the one-time sync folder notice. The
 * button shows only when its handler is given; the caller decides how long
 * the line stays (`onDismiss` adds a close button).
 */
export function ProjectNoticeLine({
  lang,
  notice,
  onView,
  onConsolidate,
  onDismiss,
}: {
  readonly lang: Lang
  readonly notice: ProjectNotice
  /** "[View]": open the home project screen at that section */
  readonly onView?: ((section: ProjectScreenSection) => void) | undefined
  /** "[Tidy up]": run the person-triggered memory consolidation */
  readonly onConsolidate?: (() => void) | undefined
  readonly onDismiss?: (() => void) | undefined
}): React.JSX.Element {
  const view = projectNoticeView(lang, notice)
  const action = view.action
  const handler =
    action?.type === 'view'
      ? onView && (() => onView(action.section))
      : action?.type === 'consolidate'
        ? onConsolidate
        : undefined
  return (
    <div
      className={`ai-project-notice${view.tone === 'warning' ? ' warning' : ''}`}
      role="status"
      data-notice={notice.kind}
    >
      <span className="ai-project-notice-text">{view.text}</span>
      {action && handler && (
        <button type="button" className="ai-project-link" onClick={handler}>
          {projectNoticeActionLabel(lang, action)}
        </button>
      )}
      {onDismiss && <DismissButton lang={lang} onDismiss={onDismiss} />}
    </div>
  )
}

/**
 * A warning line for something the person asked for that did not happen
 * (spec 5.1): a folder refused and why, a new project not made, a failed
 * action, a send that went without the project's context. Shared by the
 * editors' AI panels, the home ask and the home project screen.
 */
export function ProjectProblemLine({
  lang,
  problem,
  onDismiss,
}: {
  readonly lang: Lang
  readonly problem: ProjectProblem
  readonly onDismiss?: (() => void) | undefined
}): React.JSX.Element {
  return (
    <div className="ai-project-notice warning" role="alert" data-problem={problem.kind}>
      <span className="ai-project-notice-text" dir="auto">
        {projectProblemText(lang, problem)}
      </span>
      {onDismiss && <DismissButton lang={lang} onDismiss={onDismiss} />}
    </div>
  )
}

/** Several notices, one line each, in the order given */
export function ProjectNoticeList({
  lang,
  notices,
  onView,
  onConsolidate,
  onDismiss,
}: {
  readonly lang: Lang
  readonly notices: readonly ProjectNotice[]
  readonly onView?: ((section: ProjectScreenSection) => void) | undefined
  readonly onConsolidate?: (() => void) | undefined
  /** Called with the dismissed notice's index */
  readonly onDismiss?: ((index: number) => void) | undefined
}): React.JSX.Element | null {
  if (notices.length === 0) return null
  return (
    <div className="ai-project-notices">
      {notices.map((notice, index) => (
        <ProjectNoticeLine
          key={`${notice.kind}-${index}`}
          lang={lang}
          notice={notice}
          onView={onView}
          onConsolidate={onConsolidate}
          onDismiss={onDismiss ? () => onDismiss(index) : undefined}
        />
      ))}
    </div>
  )
}

/**
 * "This document is in the '<name>' project folder [Use]": the document sits
 * under an unregistered folder holding `.ieumoffice/project.json`. Shown above
 * the project chip; nothing is used until the person presses [Use].
 */
export function ProjectFolderHintLine({
  lang,
  hint,
  onUse,
  onDismiss,
}: {
  readonly lang: Lang
  readonly hint: UnregisteredProjectHint
  readonly onUse: () => void
  readonly onDismiss?: (() => void) | undefined
}): React.JSX.Element {
  return (
    <div className="ai-project-notice ai-project-hint" role="status" title={hint.folderPath}>
      <span className="ai-project-notice-icon">
        <IconProjectFolder size={13} />
      </span>
      <span className="ai-project-notice-text" dir="auto">
        {projectPanelText(lang, 'folderHint', { name: hint.name })}
      </span>
      <button type="button" className="ai-project-link" onClick={onUse}>
        {projectPanelText(lang, 'useFolder')}
      </button>
      {onDismiss && <DismissButton lang={lang} onDismiss={onDismiss} />}
    </div>
  )
}

/** What a [Remove] on a memory line came to */
export type ProjectMemoryRemoveOutcome = 'removed' | 'already-gone' | 'failed'

/** How long "This memory was already removed" stays under the line */
export const MEMORY_ALREADY_GONE_MS = 3_000

/**
 * A memory line in the chat, written when `project_remember` changed
 * `memory.md`: "Remembered: … [Remove]", "Memory changed: …" or "Memory
 * removed: …". [Remove] shows only for an added entry that is still in the
 * memory and only with `onRemove`. An added entry that is gone since (`gone`:
 * removed here, in another window or outside the app) reads "Memory removed:
 * …" with nothing to press. A [Remove] that finds the entry already gone says
 * so for a moment.
 */
export function ProjectMemoryEventLine({
  lang,
  change,
  gone = false,
  onRemove,
}: {
  readonly lang: Lang
  readonly change: ProjectMemoryOp
  /** The added entry is no longer in the project's memory */
  readonly gone?: boolean | undefined
  /** Removes the added entry from `memory.md`; may answer what came of it */
  readonly onRemove?: (() => void | Promise<ProjectMemoryRemoveOutcome | void>) | undefined
}): React.JSX.Element {
  const [alreadyGone, setAlreadyGone] = React.useState(false)
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  React.useEffect(() => {
    if (!alreadyGone) return
    const timer = setTimeout(() => setAlreadyGone(false), MEMORY_ALREADY_GONE_MS)
    return () => clearTimeout(timer)
  }, [alreadyGone])
  const removed = change.op === 'add' && gone
  const shown: ProjectMemoryOp = removed ? { op: 'remove', text: change.text } : change
  const remove = (): void => {
    if (!onRemove) return
    void Promise.resolve(onRemove()).then(
      (outcome) => {
        if (outcome === 'already-gone' && mounted.current) setAlreadyGone(true)
      },
      () => undefined,
    )
  }
  return (
    <div className="ai-project-event" data-memory-op={shown.op}>
      <span className="ai-project-event-text" dir="auto">
        {projectMemoryEventText(lang, shown)}
      </span>
      {change.op === 'add' && !removed && onRemove && (
        <button type="button" className="ai-project-link" onClick={remove}>
          {projectPanelText(lang, 'removeMemory')}
        </button>
      )}
      {alreadyGone && (
        <span className="ai-project-event-note" role="status">
          {projectPanelText(lang, 'memoryAlreadyRemoved')}
        </span>
      )}
    </div>
  )
}

/** What a memory edit result means for the [Remove] that asked for it */
export function memoryRemoveOutcome(
  result: { status: 'ok' } | { status: 'refused'; reason: string } | null | undefined,
): ProjectMemoryRemoveOutcome {
  if (!result) return 'failed'
  if (result.status === 'ok') return 'removed'
  return result.reason === 'not-found' ? 'already-gone' : 'failed'
}

/** "Memory tidied up (N → M entries) [Undo]" after a person-triggered consolidation */
export function ProjectMemoryConsolidatedLine({
  lang,
  before,
  after,
  onUndo,
}: {
  readonly lang: Lang
  readonly before: number
  readonly after: number
  /** Restores the backup written before the consolidation */
  readonly onUndo?: (() => void) | undefined
}): React.JSX.Element {
  return (
    <div className="ai-project-event" role="status">
      <span className="ai-project-event-text">{projectConsolidatedText(lang, before, after)}</span>
      {onUndo && (
        <button type="button" className="ai-project-link" onClick={onUndo}>
          {projectPanelText(lang, 'undo')}
        </button>
      )}
    </div>
  )
}

/**
 * The one-line summary standing in for another editor's tool records in a
 * reopened chat ("Ran tools 3 times in HWP 'report.hwp'"). It never expands.
 */
export function ProjectToolSummaryLine({
  lang,
  editor,
  documentName,
  count,
}: {
  readonly lang: Lang
  readonly editor: ProjectEditor
  /** Absent for the home ask panel and untitled documents */
  readonly documentName?: string | undefined
  readonly count: number
}): React.JSX.Element {
  return (
    <div className="ai-project-event ai-project-tool-summary">
      <span className="ai-project-event-icon" title={projectEditorLabel(lang, editor)}>
        <IconProjectEditor editor={editor} size={12} />
      </span>
      <span className="ai-project-event-text" dir="auto">
        {projectToolSummaryText(lang, { editor, documentName, count })}
      </span>
    </div>
  )
}
