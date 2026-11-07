/**
 * One turn on the user's ChatGPT plan, over OpenAI's public Responses API with
 * the app's own tokens (decision 0081). No program is started: the request
 * goes from this process to `api.openai.com/v1/responses`.
 *
 * The turn speaks the same protocol as the Claude Code bridge: the app's tools
 * and a response schema are written into the input, the model answers with
 * one JSON object, and `parseClaudeCodeTurn` reads it. The plan-usage docs do
 * not promise native tool calling, image input or structured output, so the
 * request carries only what they list (`model`, `input`, `store: false`,
 * `stream: true`) plus images as `input_image` parts. A request OpenAI turns
 * down for an unsupported part fails with that part named.
 */
import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import {
  buildClaudeCodeInput,
  ClaudeCodeStructureError,
  parseClaudeCodeTurn,
  TurnTextScanner,
  type ClaudeCodeContentBlock,
} from '../claude-code-cli'
import { aiFetch } from '../fetch'
import { isPlainObject, sseDataEvents, usageCount, type StreamCallbacks } from '../protocols/shared'
import { AiRunError } from '../run-error'
import type { AiChatResponse, AiProviderConfig, AiSubscriptionModel } from '../types'
import { setSubscriptionModelSource } from '../subscription/models'
import { createStreamWatchdog } from '../watchdog'
import { chatGptConnection, type ChatGptConnection } from './connection'
import type { FetchLike } from './oauth'

export const CHATGPT_RESPONSES_URL = 'https://api.openai.com/v1/responses'
export const CHATGPT_MODELS_URL = 'https://api.openai.com/v1/models'

const PROVIDER = 'chatgpt'
const EMPTY_STREAM_MARK = '(empty stream)'
const TOOL_ARGS_DROP_MARK = 'while sending tool arguments'
const MODEL_LIST_TIMEOUT_MS = 15_000

const PLAIN_INSTRUCTIONS =
  'You are the language-model backend embedded in an office application. You have no tools of your own: you cannot read or change files, run commands, browse the web or call any tool, and you must not try. Answer the request directly.'

/** A model slug as the API takes it */
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export interface ChatGptBridgeDeps {
  fetch?: FetchLike | undefined
  connection?: ChatGptConnection | null | undefined
}

type ResponsesInputPart =
  { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }

/** The Claude Code input blocks as Responses API parts, the instructions first */
export function chatGptInputParts(
  systemPrompt: string[],
  content: ClaudeCodeContentBlock[],
): ResponsesInputPart[] {
  const parts: ResponsesInputPart[] = []
  const instructions = systemPrompt.filter((part) => part.trim()).join('\n\n')
  if (instructions) {
    parts.push({ type: 'input_text', text: `<instructions>\n${instructions}\n</instructions>` })
  }
  for (const block of content) {
    if (block.type === 'text') parts.push({ type: 'input_text', text: block.text })
    else {
      parts.push({
        type: 'input_image',
        image_url: `data:${block.source.media_type};base64,${block.source.data}`,
      })
    }
  }
  return parts
}

export function chatGptRequestBody(model: string, parts: ResponsesInputPart[]): string {
  return JSON.stringify({
    model,
    input: [{ role: 'user', content: parts }],
    store: false,
    stream: true,
  })
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; param?: unknown } | unknown
  detail?: unknown
}

function errorFields(body: unknown): { code: string; message: string; param: string } {
  const record = isPlainObject(body) ? (body as ErrorBody) : {}
  const error = isPlainObject(record.error) ? record.error : {}
  const str = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 500) : '')
  return {
    code: str(error.code),
    message: str(error.message) || str(record.detail),
    param: str(error.param),
  }
}

/**
 * The error a refused or failed request is reported as. A session OpenAI no
 * longer accepts is dropped so the card asks to sign in again; a used-up plan
 * is a rate limit; a part the plan does not take is named.
 */
export async function chatGptFailure(
  status: number,
  body: unknown,
  connection: ChatGptConnection | null,
): Promise<Error> {
  const { code, message, param } = errorFields(body)
  if (code === 'subscription_sharing_usage_limit_exceeded') {
    return new AiRunError(
      'rate-limit',
      'The ChatGPT plan has reached its usage limit for this app.',
      {
        provider: PROVIDER,
      },
    )
  }
  if (status === 401 || code === 'subscription_sharing_invalid_user') {
    await connection?.dropSession().catch(() => undefined)
    return new AiRunError('signed-out', 'ChatGPT signed this app out. Sign in again.', {
      provider: PROVIDER,
    })
  }
  if (code === 'subscription_sharing_user_not_eligible') {
    return new Error('This ChatGPT account cannot use its plan in other apps.')
  }
  if (code === 'subscription_sharing_unsupported_capability') {
    return new Error(
      `ChatGPT does not accept this kind of input on the plan${param ? ` (${param})` : ''}.`,
    )
  }
  // 503s were already retried by aiFetch; "HTTP 503" lets the run say the service is busy
  const detail = message || code || 'request failed'
  return new Error(`ChatGPT HTTP ${status}: ${detail}`)
}

