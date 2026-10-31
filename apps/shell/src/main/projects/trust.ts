import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  isValidProjectId,
  PROJECT_FOLDER_NAMES,
  type ProjectForeignChat,
  type ProjectHashedFile,
  type ProjectId,
  type ProjectTrustPrompt,
} from '@genoffice/project-store'
import {
  hashText,
  plainFileIn,
  plainFolderEntries,
  readDataText,
  readFolderText,
} from './folder-files'
import { memoryHasContent } from './memory'

/**
 * The first-time trust check (spec 5.10). Before a folder joins the list, the
 * person sees everything in it this install did not write: the instructions, the
 * memory, the root `AGENTS.md` / `CLAUDE.md`, and chats another install wrote
 * (by the chat info or by any one message). Nothing here decides; the guide
 * records the answer.
 */

const { dataDir, chatsDir, chatInfoExt, chatMessagesExt } = PROJECT_FOLDER_NAMES

/** The texts the trust record hashes, read as they are now (null when absent) */
export interface HashedTexts {
  instructions: string | null
  memory: string | null
  agents: string | null
  claude: string | null
}

export async function readHashedTexts(root: string): Promise<HashedTexts> {
  const [instructions, memory, agents, claude] = await Promise.all([
    readDataText(root, PROJECT_FOLDER_NAMES.instructionsFile),
    readDataText(root, PROJECT_FOLDER_NAMES.memoryFile),
    readFolderText(root, [PROJECT_FOLDER_NAMES.rootAgentsFile]),
    readFolderText(root, [PROJECT_FOLDER_NAMES.rootClaudeFile]),
  ])
  return { instructions, memory, agents, claude }
}

/** Hashes of the present texts, keyed as in the trust record */
export function hashesOf(texts: HashedTexts): Partial<Record<ProjectHashedFile, string>> {
  const out: Partial<Record<ProjectHashedFile, string>> = {}
  for (const file of ['instructions', 'memory', 'agents', 'claude'] as const) {
    const text = texts[file]
    if (text !== null) out[file] = hashText(text)
  }
  return out
}

/** Text worth showing: absent and blank files carry nothing */
function shown(text: string | null): string | null {
  return text !== null && text.trim() !== '' ? text : null
}

interface ChatInfoLike {
  id: string
  projectId: string
  title: string
  updatedAt: string
  origin: unknown
}

function parseChatInfo(text: string | null, id: string): ChatInfoLike | null {
  if (text === null) return null
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || raw.id !== id || !isValidProjectId(raw.projectId)) {
      return null
    }
    return {
      id,
      projectId: raw.projectId,
      title: typeof raw.title === 'string' ? raw.title : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      origin: raw.origin,
    }
  } catch {
    return null
  }
}

/**
 * Whether any message line of a chat was written by another install. Lines are
 * read one at a time and the scan stops at the first foreign one; unreadable
 * lines are skipped, as chat reading does. A file that cannot be read to the
 * end counts as foreign: under "without" such a chat stays hidden.
 */
export async function hasForeignMessage(
  root: string,
  chatId: ProjectId,
  installId: string,
): Promise<boolean> {
  const path = await plainFileIn(root, [dataDir, chatsDir, `${chatId}${chatMessagesExt}`])
  if (!path) return false
  const stream = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (line.trim() === '') continue
      let record: unknown
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (!record || typeof record !== 'object') continue
      if ((record as { origin?: unknown }).origin !== installId) return true
    }
    return false
  } catch {
    return true
  } finally {
    lines.close()
    stream.destroy()
  }
}

/**
 * Chats of this project (info `projectId` equal to `projectId`) written by
 * another install. Chats of another project id never show in the list, so they
 * are left out.
 */
export async function listForeignChats(
  root: string,
  projectId: ProjectId,
  installId: string,
): Promise<ProjectForeignChat[]> {
  const out: ProjectForeignChat[] = []
  const names = await plainFolderEntries(root, [dataDir, chatsDir])
  for (const name of names.sort()) {
    if (!name.endsWith(chatInfoExt)) continue
    const id = name.slice(0, -chatInfoExt.length)
    if (!isValidProjectId(id)) continue
    const info = parseChatInfo(await readFolderText(root, [dataDir, chatsDir, name]), id)
    if (!info || info.projectId !== projectId) continue
    if (info.origin !== installId || (await hasForeignMessage(root, id, installId))) {
      out.push({ id, title: info.title, updatedAt: info.updatedAt })
    }
  }
  return out
}

export interface TrustScanInput {
  root: string
  projectId: ProjectId
  name: string
  installId: string
}

export interface TrustScan {
  prompt: ProjectTrustPrompt
  /** Whether there is anything to confirm at all */
  foreign: boolean
  /** Hashes of the texts as shown, recorded with the answer */
  hashes: Partial<Record<ProjectHashedFile, string>>
}

/** What the trust prompt shows for a folder, and whether it has to be shown */
export async function scanForTrust(input: TrustScanInput): Promise<TrustScan> {
  const texts = await readHashedTexts(input.root)
  const foreignChats = await listForeignChats(input.root, input.projectId, input.installId)
  const prompt: ProjectTrustPrompt = {
    projectId: input.projectId,
    name: input.name,
    folderPath: input.root,
    instructions: shown(texts.instructions),
    memory: memoryHasContent(texts.memory) ? texts.memory : null,
    agents: shown(texts.agents),
    claude: shown(texts.claude),
    foreignChats,
  }
  const foreign =
    prompt.instructions !== null ||
    prompt.memory !== null ||
    prompt.agents !== null ||
    prompt.claude !== null ||
    foreignChats.length > 0
  return { prompt, foreign, hashes: hashesOf(texts) }
}
