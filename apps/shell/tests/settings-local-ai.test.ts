import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import {
  isKeyProviderConfigured,
  removeCustomEndpoint,
  resolveCustomEndpoints,
  selectAiProvider,
} from '@genoffice/ai-provider/browser'
import type {
  AiCustomEndpoint,
  AiLocalModelProfile,
  AiSettings,
} from '@genoffice/ai-provider/browser'
import {
  applyInspection,
  applyPreset,
  applyTestResult,
  localEndpointDraft,
  localEndpoints,
  localServerStatus,
  localTestView,
  mergeLoadedModel,
  newLocalDraft,
  normalizeLocalBaseUrl,
  normalizeTimeoutMinutes,
  normalizeTimeoutMs,
  removeLocalEndpoint,
  saveLocalDraft,
} from '../src/renderer/src/local-ai'
import type { LocalEndpointDraft, LocalTestResult } from '../src/renderer/src/local-ai'

/**
 * The rules behind the local AI card (src/renderer/src/local-ai.ts): presets,
 * address and timeout checks, saving and deleting a server without changing the
 * selected AI, and the profile merge rules. No DOM is involved.
 */

const localA: AiCustomEndpoint = {
  id: 'local-a',
  name: 'Ollama',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: '',
  model: 'qwen3:8b',
  models: ['qwen3:8b', 'llama3'],
  kind: 'local',
  modelProfiles: {
    'qwen3:8b': {
      contextLength: 32_768,
      contextSource: 'server',
      tools: true,
      toolsSource: 'server',
    },
  },
  timeoutMs: 300_000,
}

const localB: AiCustomEndpoint = {
  id: 'local-b',
  name: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  apiKey: '',
  model: 'qwen2.5:7b',
  kind: 'local',
  timeoutMs: 120_000,
}

const plain: AiCustomEndpoint = {
  id: 'plain',
  name: 'Gateway',
  baseUrl: 'https://gw.example.com/v1',
  apiKey: 'k',
  model: 'gpt-x',
}

function settingsWith(overrides: Partial<AiSettings> = {}): AiSettings {
  return resolveCustomEndpoints({ ...defaultAiSettings(), ...overrides })
}

function activeA(): AiSettings {
  return settingsWith({
    provider: 'custom',
    customEndpoints: [localA, localB, plain],
    customEndpoint: 'local-a',
  })
}

function testResult(
  tools: LocalTestResult['tools'],
  checkedAt = 1_000,
  patch: Partial<LocalTestResult> = {},
): LocalTestResult {
  return {
    server: { status: 'pass' },
    model: { status: 'pass' },
    chat: { status: 'pass' },
    tools,
    checkedAt,
    elapsedMs: 12,
    ...patch,
  }
}

function endpointOf(settings: AiSettings, id: string): AiCustomEndpoint {
  const endpoint = settings.customEndpoints?.find((entry) => entry.id === id)
  if (!endpoint) throw new Error(`missing endpoint ${id}`)
  return endpoint
}

describe('localEndpoints', () => {
  it('lists only kind local servers in registration order', () => {
    const settings = settingsWith({
      customEndpoints: [plain, localB, localA],
      customEndpoint: 'plain',
    })
    expect(localEndpoints(settings).map((entry) => entry.id)).toEqual(['local-b', 'local-a'])
  })

  it('is empty when nothing is saved', () => {
    expect(localEndpoints(defaultAiSettings())).toEqual([])
  })
})

