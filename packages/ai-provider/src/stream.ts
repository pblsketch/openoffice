import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import { withOutputCapFallback } from './output-cap'
import { streamAnthropic } from './protocols/anthropic'
import { streamGemini } from './protocols/gemini'
import { streamOpenAiCompatible } from './protocols/openai-compatible'
import { streamOpenAiResponses } from './protocols/openai-responses'
import { streamCodexAppServer } from './codex-app-server'
import { streamClaudeCodeCli } from './claude-code-cli'
import { streamChatGpt } from './chatgpt/responses'
import type { StreamCallbacks } from './protocols/shared'
import { keyEffortBody } from './key-effort'
import { getProviderAdapter, type AiProtocol } from './registry'
import type { AiProviderConfig, AiProviderSelection } from './types'

export { streamAnthropic } from './protocols/anthropic'
export { streamGemini } from './protocols/gemini'
export { streamOpenAiCompatible } from './protocols/openai-compatible'
export { streamOpenAiResponses } from './protocols/openai-responses'
export { AiCreditsError, sseLines } from './protocols/shared'
export type { StreamCallbacks } from './protocols/shared'

/** Optional shaping of one turn, resolved by the caller (never by the provider itself). */
export interface StreamForProviderOptions {
  /**
   * A first-response limit for this request, in milliseconds. Only the
   * OpenAI-compatible transport has a per-request watchdog, so this reaches the
   * connect and idle timeouts there; other protocols keep their own budgets.
   * A local server loads the model on the first turn, so its endpoint can ask
   * for a longer wait than the default.
   */
  timeoutMs?: number | undefined
}

/** route a streaming, tool-calling-capable turn by provider id */
export async function streamForProvider(
  provider: AiProviderSelection,
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  options: StreamForProviderOptions = {},
): Promise<void> {
  const endpoint = getProviderAdapter(provider).resolveEndpoint(config)
  const { baseUrl } = endpoint
  // read before the wire id replaces the model: the table is by the listed id
  const effortBody = keyEffortBody(provider, config, endpoint.protocol)
  if (endpoint.model) config = { ...config, model: endpoint.model }
  if (endpoint.protocol === 'codex-app-server') {
    return streamCodexAppServer(config, system, messages, tools, maxTokens, cb)
  }
  if (endpoint.protocol === 'claude-code-cli') {
    return streamClaudeCodeCli(config, system, messages, tools, maxTokens, cb)
  }
  if (endpoint.protocol === 'chatgpt-responses') {
    return streamChatGpt(config, system, messages, tools, maxTokens, cb)
  }
  const protocol: Exclude<
    AiProtocol,
    'codex-app-server' | 'claude-code-cli' | 'chatgpt-responses'
  > = endpoint.protocol
  return withOutputCapFallback(baseUrl, config.model, maxTokens, (cap) => {
    switch (protocol) {
      case 'anthropic':
        return streamAnthropic(config, system, messages, tools, cap, cb, baseUrl, effortBody)
      case 'gemini':
        return streamGemini(config, system, messages, tools, cap, cb, baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return streamOpenAiCompatible(baseUrl, config, system, messages, tools, cap, cb, {
          omitTemperature: endpoint.omitTemperature,
          useMaxCompletionTokens: endpoint.useMaxCompletionTokens,
          bodyExtras: effortBody ? { ...endpoint.bodyExtras, ...effortBody } : endpoint.bodyExtras,
          ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        })
      case 'openai-responses':
        return streamOpenAiResponses(baseUrl, config, system, messages, tools, cap, cb, {
          bodyExtras: endpoint.bodyExtras,
        })
    }
  })
}
