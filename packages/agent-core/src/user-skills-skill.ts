import type { AgentMessage, AgentToolCall, AgentToolDef, ToolExecution } from './types'
import { RESERVED_USER_SKILL_NAMES } from './user-skill-names'
import type { AgentSkill } from './skill'

/**
 * The person's skills as app tools of the regular AI panels and the home ask
 * panel (spec 5.5, 5.6, 5.8).
 *
 * The app defines and runs every tool here; the subscription program gets no
 * tool of its own. `use_skill` and `read_skill_file` only read through the
 * injected deps (the shell's main process checks every request again), and
 * `propose_skill` never writes: it hands the proposal to `onProposal`, which
 * shows a card, and the person's Save on that card is the only write. No
 * script of a skill ever runs.
 *
 * Like the knowledge base, the capability is storage-agnostic: deps inject a
 * synchronous list snapshot (the loop reads the prompt synchronously) and the
 * two reads, so it carries no Electron dependency and is testable with mocks.
 */

export const USE_SKILL_TOOL = 'use_skill'
export const READ_SKILL_FILE_TOOL = 'read_skill_file'
export const PROPOSE_SKILL_TOOL = 'propose_skill'

/** The names of the three skill tools */
export const USER_SKILL_TOOL_NAMES: ReadonlySet<string> = new Set([
  USE_SKILL_TOOL,
  READ_SKILL_FILE_TOOL,
  PROPOSE_SKILL_TOOL,
])

/** First words of a proposal's tool result, then its name as JSON (stored chats read it back) */
const PROPOSAL_SHOWN_PREFIX = 'Skill card shown: '

/** The name (a title in older chats) a stored `propose_skill` result names, or '' */
export function proposedTitleOf(output: string | undefined): string {
  if (!output?.startsWith(PROPOSAL_SHOWN_PREFIX)) return ''
  const line = output.slice(PROPOSAL_SHOWN_PREFIX.length).split('\n', 1)[0]!
  try {
    const title: unknown = JSON.parse(line)
    return typeof title === 'string' ? title : ''
  } catch {
    return ''
  }
}

/** Characters of one skill's description in the instruction's list (tunable) */
export const AUTO_SKILL_DESCRIPTION_MAX = 300
/** Skills listed with their descriptions (tunable); later ones keep their names only */
export const AUTO_SKILLS_MAX = 100
/** Further skills listed by name only (tunable); the rest is left out */
export const AUTO_SKILLS_NAMES_ONLY_MAX = 200
/** Characters of a title in the list */
const AUTO_SKILL_TITLE_MAX = 120

/**
 * Text files `read_skill_file` reads (spec 5.8). Keep in sync with
 * SKILL_TEXT_EXTENSIONS in @genoffice/ai-provider (this package must not
 * depend on it: ai-provider imports this package).
 */
export const SKILL_TEXT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.xml',
  '.html',
  '.css',
])

export { RESERVED_USER_SKILL_NAMES } from './user-skill-names'

/** One skill of the list as this capability reads it */
export interface UserSkillEntry {
  /** `source:name`, `plugin:<plugin>:<name>` */
  id: string
  source: string
  name: string
  title: string
  description: string
  enabled: boolean
  invoke: 'auto' | 'manual'
  agentOnly: boolean
  hidden: boolean
  unreadable: boolean
  /** enabled but pushed back by an enabled skill of the same name (spec 4.4) */
  shadowedBy: string | undefined
  /** the skill lives in the app's own skills folder */
  owned: boolean
}

/** A skill's text as `use_skill` gets it */
export interface UserSkillText {
  id: string
  name: string
  title: string
  /** SKILL.md after the front matter */
  body: string
  /** the folder's other text files, `/` between parts */
  files: string[]
  /** the template path when the skill names one that is there */
  template: string | undefined
  hasScripts: boolean
}

export type UserSkillRead<T> = ({ ok: true } & T) | { ok: false; reason: string }