describe('newLocalDraft and applyPreset', () => {
  it('builds the preset defaults with a blank id and the default timeout', () => {
    expect(newLocalDraft('ollama')).toEqual({
      id: '',
      preset: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: '',
      model: '',
      timeoutMs: 300_000,
    })
    expect(newLocalDraft('lmstudio').baseUrl).toBe('http://127.0.0.1:1234/v1')
    expect(newLocalDraft('vllm').baseUrl).toBe('http://127.0.0.1:8000/v1')
  })

  it('leaves "other" blank, which is a partial draft the user fills in', () => {
    expect(newLocalDraft('other')).toMatchObject({
      preset: 'other',
      name: '',
      baseUrl: '',
      timeoutMs: 300_000,
    })
  })

  it('fills blank fields and updates untouched preset defaults', () => {
    const filled = applyPreset(newLocalDraft('other'), 'ollama')
    expect(filled).toMatchObject({
      preset: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
    })

    const switched = applyPreset(newLocalDraft('ollama'), 'lmstudio')
    expect(switched).toMatchObject({
      preset: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
    })
  })

  it('keeps a name and address the user typed', () => {
    const typed: LocalEndpointDraft = {
      ...newLocalDraft('other'),
      name: 'My box',
      baseUrl: 'http://mybox:9000/v1',
    }
    expect(applyPreset(typed, 'vllm')).toMatchObject({
      preset: 'vllm',
      name: 'My box',
      baseUrl: 'http://mybox:9000/v1',
    })
  })

  it('overwrites typed values only when the user asks', () => {
    const typed: LocalEndpointDraft = {
      ...newLocalDraft('other'),
      name: 'My box',
      baseUrl: 'http://mybox:9000/v1',
      timeoutMs: 150_000,
    }
    const replaced = applyPreset(typed, 'ollama', { replace: true })
    expect(replaced).toMatchObject({
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      timeoutMs: 150_000,
    })
  })

  it('does not clear a typed value when the new preset has no defaults', () => {
    const typed: LocalEndpointDraft = {
      ...newLocalDraft('ollama'),
      name: 'My box',
      baseUrl: 'http://mybox:9000/v1',
    }
    expect(applyPreset(typed, 'other')).toMatchObject({
      preset: 'other',
      name: 'My box',
      baseUrl: 'http://mybox:9000/v1',
    })
  })
})

describe('normalizeLocalBaseUrl', () => {
  it('adds http and the /v1 suffix for a known preset', () => {
    expect(normalizeLocalBaseUrl(' 127.0.0.1:11434 ', 'ollama')).toEqual({
      ok: true,
      value: 'http://127.0.0.1:11434/v1',
    })
    expect(normalizeLocalBaseUrl('http://host:1234/', 'lmstudio')).toEqual({
      ok: true,
      value: 'http://host:1234/v1',
    })
  })

  it('strips trailing slashes and keeps https', () => {
    expect(normalizeLocalBaseUrl('https://host:8443/v1/', 'vllm')).toEqual({
      ok: true,
      value: 'https://host:8443/v1',
    })
  })

  it('does not append /v1 when the known preset already has a path', () => {
    expect(normalizeLocalBaseUrl('http://host:11434/openai', 'ollama')).toEqual({
      ok: true,
      value: 'http://host:11434/openai',
    })
  })

  it('uses the other preset address as entered', () => {
    expect(normalizeLocalBaseUrl('https://gw.example.com/openai', 'other')).toEqual({
      ok: true,
      value: 'https://gw.example.com/openai',
    })
    expect(normalizeLocalBaseUrl('http://host/', 'other')).toEqual({
      ok: true,
      value: 'http://host',
    })
  })

  it('accepts uppercase schemes and drops default ports', () => {
    expect(normalizeLocalBaseUrl('HTTP://HOST:80/v1/', 'other')).toEqual({
      ok: true,
      value: 'http://host/v1',
    })
  })

  it('rejects a scheme other than http or https', () => {
    expect(normalizeLocalBaseUrl('ftp://host/v1', 'other')).toEqual({
      ok: false,
      code: 'scheme',
    })
    expect(normalizeLocalBaseUrl('file:///tmp/model', 'other')).toEqual({
      ok: false,
      code: 'scheme',
    })
  })

  it('rejects an address with a user name or password', () => {
    expect(normalizeLocalBaseUrl('http://user:secret@host/v1', 'other')).toEqual({
      ok: false,
      code: 'credentials',
    })
    expect(normalizeLocalBaseUrl('http://user@host/v1', 'other')).toEqual({
      ok: false,
      code: 'credentials',
    })
  })

  it('rejects a blank or too long address', () => {
    expect(normalizeLocalBaseUrl('   ', 'other')).toEqual({ ok: false, code: 'empty' })
    expect(normalizeLocalBaseUrl(`http://host/${'a'.repeat(2048)}`, 'other')).toEqual({
      ok: false,
      code: 'too-long',
    })
  })

  it('rejects a query or fragment and a shape that is not a URL', () => {
    expect(normalizeLocalBaseUrl('http://host/v1?x=1', 'other')).toEqual({
      ok: false,
      code: 'shape',
    })
    expect(normalizeLocalBaseUrl('http://', 'other')).toEqual({ ok: false, code: 'shape' })
  })
})