/** The run's model: the chosen one, else the first the plan lists, else none (an error) */
async function modelFor(
  config: AiProviderConfig,
  accessToken: string,
  deps: ChatGptBridgeDeps,
  signal: AbortSignal,
): Promise<string> {
  const chosen = config.model.trim()
  if (chosen) {
    if (!MODEL_NAME.test(chosen)) throw new Error(`Invalid ChatGPT model name: ${chosen}`)
    return chosen
  }
  const models = await readChatGptModels(accessToken, deps.fetch ?? aiFetch, signal)
  const first = models[0]?.id
  if (!first) throw new Error('ChatGPT listed no model this plan can use')
  return first
}

interface TurnOutcome {
  raw: string
  stopReason: string
}

/** Read one response stream to its end: the text, and why it stopped */
async function readTurn(
  response: Response,
  onText: (delta: string) => void,
  cb: Pick<StreamCallbacks, 'onActivity' | 'onUsage'>,
): Promise<TurnOutcome> {
  if (!response.body) throw new Error(`ChatGPT returned no content ${EMPTY_STREAM_MARK}`)
  let raw = ''
  let completed = false
  let stopReason = 'end_turn'
  for await (const event of sseDataEvents(response.body, cb.onActivity)) {
    const data = event.json
    if (!isPlainObject(data)) continue
    const type = typeof data.type === 'string' ? data.type : ''
    if (type === 'response.output_text.delta' && typeof data.delta === 'string') {
      raw += data.delta
      onText(data.delta)
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      const result = isPlainObject(data.response) ? data.response : {}
      const usage = isPlainObject(result.usage) ? result.usage : undefined
      if (usage) {
        const inputTokens = usageCount(usage.input_tokens)
        const outputTokens = usageCount(usage.output_tokens)
        cb.onUsage?.({
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
        })
      }
      if (type === 'response.incomplete') {
        const details = isPlainObject(result.incomplete_details) ? result.incomplete_details : {}
        stopReason = details.reason === 'max_output_tokens' ? 'max_tokens' : 'incomplete'
      }
      completed = true
    } else if (type === 'response.failed' || type === 'error') {
      // `response.failed` carries the response with its error. An `error` event is the
      // error itself in the API reference (`code`, `message`, `param` on the event),
      // and wraps it as `error: { code, message }` in what Codex reads off this stream.
      const result =
        type === 'error' ? { error: isPlainObject(data.error) ? data.error : data } : data.response
      const failure = await chatGptFailure(200, result, null)
      // a cause the run tells the user about (a used-up plan) stays as it is
      if (raw || failure instanceof AiRunError) throw failure
      throw new Error(`${failure.message} ${EMPTY_STREAM_MARK}`, { cause: failure })
    }
  }
  // a stream that ends without `response.completed` did not finish
  if (!completed) {
    throw new Error(
      raw
        ? `ChatGPT stopped ${TOOL_ARGS_DROP_MARK}: the stream ended early`
        : `ChatGPT returned no content ${EMPTY_STREAM_MARK}`,
    )
  }
  return { raw, stopReason }
}

async function postTurn(
  config: AiProviderConfig,
  parts: ResponsesInputPart[],
  cb: StreamCallbacks,
  deps: ChatGptBridgeDeps,
): Promise<{ response: Response }> {
  const connection = deps.connection !== undefined ? deps.connection : chatGptConnection()
  if (!connection) {
    throw new AiRunError('signed-out', 'ChatGPT is not connected in this process.', {
      provider: PROVIDER,
    })
  }
  const fetchImpl = deps.fetch ?? aiFetch
  const accessToken = await connection.accessToken(cb.signal)
  const model = await modelFor(config, accessToken, deps, cb.signal)
  const response = await fetchImpl(CHATGPT_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: chatGptRequestBody(model, parts),
    signal: cb.signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as unknown
    throw await chatGptFailure(response.status, body, connection)
  }
  cb.onActivity?.()
  return { response }
}

