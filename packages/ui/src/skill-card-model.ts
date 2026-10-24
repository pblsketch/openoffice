import { proposedTitleOf, type SkillProposal } from '@genoffice/agent-core'
import type { SkillCardStringKey } from './strings-skill-card'

/**
 * The rules of the skill card (spec 5.6) as plain functions: the card's mode,
 * its starting fields, when Save is blocked and why, what Save hands to the
 * shell, and how a stored conversation keeps the card. The component lays
 * these out; it writes nothing itself (the shell's main process does, on Save).
 */

// ---- the bridge the card uses ----------------------------------------------

export type SkillNameProblem =
  'empty' | 'too-long' | 'characters' | 'hyphen-edge' | 'double-hyphen' | 'reserved' | 'taken'

export type SkillNameCheck = { ok: true } | { ok: false; problem: SkillNameProblem }

/** The template a card saves along (the template flow fills it) */
export interface SkillCardTemplate {
  /** the document's bytes (read in the main process, or an edited copy) */
  bytes: Uint8Array
  /** the file name under `assets/`, with the extension */
  fileName: string
}

/** What the card's Save hands to the shell (`saveFromCard`) */
export interface SkillCardSaveInput {
  title: string
  name: string
  description: string
  body: string
  invoke: 'auto' | 'manual'
  template?: SkillCardTemplate | undefined
  targetId?: string | undefined
  overwrite?: boolean | undefined
}

/** The calls of `window.aiOfficeUserSkills` the card uses */
export interface SkillCardBridge {
  suggestName(title: string): Promise<string>
  checkName(name: string, forId?: string): Promise<unknown>
  saveFromCard(input: SkillCardSaveInput): Promise<unknown>
  openSettings(): Promise<void>
}

/** The card's bridge of this window, or null (tests, a window with no shell behind it) */
export function skillCardBridge(): SkillCardBridge | null {
  const b = (globalThis as { aiOfficeUserSkills?: Partial<SkillCardBridge> }).aiOfficeUserSkills
  return b &&
    typeof b.suggestName === 'function' &&
    typeof b.checkName === 'function' &&
    typeof b.saveFromCard === 'function' &&
    typeof b.openSettings === 'function'
    ? (b as SkillCardBridge)
    : null
}

const NAME_PROBLEMS: ReadonlySet<string> = new Set([
  'empty',
  'too-long',
  'characters',
  'hyphen-edge',
  'double-hyphen',
  'reserved',
  'taken',
])

/** A `checkName` answer that crossed the preload boundary */
export function skillNameCheckOf(raw: unknown): SkillNameCheck {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { ok?: unknown; problem?: unknown }
  if (r.ok === true) return { ok: true }
  const problem =
    typeof r.problem === 'string' && NAME_PROBLEMS.has(r.problem) ? r.problem : 'empty'
  return { ok: false, problem: problem as SkillNameProblem }
}

export type SkillCardSaveResult =
  { ok: true; id: string } | { ok: false; reason: string; problem?: string }

/** A `saveFromCard` answer that crossed the preload boundary */
export function skillCardSaveResultOf(raw: unknown): SkillCardSaveResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.ok === true && typeof r.id === 'string' && r.id) return { ok: true, id: r.id }
  return {
    ok: false,
    reason: typeof r.reason === 'string' && r.reason ? r.reason : 'failed',
    ...(typeof r.problem === 'string' ? { problem: r.problem } : {}),
  }
}

// ---- the card --------------------------------------------------------------

/** new skill / change of an own skill / another source's skill copied into mine */
export type SkillCardMode = 'new' | 'edit-own' | 'copy'

export function skillCardMode(proposal: Pick<SkillProposal, 'target'>): SkillCardMode {
  if (!proposal.target) return 'new'
  return proposal.target.owned ? 'edit-own' : 'copy'
}

/** The fields the person edits */
export interface SkillCardDraft {
  title: string
  name: string
  description: string
  body: string
  invoke: 'auto' | 'manual'
  /** "save this document along as a template" is checked */
  withTemplate: boolean
}

/**
 * The card's starting fields: the model's text, its name (else the name of
 * the skill being changed; a new skill without one gets a suggested name),
 * "used on its own", and the template box checked when the model wants one.
 */
