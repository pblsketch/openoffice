/**
 * Rules behind the project-folder parts of the AI panel (decision 0088): what
 * the project list shows and in which order, what the chat menu shows, and
 * which sentence each notice or event line says. Pure functions; the
 * components only lay these out.
 */
import { htmlLang, type Lang } from '@genoffice/i18n'
import type {
  AddFolderResult,
  CreateProjectResult,
  FolderRefusalReason,
  LegacyDocumentChat,
  ProjectChatListItem,
  ProjectEditor,
  ProjectId,
  ProjectListItem,
  ProjectMemoryOp,
  ProjectNotice,
  ProjectScreenSection,
} from '@genoffice/project-store'
import type { ProjectRunPrepared } from './project-skill'
import { projectPanelText, type ProjectPanelStringKey } from './strings-project-panel'

// ────────────────────────────────────────────────────────────
// Matching
// ────────────────────────────────────────────────────────────

/**
 * Search text in a comparable form: trimmed, NFC (macOS paths arrive
 * decomposed), lowercased. Empty means "no filter".
 */
export function projectSearchKey(text: string): string {
  return text.normalize('NFC').trim().toLocaleLowerCase()
}

function includesKey(haystack: string, key: string): boolean {
  return haystack.normalize('NFC').toLocaleLowerCase().includes(key)
}

/** Whether a project matches the search text by name or folder path */
export function projectMatchesQuery(project: ProjectListItem, query: string): boolean {
  const key = projectSearchKey(query)
  if (!key) return true
  return includesKey(project.name, key) || includesKey(project.path, key)
}

function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

// ────────────────────────────────────────────────────────────
// Project list
// ────────────────────────────────────────────────────────────

/** One row of the project list, top to bottom */
export type ProjectPickerItem =
  /** "'<name>' new project" under the default save folder: only when the search text matches no project */
  | { readonly kind: 'create'; readonly name: string }
  /** "Create somewhere else…": the same name, under a folder main asks for (right below `create`) */
  | { readonly kind: 'create-elsewhere'; readonly name: string }
  | {
      readonly kind: 'project'
      readonly project: ProjectListItem
      readonly group: 'pinned' | 'recent'
    }
  /** "+ New project" */
  | { readonly kind: 'new' }
  /** "Add folder" */
  | { readonly kind: 'add-folder' }
  /** "No project" */
  | { readonly kind: 'none' }

/**
 * The project list for a search text. Pinned projects come first in name
 * order (they stay put), then the others by last use, newest first. A search
 * text that matches no project puts "'<text>' new project" and "Create
 * somewhere else…" on top. The fixed rows ("+ New project", "Add folder", "No
 * project") always follow.
 */
export function projectPickerItems(
  projects: readonly ProjectListItem[],
  query: string,
  lang: Lang = 'en',
): ProjectPickerItem[] {
  const seen = new Set<ProjectId>()
  const matched = projects.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return projectMatchesQuery(p, query)
  })
  const collator = new Intl.Collator(htmlLang(lang), { sensitivity: 'base', numeric: true })
  const pinned = matched
    .filter((p) => p.pinned)
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
  const recent = matched
    .filter((p) => !p.pinned)
    .sort(
      (a, b) =>
        timeOf(b.lastUsedAt) - timeOf(a.lastUsedAt) ||
        collator.compare(a.name, b.name) ||
        a.id.localeCompare(b.id),
    )
  const items: ProjectPickerItem[] = []
  const name = query.normalize('NFC').trim()
  if (name && matched.length === 0) {
    items.push({ kind: 'create', name }, { kind: 'create-elsewhere', name })
  }
  for (const project of pinned) items.push({ kind: 'project', project, group: 'pinned' })
  for (const project of recent) items.push({ kind: 'project', project, group: 'recent' })
  items.push({ kind: 'new' }, { kind: 'add-folder' }, { kind: 'none' })
  return items
}

/** The row highlighted when the list opens: the chosen project, else "No project" when none is chosen, else the top row */
export function projectPickerInitialIndex(
  items: readonly ProjectPickerItem[],
  selectedId: ProjectId | null,
): number {
  const index = items.findIndex((item) =>
    selectedId === null
      ? item.kind === 'none'
      : item.kind === 'project' && item.project.id === selectedId,
  )
  return index >= 0 ? index : 0
}