/** A skill the model asked to make or change (spec 5.6); nothing is written yet */
export interface SkillProposal {
  /** unique per proposal (the tool call's id) */
  key: string
  title: string
  /** the English name the model suggested; '' when it gave none */
  name: string
  description: string
  body: string
  /** the model thinks the current document should go along as a template */
  wantsTemplate: boolean
  /** the skill being changed; undefined for a new skill */
  target: { id: string; name: string; title: string; owned: boolean; source: string } | undefined
}

/** Display words for the tool rows (the panel passes its UI language) */
export interface UserSkillLabels {
  /** "<title> skill used" */
  used(title: string): string
  /** the tool row of a proposal */
  proposed(title: string): string
}

export interface UserSkillsDeps {
  /** the skill list as of now (a synchronous snapshot) */
  list(): readonly UserSkillEntry[]
  /**
   * read the list again now; `use_skill` and `read_skill_file` call it once
   * for an id the snapshot does not have before refusing (spec 9.2)
   */
  reload?: (() => Promise<void>) | undefined
  /** `use_skill`: the skill's text; the main process refuses again */
  read(id: string): Promise<UserSkillRead<{ skill: UserSkillText }>>
  /** `read_skill_file`: one text file in the skill's folder; the main process refuses again */
  readFile(id: string, path: string): Promise<UserSkillRead<{ text: string }>>
  /** show the card; never writes */
  onProposal(proposal: SkillProposal): void
  /** a skill was used on the model's own choice (the template flow offers its template) */
  onUsed?: ((skill: UserSkillText) => void) | undefined
  /** the conversation so far: skills the last request carries are not listed again */
  messages?: (() => readonly AgentMessage[]) | undefined
  labels?: UserSkillLabels | undefined
  /** the title shown for a skill (builtins in the UI language); the list title by default */
  displayTitle?:
    ((skill: { id: string; source: string; name: string; title: string }) => string) | undefined
  /** limits of the instruction's list */
  limits?: Partial<AutoSkillsLimits> | undefined
}

export interface AutoSkillsLimits {
  descriptionMax: number
  max: number
  namesMax: number
}

const DEFAULT_LABELS: UserSkillLabels = {
  used: (title) => `Used the ${title} skill`,
  proposed: (title) => `Skill proposal: ${title}`,
}

// ---- the list in the instruction ----------------------------------------

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}

/** Whether the model may pick a skill on its own (spec 5.5) */
function isAutoSkill(skill: UserSkillEntry): boolean {
  return (
    skill.enabled &&
    !skill.hidden &&
    !skill.unreadable &&
    !skill.agentOnly &&
    skill.invoke === 'auto' &&
    !skill.shadowedBy &&
    !RESERVED_USER_SKILL_NAMES.has(skill.name.toLowerCase())
  )
}

/**
 * The list of skills the model may use on its own: enabled, "used on its
 * own", not agent-only, not pushed back by a skill of the same name, and not
 * attached to this request already. Up to `max` skills carry their
 * description (cut at `descriptionMax`); `namesMax` more keep their id and
 * title only; the rest is left out. Empty when nothing is listed.
 */
export function autoSkillsSection(
  skills: readonly UserSkillEntry[],
  options: Partial<AutoSkillsLimits> & {
    attached?: readonly string[] | undefined
    displayTitle?: UserSkillsDeps['displayTitle']
  } = {},
): string {
  const descriptionMax = options.descriptionMax ?? AUTO_SKILL_DESCRIPTION_MAX
  const max = options.max ?? AUTO_SKILLS_MAX
  const namesMax = options.namesMax ?? AUTO_SKILLS_NAMES_ONLY_MAX
  const attached = new Set(options.attached ?? [])
  const listed = skills.filter((s) => isAutoSkill(s) && !attached.has(s.id))
  if (listed.length === 0) return ''
  const titleOf = (s: UserSkillEntry) =>
    clip(options.displayTitle?.(s) || s.title || s.name, AUTO_SKILL_TITLE_MAX)
  const full = listed
    .slice(0, max)
    .map((s) => `- ${s.id} | ${titleOf(s)} | ${clip(s.description, descriptionMax)}`)
  const namesOnly = listed.slice(max, max + namesMax).map((s) => `- ${s.id} | ${titleOf(s)}`)
  const dropped = listed.length - full.length - namesOnly.length
  const lines = [...full, ...namesOnly]
  if (dropped > 0) lines.push(`(${dropped} more skills are not listed.)`)
  return `Skills you may use on your own (id | title | description):\n${lines.join('\n')}`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Undo the attribute escaping of the request's skill blocks */
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

/**
 * The skill ids of the `<skill id="…">` blocks the app adds to a request for
 * the skills the person chose (see skillRequestText in @genoffice/ui).
 */
export function attachedSkillIdsOf(text: string): string[] {
  const ids: string[] = []
  for (const match of text.matchAll(/<skill id="([^"]*)"/g)) {
    const id = unescapeAttr(match[1]!)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function lastUserText(messages: readonly AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'user') return m.text
  }
  return ''
}

