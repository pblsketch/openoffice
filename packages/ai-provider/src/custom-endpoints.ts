// Several user-hosted OpenAI-compatible servers side by side. The request path
// only ever reads `providers.custom`, so the list is kept next to it and the
// active entry is copied into that slot on every change: nothing downstream
// learns about endpoints, and a settings file from before the list existed
// still works because its single slot becomes the first entry.
import { aiEffortOf, aiModelEffortOf } from './effort'
import { localEndpointFieldsOf } from './local-profile'
import type { AiCustomEndpoint, AiProviderConfig, AiSettings } from './types'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function newCustomEndpointId(): string {
  let id = ''
  for (let i = 0; i < 8; i += 1) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return `ep-${id}`
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function configuredSlot(config: AiProviderConfig | undefined): boolean {
  return Boolean(str(config?.baseUrl) || str(config?.model) || str(config?.apiKey))
}

function normalizeEndpoints(raw: unknown): AiCustomEndpoint[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: AiCustomEndpoint[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const id = str(e.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const models = Array.isArray(e.models)
      ? [
          ...new Set(
            e.models.filter((m): m is string => typeof m === 'string').map((m) => m.trim()),
          ),
        ].filter(Boolean)
      : undefined
    out.push({
      id,
      name: str(e.name),
      baseUrl: str(e.baseUrl),
      apiKey: str(e.apiKey),
      model: str(e.model),
      ...(models && models.length > 0 ? { models } : {}),
      ...(aiEffortOf(e.effort) ? { effort: aiEffortOf(e.effort) } : {}),
      // local-only fields survive a read/write round trip; malformed ones are dropped
      ...localEndpointFieldsOf(e),
    })
  }
  return out
}

/**
 * The endpoint list and the `custom` slot made consistent. A file with a slot
 * but no list gets a one-entry list; a stale active id falls to the first
 * entry; the active entry is copied into the slot. An explicit empty
 * `customEndpoint` means "no active server": the list stays, but the slot is
 * cleared so the deleted server is not called and no first entry takes over.
 * Pure: returns a new object.
 */
export function resolveCustomEndpoints(settings: AiSettings): AiSettings {
  let endpoints = normalizeEndpoints(settings.customEndpoints)
  const slot = settings.providers?.custom
  if (endpoints.length === 0 && configuredSlot(slot)) {
    endpoints = [
      {
        id: newCustomEndpointId(),
        name: '',
        baseUrl: str(slot?.baseUrl),
        apiKey: str(slot?.apiKey),
        model: str(slot?.model),
      },
    ]
  }
  if (endpoints.length === 0) {
    const { customEndpoints: _list, customEndpoint: _active, ...rest } = settings
    // an explicit "no active server" survives an empty list; a file that never
    // carried the field is left without it, as before
    return settings.customEndpoint === '' ? { ...rest, customEndpoint: '' } : rest
  }
  const storedActive = settings.customEndpoint
  const noActiveServer = typeof storedActive === 'string' && storedActive.trim() === ''
  const active = noActiveServer
    ? undefined
    : (endpoints.find((e) => e.id === str(storedActive)) ?? (endpoints[0] as AiCustomEndpoint))
  if (!active) {
    return {
      ...settings,
      customEndpoints: endpoints,
      customEndpoint: '',
      providers: {
        ...settings.providers,
        // clear the mirror: isKeyProviderConfigured must read false, so a
        // server the user removed is not called through the old slot
        custom: { apiKey: '', model: '', baseUrl: '' },
      },
    }
  }
  return {
    ...settings,
    customEndpoints: endpoints,
    customEndpoint: active.id,
    providers: {
      ...settings.providers,
      custom: {
        apiKey: active.apiKey,
        model: active.model,
        baseUrl: active.baseUrl,
        ...effortOf(active),
      },
    },
  }
}

/**
 * The active server's level and what its model profile says the model takes,
 * in the shape the request path reads from `providers.custom` (decision 0096).
 */
function effortOf(endpoint: AiCustomEndpoint): Pick<AiProviderConfig, 'effort' | 'modelEfforts'> {
  const effort = aiEffortOf(endpoint.effort)
  const profile = endpoint.modelProfiles?.[endpoint.model]
  const taken = aiModelEffortOf({
    efforts: profile?.efforts,
    defaultEffort: profile?.defaultEffort,
  })
  return {
    ...(effort ? { effort } : {}),
    ...(taken && endpoint.model ? { modelEfforts: { [endpoint.model]: taken } } : {}),
  }
}

export function activeCustomEndpoint(settings: AiSettings): AiCustomEndpoint | undefined {
  return settings.customEndpoints?.find((e) => e.id === settings.customEndpoint)
}

export function selectCustomEndpoint(settings: AiSettings, id: string): AiSettings {
  return resolveCustomEndpoints({ ...settings, customEndpoint: id })
}

/** Replace the entry with the same id, or append; the new entry becomes active when `activate` is set. */
export function upsertCustomEndpoint(
  settings: AiSettings,
  endpoint: AiCustomEndpoint,
  activate = false,
): AiSettings {
  const list = settings.customEndpoints ?? []
  const exists = list.some((e) => e.id === endpoint.id)
  const customEndpoints = exists
    ? list.map((e) => (e.id === endpoint.id ? endpoint : e))
    : [...list, endpoint]
  return resolveCustomEndpoints({
    ...settings,
    customEndpoints,
    customEndpoint: activate || !exists ? endpoint.id : settings.customEndpoint,
  })
}

export interface RemoveCustomEndpointOptions {
  /**
   * What happens when the removed entry was the active one: `true` (default)
   * activates the next entry, `false` leaves the selection explicitly empty so
   * no other server is used without the user choosing it.
   */
  fallback?: boolean | undefined
}

export function removeCustomEndpoint(
  settings: AiSettings,
  id: string,
  options?: RemoveCustomEndpointOptions,
): AiSettings {
  const fallback = options?.fallback ?? true
  const list = settings.customEndpoints ?? []
  const storedActive = settings.customEndpoint
  const explicitEmpty = typeof storedActive === 'string' && storedActive.trim() === ''
  // the resolver's own rule: no explicit empty id means the first entry is in use
  const activeId = explicitEmpty
    ? ''
    : (list.find((e) => e.id === str(storedActive))?.id ?? list[0]?.id ?? '')
  const removedActive = activeId === id
  const customEndpoints = list.filter((e) => e.id !== id)
  // the slot mirrored the removed entry; cleared first or it would be re-seeded as a new entry
  const blank: AiProviderConfig = { apiKey: '', model: '', baseUrl: '' }
  return resolveCustomEndpoints({
    ...settings,
    customEndpoints,
    ...(!fallback && removedActive ? { customEndpoint: '' } : {}),
    providers: { ...settings.providers, custom: blank },
  })
}

/** Display name for a picker row: the user's name, else the host part of the address. */
export function customEndpointLabel(endpoint: AiCustomEndpoint, fallback: string): string {
  if (endpoint.name) return endpoint.name
  try {
    return new URL(endpoint.baseUrl).host || fallback
  } catch {
    return endpoint.baseUrl || fallback
  }
}
