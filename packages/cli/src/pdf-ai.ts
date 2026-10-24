/**
 * The AI connection of the document jobs (`pdf ai-read`, `pdf translate`,
 * `epub translate`) on the automatic-call path. Both talk to the AI provider the chat runs on,
 * chosen the way the chat chooses it (spec §7, §8): a subscription login only
 * while the automatic-call switch is on, a key provider or an accepted metered
 * login only because the user selected it. Nothing here picks a provider on
 * the user's behalf or switches to another one.
 *
 * Each model call is one request. On a subscription it waits its turn with
 * every other automatic call (runHeadlessSubscriptionCall), so a long job
 * takes turns with other callers request by request.
 */
import {
  AiRunError,
  isSubscriptionProvider,
  maxOutputTokensOf,
  selectAiProvider,
  streamForProvider,
  type AiProviderConfig,
  type AiProviderId,
  type AiSettings,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import type { AgentMessage } from '@genoffice/agent-core'
import {
  headlessSubscriptionBlocked,
  runHeadlessSubscriptionCall,
  type AiToolCallContext,
} from '@genoffice/ai-search'
import { aiReadVisionCheck } from '../../pdf-structure/src'

export type PdfAiJob = 'ai-read' | 'translate' | 'epub-translate'

/** One model call may take this long before it fails as a timeout (and is retried once by the job). */
export const PDF_AI_CALL_TIMEOUT_MS = 300_000

export type PdfAiRoute =
  | {
      available: true
      provider: AiProviderId
      /** model id; '' is the program's own default */
      model: string
      config: AiProviderConfig
      /** `subscription` runs on a CLI login's plan; `key` is billed per request (a metered login included) */
      route: 'subscription' | 'key'
      /** an accepted metered CLI login: billed like a key */
      metered: boolean
      /** billed per request: `--allow-paid` is needed (spec §10) */
      paid: boolean
      maxTokens: number
      dataDir: string | undefined
    }
  | {
      available: false
      /** what the command answers with */
      message: string
      /** detail.errorCode of the refusal */
      errorCode: string
    }

const FEATURE: Record<PdfAiJob, string> = {
  'ai-read': 'PDF AI page reading',
  translate: 'PDF translation',
  'epub-translate': 'EPUB translation',
}

/**
 * The statuses the choice may look at: on a blocked automatic call a ready
 * subscription login does not count (as in @genoffice/ai-search tool-routing),
 * a metered login stays, because using it is the user's own selection.
 */
function visibleStatuses(settings: AiSettings, context: AiToolCallContext): AiSubscriptionStatuses {
  const statuses = context.statuses ?? {}
  if (!headlessSubscriptionBlocked(settings, context)) return statuses
  const visible: AiSubscriptionStatuses = {}
  for (const id of ['claude-code', 'codex'] as const) {
    const status = statuses[id]
    if (status && status.state !== 'ready') visible[id] = status
  }
  return visible
}

/** Where a document job would send its requests, or why it cannot start. */
export function resolvePdfAiRoute(
  settings: AiSettings,
  context: AiToolCallContext,
  job: PdfAiJob,
): PdfAiRoute {
  const feature = FEATURE[job]
  const blocked = headlessSubscriptionBlocked(settings, context)
  const choice = selectAiProvider(settings, visibleStatuses(settings, context))
  if (!choice.connected) {
    return {
      available: false,
      errorCode: blocked && choice.errorKind === 'not-connected' ? 'unavailable' : choice.errorKind,
      message: blocked
        ? `${feature} is unavailable: no AI provider can be used from the command line. Select a provider key under Settings > AI > Advanced, or turn on subscription use for command-line and integration requests there.`
        : `${feature} is unavailable: no AI provider is connected. Connect Claude Code or Codex under Settings > AI, or select a provider key under Settings > AI > Advanced.`,
    }
  }
  const model = settings.providers[choice.provider]?.model ?? ''
  if (job === 'ai-read' && !aiReadVisionCheck(choice.provider, model).ok) {
    return {
      available: false,
      errorCode: 'unavailable',
      message: `${feature} is unavailable: the selected AI model cannot read images. Select a model that can under Settings > AI.`,
    }
  }
  const subscription = isSubscriptionProvider(choice.provider) && !choice.metered
  return {
    available: true,
    provider: choice.provider,
    model,
    config: settings.providers[choice.provider]!,
    route: subscription ? 'subscription' : 'key',
    metered: choice.metered,
    paid: !subscription,
    maxTokens: maxOutputTokensOf(settings),
    dataDir: context.dataDir,
  }
}

/** The `capabilities` item of a document job, shaped like the other items. */
export function pdfAiFeature(route: PdfAiRoute): {
  available: boolean
  via: string | null
  route: 'subscription' | 'key' | null
  metered?: true
  message?: string
} {
  if (!route.available) return { available: false, via: null, route: null, message: route.message }
  return {
    available: true,
    via: route.provider,
    route: route.route,
    ...(route.metered ? { metered: true as const } : {}),
  }
}

export interface PdfAiRequest {
  system: string
  messages: AgentMessage[]
}

/**
 * One model call: no tools, the answer collected from the stream. Run errors
 * (rate limit, sign-out, timeout, ...) propagate with their kind, so the job
 * engine retries or stops by its own rules. The answer is document data only.
 */
export async function askPdfModel(
  route: Extract<PdfAiRoute, { available: true }>,
  request: PdfAiRequest,
  signal: AbortSignal,
): Promise<string> {
  const run = () => streamAnswer(route, request, signal)
  return route.route === 'subscription' && route.dataDir
    ? runHeadlessSubscriptionCall(route.dataDir, run, { signal })
    : run()
}

async function streamAnswer(
  route: Extract<PdfAiRoute, { available: true }>,
  request: PdfAiRequest,
  signal: AbortSignal,
): Promise<string> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal.reason)
  if (signal.aborted) onAbort()
  signal.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, PDF_AI_CALL_TIMEOUT_MS)
  let text = ''
  try {
    await streamForProvider(
      route.provider,
      route.config,
      request.system,
      request.messages,
      [],
      route.maxTokens,
      {
        signal: controller.signal,
        onDelta: (delta) => {
          text += delta
        },
        // no tools were offered; a call the model makes up anyway has nothing to run
        onToolCall: () => {},
      },
    )
  } catch (err) {
    if (timedOut) throw new AiRunError('timeout', 'The AI request timed out')
    throw err
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
  if (timedOut) throw new AiRunError('timeout', 'The AI request timed out')
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('cancelled')
  return text
}
