import { describe, expect, it } from 'vitest'
import {
  defaultAiSettings,
  resolveCustomEndpoints,
  type AiCustomEndpoint,
  type AiSettings,
} from '@genoffice/ai-provider'
import {
  aiEffortChoice,
  withAiEffort,
  withAiEffortFitted,
  withAiProviderSelection,
} from '../src/ai-model-picker-options'

/** The effort row on a key provider whose list names levels, and on a local server (decision 0096) */

function anthropic(model: string, effort?: string): AiSettings {
  const settings = defaultAiSettings()
  settings.provider = 'anthropic'
  settings.providers.anthropic = {
    apiKey: 'sk-ant',
    model,
    models: ['claude-opus-5-5', 'claude-haiku-4-5'],
    modelEfforts: {
      'claude-opus-5-5': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    },
    ...(effort ? { effort } : {}),
  }
  return settings
}

function local(model: string, effort?: string): AiSettings {
  const endpoint: AiCustomEndpoint = {
    id: 'ollama-1',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    model,
    models: ['gpt-oss:20b', 'qwen3:8b'],
    kind: 'local',
    modelProfiles: {
      'gpt-oss:20b': { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', checkedAt: 1 },
      'qwen3:8b': { tools: true, checkedAt: 1 },
    },
    ...(effort ? { effort } : {}),
  }
  return resolveCustomEndpoints({
    ...defaultAiSettings(),
    provider: 'custom',
    customEndpoints: [endpoint],
    customEndpoint: 'ollama-1',
  })
}

describe('the effort row on a key provider', () => {
  it('offers the levels the vendor listed for the selected model', () => {
    expect(aiEffortChoice(anthropic('claude-opus-5-5', 'xhigh'), {})).toEqual({
      provider: 'anthropic',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      current: 'xhigh',
    })
  })

  it('is absent for a model listed without levels and for a vendor that names none', () => {
    expect(aiEffortChoice(anthropic('claude-haiku-4-5'), {})).toBeUndefined()
    const openai = defaultAiSettings()
    openai.provider = 'openai'
    openai.providers.openai = {
      apiKey: 'k',
      model: 'gpt-5.6-terra',
      modelEfforts: { 'gpt-5.6-terra': { efforts: ['low', 'high'] } },
    }
    expect(aiEffortChoice(openai, {})).toBeUndefined()
  })

  it('stores the level on the provider and drops it for a listed model without levels', () => {
    const high = withAiEffort(anthropic('claude-opus-5-5'), 'anthropic', 'high')
    expect(high.providers.anthropic.effort).toBe('high')
    const haiku = withAiEffortFitted(
      withAiProviderSelection(high, { provider: 'anthropic', model: 'claude-haiku-4-5' }),
      {},
    )
    expect(haiku.providers.anthropic).not.toHaveProperty('effort')
    // a model the vendor did not list keeps it
    const typed = withAiEffortFitted(
      withAiProviderSelection(high, { provider: 'anthropic', model: 'claude-next' }),
      {},
    )
    expect(typed.providers.anthropic.effort).toBe('high')
  })
})

describe('the effort row on a local server', () => {
  it('offers the levels the server reported for the active model, with its default', () => {
    expect(aiEffortChoice(local('gpt-oss:20b', 'high'), {})).toEqual({
      provider: 'custom',
      endpoint: 'ollama-1',
      efforts: ['low', 'medium', 'high'],
      current: 'high',
      defaultEffort: 'medium',
    })
    expect(aiEffortChoice(local('qwen3:8b'), {})).toBeUndefined()
  })

  it('stores the level on the server entry, which the custom slot mirrors', () => {
    const set = withAiEffort(local('gpt-oss:20b'), 'custom', 'low', 'ollama-1')
    expect(set.customEndpoints?.[0]?.effort).toBe('low')
    expect(set.providers.custom).toMatchObject({ effort: 'low' })
    const cleared = withAiEffort(set, 'custom', undefined, 'ollama-1')
    expect(cleared.customEndpoints?.[0]).not.toHaveProperty('effort')
    expect(cleared.providers.custom).not.toHaveProperty('effort')
  })

  it('drops the level when the picked model was checked and takes none', () => {
    const set = withAiEffort(local('gpt-oss:20b'), 'custom', 'low', 'ollama-1')
    const picked = withAiEffortFitted(
      withAiProviderSelection(set, { provider: 'custom', endpoint: 'ollama-1', model: 'qwen3:8b' }),
      {},
    )
    expect(picked.customEndpoints?.[0]).not.toHaveProperty('effort')
  })
})