describe('normalizeTimeoutMs', () => {
  it('accepts whole milliseconds inside the allowed window', () => {
    expect(normalizeTimeoutMs(60_000)).toEqual({ ok: true, value: 60_000 })
    expect(normalizeTimeoutMs(600_000)).toEqual({ ok: true, value: 600_000 })
    expect(normalizeTimeoutMs('300000')).toEqual({ ok: true, value: 300_000 })
  })

  it('uses the default for a blank value', () => {
    expect(normalizeTimeoutMs(undefined)).toEqual({ ok: true, value: 300_000 })
    expect(normalizeTimeoutMs('')).toEqual({ ok: true, value: 300_000 })
  })

  it('rejects values outside the window', () => {
    expect(normalizeTimeoutMs(59_999)).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMs(600_001)).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMs(60_000.5)).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMs('abc')).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMs(Number.NaN)).toEqual({ ok: false, code: 'range' })
  })
})

describe('normalizeTimeoutMinutes', () => {
  it('accepts whole minutes inside 1..10 and converts to milliseconds', () => {
    expect(normalizeTimeoutMinutes('1')).toEqual({ ok: true, value: 60_000 })
    expect(normalizeTimeoutMinutes('10')).toEqual({ ok: true, value: 600_000 })
    expect(normalizeTimeoutMinutes('5')).toEqual({ ok: true, value: 300_000 })
  })

  it('uses the default for a blank field', () => {
    expect(normalizeTimeoutMinutes('')).toEqual({ ok: true, value: 300_000 })
    expect(normalizeTimeoutMinutes('  ')).toEqual({ ok: true, value: 300_000 })
  })

  it('rejects decimals, zero, and values over ten', () => {
    expect(normalizeTimeoutMinutes('1.5')).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMinutes('0')).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMinutes('11')).toEqual({ ok: false, code: 'range' })
    expect(normalizeTimeoutMinutes('abc')).toEqual({ ok: false, code: 'range' })
  })
})

