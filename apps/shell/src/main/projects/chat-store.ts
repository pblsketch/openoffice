import { randomBytes } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import {
  isValidProjectId,
  PROJECT_EDITORS,
  PROJECT_FOLDER_NAMES,
  PROJECT_FORMAT_VERSION,
  type AppendProjectChatArgs,
  type AppendProjectChatResult,
  type ChatSkillChip,
  type ProjectChatAppendedEvent,
  type ProjectChatInfo,
  type ProjectChatListItem,
  type ProjectChatMessage,
  type ProjectChatRef,
  type ProjectEditor,
  type ProjectId,
  type ProjectWriteResult,
  type OpenProjectChatArgs,
  type OpenProjectChatResult,
  type RenameProjectChatArgs,
  type ToolActivity,
} from '@genoffice/project-store'
import { plainFileIn, plainFolderEntries, readFolderText } from './folder-files'
import type { ProjectGuide } from './project-guide'
import { hasForeignMessage } from './trust'

/**
 * Chats inside a project folder (spec 3, 5.3, 5.7): `.ieumoffice/chats/<chatId>.json`
 * holds the chat info and `<chatId>.jsonl` one message per line.
 *
 * The record format, the storage caps and the lenient tail reading mirror the
 * per-document project-store (its helpers are private, so they are repeated here
 * with the same values). Like there, nothing is written before the first
 * assistant reply: an aborted or failed first request leaves no file behind.
 *
 * Every write goes through the project guide (and so through its write guard).
 * A failed write marks the project unwritable for this app run; the messages it
 * carried stay in memory for this run and are written by a later append once the
 * folder can be written again. They are never written anywhere else.
 *
 * All work on one chat (appends from any window, rename, attach, delete, open)
 * runs one task at a time, so `seq` stays monotonic across windows: one counter
 * per chat, read from the file's maximum once.
 */

/** Characters of the first user message that become a chat's automatic title (spec 5.3) */
export const CHAT_TITLE_CHARS = 40

/** Longest title a rename keeps */
export const CHAT_TITLE_MAX_CHARS = 200

// Same values as project-store (`packages/project-store/src/store.ts`).
const TEXT_MAX_CHARS = 32_000
const TEXT_TRUNCATED_MARK = '\n\n[truncated]'
const TOOL_FIELD_MAX_CHARS = 16_000
const MAX_TOOLS_PER_MESSAGE = 64
const MAX_ATTACHMENTS_PER_MESSAGE = 32
const TOOL_NAME_MAX_CHARS = 200
const TOOL_SUMMARY_MAX_CHARS = 2_000
const ATTACHMENT_FIELD_MAX_CHARS = 1_000
const SCOPE_TEXT_MAX_CHARS = 400
const SCOPE_LABEL_MAX_CHARS = 200
const MAX_SKILLS_PER_MESSAGE = 32
const SKILL_ID_MAX_CHARS = 512
const SKILL_FIELD_MAX_CHARS = 200
/** Opening messages held before the first reply; reaching it writes the file early instead of dropping */
export const MAX_PENDING_OPENING_MESSAGES = 200

/**
 * Chats whose in-memory state is kept (tunable). A state with nothing unwritten
 * is rebuilt from the folder when needed (its next `seq` from the last message
 * on disk), so past this the least recently used idle ones are dropped; a chat
 * with unwritten messages, a rename or a task running is never dropped.
 */
export const CHAT_STATE_CACHE_LIMIT = 64

/** Foreign-message scans remembered (tunable); a dropped one is scanned again */
export const FOREIGN_SCAN_CACHE_LIMIT = 512
const DEFAULT_OPEN_LIMIT = 200
const MAX_OPEN_LIMIT = 10_000
const TAIL_READ_BYTES = 8 * 1024 * 1024
const TAIL_HARD_CAP_BYTES = 64 * 1024 * 1024

const { dataDir, chatsDir, chatInfoExt, chatMessagesExt } = PROJECT_FOLDER_NAMES

/** The guide calls the chat store uses */
export type ChatStoreGuide = Pick<
  ProjectGuide,
  | 'appendData'
  | 'updateData'
  | 'dataPath'
  | 'installId'
  | 'trustState'
  | 'isUnwritable'
  | 'markUnwritable'
  | 'projectRoot'
  | 'recordOutsideChat'
  | 'documentRelativePath'
  | 'getSelection'
