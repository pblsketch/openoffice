/**
 * Which AI the book translation job sends to, decided once before the
 * pre-start confirmation (spec §8, the document job rules of
 * docs/business-rules.md) and kept for the whole job:
 *
 * - the provider is `selectAiProvider`'s answer for the stored settings and
 *   the live statuses; nothing here picks a provider of its own;
 * - the job runs on settings pinned to that provider, so an `auto` choice
 *   cannot slide to another subscription halfway through (the rule against
 *   switching providers by itself);
 * - before every call `jobRouteRefusal` checks the pinned route still holds:
 *   same provider, still usable, and not newly paid. Otherwise the call fails
 *   with the run error kind and the job stops.
 *
 * Paid routes are the key providers and an accepted metered login; the
 * confirmation names them ("〈provider〉 will charge for this").
 */
import {
  isSubscriptionProvider,
  selectAiProvider,
  type AiNotConnectedReason,
  type AiProviderChoice,
  type AiProviderId,
  type AiRunErrorKind,
  type AiSettings,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { aiProviderDisplayName } from '@genoffice/ui'

export type DocumentJobRoute =
  /** settings or statuses not known yet */
  | { state: 'checking' }
  | { state: 'not-connected'; choice: Extract<AiProviderChoice, { connected: false }> }
  | {
      state: 'ready'
      provider: AiProviderId
      /** the model id the job records; '' is the program's own default */
      model: string
      /** an accepted metered CLI login */
      metered: boolean
      /** a key provider or a metered login: the user pays per call */
      paid: boolean
      /** the stored settings with the selection pinned to `provider` */
      settings: AiSettings
    }

const STILL_CHECKING: ReadonlySet<AiNotConnectedReason> = new Set(['checking'])

/** the model a provider is configured with ('' = the program's default) */
export function providerModel(settings: AiSettings, provider: AiProviderId): string {
  return settings.providers?.[provider]?.model?.trim() ?? ''
}

export function documentJobRoute(
  settings: AiSettings | null | undefined,
  statuses: AiSubscriptionStatuses | null | undefined,
): DocumentJobRoute {
  if (!settings || !statuses) return { state: 'checking' }
  const choice = selectAiProvider(settings, statuses)
  if (!choice.connected) {
    return STILL_CHECKING.has(choice.reason)
      ? { state: 'checking' }
      : { state: 'not-connected', choice }
  }
  const paid = choice.metered || !isSubscriptionProvider(choice.provider)
  return {
    state: 'ready',
    provider: choice.provider,
    model: providerModel(settings, choice.provider),
    metered: choice.metered,
    paid,
    settings: { ...settings, provider: choice.provider },
  }
}

/** the provider's name as the confirmation shows it, with the model when one is set */
export function routeLabel(route: Extract<DocumentJobRoute, { state: 'ready' }>): string {
  const name = aiProviderDisplayName(route.provider)
  return route.model ? `${name} · ${route.model}` : name
}

/** two routes send to the same place on the same terms */
export function sameRoute(
  a: Extract<DocumentJobRoute, { state: 'ready' }>,
  b: DocumentJobRoute,
): boolean {
  return (
    b.state === 'ready' &&
    a.provider === b.provider &&
    a.model === b.model &&
    a.paid === b.paid &&
    a.metered === b.metered
  )
}

/**
 * Null while the pinned route may still be used; otherwise the run error kind
 * to stop with. `current` are the stored settings now (a metered acceptance
 * can be withdrawn), `statuses` the live statuses.
 */
export function jobRouteRefusal(
  pinned: Extract<DocumentJobRoute, { state: 'ready' }>,
  current: AiSettings | null,
  statuses: AiSubscriptionStatuses | null,
): AiRunErrorKind | null {
  if (!current || !statuses) return null
  const now = documentJobRoute({ ...current, provider: pinned.provider }, statuses)
  if (now.state === 'checking') return null
  if (now.state === 'not-connected') return now.choice.errorKind
  // a route that became paid (a metered login accepted since) needs a new confirmation
  if (now.paid !== pinned.paid || now.metered !== pinned.metered) return 'not-connected'
  return null
}
