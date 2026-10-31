import { isOpenRouterFreeModel, type AiSettings } from '@genoffice/ai-provider'

/**
 * Whether a provider and model are a free connection (decision 0085). Free
 * tiers may use what they receive to improve their models and offer no way
 * to turn that off, and Google's Workspace policy forbids handing Drive data
 * to a service that trains on it, so Drive files are not given to them.
 * OpenRouter counts only on a `:free` model; a Gemini key carries no free
 * marker, so Gemini always counts.
 */
export function isFreeAi(provider: string, model: string | undefined): boolean {
  if (provider === 'gemini') return true
  return provider === 'openrouter' && isOpenRouterFreeModel(model)
}

/** Whether the AI the person chose is a free connection; `auto` never lands on one */
export function freeAiInUse(settings: Pick<AiSettings, 'provider' | 'providers'>): boolean {
  const provider = settings.provider
  if (provider !== 'gemini' && provider !== 'openrouter') return false
  return isFreeAi(provider, settings.providers[provider]?.model)
}