describe('saveLocalDraft', () => {
  it('replaces the entry with the same id without changing the active server', () => {
    const before = activeA()
    const draft: LocalEndpointDraft = {
      ...localEndpointDraft(localA),
      name: 'A renamed',
      baseUrl: '127.0.0.1:11434',
      timeoutMs: 120_000,
    }
    const after = saveLocalDraft(before, draft)
    const saved = endpointOf(after, 'local-a')

    expect(after.customEndpoint).toBe('local-a')
    expect(after.provider).toBe('custom')
    expect(after.customEndpoints!.map((entry) => entry.id)).toEqual(['local-a', 'local-b', 'plain'])
    expect(saved).toMatchObject({
      name: 'A renamed',
      baseUrl: 'http://127.0.0.1:11434/v1',
      timeoutMs: 120_000,
      kind: 'local',
    })
    expect(saved.models).toEqual(localA.models)
    expect(saved.modelProfiles).toEqual(localA.modelProfiles)
    expect(after.providers.custom).toEqual({
      apiKey: '',
      model: 'qwen3:8b',
      baseUrl: 'http://127.0.0.1:11434/v1',
    })
  })

  it('appends a new server without making it active', () => {
    const before = activeA()
    const after = saveLocalDraft(before, newLocalDraft('lmstudio'))
    const added = after.customEndpoints!.at(-1)!

    expect(after.customEndpoint).toBe('local-a')
    expect(after.provider).toBe('custom')
    expect(added.id).not.toBe('')
    expect(added).toMatchObject({
      name: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      timeoutMs: 300_000,
      kind: 'local',
    })
    expect(after.customEndpoints!.map((entry) => entry.id)).toContain('plain')
    expect(after.providers.custom.baseUrl).toBe(localA.baseUrl)
  })

  it('keeps an explicit "no active server" selection empty', () => {
    const before = settingsWith({
      provider: 'custom',
      customEndpoints: [localB],
      customEndpoint: '',
    })
    const after = saveLocalDraft(before, newLocalDraft('ollama'))

    expect(after.customEndpoint).toBe('')
    expect(after.providers.custom).toEqual({ apiKey: '', model: '', baseUrl: '' })
    expect(after.provider).toBe('custom')
    expect(localEndpoints(after)).toHaveLength(2)
  })

  it('may materialize the first server without choosing the AI', () => {
    const after = saveLocalDraft(settingsWith({ provider: 'auto' }), newLocalDraft('ollama'))
    const added = after.customEndpoints![0]!

    expect(after.provider).toBe('auto')
    expect(after.customEndpoint).toBe(added.id)
    expect(after.providers.custom.baseUrl).toBe(added.baseUrl)
  })

  it('does not start using a new server when "custom" is chosen with no server left', () => {
    // the Advanced pane removed the last server: `provider` stays custom, the
    // list and the active id are gone, and chat reads "not configured"
    const removed = removeCustomEndpoint(
      settingsWith({ provider: 'custom', customEndpoints: [plain], customEndpoint: 'plain' }),
      'plain',
    )
    expect(removed.customEndpoints ?? []).toHaveLength(0)
    expect(removed.provider).toBe('custom')

    const after = saveLocalDraft(removed, { ...newLocalDraft('ollama'), model: 'qwen3:8b' })

    expect(after.provider).toBe('custom')
    expect(after.customEndpoint).toBe('')
    expect(after.providers.custom).toEqual({ apiKey: '', model: '', baseUrl: '' })
    expect(selectAiProvider(after, {}).connected).toBe(false)
    expect(localEndpoints(after)).toHaveLength(1)
  })

  it('keeps a server from a pre-list custom slot', () => {
    const defaults = defaultAiSettings()
    const before: AiSettings = {
      ...defaults,
      provider: 'custom',
      providers: {
        ...defaults.providers,
        custom: {
          apiKey: 'legacy-key',
          model: 'legacy-model',
          baseUrl: 'https://legacy.example.com/v1',
        },
      },
    }
    const after = saveLocalDraft(before, newLocalDraft('ollama'))
    const legacy = after.customEndpoints!.find((entry) => entry.kind !== 'local')!

    expect(after.customEndpoints).toHaveLength(2)
    expect(legacy).toMatchObject({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      baseUrl: 'https://legacy.example.com/v1',
    })
    expect(after.customEndpoint).toBe(legacy.id)
    expect(after.providers.custom).toEqual({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      baseUrl: 'https://legacy.example.com/v1',
    })
    expect(after.provider).toBe('custom')
  })

  it('refuses an address it cannot save and changes nothing', () => {
    const before = activeA()
    const draft: LocalEndpointDraft = {
      ...newLocalDraft('other'),
      id: '',
      name: 'Broken',
      baseUrl: 'ftp://broker/v1',
    }
    expect(saveLocalDraft(before, draft)).toBe(before)
  })

  it('stores the default timeout when the draft value is not usable', () => {
    const after = saveLocalDraft(activeA(), {
      ...localEndpointDraft(localB),
      timeoutMs: 5,
    })
    expect(endpointOf(after, 'local-b').timeoutMs).toBe(300_000)
  })

  it('preserves stored models and profiles, and accepts replacements', () => {
    const draft = localEndpointDraft(localA)
    delete draft.models
    delete draft.modelProfiles
    const preserved = endpointOf(saveLocalDraft(activeA(), draft), 'local-a')
    expect(preserved.models).toEqual(localA.models)
    expect(preserved.modelProfiles).toEqual(localA.modelProfiles)

    const replacement: AiLocalModelProfile = { contextLength: 8_192, tools: false }
    const replaced = endpointOf(
      saveLocalDraft(activeA(), {
        ...localEndpointDraft(localA),
        models: ['new-model'],
        modelProfiles: { 'new-model': replacement },
      }),
      'local-a',
    )
    expect(replaced.models).toEqual(['new-model'])
    expect(replaced.modelProfiles).toEqual({ 'new-model': replacement })
  })
})