/** What activating a row asks the caller to do */
export type ProjectPickerAction =
  | { readonly type: 'select'; readonly projectId: ProjectId | null }
  /** A missing folder: the caller opens a folder picker to relocate it */
  | { readonly type: 'relocate'; readonly projectId: ProjectId }
  /**
   * A new project named `name`: under the default save folder, or with
   * `otherPlace` under a folder main asks for. The renderer never names the place.
   */
  | { readonly type: 'create'; readonly name: string; readonly otherPlace: boolean }
  /** "+ New project" with an empty search field: the list asks for a name first */
  | { readonly type: 'ask-name' }
  | { readonly type: 'add-folder' }

/** What a row does; `query` is the search text ("+ New project" takes it as the name) */
export function projectPickerAction(item: ProjectPickerItem, query = ''): ProjectPickerAction {
  switch (item.kind) {
    case 'create':
      return { type: 'create', name: item.name, otherPlace: false }
    case 'create-elsewhere':
      return { type: 'create', name: item.name, otherPlace: true }
    case 'project':
      return item.project.missing
        ? { type: 'relocate', projectId: item.project.id }
        : { type: 'select', projectId: item.project.id }
    case 'new': {
      const name = query.normalize('NFC').trim()
      return name ? { type: 'create', name, otherPlace: false } : { type: 'ask-name' }
    }
    case 'add-folder':
      return { type: 'add-folder' }
    case 'none':
      return { type: 'select', projectId: null }
  }
}

/**
 * Where "'<name>' new project" creates the folder, for display: the default
 * save folder joined with the name, using the separator that folder is written
 * with. '' while the default folder is not known yet.
 */
export function projectCreateLocation(
  parentFolder: string | null | undefined,
  name: string,
): string {
  const parent = (parentFolder ?? '').trim()
  if (!parent) return ''
  // a bare drive ("D:") has no separator to copy: Windows writes a backslash
  const separator = parent.includes('\\') || !parent.includes('/') ? '\\' : '/'
  const base = /[\\/]$/.test(parent) && parent.length > 1 ? parent.slice(0, -1) : parent
  return `${base}${base.endsWith(separator) ? '' : separator}${name.normalize('NFC').trim()}`
}

/** Next highlighted row for ↑/↓ (wrapping), Home and End */
export function stepIndex(
  current: number,
  count: number,
  key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
): number {
  if (count <= 0) return 0
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const delta = key === 'ArrowDown' ? 1 : -1
  return (((current + delta) % count) + count) % count
}

/** The chip's text: the chosen project's name, "No project", or a generic label while the list is not loaded */
export function projectChipText(
  lang: Lang,
  projects: readonly ProjectListItem[],
  selectedId: ProjectId | null,
): string {
  if (selectedId === null) return projectPanelText(lang, 'noProject')
  const found = projects.find((p) => p.id === selectedId)
  return found?.name || projectPanelText(lang, 'projectFallback')
}

// ────────────────────────────────────────────────────────────
// Chat menu
// ────────────────────────────────────────────────────────────

/** One row of the chat menu, top to bottom */
export type ProjectChatMenuItem =
  | { readonly kind: 'new' }
  | { readonly kind: 'chat'; readonly chat: ProjectChatListItem }
  /** "Earlier chat of this document" (the project-store chat from before projects) */
  | { readonly kind: 'legacy'; readonly legacy: LegacyDocumentChat }

/** Chats matching the search text by title, newest `updatedAt` first */
export function projectChatRows(
  chats: readonly ProjectChatListItem[],
  query: string,
): ProjectChatListItem[] {
  const key = projectSearchKey(query)
  return chats
    .filter((c) => !key || includesKey(c.title, key))
    .sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt) || a.id.localeCompare(b.id))
}

/** [New chat] on top, the matching chats, then the earlier document chat when there is one */
export function projectChatMenuItems(
  chats: readonly ProjectChatListItem[],
  query: string,
  legacy: LegacyDocumentChat | null | undefined,
): ProjectChatMenuItem[] {
  const items: ProjectChatMenuItem[] = [{ kind: 'new' }]
  for (const chat of projectChatRows(chats, query)) items.push({ kind: 'chat', chat })
  if (legacy) items.push({ kind: 'legacy', legacy })
  return items
}

/** The chat button's text */
export function projectChatTitle(
  lang: Lang,
  chats: readonly ProjectChatListItem[],
  currentChatId: ProjectId | null,
  options: { readonly legacyActive?: boolean; readonly currentTitle?: string } = {},
): string {
  if (options.legacyActive) return projectPanelText(lang, 'legacyChat')
  const found = currentChatId ? chats.find((c) => c.id === currentChatId) : undefined
  const title = (found?.title ?? options.currentTitle ?? '').trim()
  if (title) return title
  return found ? projectPanelText(lang, 'untitledChat') : projectPanelText(lang, 'newChat')
}

