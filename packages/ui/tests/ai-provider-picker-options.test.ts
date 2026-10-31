import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  selectAiProvider,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import type { AiSubscriptionModel } from '@genoffice/ai-provider'
import {
  aiProviderPickerGroups,
  aiProviderPickerSelection,
  aiSubscriptionModelName,
  withAiProviderSelection,
} from '../src/ai-model-picker-options'

/** as Claude Code lists them: the default first, by the name of what it resolves to */
const CLAUDE_LIST: AiSubscriptionModel[] = [
  { id: '', label: 'Default (recommended)', resolved: 'claude-opus-5-5', isDefault: true },
  { id: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' },
  { id: 'fable', label: 'Fable 5.1', resolved: 'claude-fable-5-1' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
]

/** as Codex lists them: one of the entries is flagged as the default */
const CODEX_LIST: AiSubscriptionModel[] = [
  { id: 'gpt-next-codex', label: 'GPT-Next-Codex', isDefault: true },
  { id: 'gpt-next', label: 'GPT-Next', resolved: 'gpt-next-2026-09-01' },
]

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

const ready: AiSubscriptionStatuses = {
  'claude-code': status('claude-code', 'ready'),
  codex: status('codex', 'ready'),
}

const anthropicModels = AI_PROVIDERS.find((m) => m.id === 'anthropic')!.models
const claudeModels = AI_PROVIDERS.find((m) => m.id === 'claude-code')!.models

function withAnthropicKey(settings: AiSettings = defaultAiSettings()): AiSettings {
  settings.providers.anthropic = { apiKey: 'k', model: anthropicModels[0]! }
  return settings
}

/** a metered login counts as accepted only with both the stored flag and the status flag */
function acceptedMetered(provider: AiSubscriptionProviderId): {
  settings: AiSettings
  status: AiSubscriptionStatus
} {
  const settings = defaultAiSettings()
  settings.meteredAccepted = { [provider]: true }
  return { settings, status: status(provider, 'metered', { meteredAccepted: true }) }
}

describe('aiProviderPickerGroups', () => {
  it('lists only free models for an OpenRouter free connection', () => {
    const settings = defaultAiSettings()
    settings.providers.openrouter = {
      apiKey: 'sk-or-v1-x',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
    }
    const group = aiProviderPickerGroups(settings, {}).find((g) => g.id === 'openrouter')
    expect(group?.models.length).toBeGreaterThan(0)
    expect(group?.models.every((m) => m.endsWith(':free'))).toBe(true)
  })

  it('lists nothing while no subscription is connected and no key is filled in', () => {
    expect(aiProviderPickerGroups(defaultAiSettings(), {})).toEqual([])
    expect(
      aiProviderPickerGroups(defaultAiSettings(), {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'not-installed'),
      }),
    ).toEqual([])
  })

  it('puts the automatic entry and the subscriptions before the key providers', () => {
    const groups = aiProviderPickerGroups(withAnthropicKey(), ready)
    expect(groups.map((g) => [g.kind, g.id])).toEqual([
      ['auto', 'auto'],
      ['subscription', 'claude-code'],
      ['subscription', 'codex'],
      ['key', 'anthropic'],
    ])
  })

  it('names subscriptions in plain text and offers the CLI default before the catalog', () => {
    const groups = aiProviderPickerGroups(defaultAiSettings(), ready)
    expect(groups.find((g) => g.id === 'claude-code')).toEqual({
      kind: 'subscription',
      id: 'claude-code',
      label: 'Claude',
      models: ['', ...claudeModels],
      metered: false,
    })
    expect(groups.find((g) => g.id === 'codex')).toEqual({
      kind: 'subscription',
      id: 'codex',
      label: 'Codex',
      models: [''],
      metered: false,
    })
  })

  it('keeps a stored model that is not in the catalog selectable', () => {
    const settings = defaultAiSettings()
    settings.providers.codex = { apiKey: '', model: 'gpt-next', cliPath: '' }
    const codex = aiProviderPickerGroups(settings, ready).find((g) => g.id === 'codex')!
    expect(codex.models).toEqual(['', 'gpt-next'])
  })

  describe('a subscription whose CLI listed its models', () => {
    const withLists: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'ready', { models: CLAUDE_LIST }),
      codex: status('codex', 'ready', { models: CODEX_LIST }),
    }
    const group = (settings: AiSettings, id: AiSubscriptionProviderId) =>
      aiProviderPickerGroups(settings, withLists).find((g) => g.id === id)!

    it('offers the CLI default first, then what the CLI lists, by the value it takes', () => {
      expect(group(defaultAiSettings(), 'claude-code').models).toEqual([
        '',
        'opus',
        'fable',
        'claude-sonnet-5',
      ])
      expect(group(defaultAiSettings(), 'codex').models).toEqual(['', 'gpt-next-codex', 'gpt-next'])
    })

    it('gives each entry its display name and its concrete id', () => {
      const claude = group(defaultAiSettings(), 'claude-code').details!
      expect(claude.get('opus')).toEqual({ name: 'Opus 5.5', concrete: 'claude-opus-5-5' })
      expect(claude.get('fable')).toEqual({ name: 'Fable 5.1', concrete: 'claude-fable-5-1' })
      // an entry that is its own concrete id
      expect(claude.get('claude-sonnet-5')).toEqual({
        name: 'Sonnet 5',
        concrete: 'claude-sonnet-5',
      })
      const codex = group(defaultAiSettings(), 'codex').details!
      expect(codex.get('gpt-next')).toEqual({ name: 'GPT-Next', concrete: 'gpt-next-2026-09-01' })
      expect(codex.get('gpt-next-codex')).toEqual({
        name: 'GPT-Next-Codex',
        concrete: 'gpt-next-codex',
      })
    })

    it('says what the default resolves to', () => {
      // Claude names the model its default runs on: shown by that model's own name
      expect(group(defaultAiSettings(), 'claude-code').details!.get('')).toEqual({
        name: 'Opus 5.5',
        concrete: 'claude-opus-5-5',
      })
      // Codex flags one of its entries as the default
      expect(group(defaultAiSettings(), 'codex').details!.get('')).toEqual({
        name: 'GPT-Next-Codex',
        concrete: 'gpt-next-codex',
      })
      // a default that resolves to a model the list does not name is shown by its id
      const lone = aiProviderPickerGroups(defaultAiSettings(), {
        'claude-code': status('claude-code', 'ready', {
          models: [
            { id: '', label: 'Default', resolved: 'claude-next-9', isDefault: true },
            { id: 'haiku', label: 'Haiku 4.5', resolved: 'claude-haiku-4-5' },
          ],
        }),
      }).find((g) => g.id === 'claude-code')!
      expect(lone.details!.get('')).toEqual({ name: 'claude-next-9' })
      // a CLI that does not say leaves the default entry as it was
      const silent = aiProviderPickerGroups(defaultAiSettings(), {
        'claude-code': status('claude-code', 'ready', {
          models: [{ id: 'haiku', label: 'Haiku 4.5' }],
        }),
      }).find((g) => g.id === 'claude-code')!
      expect(silent.models).toEqual(['', 'haiku'])
      expect(silent.details!.has('')).toBe(false)
    })

    it('still shows a stored selection the CLI does not list, right after the default', () => {
      const settings = defaultAiSettings()
      settings.providers['claude-code'] = { apiKey: '', model: 'claude-old-3' }
      const claude = group(settings, 'claude-code')
      expect(claude.models).toEqual(['', 'claude-old-3', 'opus', 'fable', 'claude-sonnet-5'])
      expect(claude.details!.has('claude-old-3')).toBe(false)
      // a listed selection is not repeated
      settings.providers['claude-code'] = { apiKey: '', model: 'fable' }
      expect(group(settings, 'claude-code').models).toEqual([
        '',
        'opus',
        'fable',
        'claude-sonnet-5',
      ])
    })

    it('a stored selection named like an object property is just another id', () => {
      const settings = defaultAiSettings()
      settings.providers['claude-code'] = { apiKey: '', model: 'constructor' }
      const claude = group(settings, 'claude-code')
      expect(claude.details!.get('constructor')).toBeUndefined()
      expect(aiSubscriptionModelName(settings, withLists, 'claude-code')).toBe('constructor')
    })

    it('every listed entry still passes selectAiProvider once picked, stored by its id', () => {
      for (const id of ['claude-code', 'codex'] as const) {
        for (const model of group(defaultAiSettings(), id).models) {
          const next = withAiProviderSelection(defaultAiSettings(), { provider: id, model })
          expect(next.providers[id].model).toBe(model)
          expect(selectAiProvider(next, withLists).connected).toBe(true)
        }
      }
    })

    it('without a list the static catalog is shown, with no details', () => {
      const claude = aiProviderPickerGroups(defaultAiSettings(), ready).find(
        (g) => g.id === 'claude-code',
      )!
      expect(claude.models).toEqual(['', ...claudeModels])
      expect(claude.details).toBeUndefined()
    })
  })

  describe('aiSubscriptionModelName', () => {
    const withLists: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'ready', { models: CLAUDE_LIST }),
      codex: status('codex', 'ready', { models: CODEX_LIST }),
    }

    it('names the model the stored selection runs on', () => {
      const settings = defaultAiSettings()
      expect(aiSubscriptionModelName(settings, withLists, 'claude-code')).toBe('Opus 5.5')
      expect(aiSubscriptionModelName(settings, withLists, 'codex')).toBe('GPT-Next-Codex')
      settings.providers['claude-code'] = { apiKey: '', model: 'fable' }
      settings.providers.codex = { apiKey: '', model: 'gpt-next', cliPath: '' }
      expect(aiSubscriptionModelName(settings, withLists, 'claude-code')).toBe('Fable 5.1')
      expect(aiSubscriptionModelName(settings, withLists, 'codex')).toBe('GPT-Next')
    })

    it('falls back to the stored id for a model the CLI does not list', () => {
      const settings = defaultAiSettings()
      settings.providers['claude-code'] = { apiKey: '', model: 'claude-old-3' }
      expect(aiSubscriptionModelName(settings, withLists, 'claude-code')).toBe('claude-old-3')
    })

    it('is absent without a list, for a key provider, and for no provider', () => {
      const settings = defaultAiSettings()
      settings.providers['claude-code'] = { apiKey: '', model: 'sonnet' }
      expect(aiSubscriptionModelName(settings, ready, 'claude-code')).toBeUndefined()
      expect(aiSubscriptionModelName(settings, {}, 'claude-code')).toBeUndefined()
      expect(aiSubscriptionModelName(settings, withLists, 'anthropic')).toBeUndefined()
      expect(aiSubscriptionModelName(settings, withLists, undefined)).toBeUndefined()
    })
  })

  it('lists a key provider only once its settings are filled in', () => {
    const settings = defaultAiSettings()
    expect(aiProviderPickerGroups(settings, ready).some((g) => g.kind === 'key')).toBe(false)
    // a key without a model, and a model without a key, are both unfinished
    settings.providers.anthropic = { apiKey: 'k', model: '' }
    settings.providers.openai = { apiKey: '', model: 'gpt-x' }
    expect(aiProviderPickerGroups(settings, ready).some((g) => g.kind === 'key')).toBe(false)
    settings.providers.anthropic = { apiKey: 'k', model: 'claude-next' }
    const key = aiProviderPickerGroups(settings, ready).filter((g) => g.kind === 'key')
    expect(key.map((g) => g.id)).toEqual(['anthropic'])
    expect(key[0]!.models).toEqual(['claude-next', ...anthropicModels])
    expect(key[0]!.metered).toBe(false)
  })

  it('shows the models the vendor listed for the key after the catalog (decision 0087)', () => {
    const settings = withAnthropicKey()
    settings.providers.anthropic.models = ['claude-opus-6', anthropicModels[1]!]
    const key = aiProviderPickerGroups(settings, ready).find((g) => g.id === 'anthropic')!
    expect(key.models).toEqual([...anthropicModels, 'claude-opus-6'])
  })

  it('never lists a provider config stored under an id this build does not know', () => {
    const settings = defaultAiSettings()
    const stored = settings.providers as Record<string, { apiKey: string; model: string }>
    stored['retired-provider'] = { apiKey: 'k', model: 'claude-opus-5-5' }
    const ids: string[] = aiProviderPickerGroups(settings, ready).map((g) => g.id)
    expect(ids).not.toContain('retired-provider')
  })

  it('lists an accepted metered login with a cost marker', () => {
    const { settings, status: claude } = acceptedMetered('claude-code')
    const groups = aiProviderPickerGroups(settings, { 'claude-code': claude })
    expect(groups.map((g) => [g.kind, g.id, g.metered])).toEqual([
      ['subscription', 'claude-code', true],
    ])
  })

  it('leaves a metered login out until the user accepted it', () => {
    const metered = { 'claude-code': status('claude-code', 'metered') }
    expect(aiProviderPickerGroups(defaultAiSettings(), metered)).toEqual([])
    // the stored flag alone is not enough: the status must carry it too
    const stale = defaultAiSettings()
    stale.meteredAccepted = { 'claude-code': true }
    expect(aiProviderPickerGroups(stale, metered)).toEqual([])
    // and neither is the status flag without the stored one
    expect(
      aiProviderPickerGroups(defaultAiSettings(), {
        'claude-code': status('claude-code', 'metered', { meteredAccepted: true }),
      }),
    ).toEqual([])
  })

  describe('the automatic entry', () => {
    const autoOf = (settings: AiSettings, statuses: AiSubscriptionStatuses) =>
      aiProviderPickerGroups(settings, statuses).find((g) => g.kind === 'auto')

    it('resolves to Claude while both subscriptions are ready', () => {
      expect(autoOf(defaultAiSettings(), ready)).toEqual({
        kind: 'auto',
        id: 'auto',
        label: 'Claude',
        models: [],
        metered: false,
        resolved: 'claude-code',
      })
    })

    it('resolves to Codex when Claude is not ready', () => {
      const auto = autoOf(defaultAiSettings(), {
        'claude-code': status('claude-code', 'signed-out'),
        chatgpt: status('chatgpt', 'signed-out'),
        codex: status('codex', 'ready'),
      })
      expect(auto?.resolved).toBe('codex')
      expect(auto?.label).toBe('Codex')
    })

    it('skips an accepted metered Claude for a ready Codex', () => {
      const { settings, status: claude } = acceptedMetered('claude-code')
      const statuses = {
        'claude-code': claude,
        chatgpt: status('chatgpt', 'signed-out'),
        codex: status('codex', 'ready'),
      }
      expect(autoOf(settings, statuses)?.resolved).toBe('codex')
      // the metered login stays selectable on its own, marked as paid
      const groups = aiProviderPickerGroups(settings, statuses)
      expect(groups.find((g) => g.id === 'claude-code')?.metered).toBe(true)
    })

    it('is absent while it would resolve to nothing', () => {
      // key providers and metered logins are never automatic candidates
      const { settings, status: claude } = acceptedMetered('claude-code')
      expect(autoOf(withAnthropicKey(settings), { 'claude-code': claude })).toBeUndefined()
      expect(autoOf(withAnthropicKey(), {})).toBeUndefined()
    })

    it('reflects the stored selection, not the entry the user is on', () => {
      const settings = withAnthropicKey()
      settings.provider = 'anthropic'
      expect(autoOf(settings, ready)?.resolved).toBe('claude-code')
    })
  })

  it('lists nothing that selectAiProvider would refuse', () => {
    const { settings, status: claude } = acceptedMetered('claude-code')
    withAnthropicKey(settings)
    settings.providers.openai = { apiKey: '', model: 'gpt-x' }
    settings.providers.gemini = { apiKey: 'k', model: '' }
    settings.customEndpoints = [
      {
        id: 'a',
        name: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'llama3',
      },
      { id: 'c', name: 'Empty', baseUrl: '', apiKey: '', model: 'm' },
    ]
    const fixtures: AiSubscriptionStatuses[] = [
      {},
      ready,
      { 'claude-code': claude, codex: status('codex', 'ready') },
      { 'claude-code': claude, codex: status('codex', 'metered') },
      { 'claude-code': status('claude-code', 'error', { error: 'boom' }) },
      { 'claude-code': status('claude-code', 'checking'), codex: status('codex', 'signed-out') },
    ]
    for (const statuses of fixtures) {
      const groups = aiProviderPickerGroups(settings, statuses)
      expect(groups.length).toBeGreaterThan(0)
      for (const group of groups) {
        for (const model of group.models.length > 0 ? group.models : ['']) {
          const next = withAiProviderSelection(settings, {
            provider: group.id,
            endpoint: group.endpoint,
            model,
          })
          const choice = selectAiProvider(next, statuses)
          expect(choice.connected, `${group.id}:${model}`).toBe(true)
          if (choice.connected) expect(choice.metered, group.id).toBe(group.metered)
        }
      }
    }
  })
})

