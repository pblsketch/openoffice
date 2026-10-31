/**
 * The home ask panel with a project folder chosen (spec 5.2, 5.3.8, 5.5),
 * kept free of React so the decisions can be tested on their own: how a run
 * opens its knowledge scope, how a failed open is worded, and what a stored
 * chat message shows and what a run records.
 */
import {
  CREATE_DOCUMENT_TOOL,
  USE_SKILL_TOOL,
  USER_SKILL_TOOL_NAMES,
  type AgentToolCall,
  type ToolExecution,
} from '@genoffice/agent-core'
import type { ProjectId, ToolActivity } from '@genoffice/project-store'
import { PROJECT_TOOLS } from '@genoffice/ui'
import type { HomeApi } from '../../shared/home-api'

/** one tool a turn used, badge-shaped; the icon follows the kind */
export interface ToolNote {
  label: string
  /**
   * 'skill': "<title> skill used"; 'create': a new document is being made;
   * 'created': it was saved in the chosen project's folder (`path`, [Open])
   */
  kind: 'search' | 'read' | 'skill' | 'create' | 'created'
  /** the saved document, for a 'created' note */
  path?: string
}

/** what `kb:open-scope` takes from the home ask with a project chosen (see parseKbOpenScope in main) */
export interface KbProjectScopeRequest {
  /** the starred part: one group, or null for every starred file */
  group: string | null
  projectId: ProjectId
}

/**
 * The knowledge scope of one ask. Without a project: none for "All" (an
 * unscoped ask, as before) or the group's scope. With a project: always a
 * scope, covering the project folder plus the starred part (All or the
 * group), so every knowledge call of the run can also reach the folder.
 * Main's `kb:open-scope` takes `{ group, projectId }` for that (parseKbOpenScope).
 */
export async function openAskScope(
  api: Pick<HomeApi, 'kbOpenScope'>,
  group: string | null,
  projectId: ProjectId | null,
): Promise<string | undefined> {
  if (projectId === null) return group === null ? undefined : api.kbOpenScope(group)
  const request: KbProjectScopeRequest = { group, projectId }
  return api.kbOpenScope(request)
}

/** main's refusal of a group with no starred files (KB_GROUP_EMPTY in knowledge-base.ts) */
const GROUP_EMPTY_TEXT = 'group has no starred files'

/**
 * Why a scope could not be opened: the chosen group has no starred files any
 * more, or (with a project) the project's folder is gone or it left the list.
 */
export function askScopeFailure(
  error: unknown,
  projectId: ProjectId | null,
): 'group-gone' | 'project-missing' {
  if (projectId === null) return 'group-gone'
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(GROUP_EMPTY_TEXT) ? 'group-gone' : 'project-missing'
}

const PROJECT_TOOL_NAMES = new Set<string>(Object.values(PROJECT_TOOLS))

/** the project tools show their own line once they ran (the remember tool shows a memory line) */
export function isProjectTool(name: string): boolean {
  return PROJECT_TOOL_NAMES.has(name)
}

/**
 * The badge a finished project tool shows (its summary is already worded in
 * the UI language, failures included); null for a memory change that went
 * through, which shows as a memory line instead.
 */
export function projectToolNote(name: string, summary: string, isError?: boolean): ToolNote | null {
  if (name === PROJECT_TOOLS.remember && !isError) return null
  return { label: summary, kind: name === PROJECT_TOOLS.search ? 'search' : 'read' }
}

/** the panel's words for the knowledge tools */
export interface AskToolLabels {
  search: string
  read: string
  create: string
}

/** the badge of a knowledge, document or other tool as it starts */
export function startedToolNote(name: string, labels: AskToolLabels): ToolNote {
  if (name === 'search_knowledge_base') return { label: labels.search, kind: 'search' }
  if (name === CREATE_DOCUMENT_TOOL) return { label: labels.create, kind: 'create' }
  return { label: labels.read, kind: 'read' }
}

/** the badges of a stored message's tool records, as the panel showed them when they ran */
export function storedToolNotes(
  tools: readonly ToolActivity[] | undefined,
  labels: AskToolLabels,
): ToolNote[] {
  const notes: ToolNote[] = []
  for (const tool of tools ?? []) {
    if (isProjectTool(tool.name)) {
      const note = projectToolNote(tool.name, tool.summary, tool.isError)
      if (note) notes.push(note)
    } else if (USER_SKILL_TOOL_NAMES.has(tool.name)) {
      if (tool.name === USE_SKILL_TOOL && !tool.isError) {
        notes.push({ label: tool.summary, kind: 'skill' })
      }
    } else {
      notes.push(startedToolNote(tool.name, labels))
    }
  }
  return notes
}

/**
 * One tool record of a run as the project chat keeps it. Only the remember
 * tool keeps its output (the memory line is rebuilt from it when the chat is
 * opened again); what the knowledge and project tools read stays out of the
 * chat file, which lives in the person's folder.
 */
export function toolRecordOf(call: AgentToolCall, execution: ToolExecution): ToolActivity {
  return {
    name: call.name,
    summary: execution.summary,
    ...(execution.isError ? { isError: true } : {}),
    ...(call.name === PROJECT_TOOLS.remember && execution.output
      ? { output: execution.output }
      : {}),
  }
}

/** Whether `path` lies inside `folder` (either separator, case-insensitive on Windows-style paths) */
export function pathInsideFolder(path: string, folder: string): boolean {
  const norm = (value: string) => value.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  const windowsLike = /^[A-Za-z]:/.test(folder) || folder.includes('\\')
  const a = windowsLike ? norm(path).toLowerCase() : norm(path)
  const b = windowsLike ? norm(folder).toLowerCase() : norm(folder)
  return b !== '' && a.startsWith(`${b}/`)
}

/**
 * The notes after `create_document` saved `path`. Inside the chosen project's
 * folder the "making a document" note becomes "saved in the project folder:
 * <name>" with the path to open (the step is done); anywhere else, or
 * without a project, the notes stay as they were.
 */
export function notesAfterCreate(
  notes: readonly ToolNote[],
  path: string | undefined,
  projectFolder: string | null | undefined,
  savedLabel: (name: string) => string,
): ToolNote[] | null {
  if (!path || !projectFolder || !pathInsideFolder(path, projectFolder)) return null
  const name = path.split(/[\\/]/).pop() || path
  const done: ToolNote = { label: savedLabel(name), kind: 'created', path }
  const at = notes.map((note) => note.kind).lastIndexOf('create')
  return at < 0 ? [...notes, done] : notes.map((note, i) => (i === at ? done : note))
}