// ---- tool texts -----------------------------------------------------------

const SKILLS_SYSTEM_PROMPT = `## Skills
The person keeps skills: instructions for work they do again and again.
- When a request matches a skill in the list below, call use_skill with its id
  before you start, then follow what it returns. Read another file of the skill
  with read_skill_file only when its text points you to one.
- A skill the person chose for this request is already in their message (a
  <skill id="…"> block); follow it there and do not call use_skill for it.
- Scripts of a skill never run here; do not ask for them to be run.
- When the person asks to save the work as a skill, or to make or change a
  skill, call propose_skill. It shows them a card to check; nothing is saved
  until they press Save on it, so never say the skill was saved.`

const PROPOSE_DESCRIPTION =
  'Show the person a card with a skill to save: a new skill, or a change to an existing one ' +
  '(give targetId). This tool never saves anything; the person checks the card and presses ' +
  'Save. When you make a skill from the conversation, keep what would repeat: the order of ' +
  'steps, the rules, the tone and wording, the checks before finishing. Leave out values used ' +
  'only once (names of people, dates, this particular content): list them in the body as ' +
  'values given each time instead. Write the body as instructions to an assistant, in the ' +
  'language of the conversation. Set wantsTemplate when the finished document itself should ' +
  'be kept as a template to fill in next time.'

function tools(): AgentToolDef[] {
  return [
    {
      name: USE_SKILL_TOOL,
      description:
        'Load one of the person’s enabled skills by its id from the skills list: returns its ' +
        'instructions, the list of its other text files and whether it has a template document.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'the skill id, e.g. app:home-letter' } },
        required: ['id'],
      },
    },
    {
      name: READ_SKILL_FILE_TOOL,
      description:
        'Read one text file (.md, .txt, .json, .yaml, .yml, .csv, .xml, .html, .css) inside an ' +
        'enabled skill’s folder, by its path inside the folder as use_skill listed it.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'the skill id' },
          path: {
            type: 'string',
            description: 'path inside the skill folder, e.g. reference/tone.md',
          },
        },
        required: ['id', 'path'],
      },
    },
    {
      name: PROPOSE_SKILL_TOOL,
      description: PROPOSE_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'the name the person sees in the skill list and types after / to call it: English ' +
              'words saying what the skill does, lowercase letters, digits and hyphens, 1-64 ' +
              'characters, e.g. meeting-minutes',
          },
          description: {
            type: 'string',
            description: 'one or two sentences: what the skill does and when to use it',
          },
          body: { type: 'string', description: 'the instructions (Markdown)' },
          wantsTemplate: {
            type: 'boolean',
            description: 'keep the current document as the skill’s template',
          },
          targetId: {
            type: 'string',
            description: 'id of the existing skill to change; leave out for a new skill',
          },
        },
        required: ['name', 'description', 'body'],
      },
    },
  ]
}

function refusalText(reason: string, id: string): string {
  switch (reason) {
    case 'not-found':
      return `No skill with id ${id}. Use an id from the skills list.`
    case 'disabled':
    case 'hidden':
      return `The skill ${id} is turned off. The person can turn it on in Settings → Skills.`
    case 'agent-only':
      return `The skill ${id} is for the agent window only.`
    case 'unreadable':
      return `The skill ${id} cannot be read.`
    default:
      return `The skill ${id} could not be read.`
  }
}