describe('removeLocalEndpoint', () => {
  it('leaves no active server when the active one is removed', () => {
    const after = removeLocalEndpoint(activeA(), 'local-a')

    expect(after.customEndpoint).toBe('')
    expect(after.providers.custom).toEqual({ apiKey: '', model: '', baseUrl: '' })
    expect(after.provider).toBe('custom')
    expect(isKeyProviderConfigured(after, 'custom')).toBe(false)
    expect(localEndpoints(after).map((entry) => entry.id)).toEqual(['local-b'])
    expect(after.customEndpoints!.map((entry) => entry.id)).toContain('plain')
  })

  it('keeps the active server when an inactive one is removed', () => {
    const after = removeLocalEndpoint(activeA(), 'local-b')

    expect(after.customEndpoint).toBe('local-a')
    expect(after.providers.custom.baseUrl).toBe(localA.baseUrl)
    expect(localEndpoints(after).map((entry) => entry.id)).toEqual(['local-a'])
  })
})

describe('mergeLoadedModel', () => {
  it('keeps the latest model when the card did not change it', () => {
    expect(mergeLoadedModel({ model: 'qwen3:8b' }, 'qwen3:8b', 'llama3')).toBe('llama3')
    expect(mergeLoadedModel({ model: '' }, '', 'llama3')).toBe('llama3')
  })

  it('uses the card model when the card changed it', () => {
    expect(mergeLoadedModel({ model: 'llama3' }, 'qwen3:8b', 'mistral')).toBe('llama3')
  })
})

