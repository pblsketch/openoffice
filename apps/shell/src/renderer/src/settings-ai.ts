/**
 * What the AI part of Settings offers and writes, as plain functions over the
 * settings and the connection statuses: the "AI to use" choices, the media
 * provider choices, and the shape of what gets saved. The components only lay
 * these results out, so the rules are testable without a DOM.
 */
import {
  AI_PROVIDERS,
  HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
  activeCustomEndpoint,
  customEndpointLabel,
  imageProviderSelection,
  isKeyProviderConfigured,
  isSubscriptionProvider,
  normalizeAiSettings,
  providerSelectionOf,
  resolveCustomEndpoints,
  selectCustomEndpoint,
} from '@genoffice/ai-provider/browser'
import type {
  AiProviderId,
  AiProviderSelection,
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import type { AiMediaProviderMeta } from '@genoffice/ai-provider'
import {
  aiProviderDisplayName,
  aiProviderPickerGroups,
  aiSubscriptionModelName,
} from '@genoffice/ui'

/**
 * Whether the first-connection notice carries its Codex sentence. The Codex
 * bridge turns conversation history off (ephemeral threads, no history file),
 * but Codex still writes its own diagnostic log on this PC, which the app can
 * neither read nor prevent. So the sentence stays in, and says exactly that.
 */
export const CODEX_MAY_KEEP_HISTORY = true

/**
 * The vendor program behind each subscription, by the name its users know it
 * under in a terminal. Said only where the program itself is the subject: the
 * confirmation before a sign-out or a change of account, which apply to that
 * program on the whole PC. Everywhere else the connection is "Claude" / "Codex".
 */
const SUBSCRIPTION_PROGRAM_NAMES: Record<AiSubscriptionProviderId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  // no program: its sign-out is the app's own and asks with words of its own
  chatgpt: 'ChatGPT',
}

export function subscriptionProgramName(provider: AiSubscriptionProviderId): string {
  return SUBSCRIPTION_PROGRAM_NAMES[provider]
}

/** The two things a card can do to the account of a signed-in program; each is confirmed first */
export type SubscriptionAccountAction = 'switch' | 'logout'

// ── reading and writing ───────────────────────────────────

/**
 * The settings file as the screen works with it; null when it cannot be read.
 * A file written before the subscription providers existed names a removed
 * provider in its selections: those fall to their defaults here, and the
 * removed cloud-tools switch is left out.
 */
export async function readAiSettings(): Promise<AiSettings | null> {
  try {
    const stored = await window.aiOffice.getAiSettings?.()
    return stored ? normalizeAiSettings(stored) : null
  } catch {
    return null
  }
}

/**
 * Save a draft. It is normalized once more on the way out, so no edit path can
 * write a removed selection or the removed cloud-tools switch back. Resolves
 * to what was written.
 */
export async function writeAiSettings(draft: AiSettings): Promise<AiSettings> {
  const next = normalizeAiSettings(draft)
  await window.aiOffice.setAiSettings?.(next)
  return next
}

/** the last read-change-write still under way; the next one waits for it */
let lastChange: Promise<unknown> = Promise.resolve()

/**
 * Read, change, write: for the controls that save at once. Starting from the
 * file as it is now keeps an edit made elsewhere (a composer chip, another
 * window), and running one change at a time keeps two quick clicks from
 * reading the same file and undoing each other. Resolves to what was written,
 * or null when nothing could be.
 */
export function changeAiSettings(
  change: (settings: AiSettings) => AiSettings,
): Promise<AiSettings | null> {
  const run = lastChange.then(async () => {
    const current = await readAiSettings()
    if (!current) return null
    try {
      return await writeAiSettings(change(current))
    } catch {
      return null
    }
  })
  lastChange = run
  return run
}

/**
 * The fields the always-visible part of the AI screen writes at once (which AI
 * to use, the accepted metered logins, the automatic-requests switch, the
 * notice flag, the web-reading token). A key pane saves a draft it loaded
 * earlier; taking these from the file as it is now keeps that save from
 * undoing them.
 */
export function withLiveSelectionFields(draft: AiSettings, latest: AiSettings | null): AiSettings {
  if (!latest) return draft
  return {
    ...draft,
    provider: latest.provider,
    meteredAccepted: latest.meteredAccepted,
    headlessSubscriptionEnabled: latest.headlessSubscriptionEnabled,
    headlessSubscriptionConsentVersion: latest.headlessSubscriptionConsentVersion,
    subscriptionNoticeSeen: latest.subscriptionNoticeSeen,
    subscriptionNoticeVersion: latest.subscriptionNoticeVersion,
    pdfSendNoticeSeen: latest.pdfSendNoticeSeen,
    readUrl: latest.readUrl,
  }
}