>

/** Who records a message: the window's editor and its document, as main identified them */
export interface ChatSender {
  editor: ProjectEditor
  /** The window's saved document (absolute path); null for the home panel and untitled documents */
  docPath: string | null
  /** Opaque tag handed back to append listeners (for example the sending window), never stored */
  key?: unknown
}

export type ChatAppendedListener = (event: ProjectChatAppendedEvent, sender: ChatSender) => void

export interface ProjectChatStoreDeps {
  guide: ChatStoreGuide
  /** Moves one file to the OS trash (main passes Electron's `shell.trashItem`) */
  trash: (absPath: string) => Promise<void>
  now?: () => Date
  /** A new chat id; must match `PROJECT_ID_PATTERN` */
  newId?: () => string
  platform?: NodeJS.Platform
  /** default `CHAT_STATE_CACHE_LIMIT` */
  stateCacheLimit?: number
  /** default `FOREIGN_SCAN_CACHE_LIMIT` */
  foreignCacheLimit?: number
}

interface PendingEntry {
  message: ProjectChatMessage
  /** The sender's document relative to the project folder, when inside it */
  docRel: string | null
  /** The sender's document when it is outside the project folder */
  outsideDoc: string | null
  sender: ChatSender
}

interface ChatState {
  nextSeq: number
  /** The chat has a file (info or messages) in the folder */
  materialized: boolean
  /** The info file names another project id (a copied folder's chat) */
  otherProject: boolean
  /** Messages with a seq that are not on disk yet (before the first reply, or unwritable) */
  pending: PendingEntry[]
  /** Messages on disk whose effect on the info (time, editor, documents, title) is not written yet */
  unrecorded: PendingEntry[]
  /** Documents attached before the info could take them */
  attachDocs: string[]
  /** A rename not written yet */
  title: string | null
}

interface ListedChat {
  info: ProjectChatInfo
  foreign: boolean
}

function defaultNewId(): string {
  return randomBytes(12).toString('base64url')
}

function assertId(value: unknown, kind: string): asserts value is ProjectId {
  if (!isValidProjectId(value)) throw new Error(`invalid ${kind}`)
}

function isEditor(value: unknown): value is ProjectEditor {
  return typeof value === 'string' && (PROJECT_EDITORS as readonly string[]).includes(value)
}

function clamp(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

// Providers hand tool input/output over as objects as often as text.
function toolFieldText(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, TOOL_FIELD_MAX_CHARS)
  let text: string
  try {
    text = JSON.stringify(value) ?? String(value)
  } catch {
    text = String(value)
  }
  return text.slice(0, TOOL_FIELD_MAX_CHARS)
}

function toolsOf(value: unknown): ToolActivity[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object')
    .slice(0, MAX_TOOLS_PER_MESSAGE)
    .map((tool) => ({
      name: clamp(tool.name, TOOL_NAME_MAX_CHARS),
      summary: clamp(tool.summary, TOOL_SUMMARY_MAX_CHARS),
      ...(typeof tool.isError === 'boolean' ? { isError: tool.isError } : {}),
      ...(tool.input !== undefined ? { input: toolFieldText(tool.input) } : {}),
      ...(tool.output !== undefined ? { output: toolFieldText(tool.output) } : {}),
    }))
}

function attachmentsOf(value: unknown): NonNullable<ProjectChatMessage['attachments']> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
    .map((item) => ({
      name: clamp(item.name, ATTACHMENT_FIELD_MAX_CHARS),
      ...(typeof item.path === 'string'
        ? { path: clamp(item.path, ATTACHMENT_FIELD_MAX_CHARS) }
        : {}),
      ...(typeof item.ext === 'string' ? { ext: clamp(item.ext, ATTACHMENT_FIELD_MAX_CHARS) } : {}),
      ...(typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes)
        ? { sizeBytes: item.sizeBytes }
        : {}),
    }))
}

// Skill chips are references (id, source, title); malformed entries are dropped
function skillChipsOf(value: unknown): ChatSkillChip[] {
  if (!Array.isArray(value)) return []
  const out: ChatSkillChip[] = []
  for (const entry of value) {
    if (out.length >= MAX_SKILLS_PER_MESSAGE) break
    if (!entry || typeof entry !== 'object') continue
    const chip = entry as Record<string, unknown>
    if (typeof chip.id !== 'string' || !chip.id || chip.id.length > SKILL_ID_MAX_CHARS) continue
    out.push({
      id: chip.id,
      source: clamp(chip.source, SKILL_FIELD_MAX_CHARS),
      title: clamp(chip.title, SKILL_FIELD_MAX_CHARS),
    })
  }
  return out
}

