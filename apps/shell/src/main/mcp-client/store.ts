import { randomUUID } from 'node:crypto'
import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile } from '../atomic-write'
import {
  permissionOf,
  type McpInstructions,
  type McpServerKind,
  type McpServersView,
  type McpServerRecordView,
  type McpToolAnnotations,
  type McpToolDefinition,
  type McpToolEntry,
  type McpTransport,
} from '../../shared/mcp-servers-api'
import { launchReviewNeeded } from './fingerprint'
import {
  openServerSecrets,
  sealServerSecrets,
  secretView,
  type McpSecretCodec,
  type McpSecretRef,
} from './secrets'

/**
 * `mcp-servers.json` in the app data folder (user MCP spec 10, 12.1): the
 * registered servers, their tool permissions and approval fingerprints. Only
 * the app reads it; the terminal command does not. In memory every secret is
 * plain; on disk it is sealed or, where this PC cannot seal, left empty.
 */

export const MCP_SERVERS_FILE_NAME = 'mcp-servers.json'
export const MCP_SERVERS_FILE_VERSION = 1

export function mcpServersFilePath(dataDir: string): string {
  return join(dataDir, MCP_SERVERS_FILE_NAME)
}

export interface McpOAuthConfig {
  clientId: string
  /** secret */
  clientSecret: string
  /** secret: the token set as the OAuth layer keeps it (JSON text) */
  tokens: string
}

/**
 * One registered server. Fields of the other kind stay at their empty values
 * in memory and are not written to the file.
 */
export interface McpServerConfig {
  /** made by the app; never shown as a name */
  id: string
  name: string
  kind: McpServerKind
  enabled: boolean
  keepResultsInside: boolean
  // remote
  url: string
  transport: McpTransport
  /** values are secrets */
  headers: Record<string, string>
  oauth: McpOAuthConfig | null
  // local
  command: string
  args: string[]
  /** values are secrets */
  env: Record<string, string>
  /** fingerprint of the command, arguments and env names as approved, or null */
  approvedLaunch: string | null
  /** fingerprint of the resolved plan the person allowed (`planFingerprint`), or null */
  approvedPlan: string | null
  // both
  instructions: McpInstructions | null
  pendingInstructions: string | null
  tools: Record<string, McpToolEntry>
  /** tools added since the person last opened this server's tool list */
  newTools: string[]
}

export interface McpServersFile {
  version: typeof MCP_SERVERS_FILE_VERSION
  /** runtimes the person allowed the app to download; kept across app updates */
  runtimes: Record<string, { allowed: boolean }>
  servers: McpServerConfig[]
}

export function emptyMcpServersFile(): McpServersFile {
  return { version: MCP_SERVERS_FILE_VERSION, runtimes: {}, servers: [] }
}

