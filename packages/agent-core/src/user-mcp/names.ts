/**
 * Names of user MCP servers and of their tools as the AI sees them (user MCP
 * spec 4.2, 6.1): `mcp__<server>__<tool>`, the shape skills written for coding
 * agents already call.
 *
 * A file with no imports, exported as `@genoffice/agent-core/user-mcp/names`:
 * the main process checks names when a server is registered and cannot load
 * the package root as it is.
 *
 * A server name holds no `__` and neither starts nor ends with `_`, so the
 * server part of a tool name is everything between `mcp__` and the next `__`.
 */

export const MCP_TOOL_PREFIX = 'mcp__'
export const MCP_NAME_SEPARATOR = '__'

/** Longest server name, a tunable default */
export const MCP_SERVER_NAME_MAX = 24
/** Longest full tool name the providers accept */
export const MCP_TOOL_NAME_MAX = 64

/** The app's own MCP server; a user server may not take its name */
export const APP_MCP_SERVER_NAME = 'ieumoffice-editor'
/** Server names refused, compared without case */
export const RESERVED_MCP_SERVER_NAMES: ReadonlySet<string> = new Set([APP_MCP_SERVER_NAME])

export type ServerNameProblem =
  'empty' | 'too-long' | 'bad-char' | 'double-underscore' | 'edge-underscore' | 'reserved'

const NAME_CHARS = /^[A-Za-z0-9_-]+$/
const FULL_TOOL_NAME = new RegExp(`^[A-Za-z0-9_-]{1,${MCP_TOOL_NAME_MAX}}$`)

const isReserved = (name: string) => RESERVED_MCP_SERVER_NAMES.has(name.toLowerCase())

/** The structural part of the server rule, the one parsing relies on */
function shapeProblem(name: string): ServerNameProblem | null {
  if (name.length === 0) return 'empty'
  if (!NAME_CHARS.test(name)) return 'bad-char'
  if (name.includes(MCP_NAME_SEPARATOR)) return 'double-underscore'
  if (name.startsWith('_') || name.endsWith('_')) return 'edge-underscore'
  return null
}

/** What breaks the server-name rule, or null when the name may be registered */
export function serverNameProblem(
  name: string,
  maxLength: number = MCP_SERVER_NAME_MAX,
): ServerNameProblem | null {
  if (name.length === 0) return 'empty'
  if (name.length > maxLength) return 'too-long'
  return shapeProblem(name) ?? (isReserved(name) ? 'reserved' : null)
}

export function isValidServerName(name: string, maxLength: number = MCP_SERVER_NAME_MAX): boolean {
  return serverNameProblem(name, maxLength) === null
}

/** Trim the characters a server name may not start or end with in a suggestion */
const trimEdges = (s: string) => s.replace(/^[-_]+|[-_]+$/g, '')

/**
 * A name that follows the rule, made from a pasted one: other characters
 * become `-`, runs of `_` become one, the edges are trimmed and the length
 * cut. A name already taken (compared without case) or reserved gets `-2`,
 * `-3`, ... Falls back to `server` when nothing usable is left.
 */
export function suggestServerName(
  raw: string,
  taken: Iterable<string> = [],
  maxLength: number = MCP_SERVER_NAME_MAX,
): string {
  const cleaned = trimEdges(raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/_{2,}/g, '_'))
  const base = /[A-Za-z0-9]/.test(cleaned) ? cleaned : 'server'
  const used = new Set([...taken].map((t) => t.toLowerCase()))
  const fits = (suffix: string) => {
    const name = trimEdges(base.slice(0, Math.max(1, maxLength - suffix.length))) + suffix
    return isValidServerName(name, maxLength) && !used.has(name.toLowerCase()) ? name : null
  }
  // one more try than there are taken names always finds a free number when a suffix fits at all
  for (let n = 1; n <= used.size + 2; n++) {
    const name = fits(n === 1 ? '' : `-${n}`)
    if (name) return name
  }
  return trimEdges(base.slice(0, maxLength)) || 'server'
}

/** Where a server is reached or what it runs, for a name when the given one has no usable letter */
export interface ServerNameSource {
  url?: string
  command?: string
  args?: readonly string[]
}

/** Host labels that say nothing about the server */
const PLAIN_HOST_LABELS = new Set(['www', 'mcp', 'api', 'app', 'server', 'servers'])
/** Commands that run the package named in their arguments */
const PACKAGE_RUNNERS = new Set([
  'npx',
  'bunx',
  'uvx',
  'pnpx',
  'pipx',
  'uv',
  'pnpm',
  'npm',
  'bun',
  'yarn',
])
/** Words before the package in `uv run`, `pnpm dlx`, `npm exec`, ... */
const RUNNER_WORDS = new Set(['run', 'dlx', 'exec', 'x', 'tool'])

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? ''

/** A word for a server from its address: the first telling label of the host name */
function nameFromUrl(raw: string): string {
  let host: string
  try {
    host = new URL(raw.trim()).hostname
  } catch {
    return ''
  }
  // an address by number says nothing; neither does this PC
  if (host === '' || host.includes(':') || /^[\d.]+$/.test(host) || host === 'localhost') return ''
  const labels = host.split('.').filter(Boolean)
  const telling = labels.slice(0, Math.max(1, labels.length - 1))
  return telling.find((label) => !PLAIN_HOST_LABELS.has(label.toLowerCase())) ?? ''
}