/** One message as stored, capped as project-store caps it */
function buildMessage(
  args: AppendProjectChatArgs,
  fields: { seq: number; ts: string; editor: ProjectEditor; origin: string; fileRef?: string },
): ProjectChatMessage {
  const text =
    args.text.length > TEXT_MAX_CHARS
      ? args.text.slice(0, TEXT_MAX_CHARS) + TEXT_TRUNCATED_MARK
      : args.text
  const message: ProjectChatMessage = {
    seq: fields.seq,
    ts: fields.ts,
    role: args.role,
    text,
    editor: fields.editor,
    origin: fields.origin,
  }
  if (fields.fileRef !== undefined) message.fileRef = fields.fileRef
  const tools = toolsOf(args.tools)
  if (tools.length > 0) message.tools = tools
  if (args.attachments !== undefined) message.attachments = attachmentsOf(args.attachments)
  if (args.scope && typeof args.scope === 'object') {
    message.scope = {
      label: clamp(args.scope.label, SCOPE_LABEL_MAX_CHARS),
      ...(typeof args.scope.text === 'string'
        ? { text: args.scope.text.slice(0, SCOPE_TEXT_MAX_CHARS) }
        : {}),
    }
  }
  if (args.skills !== undefined) {
    const skills = skillChipsOf(args.skills)
    if (skills.length > 0) message.skills = skills
  }
  return message
}

/** One line of text, whitespace collapsed, at most `max` characters */
function oneLine(text: string, max: number): string {
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim()
}

/** Lenient: broken lines and records without a finite seq, a role or a text are skipped */
function parseRecords(raw: string): Array<Record<string, unknown> & ProjectChatMessage> {
  const out: Array<Record<string, unknown> & ProjectChatMessage> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as Record<string, unknown> & ProjectChatMessage
      if (
        record &&
        typeof record === 'object' &&
        Number.isFinite(record.seq) &&
        typeof record.role === 'string' &&
        typeof record.text === 'string'
      ) {
        out.push(record)
      }
    } catch {
      continue
    }
  }
  return out
}

/**
 * The text of the last 8 MiB of a chat file, starting at a line boundary. A record
 * longer than that widens the window up to 64 MiB; with no boundary even then the
 * chat reads as empty (same as project-store).
 */
async function readTail(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    if (size === 0) return ''
    let length = Math.min(size, TAIL_READ_BYTES - 1)
    for (;;) {
      const start = size - length
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buffer, 0, length, start)
      const window = buffer.subarray(0, bytesRead)
      if (start === 0) return window.toString('utf8')
      const before = Buffer.allocUnsafe(1)
      await handle.read(before, 0, 1, start - 1)
      if (before[0] === 0x0a) return window.toString('utf8')
      const newline = window.indexOf(0x0a)
      // A newline only at the very end means the window is one oversized record
      if (newline >= 0 && newline < bytesRead - 1) {
        return window.subarray(newline + 1).toString('utf8')
      }
      if (length >= TAIL_HARD_CAP_BYTES) {
        console.warn(`[projects] no record boundary in the last ${length} bytes of ${path}`)
        return ''
      }
      length = Math.min(size, length * 2, TAIL_HARD_CAP_BYTES)
    }
  } finally {
    await handle.close()
  }
}

/** Whether a non-empty file does not end with a newline (a cut last line) */
async function lacksFinalNewline(path: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    if (size === 0) return false
    const last = Buffer.allocUnsafe(1)
    await handle.read(last, 0, 1, size - 1)
    return last[0] !== 0x0a
  } finally {
    await handle.close()
  }
}

function normalizeLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_OPEN_LIMIT
  return Math.min(MAX_OPEN_LIMIT, Math.max(1, Math.floor(limit)))
}

