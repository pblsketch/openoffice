import { dirname, join } from 'node:path'
import {
  AI_SUBSCRIPTION_PROVIDERS,
  headlessSubscriptionOn,
  isSubscriptionProvider,
  normalizeAiSettings,
  providerSelectionOf,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import {
  SUBSCRIPTION_STATUS_TIMEOUT_MS,
  createMeteredAcceptanceFileStore,
  createSubscriptionStatusService,
  detectSubscriptionLogin,
  sharedSubscriptionChildRegistry,
  shutdownSubscriptionChildren,
} from '@genoffice/ai-provider/subscription'
import {
  aiToolCapabilities,
  codexImageRouteOffered,
  readAiSettingsFile,
  type AiToolCallContext,
  type MediaToolFailure,
} from '@genoffice/ai-search'
import { PRODUCT_NAME } from '@genoffice/i18n'
import { genofficeUserDataDir } from './gui'
import { CliError, EXIT } from './result'

/**
 * The cloud commands (search / image / media) reuse the editors' provider
 * routing with the settings of the app: the free search, a key the user
 * entered, or a subscription login. That settings file lives in the shell's
 * Electron userData directory, which the command line has to locate without
 * Electron.
 */
export function aiSettingsPath(env: NodeJS.ProcessEnv): string {
  return env.GENOFFICE_AI_SETTINGS || join(genofficeUserDataDir(env), 'ai-settings.json')
}

/**
 * The folder of the settings file in use. What belongs to those settings is
 * kept beside them, for the app and for every command-line process alike: the
 * hourly ledger of subscription requests and the record of an accepted
 * metered login.
 */
export function aiDataDir(env: NodeJS.ProcessEnv): string {
  return dirname(aiSettingsPath(env))
}

/** First http(s) proxy in the usual environment variables, as the app's main process reads them. */
export function proxyUrlFromEnv(env: NodeJS.ProcessEnv): string | null {
  return (
    [
      env.HTTPS_PROXY,
      env.https_proxy,
      env.HTTP_PROXY,
      env.http_proxy,
      env.ALL_PROXY,
      env.all_proxy,
    ].find((v) => v && /^https?:\/\//.test(v)) ?? null
  )
}

let prepared = false

/** Once per process: the proxy for fetch (search and the key providers). */
export async function prepareCloud(env: NodeJS.ProcessEnv): Promise<void> {
  if (prepared) return
  prepared = true
  const proxy = proxyUrlFromEnv(env)
  if (proxy) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(proxy))
  }
}

/** What a command is about to do: make an image, read media, run a PDF document job, or report on all of them. */
export type CloudUse = 'image' | 'media' | 'pdf' | 'capabilities'

/**
 * The subscription CLIs whose status can change what `use` runs on; empty
 * when none can, so that nothing is started just to be ignored.
 *
 * Images are only ever made on a `ready` Codex login, and only with the
 * automatic-call setting on. Image analysis asks the AI provider the chat
 * runs on: with `auto` that is a subscription, so again only with the setting
 * on; a CLI the user selected may be a metered login they accepted, which
 * runs whatever the setting says. When a key route already answers, no
 * status can change it. The PDF document jobs (and their capability items)
 * always ask the chat's provider, so its status always matters to them.
 */
export function subscriptionProvidersInPlay(
  settings: AiSettings,
  use: CloudUse,
  dataDir: string,
): AiSubscriptionProviderId[] {
  const on = headlessSubscriptionOn(settings)
  const wanted = new Set<AiSubscriptionProviderId>()
  if ((use === 'image' || use === 'capabilities') && on && codexImageRouteOffered()) {
    wanted.add('codex')
  }
  // the PDF document jobs always ask the AI provider the chat runs on
  if (
    use === 'pdf' ||
    use === 'capabilities' ||
    (use === 'media' &&
      !aiToolCapabilities(settings, { path: 'headless', dataDir }).imageAnalysis.available)
  ) {
    const selection = providerSelectionOf(settings)
    if (isSubscriptionProvider(selection)) wanted.add(selection)
    else if (selection === 'auto' && on) for (const id of AI_SUBSCRIPTION_PROVIDERS) wanted.add(id)
  }
  return AI_SUBSCRIPTION_PROVIDERS.filter((id) => wanted.has(id))
}