async function runStructuredTurn(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  deps: ChatGptBridgeDeps,
): Promise<void> {
  const input = buildClaudeCodeInput(system, messages, tools, maxTokens)
  if (input.truncated) cb.onInputTruncated?.()
  const parts = chatGptInputParts(input.initialize.request.systemPrompt, input.user.message.content)
  const { response } = await postTurn(config, parts, cb, deps)
  const scanner = new TurnTextScanner()
  let emitted = ''
  const outcome = await readTurn(
    response,
    (delta) => {
      const text = scanner.push(delta)
      if (text) {
        emitted += text
        cb.onDelta(text)
      }
    },
    cb,
  )
  if (outcome.stopReason === 'max_tokens') cb.onStopReason?.('max_tokens')
  try {
    const turn = parseClaudeCodeTurn(outcome.raw, tools, PROVIDER)
    // the scanner delivered the text as it came; the rest (or all, for an answer it could not follow)
    const rest = turn.text.startsWith(emitted) ? turn.text.slice(emitted.length) : ''
    if (rest) cb.onDelta(rest)
    for (const call of turn.toolCalls) cb.onToolCall(call)
  } catch (error) {
    if (!(error instanceof ClaudeCodeStructureError)) throw error
    if (emitted) {
      throw new Error(
        `ChatGPT returned a structured response that broke off ${TOOL_ARGS_DROP_MARK}: ${error.message}`,
        { cause: error },
      )
    }
    throw new Error(
      `ChatGPT returned an invalid structured response: ${error.message} ${EMPTY_STREAM_MARK}`,
      { cause: error },
    )
  }
}

/** One streamed turn of the agent loop: text deltas, then the tool calls the model requests */
export async function streamChatGpt(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  deps: ChatGptBridgeDeps = {},
): Promise<void> {
  const wd = createStreamWatchdog(cb.signal)
  return wd.guard(() =>
    runStructuredTurn(
      config,
      system,
      messages,
      tools,
      maxTokens,
      {
        ...cb,
        signal: wd.signal,
        onActivity: () => {
          wd.touch()
          cb.onActivity?.()
        },
      },
      deps,
    ),
  )
}

/** One-shot text chat: the answer is the model's text as it is */
export async function chatChatGpt(
  config: AiProviderConfig,
  system: string,
  user: string,
  signal: AbortSignal,
  deps: ChatGptBridgeDeps = {},
): Promise<AiChatResponse> {
  const cb: StreamCallbacks = { signal, onDelta: () => undefined, onToolCall: () => undefined }
  const parts = chatGptInputParts([system, PLAIN_INSTRUCTIONS], [{ type: 'text', text: user }])
  const { response } = await postTurn(config, parts, cb, deps)
  const { raw } = await readTurn(response, () => undefined, cb)
  return raw ? { ok: true, content: raw } : { ok: false, error: 'ChatGPT returned no content' }
}

interface ModelEntry {
  slug?: unknown
  id?: unknown
  display_name?: unknown
  visibility?: unknown
}

/** The plan's models as the picker shows them; entries the catalog does not list for display are left out */
export function chatGptModelsOf(body: unknown): AiSubscriptionModel[] {
  const record = isPlainObject(body) ? body : {}
  const entries = Array.isArray(record.models)
    ? record.models
    : Array.isArray(record.data)
      ? record.data
      : []
  const models: AiSubscriptionModel[] = []
  for (const entry of entries as ModelEntry[]) {
    if (!isPlainObject(entry)) continue
    if (entry.visibility !== undefined && entry.visibility !== 'list') continue
    const id =
      typeof entry.slug === 'string' ? entry.slug : typeof entry.id === 'string' ? entry.id : ''
    if (!MODEL_NAME.test(id)) continue
    const label =
      typeof entry.display_name === 'string' && entry.display_name ? entry.display_name : id
    models.push({ id, label })
  }
  return models
}

/** Read the model catalog: an authenticated GET, no model call */
export async function readChatGptModels(
  accessToken: string,
  fetchImpl: FetchLike = aiFetch,
  signal?: AbortSignal,
): Promise<AiSubscriptionModel[]> {
  const timeout = AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
  const response = await fetchImpl(CHATGPT_MODELS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error(`ChatGPT model list failed with HTTP ${response.status}`)
  return chatGptModelsOf(await response.json())
}

/** The model list of the process's connection, for the status service */
export async function listChatGptModels(
  deps: ChatGptBridgeDeps = {},
  signal?: AbortSignal,
): Promise<AiSubscriptionModel[]> {
  const connection = deps.connection !== undefined ? deps.connection : chatGptConnection()
  if (!connection) return []
  const accessToken = await connection.accessToken(signal)
  return readChatGptModels(accessToken, deps.fetch ?? aiFetch, signal)
}

// the status service reads the list through the registry, like the CLI bridges' lists
setSubscriptionModelSource('chatgpt', ({ signal }) => listChatGptModels({}, signal))
