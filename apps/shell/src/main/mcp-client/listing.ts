import type {
  McpPermission,
  McpToolAnnotations,
  McpToolDefinition,
  McpToolEntry,
} from '../../shared/mcp-servers-api'
import {
  instructionsFingerprint,
  serverLaunchFingerprint,
  stableJson,
  toolFingerprint,
} from './fingerprint'
import type { McpServerConfig } from './store'

/**
 * What a fresh tool list does to a stored server (spec 6.2), and the
 * approvals that clear a review. Pure: each function returns a new server.
 */

/** One tool as a server lists it */
export interface ListedTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: McpToolAnnotations
}

export interface McpListing {
  tools: readonly ListedTool[]
  /** the server's instructions text, or null when it sent none */
  instructions: string | null
}

export interface ListingChanges {
  /** tools whose description or input schema changed: they wait for review */
  changedTools: string[]
  /** tools added with the initial permission */
  newTools: string[]
  /** tools gone from the server, dropped from the list */
  removedTools: string[]
  /** the instructions changed and wait for review */
  instructionsChanged: boolean
}

/** 4.7: a tool the server marks read-only runs without asking; any other asks */
export function initialPermission(annotations: McpToolAnnotations | undefined): McpPermission {
  return annotations?.readOnlyHint === true ? 'always' : 'ask'
}

export function definitionOf(tool: ListedTool): McpToolDefinition {
  const def: McpToolDefinition = {
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? {},
  }
  if (tool.annotations) def.annotations = tool.annotations
  return def
}

const fingerprintOfTool = (tool: ListedTool) => toolFingerprint(tool.name, definitionOf(tool))

const sameDefinition = (a: McpToolDefinition | null, b: McpToolDefinition) =>
  a !== null && stableJson(a) === stableJson(b)

const hasText = (text: string | null): text is string => text !== null && text !== ''

/** Later entries win when a server lists a name twice */
const byName = (tools: readonly ListedTool[]) => new Map(tools.map((t) => [t.name, t]))

/**
 * The listing seen when the person registers the server (4.6): every tool
 * is approved with its initial permission and the instructions shown there
 * are approved too. Nothing counts as new.
 */
export function acceptFirstListing(server: McpServerConfig, listing: McpListing): McpServerConfig {
  const tools = Object.fromEntries(
    [...byName(listing.tools).values()].map((t) => [
      t.name,
      {
        permission: initialPermission(t.annotations),
        approved: fingerprintOfTool(t),
        definition: definitionOf(t),
        pending: null,
      } satisfies McpToolEntry,
    ]),
  )
  return {
    ...server,
    tools,
    newTools: [],
    instructions: hasText(listing.instructions)
      ? { approved: instructionsFingerprint(listing.instructions), text: listing.instructions }
      : null,
    pendingInstructions: null,
  }
}

/**
 * A later listing against what the person approved:
 * - a changed description or input schema puts the new definition in
 *   `pending` (the tool leaves every window until approved; its permission
 *   is kept for afterwards); a tool that changes back clears its review;
 * - changed or newly appearing instructions go to `pendingInstructions`;
 *   instructions that disappear are dropped;
 * - a new tool gets the initial permission and is listed in `newTools`;
 * - a tool gone from the server is dropped.
 * Annotations are display hints outside the fingerprint and follow the server.
 */
export function applyListing(
  server: McpServerConfig,
  listing: McpListing,
): { server: McpServerConfig; changes: ListingChanges } {
  const listed = byName(listing.tools)
  const changes: ListingChanges = {
    changedTools: [],
    newTools: [],
    removedTools: Object.keys(server.tools).filter((name) => !listed.has(name)),
    instructionsChanged: false,
  }

  const entries: [string, McpToolEntry][] = []
  for (const tool of listed.values()) {
    const def = definitionOf(tool)
    const stored = Object.prototype.hasOwnProperty.call(server.tools, tool.name)
      ? server.tools[tool.name]
      : undefined
    if (!stored) {
      changes.newTools.push(tool.name)
      entries.push([
        tool.name,
        {
          permission: initialPermission(tool.annotations),
          approved: fingerprintOfTool(tool),
          definition: def,
          pending: null,
        },
      ])
      continue
    }
    if (fingerprintOfTool(tool) === stored.approved) {
      const definition =
        def.annotations === undefined
          ? {
              description: stored.definition.description,
              inputSchema: stored.definition.inputSchema,
            }
          : { ...stored.definition, annotations: def.annotations }
      entries.push([tool.name, { ...stored, definition, pending: null }])
      continue
    }
    changes.changedTools.push(tool.name)
    entries.push([
      tool.name,
      { ...stored, pending: sameDefinition(stored.pending, def) ? stored.pending : def },
    ])
  }

  let instructions = server.instructions
  let pendingInstructions: string | null = null
  if (!hasText(listing.instructions)) {
    instructions = null
  } else if (
    !instructions ||
    instructionsFingerprint(listing.instructions) !== instructions.approved
  ) {
    pendingInstructions = listing.instructions
    changes.instructionsChanged = true
  }

  const kept = new Set(entries.map(([name]) => name))
  const newTools = [
    ...new Set([...server.newTools.filter((n) => kept.has(n)), ...changes.newTools]),
  ]
  return {
    server: {
      ...server,
      tools: Object.fromEntries(entries),
      newTools,
      instructions,
      pendingInstructions,
    },
    changes,
  }
}

/** The person approved a changed tool: its pending definition becomes the approved one */
export function approveTool(server: McpServerConfig, name: string): McpServerConfig {
  if (!Object.prototype.hasOwnProperty.call(server.tools, name)) return server
  const tool = server.tools[name]
  if (!tool.pending) return server
  const entry: McpToolEntry = {
    ...tool,
    definition: tool.pending,
    approved: toolFingerprint(name, tool.pending),
    pending: null,
  }
  return { ...server, tools: withEntry(server.tools, name, entry) }
}

/** The person approved changed instructions */
export function approveInstructions(server: McpServerConfig): McpServerConfig {
  const text = server.pendingInstructions
  if (text === null) return server
  return {
    ...server,
    instructions: { approved: instructionsFingerprint(text), text },
    pendingInstructions: null,
  }
}

/**
 * The person approved the command shown to them: the stored command,
 * arguments and env names, and the resolved plan they saw (`planFingerprint`)
 */
export function approveLaunch(server: McpServerConfig, plan: string): McpServerConfig {
  if (server.kind !== 'local') return server
  return { ...server, approvedLaunch: serverLaunchFingerprint(server), approvedPlan: plan }
}

/** The person opened this server's tool list: the new-tool notice goes */
export function markToolsSeen(server: McpServerConfig): McpServerConfig {
  return server.newTools.length === 0 ? server : { ...server, newTools: [] }
}

export function setToolPermission(
  server: McpServerConfig,
  name: string,
  permission: McpPermission,
): McpServerConfig {
  if (!Object.prototype.hasOwnProperty.call(server.tools, name)) return server
  return {
    ...server,
    tools: withEntry(server.tools, name, { ...server.tools[name], permission }),
  }
}

/** Tools waiting for the person to approve a changed definition */
export function toolsAwaitingReview(server: McpServerConfig): string[] {
  return Object.entries(server.tools)
    .filter(([, t]) => t.pending !== null)
    .map(([name]) => name)
}

/** Replace one entry without assigning through a key (a tool may be called `__proto__`) */
const withEntry = (tools: Record<string, McpToolEntry>, name: string, entry: McpToolEntry) =>
  Object.fromEntries(Object.entries(tools).map(([n, t]) => [n, n === name ? entry : t]))