describe('selection under the subscription contract', () => {
  it('reads the automatic selection and what it runs on', () => {
    const settings = defaultAiSettings()
    settings.providers['claude-code'] = { apiKey: '', model: 'sonnet' }
    expect(aiProviderPickerSelection(settings, ready)).toEqual({
      provider: 'auto',
      model: 'sonnet',
      resolved: 'claude-code',
      metered: false,
    })
    expect(aiProviderPickerSelection(settings, {})).toEqual({
      provider: 'auto',
      model: '',
      resolved: undefined,
      metered: false,
    })
  })

  it('reads an unknown provider id as the automatic selection', () => {
    const settings = { ...defaultAiSettings(), provider: 'retired-provider' as never }
    expect(aiProviderPickerSelection(settings, ready).provider).toBe('auto')
  })

  it('picking a subscription model stores the provider and the model', () => {
    const start = defaultAiSettings()
    const next = withAiProviderSelection(start, { provider: 'codex', model: 'gpt-next' })
    expect(next.provider).toBe('codex')
    expect(next.providers.codex.model).toBe('gpt-next')
    expect(aiProviderPickerSelection(next, ready)).toEqual({
      provider: 'codex',
      model: 'gpt-next',
      resolved: 'codex',
      metered: false,
    })
    // the input is not mutated
    expect(start.provider).toBe('auto')
    expect(start.providers.codex.model).toBe('')
  })

  it('picking the automatic entry only changes the selection', () => {
    const start = withAiProviderSelection(defaultAiSettings(), {
      provider: 'codex',
      model: 'gpt-next',
    })
    const next = withAiProviderSelection(start, { provider: 'auto', model: '' })
    expect(next.provider).toBe('auto')
    expect(next.providers.codex.model).toBe('gpt-next')
  })

  it('marks an accepted metered selection as paid and keeps a blocked one unresolved', () => {
    const { settings, status: claude } = acceptedMetered('claude-code')
    const picked = withAiProviderSelection(settings, { provider: 'claude-code', model: 'opus' })
    expect(aiProviderPickerSelection(picked, { 'claude-code': claude })).toEqual({
      provider: 'claude-code',
      model: 'opus',
      resolved: 'claude-code',
      metered: true,
    })
    // a selection that cannot run is reported as it is, never replaced by another provider
    const blocked = aiProviderPickerSelection(picked, {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'ready'),
    })
    expect(blocked.provider).toBe('claude-code')
    expect(blocked.resolved).toBeUndefined()
  })

  it('picking a model on a saved custom endpoint activates that endpoint', () => {
    const settings: AiSettings = {
      ...defaultAiSettings(),
      customEndpoints: [
        { id: 'a', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'm1' },
        { id: 'b', name: '', baseUrl: 'https://gw.example.com/v1', apiKey: 'k', model: 'm2' },
      ],
      customEndpoint: 'a',
    }
    const next = withAiProviderSelection(settings, {
      provider: 'custom',
      endpoint: 'b',
      model: 'm2',
    })
    expect(aiProviderPickerSelection(next, {})).toEqual({
      provider: 'custom',
      endpoint: 'b',
      model: 'm2',
      resolved: 'custom',
      metered: false,
    })
  })
})
