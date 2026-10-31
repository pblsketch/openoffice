import {
  AI_PROVIDERS,
  AI_SUBSCRIPTION_PROVIDERS,
  customEndpointLabel,
  isKeyProviderConfigured,
  isSubscriptionProvider,
  keyProviderModels,
  providerSelectionOf,
  resolveCustomEndpoints,
  selectAiProvider,
  subscriptionConnection,
  upsertCustomEndpoint,
  type AiProviderId,
  type AiProviderSelection,
  type AiSettings,
  type AiSubscriptionModel,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { aiProviderDisplayName, aiSubscriptionProviderName } from './ai-subscription'

export interface AiModelPickerSelection {
  readonly provider: AiProviderId
  readonly endpoint?: string | undefined
  readonly model: string
}

export function withAiModelSelection(input: AiSettings, pick: AiModelPickerSelection): AiSettings {
  const settings = resolveCustomEndpoints(input)
  if (pick.provider === 'custom' && pick.endpoint) {
    const ep = settings.customEndpoints?.find((e) => e.id === pick.endpoint)
    if (ep) {
      return {
        ...upsertCustomEndpoint(settings, { ...ep, model: pick.model }, true),
        provider: 'custom',
      }
    }
  }
  const config = settings.providers[pick.provider] ?? { apiKey: '', model: '' }
  return {
    ...settings,
    provider: pick.provider,
    providers: { ...settings.providers, [pick.provider]: { ...config, model: pick.model } },
  }
}

/** What the list shows for one model of a subscription whose CLI listed its models */
export interface AiPickerModelDetail {
  /**
   * the CLI's display name of the model; on the default entry (the empty id),
   * the name of the model it runs on
   */
  readonly name: string
  /** the concrete model id, shown beside the name in a quieter style when it says more */
  readonly concrete?: string | undefined
}

/**
 * The display details of a CLI's model list, by the id a selection stores. The
 * entry for the empty id is the CLI's own default and is present only when the
 * CLI tells what that is: Claude lists the default with what it resolves to,
 * Codex flags one of its entries.
 */
function subscriptionModelDetails(
  listed: readonly AiSubscriptionModel[],
): Map<string, AiPickerModelDetail> {
  const detailOf = (name: string, concrete: string | undefined): AiPickerModelDetail => ({
    name,
    ...(concrete && concrete !== name ? { concrete } : {}),
  })
  const details = new Map<string, AiPickerModelDetail>()
  const named = listed.filter((model) => model.id !== '')
  const own = listed.find((model) => model.id === '')
  const flagged = named.find((model) => model.isDefault)
  if (own?.resolved) {
    const same = named.find((model) => model.resolved === own.resolved)
    details.set('', detailOf(same?.label ?? own.resolved, own.resolved))
  } else if (flagged) {
    details.set('', detailOf(flagged.label, flagged.resolved ?? flagged.id))
  }
  for (const model of named)
    details.set(model.id, detailOf(model.label, model.resolved ?? model.id))
  return details
}

/**
 * The name of the model a subscription provider runs on right now, for the
 * places that show the current choice (the composer chip, "AI to use" in
 * Settings): the CLI's name for the stored selection, or for what its default
 * resolves to. A stored model the CLI does not list reads as its id. Undefined
 * when the CLI listed no models, or does not tell what its default is.
 */
export function aiSubscriptionModelName(
  settings: Pick<AiSettings, 'providers'>,
  statuses: AiSubscriptionStatuses,
  provider: AiProviderSelection | undefined,
): string | undefined {
  if (!isSubscriptionProvider(provider)) return undefined
  const listed = statuses[provider]?.models
  if (!listed?.length) return undefined
  const stored = settings.providers?.[provider]?.model?.trim() ?? ''
  return subscriptionModelDetails(listed).get(stored)?.name ?? (stored || undefined)
}

/** One block of the composer chip's list under the subscription contract */
export interface AiProviderPickerGroup {
  /** `auto`: the "automatic" entry; `subscription`: a vendor CLI login; `key`: an API-key provider */
  readonly kind: 'auto' | 'subscription' | 'key'
  readonly id: AiProviderSelection
  /** set on custom groups: one group per saved endpoint */
  readonly endpoint?: string | undefined
  /** the provider's name; on `auto`, the name of the provider it resolves to */
  readonly label: string
  /** selectable models; '' is the CLI's own default. Empty on `auto`, which is a single entry */
  readonly models: readonly string[]
  /**
   * a subscription whose CLI listed its models: what to show for each id (its
   * name and concrete model). Absent otherwise, and a stored selection the CLI
   * does not list has no entry: both are shown by their id, as before.
   */
  readonly details?: ReadonlyMap<string, AiPickerModelDetail> | undefined
  /** an accepted metered login: listed, but marked as costing money */
  readonly metered: boolean
  /** `auto` only: the provider requests run on right now */
  readonly resolved?: AiProviderId | undefined
}

export interface AiProviderPickerSelection {
  readonly provider: AiProviderSelection
  readonly endpoint?: string | undefined
  readonly model: string
}

export interface AiProviderPickerCurrent extends AiProviderPickerSelection {
  /** the provider requests run on right now; absent while none can */
  readonly resolved?: AiProviderId | undefined
  /** that provider is an accepted metered login */
  readonly metered: boolean
}

/**
 * What the composer chip may switch to under the subscription contract, in
 * display order: the automatic entry while it resolves to a subscription, the
 * subscription providers that can run (a ready login, or a metered one the
 * user accepted — marked as paid), then every key provider whose settings are
 * filled in. Each entry passes `selectAiProvider` once picked, so a row never
 * lands on the not-connected prompt.
 */
export function aiProviderPickerGroups(
  input: AiSettings,
  statuses: AiSubscriptionStatuses,
): AiProviderPickerGroup[] {
  const settings = resolveCustomEndpoints(input)
  const groups: AiProviderPickerGroup[] = []
  const auto = selectAiProvider({ ...settings, provider: 'auto' }, statuses)
  if (auto.connected) {
    groups.push({
      kind: 'auto',
      id: 'auto',
      label: aiProviderDisplayName(auto.provider),
      models: [],
      metered: false,
      resolved: auto.provider,
    })
  }
  for (const id of AI_SUBSCRIPTION_PROVIDERS) {
    const connection = subscriptionConnection(settings, statuses[id])
    if (!connection) continue
    // what the CLI itself lists, when it did; the fixed catalog of this build otherwise
    const listed = statuses[id]?.models
    const details = listed?.length ? subscriptionModelDetails(listed) : undefined
    const catalog = listed?.length
      ? listed.map((model) => model.id).filter((model) => model !== '')
      : (AI_PROVIDERS.find((m) => m.id === id)?.models ?? [])
    const stored = settings.providers?.[id]?.model?.trim() ?? ''
    groups.push({
      kind: 'subscription',
      id,
      label: aiSubscriptionProviderName(id),
      models: ['', ...(stored && !catalog.includes(stored) ? [stored] : []), ...catalog],
      metered: connection === 'metered',
      ...(details ? { details } : {}),
    })
  }
  for (const meta of AI_PROVIDERS) {
    if (isSubscriptionProvider(meta.id)) continue
    if (meta.id === 'custom') {
      for (const ep of settings.customEndpoints ?? []) {
        if (!ep.baseUrl || !ep.model) continue
        const models = [ep.model, ...(ep.models ?? []).filter((m) => m !== ep.model)]
        groups.push({
          kind: 'key',
          id: meta.id,
          endpoint: ep.id,
          label: customEndpointLabel(ep, meta.label),
          models,
          metered: false,
        })
      }
      continue
    }
    if (!isKeyProviderConfigured(settings, meta.id)) continue
    const config = settings.providers[meta.id]
    const models = keyProviderModels(meta.id, config.model, config.models)
    groups.push({ kind: 'key', id: meta.id, label: meta.label, models, metered: false })
  }
  return groups
}

/** The stored selection and what it runs on right now */
export function aiProviderPickerSelection(
  input: AiSettings,
  statuses: AiSubscriptionStatuses,
): AiProviderPickerCurrent {
  const settings = resolveCustomEndpoints(input)
  const provider = providerSelectionOf(settings)
  const choice = selectAiProvider(settings, statuses)
  const resolved = choice.connected ? choice.provider : undefined
  const target = provider === 'auto' ? resolved : provider
  const model = (target && settings.providers?.[target]?.model?.trim()) || ''
  return {
    provider,
    ...(provider === 'custom' && settings.customEndpoint
      ? { endpoint: settings.customEndpoint }
      : {}),
    model,
    resolved,
    metered: choice.connected && choice.metered,
  }
}

/** Settings after picking an entry: the provider selection and, for a provider, its model */
export function withAiProviderSelection(
  input: AiSettings,
  pick: AiProviderPickerSelection,
): AiSettings {
  if (pick.provider === 'auto') return { ...input, provider: 'auto' }
  return withAiModelSelection(input, {
    provider: pick.provider,
    endpoint: pick.endpoint,
    model: pick.model,
  })
}