export function initialSkillCardDraft(proposal: SkillProposal): SkillCardDraft {
  return {
    title: proposal.title,
    name: proposal.name || proposal.target?.name || '',
    description: proposal.description,
    body: proposal.body,
    invoke: 'auto',
    withTemplate: proposal.wantsTemplate,
  }
}

/** The name is the changed skill's own name (kept as is; the strict rule is for new names) */
export function keepsTargetName(proposal: SkillProposal, name: string): boolean {
  return !!proposal.target && name.trim() === proposal.target.name
}

const NAME_KEYS: Record<SkillNameProblem, SkillCardStringKey> = {
  empty: 'nameEmpty',
  'too-long': 'nameTooLong',
  characters: 'nameCharacters',
  'hyphen-edge': 'nameHyphenEdge',
  'double-hyphen': 'nameDoubleHyphen',
  reserved: 'nameReserved',
  taken: 'nameTaken',
}

/** The line for a name problem */
export function skillNameProblemKey(problem: SkillNameProblem): SkillCardStringKey {
  return NAME_KEYS[problem]
}

/** A name check as the card reads it: still running, or the answer */
export type SkillCardNameState = 'checking' | SkillNameCheck

/**
 * What the name check means for Save. A copy that takes the name of one of
 * my skills replaces it (the notice says so); a new skill may not take a used
 * name; the changed skill's own name is kept whatever the strict rule says.
 */
export function skillCardNameVerdict(
  mode: SkillCardMode,
  proposal: SkillProposal,
  name: string,
  state: SkillCardNameState,
): { blocked: SkillCardStringKey | null; overwrite: boolean; notice: SkillCardStringKey | null } {
  if (!name.trim()) return { blocked: 'nameEmpty', overwrite: false, notice: null }
  if (state === 'checking') return { blocked: 'nameChecking', overwrite: false, notice: null }
  if (state.ok) return { blocked: null, overwrite: false, notice: null }
  if (state.problem === 'taken') {
    if (mode === 'copy') return { blocked: null, overwrite: true, notice: 'nameTakenReplace' }
    return { blocked: 'nameTaken', overwrite: false, notice: null }
  }
  if (keepsTargetName(proposal, name)) return { blocked: null, overwrite: false, notice: null }
  return { blocked: skillNameProblemKey(state.problem), overwrite: false, notice: null }
}

/**
 * Why Save is blocked, or null (spec 9.12): an empty description or body, or
 * a name the rule refuses. The description is required by the shell's save as
 * well. The title is optional: lists show the name.
 */
export function skillCardSaveBlock(
  draft: SkillCardDraft,
  nameBlock: SkillCardStringKey | null,
): SkillCardStringKey | null {
  if (!draft.description.trim()) return 'blockDescription'
  if (!draft.body.trim()) return 'blockBody'
  return nameBlock
}

/**
 * What Save hands to the shell. A change carries the skill it changes: the
 * shell rewrites an own skill, and copies another source's skill into mine
 * with the new text and turns the original off.
 */
export function skillCardSaveInput(
  draft: SkillCardDraft,
  proposal: SkillProposal,
  options: { overwrite?: boolean; template?: SkillCardTemplate | undefined } = {},
): SkillCardSaveInput {
  return {
    title: draft.title.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    body: draft.body,
    invoke: draft.invoke,
    ...(options.template ? { template: options.template } : {}),
    ...(proposal.target ? { targetId: proposal.target.id } : {}),
    ...(options.overwrite ? { overwrite: true } : {}),
  }
}

/** The line for a refused save */
export function skillCardSaveFailureKey(reason: string, problem?: string): SkillCardStringKey {
  switch (reason) {
    case 'empty-description':
      return 'blockDescription'
    case 'empty-body':
      return 'blockBody'
    case 'name-taken':
    case 'exists':
      return 'nameTaken'
    case 'bad-name':
      return problem && NAME_PROBLEMS.has(problem)
        ? skillNameProblemKey(problem as SkillNameProblem)
        : 'nameCharacters'
    case 'not-allowed':
      return 'noBridge'
    case 'trash-failed':
      return 'trashFailed'
    default:
      return 'saveFailed'
  }
}