function fileRefusalText(reason: string, id: string, path: string): string {
  switch (reason) {
    case 'outside':
      return `${path} is not a file inside the skill folder of ${id}.`
    case 'not-text':
      return `Only text files can be read (${[...SKILL_TEXT_FILE_EXTENSIONS].join(', ')}).`
    case 'too-large':
      return `${path} is too large to read.`
    case 'not-found':
      return `No file ${path} in the skill ${id}.`
    default:
      return refusalText(reason, id)
  }
}

/** Why a skill may not be used or read here; undefined when it may */
function entryRefusal(entry: UserSkillEntry | undefined, id: string): string | undefined {
  if (!entry || RESERVED_USER_SKILL_NAMES.has(entry.name.toLowerCase()))
    return refusalText('not-found', id)
  if (entry.agentOnly) return refusalText('agent-only', id)
  if (entry.unreadable) return refusalText('unreadable', id)
  if (!entry.enabled || entry.hidden) return refusalText('disabled', id)
  return undefined
}

/** Whether a path stays inside a skill folder as written (the main process checks the real place) */
function pathLeavesFolder(path: string): boolean {
  const wanted = path.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!wanted || wanted.startsWith('/') || /^[A-Za-z]:/.test(wanted)) return true
  return wanted.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function extensionOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').at(-1) ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const fail = (output: string, summary: string): ToolExecution => ({
  output,
  isError: true,
  summary,
})

// ---- the capability -------------------------------------------------------