/** Chat info as read (lenient); null when absent, broken, or named for another id */
function parseInfo(text: string | null, chatId: ProjectId): ProjectChatInfo | null {
  if (text === null) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || raw.id !== chatId || !isValidProjectId(raw.projectId)) {
    return null
  }
  const str = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    ...raw,
    version: PROJECT_FORMAT_VERSION,
    id: chatId,
    projectId: raw.projectId,
    title: str(raw.title),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    origin: str(raw.origin),
    lastEditor: isEditor(raw.lastEditor) ? raw.lastEditor : 'home',
    documents: Array.isArray(raw.documents)
      ? raw.documents.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function infoText(info: ProjectChatInfo): string {
  return `${JSON.stringify(info, null, 2)}\n`
}

const infoRel = (chatId: ProjectId) => `${chatsDir}/${chatId}${chatInfoExt}`
const messagesRel = (chatId: ProjectId) => `${chatsDir}/${chatId}${chatMessagesExt}`

export class ProjectChatStore {
  private readonly guide: ChatStoreGuide
  private readonly now: () => Date
  private readonly newId: () => string
  private readonly platform: NodeJS.Platform
  private readonly states = new Map<string, ChatState>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly listeners = new Set<ChatAppendedListener>()
  /** Foreign-message scans by file, valid while size and mtime stay the same */
  private readonly foreignCache = new Map<
    string,
    { size: number; mtimeMs: number; foreign: boolean }
  >()
  /** Outside documents already recorded this run (document + project → chat) */
  private readonly outsideRecorded = new Map<string, ProjectId>()

  constructor(private readonly deps: ProjectChatStoreDeps) {
    this.guide = deps.guide
    this.now = deps.now ?? (() => new Date())
    this.newId = deps.newId ?? defaultNewId
    this.platform = deps.platform ?? process.platform
    this.stateLimit = Math.max(1, deps.stateCacheLimit ?? CHAT_STATE_CACHE_LIMIT)
    this.foreignLimit = Math.max(1, deps.foreignCacheLimit ?? FOREIGN_SCAN_CACHE_LIMIT)
  }

  private readonly stateLimit: number
  private readonly foreignLimit: number

  /** how many chat states are held now (for tests) */
  heldStateCount(): number {
    return this.states.size
  }

  /** how many foreign-message scans are remembered now (for tests) */
  heldForeignScanCount(): number {
    return this.foreignCache.size
  }

  /** nothing of this chat waits in memory, and no task for it is running or queued */
  private isIdle(key: string, state: ChatState): boolean {
    return (
      state.pending.length === 0 &&
      state.unrecorded.length === 0 &&
      state.attachDocs.length === 0 &&
      state.title === null &&
      !this.queues.has(key)
    )
  }

  /** drops the least recently used idle states past the limit */
  private trimStates(keep: string): void {
    if (this.states.size <= this.stateLimit) return
    for (const [key, state] of this.states) {
      if (this.states.size <= this.stateLimit) break
      if (key !== keep && this.isIdle(key, state)) this.states.delete(key)
    }
  }

  // ────────────────────────── events ──────────────────────────

