// Model profiles of a user-hosted local AI server: what the server, a
// connection test or the user reported about one model, plus the two answers
// the request path needs (may the tools be sent, how much context fits).
//
// Pure and browser-safe: the settings screen and the main process read the same
// rules. Absent never means false — a value nobody reported stays unknown, and
// only a `user` source outranks what a later observation reports.
import { aiEffortOf, aiEffortsOf } from './effort'
import type { AiCustomEndpoint, AiLocalModelProfile, AiLocalValueSource, AiSettings } from './types'

/** context assumed when a local model's window is unknown (conservative on purpose) */
export const DEFAULT_LOCAL_CONTEXT_TOKENS = 4096
/** first-response limit used when an endpoint carries none */
export const DEFAULT_LOCAL_TIMEOUT_MS = 300_000
export const MIN_LOCAL_TIMEOUT_MS = 60_000
export const MAX_LOCAL_TIMEOUT_MS = 600_000
export const MAX_LOCAL_CONTEXT_TOKENS = 10_000_000
export const MAX_LOCAL_MODEL_PROFILES = 2_000
export const MAX_LOCAL_MODEL_ID_LENGTH = 256
export const MAX_LOCAL_NOTES_LENGTH = 500

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** an integer inside `[min, max]`, or undefined when the value is not one */
function integerInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined
}

/** one of the three places a profile value can come from */
export function localValueSourceOf(raw: unknown): AiLocalValueSource | undefined {
  return raw === 'server' || raw === 'user' || raw === 'test' ? raw : undefined
}

/** a context figure: a positive integer, at most ten million tokens */
export function localContextTokensOf(raw: unknown): number | undefined {
  return integerInRange(raw, 1, MAX_LOCAL_CONTEXT_TOKENS)
}

/** a first-response limit: a whole number of milliseconds inside the allowed window */
export function localTimeoutMsOf(raw: unknown): number | undefined {
  return integerInRange(raw, MIN_LOCAL_TIMEOUT_MS, MAX_LOCAL_TIMEOUT_MS)
}

/**
 * One model profile with every malformed field dropped. Returns undefined when
 * nothing survives, so a bad object does not leave an empty entry behind.
 */
export function localModelProfileOf(raw: unknown): AiLocalModelProfile | undefined {
  if (!isRecord(raw)) return undefined
  const profile: AiLocalModelProfile = {}
  const contextLength = localContextTokensOf(raw.contextLength)
  if (contextLength !== undefined) profile.contextLength = contextLength
  const maxContextLength = localContextTokensOf(raw.maxContextLength)
  if (maxContextLength !== undefined) profile.maxContextLength = maxContextLength
  if (typeof raw.tools === 'boolean') profile.tools = raw.tools
  if (typeof raw.vision === 'boolean') profile.vision = raw.vision
  const contextSource = localValueSourceOf(raw.contextSource)
  if (contextSource !== undefined) profile.contextSource = contextSource
  const toolsSource = localValueSourceOf(raw.toolsSource)
  if (toolsSource !== undefined) profile.toolsSource = toolsSource
  const visionSource = localValueSourceOf(raw.visionSource)
  if (visionSource !== undefined) profile.visionSource = visionSource
  if (typeof raw.checkedAt === 'number' && Number.isInteger(raw.checkedAt) && raw.checkedAt > 0) {
    profile.checkedAt = raw.checkedAt
  }
  // notes are free text: trimmed, bounded, and left out when blank
  const notes = str(raw.notes).slice(0, MAX_LOCAL_NOTES_LENGTH)
  if (notes) profile.notes = notes
  // the levels the server named; a default counts only as one of them
  const efforts = aiEffortsOf(raw.efforts)
  if (efforts) {
    profile.efforts = efforts
    const defaultEffort = aiEffortOf(raw.defaultEffort)
    if (defaultEffort && efforts.includes(defaultEffort)) profile.defaultEffort = defaultEffort
  }
  return Object.keys(profile).length > 0 ? profile : undefined
}

/**
 * The profile map with malformed entries dropped and the entry count capped.
 * A key longer than a model id can be is dropped rather than truncated: a
 * shortened key would name a model the server never listed.
 */
export function localModelProfilesOf(
  raw: unknown,
): Record<string, AiLocalModelProfile> | undefined {
  if (!isRecord(raw)) return undefined
  const profiles: Record<string, AiLocalModelProfile> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_LOCAL_MODEL_PROFILES) break
    const modelId = str(key)
    if (!modelId || modelId.length > MAX_LOCAL_MODEL_ID_LENGTH) continue
    const profile = localModelProfileOf(value)
    if (!profile) continue
    profiles[modelId] = profile
    count += 1
  }
  return count > 0 ? profiles : undefined
}

/** The local-only fields of one endpoint, safe to spread into an endpoint object. */
export interface AiLocalEndpointFields {
  kind?: 'local' | undefined
  modelProfiles?: Record<string, AiLocalModelProfile> | undefined
  timeoutMs?: number | undefined
}