export function createUserSkillsSkill(deps: UserSkillsDeps): AgentSkill {
  const labels = deps.labels ?? DEFAULT_LABELS
  const toolDefs = tools()
  const find = (id: string) => deps.list().find((s) => s.id === id)
  /** the entry, reading the list again once when the snapshot does not have it yet */
  const findFresh = async (id: string): Promise<UserSkillEntry | undefined> => {
    const known = find(id)
    if (known || !id || !deps.reload) return known
    await deps.reload().catch(() => undefined)
    return find(id)
  }
  const titleOf = (skill: { id: string; source: string; name: string; title: string }) =>
    deps.displayTitle?.(skill) || skill.title || skill.name
  const attached = () => attachedSkillIdsOf(lastUserText(deps.messages?.() ?? []))

  const useSkill = async (call: AgentToolCall): Promise<ToolExecution> => {
    const id = str(call.input.id).trim()
    const entry = await findFresh(id)
    const refusal = entryRefusal(entry, id)
    if (refusal || !entry) return fail(refusal ?? refusalText('not-found', id), USE_SKILL_TOOL)
    const title = titleOf(entry)
    if (attached().includes(id)) {
      return {
        output: `The skill ${id} is already in the person’s message for this request; follow it there.`,
        summary: labels.used(title),
      }
    }
    const read = await deps.read(id).catch(() => null)
    if (!read || !read.ok) {
      return fail(refusalText(read ? read.reason : 'failed', id), USE_SKILL_TOOL)
    }
    const skill = read.skill
    deps.onUsed?.(skill)
    const lines = [
      `<skill id="${escapeAttr(id)}" title="${escapeAttr(title)}">`,
      skill.body.trim(),
      '</skill>',
      skill.files.length > 0
        ? `Other text files in this skill's folder (read with read_skill_file): ${skill.files.join(', ')}`
        : 'Other text files in this skill’s folder: none',
      skill.template
        ? `Template document: ${skill.template}. The app offers the person to open a copy of it as a new document; do not try to open it yourself.`
        : 'Template document: none',
    ]
    if (skill.hasScripts) {
      lines.push('This skill has scripts; scripts are not run here. Do the work without them.')
    }
    return { output: lines.join('\n'), summary: labels.used(title) }
  }

  const readSkillFile = async (call: AgentToolCall): Promise<ToolExecution> => {
    const id = str(call.input.id).trim()
    const path = str(call.input.path).trim()
    const entry = await findFresh(id)
    const refusal = entryRefusal(entry, id)
    if (refusal || !entry)
      return fail(refusal ?? refusalText('not-found', id), READ_SKILL_FILE_TOOL)
    if (pathLeavesFolder(path)) return fail(fileRefusalText('outside', id, path), path)
    if (!SKILL_TEXT_FILE_EXTENSIONS.has(extensionOf(path))) {
      return fail(fileRefusalText('not-text', id, path), path)
    }
    const read = await deps.readFile(id, path).catch(() => null)
    if (!read || !read.ok)
      return fail(fileRefusalText(read ? read.reason : 'failed', id, path), path)
    return {
      output: `${path} (skill ${id}):\n\n${read.text}`,
      summary: `${titleOf(entry)} · ${path}`,
    }
  }

  const proposeSkill = (call: AgentToolCall): ToolExecution => {
    const name = str(call.input.name).trim()
    // older prompts gave a title instead; the card makes a name from it
    const title = str(call.input.title).trim()
    const label = name || title
    const body = str(call.input.body)
    if (!label) return fail('name must not be empty', PROPOSE_SKILL_TOOL)
    if (!body.trim()) return fail('body must not be empty', PROPOSE_SKILL_TOOL)
    const targetId = str(call.input.targetId).trim()
    let target: SkillProposal['target']
    if (targetId) {
      const entry = find(targetId)
      if (!entry || RESERVED_USER_SKILL_NAMES.has(entry.name.toLowerCase())) {
        return fail(refusalText('not-found', targetId), PROPOSE_SKILL_TOOL)
      }
      if (entry.agentOnly) return fail(refusalText('agent-only', targetId), PROPOSE_SKILL_TOOL)
      if (entry.unreadable) return fail(refusalText('unreadable', targetId), PROPOSE_SKILL_TOOL)
      if (entry.source === 'project')
        return fail(refusalText('not-found', targetId), PROPOSE_SKILL_TOOL)
      target = {
        id: entry.id,
        name: entry.name,
        title: titleOf(entry),
        owned: entry.owned,
        source: entry.source,
      }
    }
    deps.onProposal({
      key: call.id,
      title,
      name,
      description: str(call.input.description).trim(),
      body,
      wantsTemplate: call.input.wantsTemplate === true,
      target,
    })
    return {
      output:
        `${PROPOSAL_SHOWN_PREFIX}${JSON.stringify(label)}\n` +
        'The skill card is shown to the person in the chat. Nothing is saved until they press ' +
        'Save on it, so it is not saved yet. Tell them briefly what the card holds and that they ' +
        'can change it before saving.',
      summary: labels.proposed(label),
    }
  }

  return {
    id: 'user-skills',
    get systemPrompt() {
      const list = autoSkillsSection(deps.list(), {
        ...deps.limits,
        attached: attached(),
        displayTitle: deps.displayTitle,
      })
      return list ? `${SKILLS_SYSTEM_PROMPT}\n\n${list}` : SKILLS_SYSTEM_PROMPT
    },
    tools: toolDefs,
    executeTool: async (call) => {
      if (call.name === USE_SKILL_TOOL) return useSkill(call)
      if (call.name === READ_SKILL_FILE_TOOL) return readSkillFile(call)
      if (call.name === PROPOSE_SKILL_TOOL) return proposeSkill(call)
      return fail(`unknown tool: ${call.name}`, call.name)
    },
  }
}

// ---- over the window's bridge ---------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The list answer of the bridge as entries: well-formed ones only */
export function userSkillEntriesOf(raw: unknown): UserSkillEntry[] {
  if (!Array.isArray(raw)) return []
  const out: UserSkillEntry[] = []
  for (const view of raw) {
    if (!isRecord(view)) continue
    const id = str(view.id)
    const name = str(view.name)
    if (!id.includes(':') || !name) continue
    if (RESERVED_USER_SKILL_NAMES.has(name.toLowerCase())) continue
    out.push({
      id,
      source: str(view.source) || id.split(':')[0]!,
      name,
      title: str(view.title) || name,
      description: str(view.description),
      enabled: view.enabled === true,
      invoke: view.invoke === 'manual' ? 'manual' : 'auto',
      agentOnly: view.agentOnly === true,
      hidden: view.hidden === true,
      unreadable: !!view.unreadable,
      shadowedBy:
        typeof view.shadowedBy === 'string' && view.shadowedBy ? view.shadowedBy : undefined,
      owned: view.owned === true,
    })
  }
  return out
}