/**
 * The automatic-requests switch turned on or off. Turning it on is the user
 * agreeing to the warning on screen, so it records that warning's version:
 * a switch without it reads as off (one turned on under an older warning).
 */
export function withHeadlessSubscription(settings: AiSettings, on: boolean): AiSettings {
  return on
    ? {
        ...settings,
        headlessSubscriptionEnabled: true,
        headlessSubscriptionConsentVersion: HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
      }
    : { ...settings, headlessSubscriptionEnabled: false }
}

// ── web reading (read_url) ────────────────────────────────

/** The stored GitHub token for read_url; '' means public pages only. */
export function readUrlGithubToken(settings: Pick<AiSettings, 'readUrl'>): string {
  return settings.readUrl?.githubToken ?? ''
}

/**
 * Settings with read_url's GitHub token set, or with the field removed when it
 * is blank. The settings file stores it in plain text, like the provider keys,
 * because the terminal and MCP paths read that file without Electron.
 */
export function withReadUrlGithubToken(settings: AiSettings, token: string): AiSettings {
  const githubToken = token.trim()
  if (githubToken) return { ...settings, readUrl: { githubToken } }
  const { readUrl: _removed, ...rest } = settings
  return rest
}

// ── which AI to use ───────────────────────────────────────

/** separates the provider from the endpoint id in a choice value; no provider id contains it */
const ENDPOINT_SEPARATOR = '::'

export interface AiSelectionChoice {
  /** dropdown value: the selection, plus the endpoint id for a self-hosted endpoint */
  readonly value: string
  readonly kind: 'auto' | 'subscription' | 'key'
  readonly provider: AiProviderSelection
  readonly endpoint?: string | undefined
  /** the provider's name; on `auto`, the provider it runs on right now (absent while none is connected) */
  readonly name?: string | undefined
  /** a subscription whose program listed its models: the name of the model it runs on right now */
  readonly model?: string | undefined
  /** an accepted metered login: selectable, shown with a cost marker */
  readonly metered: boolean
  /** the stored selection, listed although it cannot run right now; shown, never offered */
  readonly unavailable: boolean
}

function choiceValue(provider: AiProviderSelection, endpoint?: string): string {
  return endpoint ? `${provider}${ENDPOINT_SEPARATOR}${endpoint}` : provider
}

/** The value of the stored selection among `aiSelectionChoices` */
export function aiSelectionValue(input: AiSettings): string {
  const settings = resolveCustomEndpoints(input)
  const provider = providerSelectionOf(settings)
  return choiceValue(provider, provider === 'custom' ? settings.customEndpoint : undefined)
}

/**
 * What "AI to use" lists. `auto` is always there. After it come the
 * connections that can run now: a subscription that is `ready`, a metered
 * login the user accepted (marked), and each key provider whose settings are
 * filled in. A metered login that was not accepted is never among them. When
 * the stored selection is none of these it is appended as `unavailable`, so
 * the control shows what is stored instead of pretending it moved elsewhere.
 */
export function aiSelectionChoices(
  input: AiSettings,
  statuses: AiSubscriptionStatuses,
): AiSelectionChoice[] {
  const settings = resolveCustomEndpoints(input)
  const groups = aiProviderPickerGroups(settings, statuses)
  const auto = groups.find((group) => group.kind === 'auto')
  const choices: AiSelectionChoice[] = [
    {
      value: 'auto',
      kind: 'auto',
      provider: 'auto',
      name: auto?.label,
      model: aiSubscriptionModelName(settings, statuses, auto?.resolved),
      metered: false,
      unavailable: false,
    },
  ]
  for (const group of groups) {
    if (group.kind === 'auto') continue
    choices.push({
      value: choiceValue(group.id, group.endpoint),
      kind: group.kind,
      provider: group.id,
      endpoint: group.endpoint,
      name: group.label,
      model:
        group.kind === 'subscription'
          ? aiSubscriptionModelName(settings, statuses, group.id)
          : undefined,
      metered: group.metered,
      unavailable: false,
    })
  }
  const current = aiSelectionValue(settings)
  if (!choices.some((choice) => choice.value === current)) {
    const provider = providerSelectionOf(settings) as AiProviderId
    const endpoint = provider === 'custom' ? activeCustomEndpoint(settings) : undefined
    choices.push({
      value: current,
      kind: isSubscriptionProvider(provider) ? 'subscription' : 'key',
      provider,
      endpoint: endpoint?.id,
      name: endpoint
        ? customEndpointLabel(endpoint, aiProviderDisplayName(provider))
        : aiProviderDisplayName(provider),
      metered: false,
      unavailable: true,
    })
  }
  return choices
}

