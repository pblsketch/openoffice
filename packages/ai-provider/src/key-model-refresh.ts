// When the main process asks the key providers for their models, and how the
// answer reaches the settings file (decision 0087).
//
// A provider is listed once per app run, and again whenever its key or base
// URL changes, so a key pasted a moment ago shows the vendor's models in every
// picker without a restart. Nothing else asks: a provider without a key is
// never contacted, and opening a picker does not send a request.
//
// `providers.<id>.models` belongs to the main process. A settings object a
// renderer sends carries whatever list that window loaded, possibly an old one,
// so every write from a renderer takes the list from the file instead
// (`withStoredKeyModels`). The guard drops the field from a renderer payload
// as well; this keeps the stored one.
import { createHash } from 'node:crypto'

import { aiModelEffortsOf, type AiModelEffort } from './effort'
import {
  listKeyProviderModelListing,
  listsKeyProviderModels,
  type KeyModelListing,
} from './key-models'
import { listedModelsOf } from './providers'
import type { AiProviderConfig, AiProviderId, AiSettings } from './types'

/** What the list was asked with; a hash, so the key itself is not kept beside the settings */
function fingerprintOf(config: Pick<AiProviderConfig, 'apiKey' | 'baseUrl'>): string {
  return createHash('sha256')
    .update(`${config.apiKey.trim()}\n${config.baseUrl?.trim() ?? ''}`)
    .digest('hex')
}

/**
 * `next` with every provider's live model list taken from `stored`: the list
 * a renderer sends is never written, and one it does not send is not lost.
 */
export function withStoredKeyModels(next: AiSettings, stored: AiSettings): AiSettings {
  const providers = { ...next.providers }
  for (const [id, config] of Object.entries(providers) as [AiProviderId, AiProviderConfig][]) {
    if (!config) continue
    const { models: _sent, modelEfforts: _sentEfforts, ...rest } = config
    const models = listedModelsOf(stored.providers?.[id]?.models)
    // the custom slot's table is a mirror of the active server, rebuilt from the server list
    const modelEfforts =
      id === 'custom'
        ? aiModelEffortsOf(config.modelEfforts)
        : aiModelEffortsOf(stored.providers?.[id]?.modelEfforts)
    providers[id] = {
      ...rest,
      ...(models ? { models } : {}),
      ...(modelEfforts ? { modelEfforts } : {}),
    }
  }
  return { ...next, providers }
}

/**
 * `settings` with one provider's live list replaced; an empty list removes the
 * field. The same object comes back when the list is unchanged, so the caller
 * can skip a write that would change nothing.
 */
export function withKeyProviderModels(
  settings: AiSettings,
  provider: AiProviderId,
  models: readonly string[],
  /** the levels by id; absent leaves the stored table as it is, empty removes it */
  efforts?: Readonly<Record<string, AiModelEffort>>,
): AiSettings {
  const config = settings.providers[provider]
  if (!config) return settings
  const { models: old, modelEfforts: oldEfforts, ...rest } = config
  const listed = listedModelsOf(models)
  const table = efforts === undefined ? aiModelEffortsOf(oldEfforts) : aiModelEffortsOf(efforts)
  if (
    (old ?? []).join('\n') === (listed ?? []).join('\n') &&
    JSON.stringify(oldEfforts ?? null) === JSON.stringify(table ?? null)
  ) {
    return settings
  }
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...rest,
        ...(listed ? { models: listed } : {}),
        ...(table ? { modelEfforts: table } : {}),
      },
    },
  }
}

export interface KeyModelRefresherDeps {
  /** the settings file as it is now, keys opened */
  read(): AiSettings
  /** write the settings the update returns, applied to the file as it is at that moment */
  write(update: (latest: AiSettings) => AiSettings): void
  /** the listing; replaced in tests (a bare id list carries no levels) */
  list?: (
    provider: AiProviderId,
    config: Pick<AiProviderConfig, 'apiKey' | 'baseUrl'>,
  ) => Promise<KeyModelListing | string[] | null>
}

export interface KeyModelRefresher {
  /** list every key provider whose key or base URL is not the one it was last listed with */
  refreshChanged(): void
  /** settles when no listing is in flight (tests) */
  idle(): Promise<void>
}

export function createKeyModelRefresher(deps: KeyModelRefresherDeps): KeyModelRefresher {
  const list = deps.list ?? ((provider, config) => listKeyProviderModelListing(provider, config))
  /** per provider, what its key and base URL were when it was last asked (in this run) */
  const askedWith = new Map<AiProviderId, string>()
  const inFlight = new Set<Promise<void>>()

  const refresh = (provider: AiProviderId, config: AiProviderConfig, fingerprint: string) => {
    const run = list(provider, { apiKey: config.apiKey, baseUrl: config.baseUrl })
      .then((answer) => {
        // no list (unreachable, refused, no endpoint): the stored one stays
        if (!answer) return
        const listing = Array.isArray(answer) ? { models: answer, efforts: undefined } : answer
        deps.write((latest) => {
          const now = latest.providers[provider]
          // the key changed while the list was on its way: that key's list is not this one
          if (!now || fingerprintOf(now) !== fingerprint) return latest
          return withKeyProviderModels(latest, provider, listing.models, listing.efforts)
        })
      })
      .catch(() => undefined)
      .finally(() => inFlight.delete(run))
    inFlight.add(run)
  }

  return {
    refreshChanged() {
      let settings: AiSettings
      try {
        settings = deps.read()
      } catch {
        return
      }
      for (const [id, config] of Object.entries(settings.providers ?? {}) as [
        AiProviderId,
        AiProviderConfig,
      ][]) {
        if (!config || !listsKeyProviderModels(id) || !config.apiKey?.trim()) {
          askedWith.delete(id)
          continue
        }
        const fingerprint = fingerprintOf(config)
        if (askedWith.get(id) === fingerprint) continue
        askedWith.set(id, fingerprint)
        refresh(id, config, fingerprint)
      }
    },
    async idle() {
      while (inFlight.size > 0) await Promise.all([...inFlight])
    },
  }
}