/**
 * The statuses of `providers`, built by the same service the app uses over
 * the same settings file and acceptance record, so a metered login accepted
 * in the app counts here too. This process only reads both: the app owns
 * them, and an acceptance that no longer fits the login is reported as not
 * accepted and left for the app to clear. A check that fails or runs out of
 * time leaves the provider not connected.
 */
async function subscriptionStatuses(
  settingsPath: string,
  dataDir: string,
  providers: AiSubscriptionProviderId[],
): Promise<AiSubscriptionStatuses> {
  const acceptance = createMeteredAcceptanceFileStore(dataDir)
  const service = createSubscriptionStatusService({
    getSettings: () => normalizeAiSettings(readAiSettingsFile(settingsPath)),
    setMeteredAccepted: () => undefined,
    acceptanceStore: { read: () => acceptance.read(), write: async () => undefined },
    detect: detectSubscriptionLogin,
    timeoutMs: SUBSCRIPTION_STATUS_TIMEOUT_MS,
  })
  try {
    const checked = await service.check(providers)
    return Object.fromEntries(providers.map((id) => [id, withoutAccount(checked[id])]))
  } catch {
    return {}
  }
}

/**
 * The account a CLI names is for the app's Settings card and nothing else. It
 * is taken off here, so it cannot reach a tool, a result or the audit log of a
 * command or MCP call.
 */
function withoutAccount(status: AiSubscriptionStatus): AiSubscriptionStatus {
  const copy = { ...status }
  delete copy.account
  return copy
}

interface ProcessEnd {
  once(event: 'exit', listener: () => void): unknown
  prependOnceListener(event: NodeJS.Signals, listener: () => void): unknown
  listenerCount(event: NodeJS.Signals): number
  exit(code: number): void
}

const END_SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const

/**
 * A subscription CLI started for a request must not outlive this process:
 * `shutdown` runs on exit and on the signals that end it. Listening for a
 * signal takes the default handler away, so when nobody else is listening
 * (a server that closes itself would be) the process is ended here the way
 * the default handler would have.
 */
export function endSubscriptionChildrenWith(proc: ProcessEnd, shutdown: () => void): void {
  proc.once('exit', shutdown)
  for (const [signal, number] of Object.entries(END_SIGNALS) as [NodeJS.Signals, number][]) {
    // first in line: the listeners after this one are still counted when it runs
    proc.prependOnceListener(signal, () => {
      shutdown()
      if (proc.listenerCount(signal) === 0) proc.exit(128 + number)
    })
  }
}

let endsWithProcess = false
let recorded = false

/**
 * In a process that may start a subscription CLI: end what it started when it
 * ends. A request that can run on a login (not a mere report) also keeps the
 * record a force-killed run leaves behind, where the app's next start looks.
 */
function guardSubscriptionChildren(recordDir: string | null): void {
  if (!endsWithProcess) {
    endsWithProcess = true
    endSubscriptionChildrenWith(process, shutdownSubscriptionChildren)
  }
  if (recordDir && !recorded) {
    recorded = true
    sharedSubscriptionChildRegistry().recordIn(recordDir)
  }
}

export interface HeadlessCall {
  settingsPath: string
  /** the settings as the tools route on them, read once for this call */
  settings: AiSettings
  context: AiToolCallContext & { path: 'headless'; dataDir: string }
}

/**
 * Every command here, and every MCP tool that runs one, is the automatic-call
 * path: the tools are told so, with the folder the hourly ledger lives in and
 * the connection statuses of the subscription CLIs that could matter.
 */