/** A word for a server from what it runs: the package a runner starts, or the script or program */
function nameFromCommand(command: string, args: readonly string[]): string {
  const program = baseName(command.trim())
    .replace(/\.(exe|cmd|bat)$/i, '')
    .toLowerCase()
  const words = args.filter((a) => a.trim() !== '' && !a.startsWith('-'))
  const target = PACKAGE_RUNNERS.has(program)
    ? (words.find((w) => !RUNNER_WORDS.has(w)) ?? '')
    : /^(node|python3?|deno)$/.test(program)
      ? (words[0] ?? '')
      : program
  if (!target) return ''
  // a scoped package keeps its own part; a version or a path goes
  let word = target.startsWith('@') ? (target.split('/')[1] ?? '') : target
  word = baseName(word)
    .replace(/@[^@]*$/, '')
    .replace(/\.[A-Za-z0-9]+$/, '')
  return word
}

/**
 * `suggestServerName`, but a name with no usable letter (a Korean name, for
 * one) is made from the address host (`dict` for `dict.example.com`) or the
 * package or script the command runs, before falling back to `server`.
 */
export function suggestServerNameFrom(
  raw: string,
  taken: Iterable<string> = [],
  source: ServerNameSource = {},
): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]+/g, '-')
  if (/[A-Za-z0-9]/.test(cleaned)) return suggestServerName(raw, taken)
  const derived =
    (source.url ? nameFromUrl(source.url) : '') ||
    (source.command ? nameFromCommand(source.command, source.args ?? []) : '')
  return suggestServerName(derived || 'server', taken)
}

/**
 * A tool step as a person reads it: `server · tool` for a user MCP tool,
 * other tool names with their underscores and dashes as spaces.
 */
export function toolStepLabel(name: string): string {
  const parsed = parseMcpToolName(name)
  if (parsed) return `${parsed.server} · ${parsed.tool}`
  return name.replace(/[_-]+/g, ' ')
}

/** The tool part made safe: every character outside [A-Za-z0-9_-] becomes `_` */
export function sanitizeToolName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** `mcp__<server>__<tool>`, the parts used as given */
export function mcpToolName(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}${MCP_NAME_SEPARATOR}${tool}`
}

/** Whether a tool name belongs to a user MCP server (prefix only; app tools never carry it) */
export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX)
}

export type ToolNameProblem = 'empty' | 'too-long' | 'collision' | 'server-name'

export interface McpToolNameEntry {
  /** the name the server reported */
  original: string
  /** the full name the AI sees */
  name: string
  /** the tool part had characters replaced (show the new name to the person) */
  changed: boolean
  /** why the tool cannot be turned on, or null */
  problem: ToolNameProblem | null
}

/**
 * The AI-facing names of one server's tools, in the order given. A tool is
 * unusable when its name is empty, when the full name runs past 64
 * characters, or when it maps to the same full name as another tool (both
 * become unusable). With a server name that breaks the structural rule every
 * tool is unusable, since its names could not be split back.
 */
export function mapServerToolNames(server: string, tools: readonly string[]): McpToolNameEntry[] {
  const badServer = shapeProblem(server) !== null
  const entries = tools.map((original) => {
    const tool = sanitizeToolName(original)
    return { original, name: mcpToolName(server, tool), changed: tool !== original }
  })
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
  return entries.map((e) => ({
    ...e,
    problem: badServer
      ? 'server-name'
      : e.original.length === 0
        ? 'empty'
        : e.name.length > MCP_TOOL_NAME_MAX
          ? 'too-long'
          : (counts.get(e.name) ?? 0) > 1
            ? 'collision'
            : null,
  }))
}

export interface ParsedMcpToolName {
  server: string
  /** the tool part as the AI sees it (after sanitizing) */
  tool: string
}

/**
 * Split a full tool name into server and tool, or null when it is not a
 * well-formed user MCP tool name. Structural only: whether the server is
 * registered is `parseMcpToolNameIn`'s question.
 */
export function parseMcpToolName(name: string): ParsedMcpToolName | null {
  if (!isMcpToolName(name) || !FULL_TOOL_NAME.test(name)) return null
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const cut = rest.indexOf(MCP_NAME_SEPARATOR)
  if (cut < 0) return null
  const server = rest.slice(0, cut)
  const tool = rest.slice(cut + MCP_NAME_SEPARATOR.length)
  if (tool.length === 0 || shapeProblem(server) !== null) return null
  return { server, tool }
}

/** `parseMcpToolName`, accepted only when the server is one of the registered names */
export function parseMcpToolNameIn(
  name: string,
  servers: ReadonlySet<string> | Iterable<string>,
): ParsedMcpToolName | null {
  const parsed = parseMcpToolName(name)
  if (!parsed) return null
  const known = servers instanceof Set ? servers : new Set(servers)
  return known.has(parsed.server) ? parsed : null
}
