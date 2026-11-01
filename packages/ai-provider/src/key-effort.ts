// How hard a key provider's model thinks (decision 0096). Only the vendors
// whose model list tells which levels each model takes are given one, and only
// a level that list names for the configured model: a level a model does not
// take is a 400 at some vendors and is never sent.
//
// Pure and browser-safe: the picker shows the same levels the request sends.
import { aiEffortOf, aiModelEffortOf, type AiEffort, type AiModelEffort } from './effort'
import type { AiProtocol } from './registry'
import type { AiProviderConfig, AiProviderSelection } from './types'

/** Where each vendor takes the level: Anthropic's `output_config`, OpenRouter's `reasoning`, or `reasoning_effort` */
type EffortField = 'output_config' | 'reasoning' | 'reasoning_effort'

const EFFORT_FIELDS: Partial<Record<AiProviderSelection, EffortField>> = {
  anthropic: 'output_config',
  openrouter: 'reasoning',
  deepseek: 'reasoning_effort',
  xai: 'reasoning_effort',
  // a local server; only Ollama's model profile reports levels
  custom: 'reasoning_effort',
}

/** The key providers this app hands a level to */
export function takesKeyEffort(provider: AiProviderSelection | undefined): boolean {
  return provider !== undefined && EFFORT_FIELDS[provider] !== undefined
}

/** What the stored table says about one model, or undefined when it says nothing */
export function keyModelEffort(
  config: Pick<AiProviderConfig, 'modelEfforts'> | undefined,
  model: string,
): AiModelEffort | undefined {
  const table = config?.modelEfforts
  const id = model.trim()
  if (!table || !id || !Object.prototype.hasOwnProperty.call(table, id)) return undefined
  return aiModelEffortOf(table[id])
}

/** The configured level when the provider takes one and the configured model is listed with it */
export function keyProviderEffort(
  provider: AiProviderSelection,
  config: Pick<AiProviderConfig, 'model' | 'effort' | 'modelEfforts'>,
): AiEffort | undefined {
  if (!takesKeyEffort(provider)) return undefined
  const effort = aiEffortOf(config.effort)
  if (!effort) return undefined
  return keyModelEffort(config, config.model)?.efforts.includes(effort) ? effort : undefined
}

/**
 * The request fields that carry the level on the route the request takes, or
 * undefined when nothing is to be sent. A gateway route of another protocol
 * gets nothing.
 */
export function keyEffortBody(
  provider: AiProviderSelection,
  config: Pick<AiProviderConfig, 'model' | 'effort' | 'modelEfforts'>,
  protocol: AiProtocol,
): Record<string, unknown> | undefined {
  const effort = keyProviderEffort(provider, config)
  if (!effort) return undefined
  const field = EFFORT_FIELDS[provider]
  if (protocol === 'anthropic') {
    return field === 'output_config' ? { output_config: { effort } } : undefined
  }
  if (protocol !== 'openai-compatible') return undefined
  if (field === 'reasoning') return { reasoning: { effort } }
  return field === 'reasoning_effort' ? { reasoning_effort: effort } : undefined
}