export interface NewMcpServerInput {
  name: string
  kind: McpServerKind
  url?: string
  transport?: McpTransport
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | null
  command?: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * A server as first registered (4.7): on, keeping results inside, no tools
 * yet, and a local launch not approved until the person presses "allow".
 */
export function newMcpServerConfig(input: NewMcpServerInput): McpServerConfig {
  const local = input.kind === 'local'
  return {
    id: randomUUID(),
    name: input.name,
    kind: input.kind,
    enabled: true,
    keepResultsInside: true,
    url: local ? '' : (input.url ?? ''),
    transport: local ? 'auto' : (input.transport ?? 'auto'),
    headers: local ? {} : { ...input.headers },
    oauth: local || !input.oauth ? null : { ...input.oauth },
    command: local ? (input.command ?? '') : '',
    args: local ? [...(input.args ?? [])] : [],
    env: local ? { ...input.env } : {},
    approvedLaunch: null,
    approvedPlan: null,
    instructions: null,
    pendingInstructions: null,
    tools: {},
    newTools: [],
  }
}

// ---- reading -------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const stringRecord = (v: unknown): Record<string, string> =>
  isRecord(v)
    ? Object.fromEntries(
        Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'),
      )
    : {}

function definitionOf(v: unknown): McpToolDefinition | null {
  if (!isRecord(v)) return null
  const def: McpToolDefinition = {
    description: str(v.description),
    inputSchema: isRecord(v.inputSchema) ? v.inputSchema : {},
  }
  if (isRecord(v.annotations)) def.annotations = v.annotations as McpToolAnnotations
  return def
}

function toolEntryOf(v: unknown): McpToolEntry | null {
  if (!isRecord(v)) return null
  return {
    permission: permissionOf(v.permission),
    // a missing fingerprint matches no listing, so the tool comes back for review
    approved: str(v.approved),
    definition: definitionOf(v.definition) ?? { description: '', inputSchema: {} },
    pending: definitionOf(v.pending),
  }
}

function instructionsOf(v: unknown): McpInstructions | null {
  if (!isRecord(v) || typeof v.text !== 'string') return null
  return { approved: str(v.approved), text: v.text }
}

function serverOf(v: unknown): McpServerConfig | null {
  if (!isRecord(v)) return null
  const kind: McpServerKind =
    v.kind === 'local' || v.kind === 'remote'
      ? v.kind
      : typeof v.command === 'string'
        ? 'local'
        : 'remote'
  const server = newMcpServerConfig({
    name: str(v.name),
    kind,
    url: str(v.url),
    transport: v.transport === 'sse' ? 'sse' : 'auto',
    headers: stringRecord(v.headers),
    oauth: isRecord(v.oauth)
      ? {
          clientId: str(v.oauth.clientId),
          clientSecret: str(v.oauth.clientSecret),
          tokens: str(v.oauth.tokens),
        }
      : null,
    command: str(v.command),
    args: strings(v.args),
    env: stringRecord(v.env),
  })
  const tools = Object.fromEntries(
    (isRecord(v.tools) ? Object.entries(v.tools) : [])
      .map(([name, t]) => [name, toolEntryOf(t)] as const)
      .filter((e): e is [string, McpToolEntry] => e[1] !== null),
  )
  const has = (name: string) => Object.prototype.hasOwnProperty.call(tools, name)
  return {
    ...server,
    id: typeof v.id === 'string' && v.id !== '' ? v.id : server.id,
    enabled: v.enabled !== false,
    keepResultsInside: v.keepResultsInside !== false,
    approvedLaunch: kind === 'local' ? strOrNull(v.approvedLaunch) : null,
    approvedPlan: kind === 'local' ? strOrNull(v.approvedPlan) : null,
    instructions: instructionsOf(v.instructions),
    pendingInstructions: strOrNull(v.pendingInstructions),
    tools,
    newTools: [...new Set(strings(v.newTools).filter(has))],
  }
}

/** The file as read, tolerant of missing fields and values it does not know */
export function normalizeMcpServersFile(raw: unknown): McpServersFile {
  if (!isRecord(raw)) return emptyMcpServersFile()
  const runtimes = Object.fromEntries(
    (isRecord(raw.runtimes) ? Object.entries(raw.runtimes) : []).map(([name, r]) => [
      name,
      { allowed: isRecord(r) && r.allowed === true },
    ]),
  )
  const servers = (Array.isArray(raw.servers) ? raw.servers : [])
    .map(serverOf)
    .filter((s): s is McpServerConfig => s !== null)
  return { version: MCP_SERVERS_FILE_VERSION, runtimes, servers }
}

/** The file text: each server carries only the fields of its kind */
export function serializeMcpServersFile(file: McpServersFile): string {
  const servers = file.servers.map((s) => {
    const common = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      enabled: s.enabled,
      keepResultsInside: s.keepResultsInside,
    }
    const byKind =
      s.kind === 'remote'
        ? { url: s.url, transport: s.transport, headers: s.headers, oauth: s.oauth }
        : {
            command: s.command,
            args: s.args,
            env: s.env,
            approvedLaunch: s.approvedLaunch,
            approvedPlan: s.approvedPlan,
          }
    return {
      ...common,
      ...byKind,
      instructions: s.instructions,
      pendingInstructions: s.pendingInstructions,
      tools: s.tools,
      newTools: s.newTools,
    }
  })
  return `${JSON.stringify({ version: file.version, runtimes: file.runtimes, servers }, null, 2)}\n`
}

// ---- the store -----------------------------------------------------------

export interface McpStoreLoad {
  /** `damaged`: the file could not be read as JSON; the next save keeps it beside as `.damaged` */
  state: 'missing' | 'ok' | 'damaged'
  /** secrets sealed by another account or PC, now empty and to be entered again */
  unreadable: { serverId: string; secret: McpSecretRef }[]
}

