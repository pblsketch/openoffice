import { createHash } from 'node:crypto'
import type { McpToolDefinition } from '../../shared/mcp-servers-api'

/**
 * Approval fingerprints for user MCP servers (spec 6.2): SHA-256 over
 * normalized text, so the same content always gives the same fingerprint
 * whatever order a server lists object keys in.
 */

/** JSON with object keys sorted at every level and undefined members left out */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null'
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)))
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.keys(value)
    .sort()
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])] as const)
  // defineProperty-style construction keeps a `__proto__` key an ordinary member
  return Object.fromEntries(entries)
}

/** Line endings and Unicode composition do not count as a change */
const normalizeText = (text: string) => text.replace(/\r\n?/g, '\n').normalize('NFC')

export function fingerprintOf(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

/** A tool's name, description and input schema; annotations are display hints and left out */
export function toolFingerprint(
  name: string,
  definition: Pick<McpToolDefinition, 'description' | 'inputSchema'>,
): string {
  return fingerprintOf(
    stableJson({
      name,
      description: normalizeText(definition.description ?? ''),
      inputSchema: definition.inputSchema ?? {},
    }),
  )
}

export function instructionsFingerprint(text: string): string {
  return fingerprintOf(normalizeText(text))
}

export interface LaunchShape {
  command: string
  args: readonly string[]
  /** the names only: a changed value is not asked about again (4.5) */
  envNames: Iterable<string>
}

/** What a person approves before a local server first runs: command, arguments, env names */
export function launchFingerprint(launch: LaunchShape): string {
  return fingerprintOf(
    stableJson({
      command: launch.command,
      args: [...launch.args],
      envNames: [...launch.envNames].sort(),
    }),
  )
}

/** The fields of a stored server the launch fingerprint reads */
export interface LaunchFields {
  kind: 'remote' | 'local'
  command: string
  args: readonly string[]
  env: Record<string, string>
  approvedLaunch: string | null
}

export function serverLaunchFingerprint(server: LaunchFields): string {
  return launchFingerprint({
    command: server.command,
    args: server.args,
    envNames: Object.keys(server.env),
  })
}

/**
 * A local server must not start until the person approves its launch: never
 * approved yet, or the command, arguments or env names changed since (12.1).
 */
export function launchReviewNeeded(server: LaunchFields): boolean {
  if (server.kind !== 'local') return false
  return server.approvedLaunch !== serverLaunchFingerprint(server)
}