export function localEndpointFieldsOf(raw: unknown): AiLocalEndpointFields {
  if (!isRecord(raw)) return {}
  const modelProfiles = localModelProfilesOf(raw.modelProfiles)
  const timeoutMs = localTimeoutMsOf(raw.timeoutMs)
  return {
    ...(raw.kind === 'local' ? { kind: 'local' as const } : {}),
    ...(modelProfiles ? { modelProfiles } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  }
}

/** The endpoint's first-response limit, or the default when it carries none. */
export function localEndpointTimeoutMs(
  endpoint: Pick<AiCustomEndpoint, 'timeoutMs'> | undefined,
): number {
  return localTimeoutMsOf(endpoint?.timeoutMs) ?? DEFAULT_LOCAL_TIMEOUT_MS
}

interface MergedField<T> {
  value: T | undefined
  source: AiLocalValueSource | undefined
}

function mergeField<T>(
  baseValue: T | undefined,
  baseSource: AiLocalValueSource | undefined,
  incomingValue: T | undefined,
  incomingSource: AiLocalValueSource | undefined,
): MergedField<T> {
  // a value the user set outranks anything a server or a test reports later
  if (baseSource === 'user') return { value: baseValue, source: baseSource }
  if (incomingValue !== undefined) return { value: incomingValue, source: incomingSource }
  return { value: baseValue, source: baseSource }
}

/**
 * Two profiles combined item by item (context, tools, vision). A `user` value
 * is never replaced; otherwise the newer observation wins and a value it does
 * not carry keeps the old one. `checkedAt` is the later check and `notes`
 * follow the newer side.
 */
export function mergeLocalModelProfile(
  base: AiLocalModelProfile | undefined,
  incoming: AiLocalModelProfile | undefined,
): AiLocalModelProfile {
  const merged: AiLocalModelProfile = {}

  // contextLength and maxContextLength share one contextSource, so they move together
  const contextLocked = base?.contextSource === 'user'
  const incomingContext =
    incoming !== undefined &&
    (incoming.contextLength !== undefined || incoming.maxContextLength !== undefined)
  const contextLength = contextLocked
    ? base?.contextLength
    : (incoming?.contextLength ?? base?.contextLength)
  const maxContextLength = contextLocked
    ? base?.maxContextLength
    : (incoming?.maxContextLength ?? base?.maxContextLength)
  const contextSource = contextLocked
    ? base?.contextSource
    : incomingContext
      ? incoming?.contextSource
      : base?.contextSource
  if (contextLength !== undefined) merged.contextLength = contextLength
  if (maxContextLength !== undefined) merged.maxContextLength = maxContextLength
  if (contextSource !== undefined) merged.contextSource = contextSource

  const tools = mergeField(base?.tools, base?.toolsSource, incoming?.tools, incoming?.toolsSource)
  if (tools.value !== undefined) merged.tools = tools.value
  if (tools.source !== undefined) merged.toolsSource = tools.source

  const vision = mergeField(
    base?.vision,
    base?.visionSource,
    incoming?.vision,
    incoming?.visionSource,
  )
  if (vision.value !== undefined) merged.vision = vision.value
  if (vision.source !== undefined) merged.visionSource = vision.source

  const checkTimes = [base?.checkedAt, incoming?.checkedAt].filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0,
  )
  if (checkTimes.length > 0) merged.checkedAt = Math.max(...checkTimes)

  const notes = incoming?.notes ?? base?.notes
  if (notes !== undefined) merged.notes = notes

  // only the server reports levels: the newer report, with its default, replaces the older one
  const levels = incoming?.efforts ? incoming : base
  if (levels?.efforts) merged.efforts = levels.efforts
  if (levels?.efforts && levels.defaultEffort) merged.defaultEffort = levels.defaultEffort

  return merged
}

/**
 * The active endpoint when requests actually run on a local server: the
 * `custom` provider is selected and the server it mirrors is marked `local`.
 * A server saved before `kind` existed is never treated as local.
 */
function activeLocalEndpoint(settings: AiSettings): AiCustomEndpoint | undefined {
  if (settings.provider !== 'custom') return undefined
  const id = settings.customEndpoint
  if (typeof id !== 'string' || id.trim() === '') return undefined
  const endpoint = settings.customEndpoints?.find((entry) => entry.id === id)
  return endpoint?.kind === 'local' ? endpoint : undefined
}

function activeLocalProfile(settings: AiSettings): AiLocalModelProfile | undefined {
  const endpoint = activeLocalEndpoint(settings)
  const model = endpoint ? str(endpoint.model) : ''
  if (!endpoint || !model) return undefined
  return endpoint.modelProfiles?.[model]
}

/** What the active local model is known to support; `{}` when it is not local. */
export interface AiLocalModelCapabilities {
  tools?: boolean | undefined
  vision?: boolean | undefined
  contextLength?: number | undefined
}

export function localModelCapabilities(settings: AiSettings): AiLocalModelCapabilities {
  const profile = activeLocalProfile(settings)
  if (!profile) return {}
  const contextLength = localContextTokensOf(profile.contextLength)
  return {
    ...(contextLength !== undefined ? { contextLength } : {}),
    ...(profile.tools !== undefined ? { tools: profile.tools } : {}),
    ...(profile.vision !== undefined ? { vision: profile.vision } : {}),
  }
}

/** The context budget of the active local model, and whether it was reported. */
export interface AiLocalContextLimit {
  limit: number
  known: boolean
}

/**
 * The active local model's context budget. A profile without a context figure
 * (or a local server with no profile yet) reads as the conservative 4096-token
 * assumption with `known: false`; a non-local request has no limit at all.
 */
export function localContextLimit(settings: AiSettings): AiLocalContextLimit | undefined {
  if (!activeLocalEndpoint(settings)) return undefined
  const limit = localContextTokensOf(activeLocalProfile(settings)?.contextLength)
  return limit === undefined
    ? { limit: DEFAULT_LOCAL_CONTEXT_TOKENS, known: false }
    : { limit, known: true }
}