function reasonOf(raw: unknown): { ok: false; reason: string } {
  const reason = isRecord(raw) ? raw.reason : undefined
  return { ok: false, reason: typeof reason === 'string' && reason ? reason : 'failed' }
}

/** An `aiRead` answer that crossed the preload boundary */
export function skillTextAnswerOf(raw: unknown): UserSkillRead<{ skill: UserSkillText }> {
  if (!isRecord(raw) || raw.ok !== true || !isRecord(raw.skill)) return reasonOf(raw)
  const s = raw.skill
  if (typeof s.id !== 'string' || typeof s.body !== 'string') return reasonOf(null)
  return {
    ok: true,
    skill: {
      id: s.id,
      name: str(s.name),
      title: str(s.title) || str(s.name) || s.id,
      body: s.body,
      files: Array.isArray(s.files)
        ? s.files.filter((f): f is string => typeof f === 'string')
        : [],
      template: typeof s.template === 'string' && s.template ? s.template : undefined,
      hasScripts: s.hasScripts === true,
    },
  }
}

/** An `aiReadFile` answer that crossed the preload boundary */
export function skillFileAnswerOf(raw: unknown): UserSkillRead<{ text: string }> {
  if (!isRecord(raw) || raw.ok !== true || typeof raw.text !== 'string') return reasonOf(raw)
  return { ok: true, text: raw.text }
}

/** The calls of `window.aiOfficeUserSkills` this capability uses */
export interface UserSkillsBridgeLike {
  list(): Promise<unknown>
  aiRead(id: string): Promise<unknown>
  aiReadFile(id: string, path: string): Promise<unknown>
  onChanged(listener: () => void): () => void
}

/** The skills bridge of this window when it carries the calls (an older preload or a test mock may not) */
export function windowUserSkillsBridge(): UserSkillsBridgeLike | null {
  const b = (globalThis as { aiOfficeUserSkills?: Partial<UserSkillsBridgeLike> })
    .aiOfficeUserSkills
  return b &&
    typeof b.list === 'function' &&
    typeof b.aiRead === 'function' &&
    typeof b.aiReadFile === 'function' &&
    typeof b.onChanged === 'function'
    ? (b as UserSkillsBridgeLike)
    : null
}

export interface UserSkillsSkill extends AgentSkill {
  /** read the list again now */
  refresh(): void
  /** stop following the list's changes */
  dispose(): void
}

/**
 * The capability over the window's skills bridge. The list is kept here and
 * read again whenever the main process says it changed, because the loop
 * reads the prompt synchronously. Reading the list never calls a model.
 */
export function createBridgedUserSkillsSkill(
  bridge: UserSkillsBridgeLike,
  options: Omit<UserSkillsDeps, 'list' | 'read' | 'readFile'>,
): UserSkillsSkill {
  let entries: UserSkillEntry[] = []
  let seq = 0
  /** read the list; an older read that answers later does not overwrite a newer one */
  const reload = async () => {
    const mine = ++seq
    const raw = await bridge.list()
    if (mine === seq) entries = userSkillEntriesOf(raw)
  }
  const refresh = () => {
    void reload().catch(() => undefined)
  }
  refresh()
  const off = bridge.onChanged(refresh)
  const skill = createUserSkillsSkill({
    ...options,
    list: () => entries,
    reload,
    read: async (id) => skillTextAnswerOf(await bridge.aiRead(id).catch(() => null)),
    readFile: async (id, path) =>
      skillFileAnswerOf(await bridge.aiReadFile(id, path).catch(() => null)),
  })
  return {
    id: skill.id,
    get systemPrompt() {
      return skill.systemPrompt
    },
    tools: skill.tools,
    executeTool: (call, signal) => skill.executeTool(call, signal),
    refresh,
    dispose: off,
  }
}
