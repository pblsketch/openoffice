import {
  PROJECT_FOLDER_NAMES,
  type ProjectHashedFile,
  type ProjectInstructionsSource,
  type ProjectNotice,
  type ProjectSettings,
  type ProjectTrustRecord,
} from '@genoffice/project-store'
import { hashText } from './folder-files'
import { MEMORY_SOFT_LIMIT_CHARS, memoryHasContent } from './memory'
import type { HashedTexts } from './trust'

/**
 * The instructions and memory one request carries for a trusted project (spec
 * 5.4, 5.10). Pure: given the texts as read now and the trust record, it returns
 * what to send, the notices, and the hashes to record.
 */

/** Instructions sent per request, all sources together; the tail past this is dropped with a notice */
export const INSTRUCTIONS_LIMIT_CHARS = 32_000

const INSTRUCTION_PARTS: readonly { source: ProjectInstructionsSource; label: string }[] = [
  {
    source: 'instructions',
    label: `${PROJECT_FOLDER_NAMES.dataDir}/${PROJECT_FOLDER_NAMES.instructionsFile}`,
  },
  { source: 'agents', label: PROJECT_FOLDER_NAMES.rootAgentsFile },
  { source: 'claude', label: PROJECT_FOLDER_NAMES.rootClaudeFile },
]

export interface TrustedContext {
  instructions: { text: string; sources: ProjectInstructionsSource[] } | null
  memory: { text: string; chars: number } | null
  notices: ProjectNotice[]
  /** New hash per changed file; null drops the hash of a file that is gone */
  hashUpdates: Partial<Record<ProjectHashedFile, string | null>>
}

/** `text` cut to `limit` characters without splitting a surrogate pair */
function cutAt(text: string, limit: number): string {
  if (text.length <= limit) return text
  let end = limit
  const code = text.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return text.slice(0, end)
}

/**
 * - Instructions: `instructions.md`, then the root `AGENTS.md` and `CLAUDE.md` when
 *   they are read, each under a line naming its file; cut at `limitChars` with an
 *   "instructions-truncated" notice.
 * - Memory: the whole `memory.md`, never cut; over `memoryLimitChars` adds "memory-long".
 * - A file whose hash differs from the record changed outside the app: one
 *   "instructions-changed" / "memory-changed" notice, and its new hash is returned.
 */
export function assembleTrustedContext(
  texts: HashedTexts,
  record: ProjectTrustRecord,
  switches: ProjectSettings,
  limitChars = INSTRUCTIONS_LIMIT_CHARS,
  memoryLimitChars = MEMORY_SOFT_LIMIT_CHARS,
): TrustedContext {
  const notices: ProjectNotice[] = []
  const hashUpdates: Partial<Record<ProjectHashedFile, string | null>> = {}
  const changed: ProjectInstructionsSource[] = []
  let memoryChanged = false
  const watched: ProjectHashedFile[] = switches.readAgentsFiles
    ? ['instructions', 'agents', 'claude', 'memory']
    : ['instructions', 'memory']
  for (const file of watched) {
    const text = texts[file]
    const known = record.hashes[file]
    if (text === null) {
      if (known !== undefined) hashUpdates[file] = null
      continue
    }
    const hash = hashText(text)
    if (hash === known) continue
    hashUpdates[file] = hash
    if (file === 'memory') memoryChanged = memoryHasContent(text)
    else if (text.trim() !== '') changed.push(file)
  }
  if (changed.length > 0) notices.push({ kind: 'instructions-changed', files: changed })
  if (memoryChanged) notices.push({ kind: 'memory-changed' })

  let instructions: TrustedContext['instructions'] = null
  const parts: { source: ProjectInstructionsSource; text: string }[] = []
  for (const part of INSTRUCTION_PARTS) {
    if (part.source !== 'instructions' && !switches.readAgentsFiles) continue
    const text = texts[part.source]
    if (text === null || text.trim() === '') continue
    parts.push({ source: part.source, text: `[${part.label}]\n${text.trim()}` })
  }
  if (parts.length > 0) {
    const full = parts.map((part) => part.text).join('\n\n')
    const text = cutAt(full, limitChars)
    const sources: ProjectInstructionsSource[] = []
    let offset = 0
    for (const part of parts) {
      if (offset < text.length) sources.push(part.source)
      offset += part.text.length + 2
    }
    instructions = { text, sources }
    if (text.length < full.length) {
      notices.push({ kind: 'instructions-truncated', chars: full.length, limit: limitChars })
    }
  }

  let memory: TrustedContext['memory'] = null
  if (texts.memory !== null && memoryHasContent(texts.memory)) {
    memory = { text: texts.memory, chars: texts.memory.length }
    if (texts.memory.length > memoryLimitChars) {
      notices.push({ kind: 'memory-long', chars: texts.memory.length, limit: memoryLimitChars })
    }
  }
  return { instructions, memory, notices, hashUpdates }
}