export interface McpServersStore {
  load(): Promise<McpStoreLoad>
  /** a copy with plain secrets: main process only, never sent to a screen */
  get(): McpServersFile
  server(id: string): McpServerConfig | null
  /** change and save; calls run one after another */
  update(change: (file: McpServersFile) => McpServersFile | void): Promise<McpServersFile>
  /** drop a server and every secret it held (4.9); false when there was none */
  removeServer(id: string): Promise<boolean>
  /** whether this PC seals secrets now */
  sealing(): boolean
  /** what a screen may see */
  view(): McpServersView
}

const copy = <T>(value: T): T => structuredClone(value)

export function createMcpServersStore(filePath: string, codec: McpSecretCodec): McpServersStore {
  let state: McpServersFile = emptyMcpServersFile()
  /** per server id: secrets written empty because this PC could not seal them */
  let memoryOnly = new Map<string, Set<McpSecretRef>>()
  let damaged = false
  let queue: Promise<unknown> = Promise.resolve()

  async function write(next: McpServersFile): Promise<void> {
    const sealedServers: McpServerConfig[] = []
    const nextMemoryOnly = new Map<string, Set<McpSecretRef>>()
    for (const server of next.servers) {
      const sealed = sealServerSecrets(server, codec)
      sealedServers.push(sealed.server)
      if (sealed.memoryOnly.length > 0) nextMemoryOnly.set(server.id, new Set(sealed.memoryOnly))
    }
    if (damaged) {
      await copyFile(filePath, `${filePath}.damaged`).catch(() => {})
      damaged = false
    }
    const text = serializeMcpServersFile({ ...next, servers: sealedServers })
    await atomicWriteFile(filePath, Buffer.from(text, 'utf8'))
    state = next
    memoryOnly = nextMemoryOnly
  }

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => {})
    return run
  }

  function serverView(server: McpServerConfig): McpServerRecordView {
    const held = memoryOnly.get(server.id) ?? new Set<McpSecretRef>()
    const views = (record: Record<string, string>, prefix: string) =>
      Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, secretView(v, held.has(`${prefix}:${k}`))]),
      )
    return {
      id: server.id,
      name: server.name,
      kind: server.kind,
      enabled: server.enabled,
      keepResultsInside: server.keepResultsInside,
      url: server.url,
      transport: server.transport,
      headers: views(server.headers, 'headers'),
      oauth: server.oauth
        ? {
            clientId: server.oauth.clientId,
            clientSecret: secretView(server.oauth.clientSecret, held.has('oauth:clientSecret')),
            signedIn: server.oauth.tokens !== '',
          }
        : null,
      command: server.command,
      args: [...server.args],
      env: views(server.env, 'env'),
      launchReviewNeeded: launchReviewNeeded(server),
      instructions: copy(server.instructions),
      pendingInstructions: server.pendingInstructions,
      tools: copy(server.tools),
      newTools: [...server.newTools],
      secretsMemoryOnly: held.size > 0,
    }
  }

  return {
    load: () =>
      serial(async () => {
        let text: string
        try {
          text = await readFile(filePath, 'utf8')
        } catch {
          state = emptyMcpServersFile()
          memoryOnly = new Map()
          return { state: 'missing', unreadable: [] }
        }
        let raw: unknown
        try {
          raw = JSON.parse(text)
        } catch {
          state = emptyMcpServersFile()
          memoryOnly = new Map()
          damaged = true
          return { state: 'damaged', unreadable: [] }
        }
        const file = normalizeMcpServersFile(raw)
        const unreadable: McpStoreLoad['unreadable'] = []
        const servers = file.servers.map((s) => {
          const opened = openServerSecrets(s, codec)
          for (const secret of opened.unreadable) unreadable.push({ serverId: s.id, secret })
          return opened.server
        })
        state = { ...file, servers }
        memoryOnly = new Map()
        damaged = false
        return { state: 'ok', unreadable }
      }),
    get: () => copy(state),
    server: (id) => {
      const found = state.servers.find((s) => s.id === id)
      return found ? copy(found) : null
    },
    update: (change) =>
      serial(async () => {
        const draft = copy(state)
        const next = change(draft) ?? draft
        await write({ ...next, version: MCP_SERVERS_FILE_VERSION })
        return copy(state)
      }),
    removeServer: (id) =>
      serial(async () => {
        if (!state.servers.some((s) => s.id === id)) return false
        await write({ ...state, servers: state.servers.filter((s) => s.id !== id) })
        return true
      }),
    sealing: () => codec.canSeal(),
    view: () => ({
      sealing: codec.canSeal(),
      runtimes: copy(state.runtimes),
      servers: state.servers.map(serverView),
    }),
  }
}
