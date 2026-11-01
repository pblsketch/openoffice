import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  type AiSettings,
  type AiSubscriptionModel,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import {
  aiEffortChoice,
  withAiEffort,
  withAiEffortFitted,
  withAiProviderSelection,
} from '../src/ai-model-picker-options'
import { AI_EFFORT_STRINGS } from '../src/strings-ai-model-picker'

/** as Claude Code lists them: the default entry has the empty id */
const CLAUDE_LIST: AiSubscriptionModel[] = [
  {
    id: '',
    label: 'Default',
    resolved: 'claude-opus-5-5',
    isDefault: true,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  { id: 'opus', label: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'sonnet', label: 'Sonnet 5.5', efforts: ['low', 'medium', 'high'] },
  { id: 'haiku', label: 'Haiku 4.5' },
]

/** as Codex lists them: one entry flagged as the default, with the level it runs */
const CODEX_LIST: AiSubscriptionModel[] = [
  {
    id: 'gpt-next',
    label: 'GPT-Next',
    isDefault: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    defaultEffort: 'medium',
  },
]

const status = (
  provider: AiSubscriptionProviderId,
  models: AiSubscriptionModel[],
): AiSubscriptionStatus => ({ provider, state: 'ready', meteredAccepted: false, models })

const statuses: AiSubscriptionStatuses = {
  'claude-code': status('claude-code', CLAUDE_LIST),
  codex: status('codex', CODEX_LIST),
}

function settingsWith(
  provider: AiSettings['provider'],
  configs: Partial<AiSettings['providers']>,
): AiSettings {
  const settings = defaultAiSettings()
  settings.provider = provider
  Object.assign(settings.providers, configs)
  return settings
}

describe('the effort row', () => {
  it('offers the levels of the model the running subscription is set to', () => {
    const settings = settingsWith('claude-code', {
      'claude-code': { apiKey: '', model: 'sonnet', effort: 'high' },
    })
    expect(aiEffortChoice(settings, statuses)).toEqual({
      provider: 'claude-code',
      efforts: ['low', 'medium', 'high'],
      current: 'high',
    })
  })

  it('reads the default entry for an empty selection, and what automatic runs on', () => {
    const settings = settingsWith('auto', { 'claude-code': { apiKey: '', model: '' } })
    expect(aiEffortChoice(settings, statuses)).toMatchObject({
      provider: 'claude-code',
      efforts: CLAUDE_LIST[0]!.efforts,
    })
    // Codex has no empty entry: the flagged one, with the level it runs when none is chosen
    const codex = settingsWith('codex', { codex: { apiKey: '', model: '' } })
    expect(aiEffortChoice(codex, statuses)).toEqual({
      provider: 'codex',
      efforts: ['minimal', 'low', 'medium', 'high'],
      defaultEffort: 'medium',
    })
  })

  it('shows no current level the model does not take', () => {
    const settings = settingsWith('claude-code', {
      'claude-code': { apiKey: '', model: 'sonnet', effort: 'max' },
    })
    expect(aiEffortChoice(settings, statuses)?.current).toBeUndefined()
  })

  it('is absent without a listed level: a model without one, an unlisted model, a key provider', () => {
    const haiku = settingsWith('claude-code', { 'claude-code': { apiKey: '', model: 'haiku' } })
    expect(aiEffortChoice(haiku, statuses)).toBeUndefined()
    const unlisted = settingsWith('claude-code', { 'claude-code': { apiKey: '', model: 'x' } })
    expect(aiEffortChoice(unlisted, statuses)).toBeUndefined()
    const anthropic = AI_PROVIDERS.find((meta) => meta.id === 'anthropic')!
    const key = settingsWith('anthropic', {
      anthropic: { apiKey: 'k', model: anthropic.models[0]!, effort: 'high' },
    })
    expect(aiEffortChoice(key, statuses)).toBeUndefined()
    // a CLI that has not listed its models yet
    const sonnet = settingsWith('claude-code', { 'claude-code': { apiKey: '', model: 'sonnet' } })
    expect(
      aiEffortChoice(sonnet, { 'claude-code': { ...statuses['claude-code']!, models: undefined } }),
    ).toBeUndefined()
  })
})

describe('setting a level', () => {
  it('stores it on the provider and clears it back to the default', () => {
    const settings = settingsWith('claude-code', {
      'claude-code': { apiKey: '', model: 'opus', cliPath: '/bin/claude' },
    })
    const high = withAiEffort(settings, 'claude-code', 'high')
    expect(high.providers['claude-code']).toEqual({
      apiKey: '',
      model: 'opus',
      cliPath: '/bin/claude',
      effort: 'high',
    })
    expect(settings.providers['claude-code']).not.toHaveProperty('effort')
    expect(
      withAiEffort(high, 'claude-code', undefined).providers['claude-code'],
    ).not.toHaveProperty('effort')
  })

  it('drops a level the newly picked model does not take, and keeps one it does', () => {
    const settings = settingsWith('claude-code', {
      'claude-code': { apiKey: '', model: 'opus', effort: 'max' },
    })
    const pick = (model: string) =>
      withAiEffortFitted(
        withAiProviderSelection(settings, { provider: 'claude-code', model }),
        statuses,
      ).providers['claude-code']
    expect(pick('sonnet')).not.toHaveProperty('effort')
    expect(pick('haiku')).not.toHaveProperty('effort')
    expect(pick('')?.effort).toBe('max')
    // what an unlisted model takes is not known: the level stays
    expect(pick('claude-next')?.effort).toBe('max')
  })
})

describe('effort strings', () => {
  it('name every level in every language, with the level placeholder kept', () => {
    const levels = Object.keys(AI_EFFORT_STRINGS.en.levels).sort()
    for (const [lang, strings] of Object.entries(AI_EFFORT_STRINGS)) {
      expect(Object.keys(strings.levels).sort(), lang).toEqual(levels)
      expect(strings.autoNamed, lang).toContain('{level}')
      for (const text of [
        strings.title,
        strings.hint,
        strings.auto,
        ...Object.values(strings.levels),
      ])
        expect(text.trim(), lang).not.toBe('')
    }
  })
})