export async function headlessCall(env: NodeJS.ProcessEnv, use: CloudUse): Promise<HeadlessCall> {
  const settingsPath = aiSettingsPath(env)
  const dataDir = aiDataDir(env)
  const settings = normalizeAiSettings(readAiSettingsFile(settingsPath))
  const providers = subscriptionProvidersInPlay(settings, use, dataDir)
  if (!providers.length) return { settingsPath, settings, context: { path: 'headless', dataDir } }
  guardSubscriptionChildren(use === 'capabilities' ? null : dataDir)
  const statuses = await subscriptionStatuses(settingsPath, dataDir, providers)
  return { settingsPath, settings, context: { path: 'headless', statuses, dataDir } }
}

/** The next step for each cause a tool reports; one sentence, as `suggestion` is everywhere else. */
const NEXT_STEP: Record<NonNullable<MediaToolFailure['errorCode']>, string> = {
  unavailable: `do not retry: it has to be turned on or filled in under Settings > AI in ${PRODUCT_NAME} as the message says, so tell the user or continue without it`,
  // no longer raised: automatic calls have no hourly cap; kept for the older runners that may still report it
  'headless-limit':
    'retry once: an older version reported its limit of automatic subscription requests, which no longer exists',
  'rate-limit': "do not retry now: the usage limit of the user's subscription is reached",
  'free-limit': `do not retry now: today's free allowance of the free AI connection is used up (detail.resetsAt says when it frees again); the user can choose another AI under Settings > AI in ${PRODUCT_NAME}`,
  'free-tier-model': `do not retry: the chosen model is not on the free tier of the user's key; the user can pick a model the free tier covers under Settings > AI > Advanced in ${PRODUCT_NAME}, or turn on billing with the provider`,
  'not-connected': `do not retry: ask the user to connect Claude Code or Codex under Settings > AI in ${PRODUCT_NAME}, or to select a provider key under Settings > AI > Advanced`,
  'not-installed': `do not retry: ask the user to install the CLI named in the message (Settings > AI in ${PRODUCT_NAME} shows how)`,
  'signed-out': `do not retry: ask the user to sign in again under Settings > AI in ${PRODUCT_NAME}`,
  'metered-not-accepted': `do not retry: this login is billed by usage and the user has not accepted that under Settings > AI in ${PRODUCT_NAME}`,
  'needs-update': 'do not retry: ask the user to update the CLI named in the message',
  'unsafe-tools':
    'do not retry: the subscription CLI came up with tools it must not have, so nothing was run; tell the user',
  credits: 'do not retry: the provider account is out of credit, tell the user',
  network: 'check the network connection (HTTPS_PROXY is honoured), then retry once',
  overloaded: 'the provider is busy: retry once in a minute',
  timeout: 'retry once; if it times out again, continue without it',
  'context-limit':
    'do not retry the same request: the prompt is larger than the model context; ask the user to choose a model with more context or shorten the request',
}

/** The next step for a run error code, when it is one the cloud commands know. */
export function cloudNextStep(errorCode: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(NEXT_STEP, errorCode)
    ? NEXT_STEP[errorCode as keyof typeof NEXT_STEP]
    : undefined
}

/**
 * A failed image / media tool result as the error a program can branch on:
 * exit 4 as before, the tool's own text as the message, and the cause in
 * `detail.errorCode` with `detail.resetsAt` (epoch ms) when a limit frees
 * again at a known time.
 */
export function cloudToolError(result: MediaToolFailure, fallback: string): CliError {
  const { errorCode, resetsAt } = result
  const text = result.error ?? fallback
  if (!errorCode) {
    return new CliError(EXIT.app, text, undefined, {
      suggestion: `retry once later; if it persists, check the provider under Settings > AI > Advanced in ${PRODUCT_NAME}, or continue without it`,
    })
  }
  // ISO 8601, as every other time this command line prints
  const when = resetsAt === undefined ? null : new Date(resetsAt).toISOString()
  return new CliError(
    EXIT.app,
    when && !text.includes(when) ? `${text} (possible again at ${when})` : text,
    { errorCode, ...(resetsAt !== undefined ? { resetsAt } : {}) },
    {
      suggestion: when
        ? `${NEXT_STEP[errorCode]}; possible again at ${when}`
        : NEXT_STEP[errorCode],
    },
  )
}
