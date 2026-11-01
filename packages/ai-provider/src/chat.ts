import { chatAnthropic } from './protocols/anthropic'
import { chatGemini } from './protocols/gemini'
import { chatOpenAiCompatible } from './protocols/openai-compatible'
import { chatOpenAiResponses } from './protocols/openai-responses'
import { ResponseBodyTooLargeError } from './protocols/shared'
import { chatCodexAppServer } from './codex-app-server'
import { chatClaudeCodeCli } from './claude-code-cli'
import { chatChatGpt } from './chatgpt/responses'
import { keyEffortBody } from './key-effort'
import { getProviderAdapter, type ResolvedEndpoint } from './registry'
import type { AiChatResponse, AiProviderConfig, AiProviderSelection } from './types'
import { AI_CHAT_RESPONSE_TIMEOUT_MS, createStreamWatchdog } from './watchdog'

/** route a one-shot (non-streaming, non-tool-calling) chat call by provider id */
export async function chatForProvider(
  provider: AiProviderSelection,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  // non-streaming: the server generates the full answer before the headers arrive,
  // so the connect phase gets the long budget; the body read then gets the idle budget
  const wd = createStreamWatchdog(signal, AI_CHAT_RESPONSE_TIMEOUT_MS)
  const result = wd.guard(() => {
    let endpoint: ResolvedEndpoint
    try {
      endpoint = getProviderAdapter(provider).resolveEndpoint(config)
    } catch (e) {
      // config errors (unknown provider, missing base URL) report as a failed reply, not a rejection
      return Promise.resolve({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    // read before the wire id replaces the model: the table is by the listed id
    const effortBody = keyEffortBody(provider, config, endpoint.protocol)
    if (endpoint.model) config = { ...config, model: endpoint.model }
    switch (endpoint.protocol) {
      case 'codex-app-server':
        return chatCodexAppServer(config, system, user, wd.signal)
      case 'claude-code-cli':
        return chatClaudeCodeCli(wd, config, system, user)
      case 'chatgpt-responses':
        return chatChatGpt(config, system, user, wd.signal)
      case 'anthropic':
        return chatAnthropic(wd, config, system, user, endpoint.baseUrl, effortBody)
      case 'gemini':
        return chatGemini(wd, config, system, user, endpoint.baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return chatOpenAiCompatible(wd, endpoint.baseUrl, config, system, user, {
          omitTemperature: endpoint.omitTemperature,
          bodyExtras: effortBody ? { ...endpoint.bodyExtras, ...effortBody } : endpoint.bodyExtras,
        })
      case 'openai-responses':
        return chatOpenAiResponses(wd, endpoint.baseUrl, config, system, user, {
          bodyExtras: endpoint.bodyExtras,
        })
    }
  })
  return result.catch((e) => {
    if (e instanceof ResponseBodyTooLargeError) return { ok: false as const, error: e.message }
    throw e
  })
}