const EDITOR_KEY: Record<ProjectEditor, ProjectPanelStringKey> = {
  docs: 'editorDocs',
  sheets: 'editorSheets',
  slides: 'editorSlides',
  pdf: 'editorPdf',
  markdown: 'editorMarkdown',
  html: 'editorHtml',
  mindmap: 'editorMindmap',
  hwp: 'editorHwp',
  epub: 'editorEpub',
  home: 'editorHome',
}

/** The editor's name as the panel shows it ("Docs", "HWP", "Home", …) */
export function projectEditorLabel(lang: Lang, editor: ProjectEditor): string {
  return projectPanelText(lang, EDITOR_KEY[editor] ?? 'editorDocs')
}

/**
 * When a chat was last used, said briefly in the reader's language: "now",
 * "5 minutes ago", "yesterday", then a short date (with the year when it is
 * not this year). An unreadable time gives ''.
 */
export function projectRelativeTime(iso: string, now: number, lang: Lang): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const locale = htmlLang(lang)
  const seconds = Math.round((t - now) / 1000)
  const abs = Math.abs(seconds)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 6 * 86400) return rtf.format(Math.round(seconds / 86400), 'day')
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear()
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(t)
}

/** The full time, for a tooltip */
export function projectFullTime(iso: string, lang: Lang): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat(htmlLang(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(t)
}

// ────────────────────────────────────────────────────────────
// Notice and event lines
// ────────────────────────────────────────────────────────────

/** The button a notice line offers */
export type ProjectNoticeAction =
  /** "[View]": opens the home project screen at that section */
  | { readonly type: 'view'; readonly section: ProjectScreenSection }
  /** "[Tidy up]": the person-triggered memory consolidation */
  | { readonly type: 'consolidate' }

export interface ProjectNoticeView {
  readonly text: string
  /** `warning` for what loses data (chats and memory not saved); `info` otherwise */
  readonly tone: 'info' | 'warning'
  readonly action?: ProjectNoticeAction
}

/** What a notice line says and offers */
export function projectNoticeView(lang: Lang, notice: ProjectNotice): ProjectNoticeView {
  switch (notice.kind) {
    case 'instructions-changed':
      return {
        text: projectPanelText(lang, 'instructionsChanged'),
        tone: 'info',
        action: { type: 'view', section: 'instructions' },
      }
    case 'memory-changed':
      return {
        text: projectPanelText(lang, 'memoryChanged'),
        tone: 'info',
        action: { type: 'view', section: 'memory' },
      }
    case 'memory-long':
      return {
        text: projectPanelText(lang, 'memoryLong'),
        tone: 'info',
        action: { type: 'consolidate' },
      }
    case 'instructions-truncated':
      return { text: projectPanelText(lang, 'instructionsTruncated'), tone: 'info' }
    case 'unwritable':
      return { text: projectPanelText(lang, 'unwritable'), tone: 'warning' }
    case 'sync-folder':
      // the service is never named: "that service" in every language
      return { text: projectPanelText(lang, 'syncFolder'), tone: 'info' }
  }
}

/** The label of a notice action's button */
export function projectNoticeActionLabel(lang: Lang, action: ProjectNoticeAction): string {
  return projectPanelText(lang, action.type === 'view' ? 'view' : 'consolidate')
}

/** "Remembered: …", "Memory changed: …" or "Memory removed: …" for one `project_remember` change */
export function projectMemoryEventText(lang: Lang, change: ProjectMemoryOp): string {
  switch (change.op) {
    case 'add':
      return projectPanelText(lang, 'memoryAdded', { text: change.text })
    case 'replace':
      return projectPanelText(lang, 'memoryReplaced', { text: change.new })
    case 'remove':
      return projectPanelText(lang, 'memoryRemoved', { text: change.text })
  }
}

/** "Memory tidied up (N → M entries)" */
export function projectConsolidatedText(lang: Lang, before: number, after: number): string {
  return projectPanelText(lang, 'memoryConsolidated', { before, after })
}

/**
 * The one-line summary of another editor's tool records in a reopened chat:
 * "Ran tools 3 times in HWP 'report.hwp'". `documentName` is absent for the
 * home ask panel and untitled documents.
 */
export function projectToolSummaryText(
  lang: Lang,
  summary: {
    readonly editor: ProjectEditor
    readonly documentName?: string | undefined
    readonly count: number
  },
): string {
  const editor = projectEditorLabel(lang, summary.editor)
  const name = summary.documentName?.trim()
  const one = summary.count === 1
  if (name) {
    return projectPanelText(lang, one ? 'toolSummaryOne' : 'toolSummary', {
      editor,
      name,
      count: summary.count,
    })
  }
  return projectPanelText(lang, one ? 'toolSummaryNoNameOne' : 'toolSummaryNoName', {
    editor,
    count: summary.count,
  })
}

// ────────────────────────────────────────────────────────────
// Problems: what the person asked for did not happen
// ────────────────────────────────────────────────────────────

/**
 * Something the person should hear about because it did not go as asked:
 * a folder that cannot be a project, a new project that was not made, a
 * bridge call that failed, a send that went without the project's context,
 * or a [Tidy up] that did not finish. One warning line says it (spec 5.1).
 */
export type ProjectProblem =
  | { readonly kind: 'refused'; readonly reason: FolderRefusalReason }
  /** "new project": a folder of that name exists and was not used */
  | { readonly kind: 'exists'; readonly folderPath: string }
  | { readonly kind: 'invalid-name' }
  /** "new project": the folder or `project.json` could not be written */
  | { readonly kind: 'create-unwritable' }
  /** the bridge call itself failed */
  | { readonly kind: 'action-failed' }
  /** `prepareSend` did not find the project: this request went without its context */
  | { readonly kind: 'context'; readonly status: 'missing' | 'unknown' | 'failed' }
  | { readonly kind: 'consolidate-failed' }

const REFUSAL_KEY: Record<FolderRefusalReason, ProjectPanelStringKey> = {
  'drive-root': 'refusedDriveRoot',
  'user-home': 'refusedUserHome',
  protected: 'refusedProtected',
  'contains-protected': 'refusedContainsProtected',
  'not-a-folder': 'refusedNotFolder',
  'different-project': 'refusedDifferentProject',
}

/**
 * What an add-folder, relocate, adopt or new-project result has to say; null
 * when it went through (`added`, `created`) or the person closed a dialog.
 */
export function projectAddProblem(
  result: AddFolderResult | CreateProjectResult,
): ProjectProblem | null {
  switch (result.status) {
    case 'added':
    case 'created':
    case 'cancelled':
      return null
    case 'refused':
      return { kind: 'refused', reason: result.reason }
    case 'exists':
      return { kind: 'exists', folderPath: result.folderPath }
    case 'invalid-name':
      return { kind: 'invalid-name' }
    case 'unwritable':
      return { kind: 'create-unwritable' }
  }
}

/** What a send's `prepareSend` outcome has to say; null when the context came (or no project is chosen) */
export function projectPrepareProblem(prepared: ProjectRunPrepared): ProjectProblem | null {
  switch (prepared.status) {
    case 'none':
    case 'ok':
      return null
    case 'missing':
    case 'unknown':
    case 'failed':
      return { kind: 'context', status: prepared.status }
  }
}

const CONTEXT_KEY = {
  missing: 'contextMissing',
  unknown: 'contextUnknown',
  failed: 'contextFailed',
} as const satisfies Record<string, ProjectPanelStringKey>

/** The sentence of a problem line */
export function projectProblemText(lang: Lang, problem: ProjectProblem): string {
  switch (problem.kind) {
    case 'refused':
      return projectPanelText(lang, REFUSAL_KEY[problem.reason])
    case 'exists':
      return projectPanelText(lang, 'createExists', { path: problem.folderPath })
    case 'invalid-name':
      return projectPanelText(lang, 'createInvalidName')
    case 'create-unwritable':
      return projectPanelText(lang, 'createUnwritable')
    case 'action-failed':
      return projectPanelText(lang, 'actionFailed')
    case 'context':
      return projectPanelText(lang, CONTEXT_KEY[problem.status])
    case 'consolidate-failed':
      return projectPanelText(lang, 'consolidateFailed')
  }
}

// ────────────────────────────────────────────────────────────
// Another window's messages
// ────────────────────────────────────────────────────────────

/**
 * The transcript with another window's messages added (spec 5.3.3). They show
 * at once. While this panel's own reply is on its way (the last entry is an
 * assistant reply that is streaming, or `running`), they go in front of that
 * question and its reply, so the two stay the last entries: the panel keeps
 * writing the reply into the last entry, and stopping or retrying finds its
 * question right before it.
 */
export function placeRemoteEntries<
  T extends { readonly role: string; readonly streaming?: boolean | undefined },
>(list: readonly T[], entries: readonly T[], running: boolean): T[] {
  if (entries.length === 0) return [...list]
  const last = list.at(-1)
  let at = list.length
  if (last?.role === 'assistant' && (running || last.streaming === true)) {
    at -= 1
    if (list[at - 1]?.role === 'user') at -= 1
  }
  return [...list.slice(0, at), ...entries, ...list.slice(at)]
}
