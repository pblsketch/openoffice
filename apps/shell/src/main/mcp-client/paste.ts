import { isValidServerName, suggestServerName } from '@genoffice/agent-core/user-mcp/names'
import type { McpServerKind, McpTransport } from '../../shared/mcp-servers-api'
import { parseToml } from './toml'

/**
 * Settings text pasted from a server's guide (user MCP spec 4.1, 12.3):
 * - JSON `{"mcpServers": {"<name>": <server>}}`
 * - the same without the wrapper, `{"<name>": <server>}`
 * - Codex TOML `[mcp_servers.<name>]`
 * Each server is read into the fields of the registration screen; fields the
 * app does not know are listed as ignored and dropped. Nothing here reads the
 * PC: Codex's `bearer_token_env_var` names a variable whose value is never
 * looked up, the key field stays empty for the person to fill.
 */

export interface PastedServer {
  /** the name as pasted */
  pastedName: string
  /** a name that follows the rule and is free */
  name: string
  /** `name` differs from the pasted one: "may differ from the name skills use" */
  nameChanged: boolean
  kind: McpServerKind
  url: string
  transport: McpTransport
  headers: Record<string, string>
  command: string
  args: string[]
  env: Record<string, string>
  /** the setting took its key from a PC variable: ask the person to enter the key */
  keyNeeded: boolean
  /** that variable's name, for the hint; its value is never read */
  keyEnvVar: string | null
  /** fields of this server the app does not use */
  ignored: string[]
  /** why this server cannot be registered as pasted, or null */
  problem: 'no-target' | 'unsupported-type' | null
}

export type PasteResult =
  | {
      ok: true
      format: 'json' | 'json-bare' | 'toml'
      servers: PastedServer[]
      /** top-level entries that are not servers */
      ignored: string[]
    }
  | { ok: false; error: 'empty' | 'unreadable' | 'no-servers' }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const KNOWN_FIELDS = new Set([
  'type',
  'command',
  'args',
  'env',
  'url',
  'serverUrl',
  'headers',
  'http_headers',
  'bearer_token_env_var',
])
const REMOTE_TYPES: Record<string, McpTransport> = {
  http: 'auto',
  'streamable-http': 'auto',
  streamableHttp: 'auto',
  sse: 'sse',
}

/** A scalar as text; anything else is dropped */
const scalarText = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null

const textRecord = (v: unknown): Record<string, string> =>
  isRecord(v)
    ? Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, scalarText(x)] as const)
          .filter((e): e is readonly [string, string] => e[1] !== null),
      )
    : {}

/** The code inside the first fenced block, when the paste came with prose around it */
function unfence(text: string): string {
  const fenced = text.match(/```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/)
  return fenced ? fenced[1] : text
}

function readServer(
  pastedName: string,
  raw: Record<string, unknown>,
  taken: Set<string>,
): PastedServer {
  const name =
    isValidServerName(pastedName) && !taken.has(pastedName.toLowerCase())
      ? pastedName
      : suggestServerName(pastedName, taken)
  taken.add(name.toLowerCase())

  const command = typeof raw.command === 'string' ? raw.command.trim() : ''
  const urlField = typeof raw.url === 'string' ? raw.url : raw.serverUrl
  const url = typeof urlField === 'string' ? urlField.trim() : ''
  const type = typeof raw.type === 'string' ? raw.type : null
  const kind: McpServerKind = command !== '' ? 'local' : 'remote'
  const local = kind === 'local'
  const remoteTransport =
    type !== null && Object.prototype.hasOwnProperty.call(REMOTE_TYPES, type)
      ? REMOTE_TYPES[type]
      : null

  let problem: PastedServer['problem'] = null
  if (command === '' && url === '') problem = 'no-target'
  else if (type !== null && (local ? type !== 'stdio' : remoteTransport === null)) {
    problem = 'unsupported-type'
  }

  const keyEnvVar =
    typeof raw.bearer_token_env_var === 'string' && raw.bearer_token_env_var !== ''
      ? raw.bearer_token_env_var
      : null
  return {
    pastedName,
    name,
    nameChanged: name !== pastedName,
    kind,
    url: local ? '' : url,
    transport: local ? 'auto' : (remoteTransport ?? 'auto'),
    headers: local ? {} : { ...textRecord(raw.http_headers), ...textRecord(raw.headers) },
    command,
    args:
      local && Array.isArray(raw.args)
        ? raw.args.map(scalarText).filter((a): a is string => a !== null)
        : [],
    env: local ? textRecord(raw.env) : {},
    keyNeeded: !local && keyEnvVar !== null,
    keyEnvVar: local ? null : keyEnvVar,
    ignored: Object.keys(raw).filter((k) => !KNOWN_FIELDS.has(k)),
    problem,
  }
}

function readServers(
  entries: Record<string, unknown>,
  taken: Iterable<string>,
): { servers: PastedServer[]; ignored: string[] } {
  const used = new Set([...taken].map((t) => t.toLowerCase()))
  const servers: PastedServer[] = []
  const ignored: string[] = []
  for (const [name, raw] of Object.entries(entries)) {
    if (isRecord(raw)) servers.push(readServer(name, raw, used))
    else ignored.push(name)
  }
  return { servers, ignored }
}

/**
 * The servers in a pasted settings text. `taken` holds the names already
 * registered; each pasted server gets a free name, also among the others
 * in the same paste.
 */
export function parseMcpPaste(text: string, taken: Iterable<string> = []): PasteResult {
  const body = unfence(text).trim()
  if (body === '') return { ok: false, error: 'empty' }

  let format: 'json' | 'json-bare' | 'toml'
  let entries: Record<string, unknown>
  let ignored: string[]
  if (body.startsWith('{')) {
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      return { ok: false, error: 'unreadable' }
    }
    if (!isRecord(raw)) return { ok: false, error: 'unreadable' }
    if (isRecord(raw.mcpServers)) {
      format = 'json'
      entries = raw.mcpServers
      ignored = Object.keys(raw).filter((k) => k !== 'mcpServers')
    } else {
      format = 'json-bare'
      entries = raw
      ignored = []
    }
  } else {
    let raw: Record<string, unknown>
    try {
      raw = parseToml(body)
    } catch {
      return { ok: false, error: 'unreadable' }
    }
    if (!isRecord(raw.mcp_servers)) return { ok: false, error: 'unreadable' }
    format = 'toml'
    entries = raw.mcp_servers
    ignored = Object.keys(raw).filter((k) => k !== 'mcp_servers')
  }

  const read = readServers(entries, taken)
  if (read.servers.length === 0) return { ok: false, error: 'no-servers' }
  return { ok: true, format, servers: read.servers, ignored: [...ignored, ...read.ignored] }
}