/** Settings after picking a choice; an `unavailable` one changes nothing */
export function withAiSelection(settings: AiSettings, choice: AiSelectionChoice): AiSettings {
  if (choice.unavailable) return settings
  if (choice.provider === 'auto') return { ...settings, provider: 'auto' }
  if (choice.provider === 'custom' && choice.endpoint) {
    return { ...selectCustomEndpoint(settings, choice.endpoint), provider: 'custom' }
  }
  return { ...settings, provider: choice.provider }
}

/**
 * The "AI to use" entry for the key provider the Advanced pane shows, offered
 * as a button there: present only while that provider's settings are filled in
 * and it is not the stored selection. Saving a key never selects it (key
 * providers run only when chosen), so without this the user has to find "AI to
 * use" to make a saved key take effect. A self-hosted endpoint is matched by
 * its id; subscriptions never match, the program list decides those.
 */
export function advancedPaneUseChoice(
  settings: AiSettings,
  provider: AiProviderId,
  endpoint?: string,
): AiSelectionChoice | undefined {
  const value = choiceValue(provider, provider === 'custom' ? endpoint : undefined)
  if (value === aiSelectionValue(settings)) return undefined
  // key entries do not depend on subscription statuses, so none are needed
  return aiSelectionChoices(settings, {}).find(
    (choice) => choice.kind === 'key' && !choice.unavailable && choice.value === value,
  )
}

// ── key providers (Advanced) ──────────────────────────────

/**
 * Providers the Advanced key pane lists: everything that has something to
 * fill in there. Claude runs on its own login and has no field of its own;
 * Codex stays for the path of a custom install.
 */
export function advancedProviderIds(catalog: readonly { id: string }[]): AiProviderId[] {
  const known = new Set<string>(AI_PROVIDERS.map((meta) => meta.id))
  return catalog
    .map((entry) => entry.id)
    .filter((id) => known.has(id) && id !== 'claude-code') as AiProviderId[]
}

/**
 * The provider the key pane opens on: the stored selection when it is one of
 * the listed providers, else the first key provider whose settings are filled
 * in (so a saved key that is not in use opens with its "use this AI" button),
 * else the first one that takes a key. Opening the pane never changes which AI
 * is in use.
 */
export function initialAdvancedProvider(
  settings: Pick<AiSettings, 'provider'> & Partial<Pick<AiSettings, 'providers'>>,
  catalog: readonly { id: string; needsCliPath?: boolean | undefined }[],
): AiProviderId | undefined {
  const listed = advancedProviderIds(catalog)
  const selected = providerSelectionOf(settings)
  if (selected !== 'auto' && listed.includes(selected)) return selected
  const providers = settings.providers
  const filled = providers
    ? listed.find((id) => isKeyProviderConfigured({ providers }, id))
    : undefined
  return (
    filled ??
    listed.find((id) => !catalog.find((entry) => entry.id === id)?.needsCliPath) ??
    listed[0]
  )
}

// ── image generation, image analysis, video analysis ──────

export type MediaBlock = 'image' | 'analysis' | 'video'

/** A selection that is not a key provider: the Codex subscription, the chat AI itself, or nothing */
export type MediaSpecialChoice = 'codex' | 'chat' | 'none'

/**
 * The choices a media block offers ahead of the key providers. The Codex
 * subscription is listed for image generation only when the main process says
 * this build can do it.
 */
export function mediaSpecialChoices(
  block: MediaBlock,
  codexImageAvailable: boolean,
): MediaSpecialChoice[] {
  if (block === 'image') return codexImageAvailable ? ['codex', 'none'] : ['none']
  if (block === 'analysis') return ['chat']
  return ['none']
}

/** Key providers able to serve a media block */
export function mediaKeyProviders(
  block: MediaBlock,
  catalog: readonly AiMediaProviderMeta[],
): AiMediaProviderMeta[] {
  return catalog.filter((meta) =>
    block === 'image'
      ? !!meta.imageProtocol
      : block === 'video'
        ? !!meta.analysisProtocol && meta.videoAnalysis
        : !!meta.analysisProtocol,
  )
}

/** The selection a media block shows: a special choice or a key provider id */
export function mediaSelection(
  block: MediaBlock,
  settings: Pick<AiSettings, 'media'>,
  catalog: readonly AiMediaProviderMeta[],
  codexImageAvailable: boolean,
): string {
  if (block === 'image') return imageProviderSelection(settings, codexImageAvailable)
  const stored: string | undefined =
    block === 'video' ? settings.media?.videoAnalysisProvider : settings.media?.analysisProvider
  const fallback = block === 'video' ? 'none' : 'chat'
  if (stored === fallback) return fallback
  return mediaKeyProviders(block, catalog).some((meta) => meta.id === stored)
    ? (stored as string)
    : fallback
}
