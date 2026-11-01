import { describe, expect, it } from 'vitest'
import { claudeAgentLaunchArgs } from '../src/agent-session/claude'
import { sanitizeAiSettings } from '../src/ai-settings-guard'
import { codexListedEffort, codexSubscriptionModels } from '../src/codex-app-server'
import { aiEffortOf, aiEffortsOf } from '../src/effort'
import { subscriptionModelsOf } from '../src/subscription/contract'

describe('effort levels', () => {
  it('reads a known level and nothing else', () => {
    expect(aiEffortOf(' high ')).toBe('high')
    expect(aiEffortOf('xhigh')).toBe('xhigh')
    for (const value of ['', 'HIGH', 'ultra', '--effort', 3, null, undefined, ['high']]) {
      expect(aiEffortOf(value)).toBeUndefined()
    }
  })

  it('lists known levels once each, lowest first', () => {
    expect(aiEffortsOf(['max', 'low', 'ultra', 'low', 'medium'])).toEqual(['low', 'medium', 'max'])
    expect(aiEffortsOf(['ultra'])).toBeUndefined()
    expect(aiEffortsOf('low')).toBeUndefined()
  })
})

describe('effort in a status model list', () => {
  it('keeps the known levels and a default only when the model takes it', () => {
    expect(
      subscriptionModelsOf([
        { id: 'a', label: 'A', efforts: ['high', 'ultra', 'low'], defaultEffort: 'high' },
        { id: 'b', label: 'B', efforts: ['low'], defaultEffort: 'max' },
        { id: 'c', label: 'C', efforts: ['ultra'], defaultEffort: 'ultra' },
        { id: 'd', label: 'D', defaultEffort: 'low' },
      ]),
    ).toEqual([
      { id: 'a', label: 'A', efforts: ['low', 'high'], defaultEffort: 'high' },
      { id: 'b', label: 'B', efforts: ['low'] },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ])
  })
})

describe('effort in saved settings', () => {
  it('keeps a known level of a provider and drops anything else', () => {
    const sanitized = sanitizeAiSettings({
      provider: 'auto',
      providers: {
        'claude-code': { apiKey: '', model: 'opus', effort: 'high' },
        codex: { apiKey: '', model: 'gpt', effort: '--tools Bash' },
        anthropic: { apiKey: 'k', model: 'm', effort: 7 },
      },
    })
    expect(sanitized!.providers['claude-code'].effort).toBe('high')
    expect(sanitized!.providers.codex).not.toHaveProperty('effort')
    expect(sanitized!.providers.anthropic).not.toHaveProperty('effort')
  })
})

describe('effort of a Claude agent session', () => {
  it('is handed to --effort after the model, and only a level the CLI takes', () => {
    const args = claudeAgentLaunchArgs({
      model: 'sonnet',
      effort: 'xhigh',
      mode: 'ask-commands',
      settingsFile: 's.json',
    })
    expect(args.slice(-4)).toEqual(['--model', 'sonnet', '--effort', 'xhigh'])
    for (const effort of [undefined, '', 'minimal', '--dangerously-skip-permissions']) {
      expect(
        claudeAgentLaunchArgs({ model: 'sonnet', effort, mode: 'ask-commands', settingsFile: 's' }),
      ).not.toContain('--effort')
    }
  })
})

/** Two `model/list` entries in the shape Codex 0.159 answers with */
const CODEX_LIST = [
  {
    id: 'gpt-6',
    model: 'gpt-6',
    displayName: 'GPT-6',
    hidden: false,
    isDefault: true,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: '' },
      { reasoningEffort: 'medium', description: '' },
      { reasoningEffort: 'high', description: '' },
      { reasoningEffort: 'xhigh', description: '' },
      { reasoningEffort: 'turbo', description: '' },
    ],
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-6-mini',
    model: 'gpt-6-mini',
    displayName: 'GPT-6 mini',
    hidden: false,
    isDefault: false,
    supportedReasoningEfforts: [{ reasoningEffort: 'minimal', description: '' }],
    defaultReasoningEffort: 'turbo',
  },
  { id: 'gpt-old', model: 'gpt-old', displayName: 'Old', hidden: false, isDefault: false },
]

describe('effort with Codex', () => {
  it('lists the levels each model takes and its default level', () => {
    expect(codexSubscriptionModels(CODEX_LIST)).toEqual([
      {
        id: 'gpt-6',
        label: 'GPT-6',
        isDefault: true,
        efforts: ['low', 'medium', 'high', 'xhigh'],
        defaultEffort: 'medium',
      },
      { id: 'gpt-6-mini', label: 'GPT-6 mini', efforts: ['minimal'] },
      { id: 'gpt-old', label: 'Old' },
    ])
  })

  it('names a configured level for a turn only when the model takes it', () => {
    const listed = { data: CODEX_LIST }
    expect(codexListedEffort(listed, 'gpt-6', 'high')).toBe('high')
    expect(codexListedEffort(listed, 'gpt-6', 'max')).toBeUndefined()
    expect(codexListedEffort(listed, 'gpt-6-mini', 'minimal')).toBe('minimal')
    expect(codexListedEffort(listed, 'gpt-old', 'high')).toBeUndefined()
    expect(codexListedEffort(listed, 'gpt-unknown', 'high')).toBeUndefined()
    expect(codexListedEffort(listed, 'gpt-6', 'turbo')).toBeUndefined()
    expect(codexListedEffort(listed, 'gpt-6', undefined)).toBeUndefined()
    expect(codexListedEffort({}, 'gpt-6', 'high')).toBeUndefined()
  })
})
