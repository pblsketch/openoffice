import {
  MCP_PERMISSIONS,
  type McpPermission,
  type McpServerInput,
  type McpServerPatch,
} from '../../shared/mcp-servers-api'

/**
 * What the settings screen sends, read as untrusted data: well-formed fields
 * are copied one by one, anything else makes the request malformed. The hub
 * then judges what the values mean (names, addresses, header names).
 */

const ID_MAX = 200
const NAME_MAX = 256
const TEXT_MAX = 16 * 1024
const PASTE_MAX = 256 * 1024
const ENTRIES_MAX = 256

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const shortText = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined

/** A server id, a tool name: non-empty and short */
export const serverIdOf = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= ID_MAX ? v : undefined

export const toolNameOf = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= NAME_MAX ? v : undefined

export const pasteTextOf = (v: unknown): string | undefined => shortText(v, PASTE_MAX)

export const permissionOfInput = (v: unknown): McpPermission | undefined =>
  (MCP_PERMISSIONS as readonly unknown[]).includes(v) ? (v as McpPermission) : undefined

export const booleanOf = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined

/** A plan fingerprint as `plannedLaunch` handed it out (`sha256:` and 64 hex digits) */
export const planFingerprintOf = (v: unknown): string | undefined =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v) ? v : undefined

const BAD = Symbol('bad')
type Read<T> = T | undefined | typeof BAD

/** A record of text values where null means "keep the value held" */
function heldRecordOf(v: unknown): Read<Record<string, string | null>> {
  if (v === undefined) return undefined
  if (!isRecord(v)) return BAD
  const entries = Object.entries(v)
  if (entries.length > ENTRIES_MAX) return BAD
  const out: [string, string | null][] = []
  for (const [k, value] of entries) {
    if (k.length === 0 || k.length > NAME_MAX) return BAD
    if (value !== null && shortText(value, TEXT_MAX) === undefined) return BAD
    out.push([k, value as string | null])
  }
  return Object.fromEntries(out)
}

function argsOf(v: unknown): Read<string[]> {
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.length > ENTRIES_MAX) return BAD
  return v.every((a) => shortText(a, TEXT_MAX) !== undefined) ? (v as string[]) : BAD
}

function optionalText(v: unknown, max = TEXT_MAX): Read<string> {
  if (v === undefined) return undefined
  return shortText(v, max) ?? BAD
}

function keyOf(v: unknown): Read<string | null> {
  if (v === undefined || v === null) return v
  return shortText(v, TEXT_MAX) ?? BAD
}

function oauthClientOf(v: unknown): Read<{ clientId: string; clientSecret: string | null } | null> {
  if (v === undefined || v === null) return v
  if (!isRecord(v)) return BAD
  const clientId = shortText(v.clientId, TEXT_MAX)
  const secret = v.clientSecret
  if (clientId === undefined) return BAD
  if (secret !== null && shortText(secret, TEXT_MAX) === undefined) return BAD
  return { clientId, clientSecret: secret as string | null }
}

function pasteRefOf(v: unknown): Read<{ token: string; index: number }> {
  if (v === undefined) return undefined
  if (!isRecord(v)) return BAD
  const token = serverIdOf(v.token)
  const index = v.index
  if (!token || typeof index !== 'number' || !Number.isInteger(index) || index < 0) return BAD
  return { token, index }
}

/** The fields shared by an addition and an edit; null when one is malformed */
function fieldsOf(raw: Record<string, unknown>): McpServerPatch | null {
  const read = {
    name: optionalText(raw.name, NAME_MAX),
    url: optionalText(raw.url),
    transport:
      raw.transport === undefined
        ? undefined
        : raw.transport === 'auto' || raw.transport === 'sse'
          ? raw.transport
          : BAD,
    key: keyOf(raw.key),
    headers: heldRecordOf(raw.headers),
    oauthClient: oauthClientOf(raw.oauthClient),
    command: optionalText(raw.command),
    args: argsOf(raw.args),
    env: heldRecordOf(raw.env),
    allowPlainHttp:
      raw.allowPlainHttp === undefined ? undefined : (booleanOf(raw.allowPlainHttp) ?? BAD),
  }
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(read)) {
    if (v === BAD) return null
    if (v !== undefined) patch[k] = v
  }
  return patch as McpServerPatch
}

/** A new server from the registration screen, or undefined when it is malformed */
export function mcpServerInputOf(raw: unknown): McpServerInput | undefined {
  if (!isRecord(raw)) return undefined
  if (raw.kind !== 'remote' && raw.kind !== 'local') return undefined
  const fields = fieldsOf(raw)
  const paste = pasteRefOf(raw.paste)
  if (!fields || paste === BAD || typeof fields.name !== 'string') return undefined
  return {
    ...fields,
    name: fields.name,
    kind: raw.kind,
    ...(paste ? { paste } : {}),
  }
}

/** An edit from the settings screen, or undefined when it is malformed */
export function mcpServerPatchOf(raw: unknown): McpServerPatch | undefined {
  if (!isRecord(raw)) return undefined
  return fieldsOf(raw) ?? undefined
}