describe('applyInspection', () => {
  it('takes the effort levels the server names, and clears them when it names none', () => {
    const named = applyInspection(
      { efforts: ['low'], defaultEffort: 'low' },
      { efforts: ['low', 'medium', 'high', 'ultra'], defaultEffort: 'medium' },
    )
    expect(named).toMatchObject({ efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' })
    const none = applyInspection(named, { efforts: [] })
    expect(none).not.toHaveProperty('efforts')
    expect(none).not.toHaveProperty('defaultEffort')
    // an inspection that says nothing about levels keeps them
    expect(applyInspection(named, { tools: true })).toMatchObject({ efforts: named.efforts })
  })

  it('prefers the running context and keeps a distinct maximum', () => {
    const profile: AiLocalModelProfile = {
      notes: 'keep me',
      checkedAt: 123,
      tools: false,
      toolsSource: 'server',
      vision: true,
      visionSource: 'server',
    }
    expect(
      applyInspection(profile, { contextLength: 131_072, runningContextLength: 8_192 }),
    ).toEqual({
      notes: 'keep me',
      checkedAt: 123,
      contextLength: 8_192,
      maxContextLength: 131_072,
      contextSource: 'server',
      tools: false,
      toolsSource: 'server',
      vision: true,
      visionSource: 'server',
    })
  })

  it('drops the maximum when it is not distinct from the running context', () => {
    const next = applyInspection(
      { contextLength: 8_192, maxContextLength: 131_072, contextSource: 'server' },
      { contextLength: 8_192, runningContextLength: 8_192 },
    )
    expect(next.contextLength).toBe(8_192)
    expect(next.maxContextLength).toBeUndefined()
    expect(next.contextSource).toBe('server')
  })

  it('uses the advertised context when the model is not running and leaves no maximum', () => {
    const next = applyInspection(
      { maxContextLength: 131_072, contextSource: 'server' },
      { contextLength: 32_768 },
    )
    expect(next.contextLength).toBe(32_768)
    expect(next.maxContextLength).toBeUndefined()
    expect(next.contextSource).toBe('server')
  })

  it('never overwrites a value whose source is the user', () => {
    const profile: AiLocalModelProfile = {
      contextLength: 4_096,
      maxContextLength: 8_192,
      contextSource: 'user',
      tools: false,
      toolsSource: 'user',
      vision: false,
      visionSource: 'user',
      notes: 'n',
      checkedAt: 5,
    }
    const next = applyInspection(profile, {
      contextLength: 131_072,
      runningContextLength: 8_192,
      tools: true,
      vision: true,
    })
    expect(next).toEqual(profile)
    expect(next).not.toBe(profile)
  })

  it('updates only the fields the inspection carries', () => {
    const profile: AiLocalModelProfile = {
      contextLength: 4_096,
      contextSource: 'user',
      tools: false,
      toolsSource: 'server',
      vision: false,
      visionSource: 'server',
    }
    const next = applyInspection(profile, {
      contextLength: 131_072,
      runningContextLength: 8_192,
      tools: true,
    })
    expect(next.contextLength).toBe(4_096)
    expect(next.contextSource).toBe('user')
    expect(next.tools).toBe(true)
    expect(next.toolsSource).toBe('server')
    expect(next.vision).toBe(false)
    expect(next.visionSource).toBe('server')
  })

  it('records a known false, but leaves an unknown field unknown', () => {
    const known = applyInspection({}, { tools: false, vision: false })
    expect(known.tools).toBe(false)
    expect(known.toolsSource).toBe('server')
    expect(known.vision).toBe(false)
    expect(known.visionSource).toBe('server')

    const unknown = applyInspection({ tools: true, vision: true }, {})
    expect(unknown.tools).toBe(true)
    expect(unknown.vision).toBe(true)
  })

  it('ignores context values outside the allowed range', () => {
    const next = applyInspection(
      { contextLength: 4_096, contextSource: 'server' },
      { contextLength: -1, runningContextLength: 0 },
    )
    expect(next.contextLength).toBe(4_096)
    expect(next.contextSource).toBe('server')
  })
})

describe('applyTestResult', () => {
  it('records a passed tool check and the check time', () => {
    const next = applyTestResult(
      { notes: 'keep me', contextLength: 8_192, contextSource: 'server' },
      testResult({ status: 'pass' }),
    )
    expect(next.tools).toBe(true)
    expect(next.toolsSource).toBe('test')
    expect(next.checkedAt).toBe(1_000)
    expect(next.notes).toBe('keep me')
    expect(next.contextLength).toBe(8_192)
  })

  it('records the check time only when the server check passed', () => {
    const next = applyTestResult({ checkedAt: 42 }, testResult({ status: 'skip' }, 999))
    expect(next.checkedAt).toBe(999)
  })

  it('records the check time when the server passed but chat or tools failed', () => {
    const next = applyTestResult(
      { checkedAt: 42 },
      {
        ...testResult({ status: 'fail', code: 'no-tool-call' }, 999),
        chat: { status: 'fail', code: 'no-chat' },
      },
    )
    expect(next.checkedAt).toBe(999)
    expect(next.tools).toBeUndefined()
    expect(next.toolsSource).toBeUndefined()
  })

  it('keeps the last check time when the server check failed', () => {
    for (const code of ['unreachable', 'timeout'] as const) {
      const next = applyTestResult(
        { checkedAt: 42 },
        testResult({ status: 'skip' }, 999, { server: { status: 'fail', code } }),
      )
      expect(next.checkedAt).toBe(42)
    }
  })

  it('never turns a missing tool call into "tools: false"', () => {
    const kept = applyTestResult(
      { tools: true, toolsSource: 'server' },
      testResult({ status: 'fail', code: 'no-tool-call' }),
    )
    expect(kept.tools).toBe(true)
    expect(kept.toolsSource).toBe('server')

    const unknown = applyTestResult({}, testResult({ status: 'fail', code: 'no-tool-call' }))
    expect(unknown.tools).toBeUndefined()
    expect(unknown.toolsSource).toBeUndefined()
  })

  it('does not touch tools on a failure or a skip', () => {
    for (const status of ['fail', 'skip'] as const) {
      const next = applyTestResult({}, testResult({ status, code: 'no-chat' }))
      expect(next.tools).toBeUndefined()
      expect(next.toolsSource).toBeUndefined()
    }
  })

  it('does not overwrite a user tool value on a pass', () => {
    const next = applyTestResult(
      { tools: false, toolsSource: 'user' },
      testResult({ status: 'pass' }),
    )
    expect(next.tools).toBe(false)
    expect(next.toolsSource).toBe('user')
  })

  it('keeps the last check time when the result carries none', () => {
    const next = applyTestResult({ checkedAt: 42 }, testResult({ status: 'skip' }, Number.NaN))
    expect(next.checkedAt).toBe(42)
  })

  it('records nothing when the input shape was invalid', () => {
    const next = applyTestResult(
      { checkedAt: 42 },
      testResult({ status: 'skip' }, 999, { inputError: 'shape' }),
    )
    expect(next.checkedAt).toBe(42)
    expect(next.tools).toBeUndefined()
  })
})

describe('localServerStatus', () => {
  it('starts unknown and follows the probe', () => {
    expect(localServerStatus(undefined)).toEqual({ state: 'unknown' })
    expect(localServerStatus('unknown')).toEqual({ state: 'unknown' })
    expect(localServerStatus('checking')).toEqual({ state: 'checking' })
  })

  it('reports online with the model count', () => {
    expect(
      localServerStatus({
        ok: true,
        server: 'ollama',
        models: [{ id: 'a' }, { id: 'b' }],
      }),
    ).toEqual({ state: 'online', modelCount: 2 })
  })

  it('separates an unreachable server from a protocol error', () => {
    expect(localServerStatus({ ok: false, errorCode: 'unreachable' })).toEqual({
      state: 'offline',
    })
    expect(localServerStatus({ ok: false, errorCode: 'timeout' })).toEqual({ state: 'offline' })
    expect(localServerStatus({ ok: false, errorCode: 'http', status: 500 })).toEqual({
      state: 'error',
    })
    expect(localServerStatus({ ok: false, errorCode: 'shape' })).toEqual({ state: 'error' })
  })
})

describe('localTestView', () => {
  it('keeps the four checks in order and marks a missing tool call as unconfirmed', () => {
    const rows = localTestView({
      server: { status: 'pass' },
      model: { status: 'fail', code: 'model-missing' },
      chat: { status: 'skip' },
      tools: { status: 'fail', code: 'no-tool-call' },
      checkedAt: 1,
      elapsedMs: 2,
    })
    expect(rows).toEqual([
      { check: 'server', state: 'pass' },
      { check: 'model', state: 'fail', code: 'model-missing' },
      { check: 'chat', state: 'skip' },
      { check: 'tools', state: 'unconfirmed', code: 'no-tool-call' },
    ])
  })

  it('shows other tool failures as failures', () => {
    const rows = localTestView(testResult({ status: 'fail', code: 'no-chat' }))
    expect(rows[3]).toEqual({ check: 'tools', state: 'fail', code: 'no-chat' })
  })

  it('shows every check as skipped for an invalid input', () => {
    const rows = localTestView(testResult({ status: 'pass' }, 1_000, { inputError: 'shape' }))
    expect(rows.map((row) => row.state)).toEqual(['skip', 'skip', 'skip', 'skip'])
  })
})

describe('localEndpointDraft', () => {
  it('builds the form values from a saved server', () => {
    const draft = localEndpointDraft(localA)
    expect(draft).toMatchObject({
      id: 'local-a',
      preset: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: '',
      model: 'qwen3:8b',
      timeoutMs: 300_000,
    })
    expect(draft.models).toEqual(localA.models)
    expect(draft.modelProfiles).toEqual(localA.modelProfiles)
    expect(draft.models).not.toBe(localA.models)
  })

  it('infers a saved preset without a /v1 path and falls back to other', () => {
    expect(localEndpointDraft({ ...localA, baseUrl: 'http://127.0.0.1:11434' }).preset).toBe(
      'ollama',
    )
    expect(localEndpointDraft(plain).preset).toBe('other')
  })

  it('reads an unusable timeout as the default', () => {
    expect(localEndpointDraft({ ...plain, timeoutMs: 5 }).timeoutMs).toBe(300_000)
  })
})

describe('module boundary', () => {
  it('keeps the rules free of the DOM, network and React', () => {
    const source = readFileSync(new URL('../src/renderer/src/local-ai.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bwindow\./)
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/from ['"]react['"]/)
  })
})