  /** Called once per message after it was written to the folder; returns the unsubscribe */
  onAppended(listener: ChatAppendedListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(projectId: ProjectId, chatId: ProjectId, entries: PendingEntry[]): void {
    for (const entry of entries) {
      const event: ProjectChatAppendedEvent = { projectId, chatId, message: entry.message }
      for (const listener of this.listeners) {
        try {
          listener(event, entry.sender)
        } catch (error) {
          console.warn('[projects] chat append listener failed:', error)
        }
      }
    }
  }

  // ────────────────────────── helpers ──────────────────────────

  private rootOf(projectId: ProjectId): string {
    const root = this.guide.projectRoot(projectId)
    if (!root) throw new Error(`unknown project ${projectId}`)
    return root
  }

  /** Runs `task` after every earlier task for the same chat, whatever their outcome */
  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.queues.set(key, tail)
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key)
    })
    return run
  }

  private sameRel(a: string, b: string): boolean {
    const norm = (value: string) => {
      const plain = value.replace(/\\/g, '/').normalize('NFC')
      return this.platform === 'win32' || this.platform === 'darwin' ? plain.toLowerCase() : plain
    }
    return norm(a) === norm(b)
  }

  /** `documents` with `rel` moved (or added) to the end */
  private moveToEnd(documents: string[], rel: string): string[] {
    return [...documents.filter((item) => !this.sameRel(item, rel)), rel]
  }

  private async state(projectId: ProjectId, chatId: ProjectId, root: string): Promise<ChatState> {
    const key = `${projectId}/${chatId}`
    const known = this.states.get(key)
    if (known) {
      // most recently used last
      this.states.delete(key)
      this.states.set(key, known)
      return known
    }
    const messagesPath = await plainFileIn(root, [dataDir, chatsDir, `${chatId}${chatMessagesExt}`])
    const rawInfo = await readFolderText(root, [dataDir, chatsDir, `${chatId}${chatInfoExt}`])
    const info = parseInfo(rawInfo, chatId)
    let maxSeq = -1
    if (messagesPath) {
      try {
        for (const record of parseRecords(await readTail(messagesPath))) {
          maxSeq = Math.max(maxSeq, record.seq)
        }
      } catch (error) {
        console.warn(`[projects] cannot read chat ${chatId}:`, error)
      }
    }
    const state: ChatState = {
      nextSeq: maxSeq + 1,
      materialized: messagesPath !== null || rawInfo !== null,
      otherProject: info !== null && info.projectId !== projectId,
      pending: [],
      unrecorded: [],
      attachDocs: [],
      title: null,
    }
    this.states.set(key, state)
    this.trimStates(key)
    return state
  }

  private async isForeign(root: string, info: ProjectChatInfo): Promise<boolean> {
    const installId = this.guide.installId()
    if (info.origin !== installId) return true
    const path = await plainFileIn(root, [dataDir, chatsDir, `${info.id}${chatMessagesExt}`])
    if (!path) return false
    const stats = await lstat(path).catch(() => null)
    if (!stats) return false
    const { size, mtimeMs } = stats
    const cached = this.foreignCache.get(path)
    if (cached && cached.size === size && cached.mtimeMs === mtimeMs) {
      this.foreignCache.delete(path)
      this.foreignCache.set(path, cached)
      return cached.foreign
    }
    const foreign = await hasForeignMessage(root, info.id, installId)
    this.foreignCache.delete(path)
    this.foreignCache.set(path, { size, mtimeMs, foreign })
    for (const oldest of this.foreignCache.keys()) {
      if (this.foreignCache.size <= this.foreignLimit) break
      this.foreignCache.delete(oldest)
    }
    return foreign
  }

  /** The info of a chat the list shows (this project id; not foreign under "without"), else null */
  private async visible(
    projectId: ProjectId,
    root: string,
    chatId: ProjectId,
  ): Promise<ListedChat | null> {
    const info = parseInfo(
      await readFolderText(root, [dataDir, chatsDir, `${chatId}${chatInfoExt}`]),
      chatId,
    )
    if (!info || info.projectId !== projectId) return null
    const foreign = await this.isForeign(root, info)
    if (foreign && this.guide.trustState(projectId) !== 'use') return null
    return { info, foreign }
  }

  /** Visible chats, newest `updatedAt` first */
  private async visibleChats(projectId: ProjectId): Promise<ListedChat[]> {
    const root = this.guide.projectRoot(projectId)
    if (!root) return []
    const out: ListedChat[] = []
    for (const name of await plainFolderEntries(root, [dataDir, chatsDir])) {
      if (!name.endsWith(chatInfoExt)) continue
      const chatId = name.slice(0, -chatInfoExt.length)
      if (!isValidProjectId(chatId)) continue
      const chat = await this.visible(projectId, root, chatId)
      if (chat) out.push(chat)
    }
    return out.sort(
      (a, b) =>
        b.info.updatedAt.localeCompare(a.info.updatedAt) || a.info.id.localeCompare(b.info.id),
    )
  }

  /**
   * Writes the info's share of `state`: time, editor and documents of the messages
   * on disk, documents attached meanwhile, and a pending rename or automatic title.
   */
  private async writeInfo(
    projectId: ProjectId,
    chatId: ProjectId,
    state: ChatState,
  ): Promise<ProjectWriteResult> {
    const entries = state.unrecorded
    const attached = state.attachDocs
    const rename = state.title
    if (entries.length === 0 && attached.length === 0 && rename === null) return { status: 'ok' }
    const outcome = await this.guide.updateData(projectId, infoRel(chatId), (current) => {
      const parsed = parseInfo(current, chatId)
      if (parsed && parsed.projectId !== projectId) return null
      const at = entries[0]?.message.ts ?? this.now().toISOString()
      const info: ProjectChatInfo = parsed ?? {
        version: PROJECT_FORMAT_VERSION,
        id: chatId,
        projectId,
        title: '',
        createdAt: at,
        updatedAt: at,
        origin: this.guide.installId(),
        lastEditor: entries[0]?.message.editor ?? 'home',
        documents: [],
      }
      for (const entry of entries) {
        info.updatedAt = entry.message.ts
        info.lastEditor = entry.message.editor
        if (entry.docRel !== null) info.documents = this.moveToEnd(info.documents, entry.docRel)
      }
      for (const rel of attached) info.documents = this.moveToEnd(info.documents, rel)
      if (rename !== null) {
        info.title = rename
      } else if (info.title === '') {
        const first = entries.find((entry) => entry.message.role === 'user')
        if (first) info.title = oneLine(first.message.text, CHAT_TITLE_CHARS)
      }
      return infoText(info)
    })
    if (outcome.status !== 'ok') return outcome
    state.unrecorded = state.unrecorded.slice(entries.length)
    state.attachDocs = state.attachDocs.slice(attached.length)
    if (state.title === rename) state.title = null
    return { status: 'ok' }
  }

  /** Writes every pending message, then the info; emits the written messages */
  private async flush(
    projectId: ProjectId,
    chatId: ProjectId,
    root: string,
    state: ChatState,
  ): Promise<ProjectWriteResult> {
    const batch = state.pending
    if (batch.length > 0) {
      const existing = await plainFileIn(root, [dataDir, chatsDir, `${chatId}${chatMessagesExt}`])
      let prefix = ''
      if (existing) {
        try {
          if (await lacksFinalNewline(existing)) prefix = '\n'
        } catch {
          // Unreadable here means the append fails too and reports it.
        }
      }
      const lines = batch.map((entry) => `${JSON.stringify(entry.message)}\n`).join('')
      const appended = await this.guide.appendData(projectId, messagesRel(chatId), prefix + lines)
      if (appended.status !== 'ok') return appended
      state.pending = state.pending.slice(batch.length)
      state.unrecorded.push(...batch)
      state.materialized = true
      this.emit(projectId, chatId, batch)
      await this.recordOutside(projectId, chatId, batch)
    }
    return this.writeInfo(projectId, chatId, state)
  }

  /** The last chat of documents outside the folder lives in this PC's settings (spec 4) */
  private async recordOutside(
    projectId: ProjectId,
    chatId: ProjectId,
    entries: PendingEntry[],
  ): Promise<void> {
    const docs = new Set(entries.map((entry) => entry.outsideDoc).filter((doc) => doc !== null))
    for (const doc of docs) {
      const key = `${doc}\n${projectId}`
      if (this.outsideRecorded.get(key) === chatId) continue
      try {
        await this.guide.recordOutsideChat(doc, projectId, chatId)
        this.outsideRecorded.set(key, chatId)
      } catch (error) {
        console.warn('[projects] cannot record the chat of an outside document:', error)
      }
    }
  }

  // ────────────────────────── public ──────────────────────────

  /** A new chat id for the project; nothing is written until the first assistant reply */
  async newChat(projectId: ProjectId): Promise<{ chatId: ProjectId }> {
    assertId(projectId, 'project id')
    this.rootOf(projectId)
    for (;;) {
      const chatId = this.newId()
      if (!isValidProjectId(chatId)) throw new Error('newId produced an invalid chat id')
      if (this.states.has(`${projectId}/${chatId}`)) continue
      let taken = false
      for (const rel of [infoRel(chatId), messagesRel(chatId)]) {
        const path = this.guide.dataPath(projectId, rel)
        if (path && (await lstat(path).catch(() => null))) taken = true
      }
      if (!taken) return { chatId }
    }
  }

  /** The project's chats for the [chat ▾] list: this project id only, newest first, "other PC" marked */
  async listChats(projectId: ProjectId): Promise<ProjectChatListItem[]> {
    assertId(projectId, 'project id')
    return (await this.visibleChats(projectId)).map(({ info, foreign }) => ({
      id: info.id,
      title: info.title,
      updatedAt: info.updatedAt,
      lastEditor: info.lastEditor,
      foreign,
    }))
  }

  /** A visible chat's info (for "open the chat's latest document"), or null */
  async chatInfo(ref: ProjectChatRef): Promise<ProjectChatInfo | null> {
    assertId(ref.projectId, 'project id')
    assertId(ref.chatId, 'chat id')
    const root = this.guide.projectRoot(ref.projectId)
    if (!root) return null
    return (await this.visible(ref.projectId, root, ref.chatId))?.info ?? null
  }

  /** The most recent messages of a visible chat (lenient tail read, unsaved messages of this run included) */
  async openChat(args: OpenProjectChatArgs): Promise<OpenProjectChatResult> {
    const { projectId, chatId } = args
    assertId(projectId, 'project id')
    assertId(chatId, 'chat id')
    const root = this.guide.projectRoot(projectId)
    if (!root) return { status: 'not-found' }
    const limit = normalizeLimit(args.limit)
    return this.serialize(`${projectId}/${chatId}`, async () => {
      const chat = await this.visible(projectId, root, chatId)
      if (!chat) return { status: 'not-found' as const }
      const path = await plainFileIn(root, [dataDir, chatsDir, `${chatId}${chatMessagesExt}`])
      let records: ProjectChatMessage[] = []
      if (path) {
        try {
          records = parseRecords(await readTail(path))
        } catch (error) {
          console.warn(`[projects] cannot read chat ${chatId}:`, error)
        }
      }
      const pending = this.states.get(`${projectId}/${chatId}`)?.pending ?? []
      const messages = [...records, ...pending.map((entry) => entry.message)]
        .map((record) => ({
          ...record,
          editor: isEditor(record.editor) ? record.editor : chat.info.lastEditor,
          origin: typeof record.origin === 'string' ? record.origin : '',
        }))
        .sort((a, b) => a.seq - b.seq)
        .slice(-limit)
      return { status: 'ok' as const, info: chat.info, messages, foreign: chat.foreign }
    })
  }

  /**
   * Record one message. Main fills `seq`, time, `editor`, `origin` and `fileRef` from
   * the sender and updates the info (`updatedAt`, `lastEditor`, `documents`, title).
   * Before the first assistant reply the message is held in memory (`pending`). When
   * the folder cannot be written the message is kept for this run and `unwritable`
   * is returned; a later append writes it once the folder can be written again.
   */
  async append(args: AppendProjectChatArgs, sender: ChatSender): Promise<AppendProjectChatResult> {
    const { projectId, chatId } = args
    assertId(projectId, 'project id')
    assertId(chatId, 'chat id')
    if (args.role !== 'user' && args.role !== 'assistant') throw new Error('invalid role')
    if (typeof args.text !== 'string') throw new Error('invalid text')
    if (!isEditor(sender.editor)) throw new Error('invalid editor')
    const docPath = sender.docPath ?? null
    if (docPath !== null && (typeof docPath !== 'string' || !isAbsolute(docPath))) {
      throw new Error('expected an absolute document path')
    }
    const root = this.rootOf(projectId)
    return this.serialize(`${projectId}/${chatId}`, async () => {
      const state = await this.state(projectId, chatId, root)
      if (state.otherProject) throw new Error(`chat ${chatId} belongs to another project`)
      const docRel = docPath ? this.guide.documentRelativePath(projectId, docPath) : null
      const outsideDoc = docPath !== null && docRel === null ? docPath : null
      const fileRef = docRel ?? (outsideDoc !== null ? basename(outsideDoc) : undefined)
      const message = buildMessage(args, {
        seq: state.nextSeq++,
        ts: this.now().toISOString(),
        editor: sender.editor,
        origin: this.guide.installId(),
        ...(fileRef !== undefined ? { fileRef } : {}),
      })
      state.pending.push({ message, docRel, outsideDoc, sender })
      const unwritable = this.guide.isUnwritable(projectId)
      if (
        !state.materialized &&
        args.role !== 'assistant' &&
        state.pending.length < MAX_PENDING_OPENING_MESSAGES
      ) {
        return unwritable
          ? { status: 'unwritable' as const }
          : { status: 'pending' as const, message }
      }
      if (unwritable) return { status: 'unwritable' as const }
      const result = await this.flush(projectId, chatId, root, state)
      return result.status === 'ok'
        ? { status: 'saved' as const, message }
        : { status: 'unwritable' as const }
    })
  }

  /** Rename a chat; the automatic title never replaces it afterwards */
  async renameChat(args: RenameProjectChatArgs): Promise<ProjectWriteResult> {
    const { projectId, chatId } = args
    assertId(projectId, 'project id')
    assertId(chatId, 'chat id')
    const title = typeof args.title === 'string' ? oneLine(args.title, CHAT_TITLE_MAX_CHARS) : ''
    if (!title) throw new Error('a chat title cannot be empty')
    const root = this.rootOf(projectId)
    return this.serialize(`${projectId}/${chatId}`, async () => {
      const state = await this.state(projectId, chatId, root)
      if (state.otherProject) return { status: 'ok' as const }
      state.title = title
      if (!state.materialized) return { status: 'ok' as const }
      if (this.guide.isUnwritable(projectId)) return { status: 'unwritable' as const }
      return this.writeInfo(projectId, chatId, state)
    })
  }

  /**
   * Spec 5.3.6: an untitled document of this project was first saved at `docPath`.
   * When that is inside the project folder its relative path joins the chat's
   * `documents` now (or with the chat's first write); elsewhere nothing changes.
   */
  async attachDocument(ref: ProjectChatRef, docPath: string): Promise<ProjectWriteResult> {
    const { projectId, chatId } = ref
    assertId(projectId, 'project id')
    assertId(chatId, 'chat id')
    if (typeof docPath !== 'string' || !isAbsolute(docPath)) {
      throw new Error('expected an absolute document path')
    }
    const root = this.rootOf(projectId)
    const rel = this.guide.documentRelativePath(projectId, docPath)
    if (rel === null) return { status: 'ok' }
    return this.serialize(`${projectId}/${chatId}`, async () => {
      const state = await this.state(projectId, chatId, root)
      if (state.otherProject) return { status: 'ok' as const }
      state.attachDocs = this.moveToEnd(state.attachDocs, rel)
      if (!state.materialized) return { status: 'ok' as const }
      if (this.guide.isUnwritable(projectId)) return { status: 'unwritable' as const }
      return this.writeInfo(projectId, chatId, state)
    })
  }

  /** Moves both chat files to the OS trash (never deletes them); unsaved messages of the chat go too */
  async deleteChat(ref: ProjectChatRef): Promise<ProjectWriteResult> {
    const { projectId, chatId } = ref
    assertId(projectId, 'project id')
    assertId(chatId, 'chat id')
    const root = this.rootOf(projectId)
    const key = `${projectId}/${chatId}`
    return this.serialize(key, async () => {
      const state = await this.state(projectId, chatId, root)
      if (state.otherProject) return { status: 'ok' as const }
      if (this.guide.isUnwritable(projectId)) return { status: 'unwritable' as const }
      for (const rel of [infoRel(chatId), messagesRel(chatId)]) {
        const path = this.guide.dataPath(projectId, rel)
        if (!path) continue
        const stats = await lstat(path).catch(() => null)
        if (!stats || stats.isDirectory()) continue
        try {
          await this.deps.trash(path)
        } catch (error) {
          console.warn(`[projects] cannot move chat ${chatId} to the trash:`, error)
          this.guide.markUnwritable(projectId)
          return { status: 'unwritable' as const }
        }
        this.foreignCache.delete(path)
      }
      this.states.delete(key)
      return { status: 'ok' as const }
    })
  }

  /**
   * The chat a document opens with (spec 5.3.1), or null for an empty new chat.
   * Inside the folder: the visible chat with the latest `updatedAt` whose `documents`
   * holds the document. Outside: the last chat recorded for the document in this
   * project, while it is still visible. Chats the list hides are never picked.
   */
  async chatForDocument(projectId: ProjectId, docPath: string): Promise<ProjectId | null> {
    assertId(projectId, 'project id')
    if (typeof docPath !== 'string' || !isAbsolute(docPath)) {
      throw new Error('expected an absolute document path')
    }
    const root = this.guide.projectRoot(projectId)
    if (!root) return null
    const rel = this.guide.documentRelativePath(projectId, docPath)
    if (rel !== null) {
      const chats = await this.visibleChats(projectId)
      const hit = chats.find(({ info }) => info.documents.some((item) => this.sameRel(item, rel)))
      return hit?.info.id ?? null
    }
    const selection = await this.guide.getSelection({ kind: 'document', path: docPath })
    const chatId = selection.projectId === projectId ? selection.initialChatId : null
    if (!chatId || !isValidProjectId(chatId)) return null
    return (await this.visible(projectId, root, chatId)) ? chatId : null
  }
}