// ---- in the conversation ----------------------------------------------------

/** Where a card stands: shown for editing, saved, or left unsaved */
export type SkillCardStatus = 'open' | 'saved' | 'unsaved'

/** A tool record as a stored conversation keeps it */
export interface StoredToolRecord {
  name: string
  summary: string
  isError?: boolean | undefined
  input?: string | undefined
  output?: string | undefined
}

/** A message as a stored conversation keeps it */
export interface StoredChatLike {
  role: 'user' | 'assistant'
  text: string
  tools?: readonly StoredToolRecord[] | undefined
}

/** The tool name a proposal's record carries (keep in sync with agent-core) */
const PROPOSE_TOOL = 'propose_skill'
/** A saved card's record starts its output with this */
const SAVED_MARKER = 'skill-card-saved:'

/**
 * The record a panel stores when a card is saved: an assistant message of
 * its own, with no text and one tool record. A reopened conversation reads
 * it back as "saved" and never hands it to the model.
 */
export interface SavedSkillCardRecord {
  name: string
  summary: string
  output: string
}

export function skillCardSavedRecord(title: string, id: string): SavedSkillCardRecord {
  return { name: PROPOSE_TOOL, summary: title, output: `${SAVED_MARKER}${id}` }
}

function isSavedRecord(tool: StoredToolRecord): boolean {
  return tool.name === PROPOSE_TOOL && !!tool.output?.startsWith(SAVED_MARKER)
}

/** Whether a stored message is a saved card's record (not part of the conversation) */
export function isSkillCardSavedMessage(message: StoredChatLike): boolean {
  return (
    message.role === 'assistant' &&
    !message.text &&
    (message.tools?.length ?? 0) > 0 &&
    message.tools!.every(isSavedRecord)
  )
}

/** A proposal a stored conversation kept: its title and whether it was saved */
export interface StoredSkillProposal {
  key: string
  title: string
  status: 'saved' | 'unsaved'
}

function storedTitle(tool: StoredToolRecord): string {
  const named = proposedTitleOf(tool.output)
  if (named) return named
  try {
    const input = JSON.parse(tool.input ?? '') as { name?: unknown; title?: unknown }
    for (const value of [input.name, input.title]) {
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  } catch {
    // a cut-off record keeps the tool row's words
  }
  return ''
}

/**
 * Read the cards back from a stored conversation: every successful proposal
 * record becomes a card that stays closed ("unsaved", or "saved" when a saved
 * record names it), and the saved records leave the conversation. Returns the
 * messages to show and restore, each with the keys of the cards it carries.
 */
export function readStoredSkillCards<T extends StoredChatLike>(
  messages: readonly T[],
  keyPrefix = 'stored',
): { messages: Array<T & { skillProposals?: string[] }>; proposals: StoredSkillProposal[] } {
  const proposals: StoredSkillProposal[] = []
  const savedTitles: string[] = []
  const kept: Array<T & { skillProposals?: string[] }> = []
  messages.forEach((message, i) => {
    if (isSkillCardSavedMessage(message)) {
      for (const tool of message.tools ?? []) savedTitles.push(tool.summary)
      return
    }
    const keys: string[] = []
    if (message.role === 'assistant') {
      message.tools?.forEach((tool, j) => {
        if (tool.name !== PROPOSE_TOOL || tool.isError || isSavedRecord(tool)) return
        const key = `${keyPrefix}-${i}-${j}`
        keys.push(key)
        proposals.push({ key, title: storedTitle(tool), status: 'unsaved' })
      })
    }
    kept.push(keys.length > 0 ? { ...message, skillProposals: keys } : message)
  })
  // a saved record names the proposal by its title: the latest such proposal was saved
  // (a record cut off by the store has no title: it takes a saved record no titled one did)
  const open = () => [...proposals].reverse().filter((p) => p.status === 'unsaved')
  for (const title of savedTitles) {
    const match = open().find((p) => p.title === title) ?? open().find((p) => p.title === '')
    if (match) match.status = 'saved'
  }
  return { messages: kept, proposals }
}
