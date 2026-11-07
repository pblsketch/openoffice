/**
 * Settings files written before the subscription providers existed name
 * Genspark in every selection slot and carry its cloud-tools switch. Loading
 * one must quietly land on the new defaults: no error dialog, nothing thrown,
 * and the user's keys and other choices intact.
 */
import { describe, expect, it } from 'vitest'
import { sanitizeAiSettings } from '../src/ai-settings-guard'
import { selectAiProvider } from '../src/provider-selection'
import {
  DEFAULT_AI_ANALYSIS_PROVIDER,
  DEFAULT_AI_IMAGE_PROVIDER,
  DEFAULT_AI_PROVIDER_SELECTION,
  DEFAULT_AI_SEARCH_PROVIDER,
  DEFAULT_AI_VIDEO_ANALYSIS_PROVIDER,
  normalizeAiSettings,
} from '../src/legacy-settings'
import { HEADLESS_SUBSCRIPTION_CONSENT_VERSION } from '../src/providers'
import { activeSearchProvider } from '../src/search-settings'

/** what an untouched GenOffice install has on disk */
function gensparkEraFile() {
  return {
    provider: 'genspark',
    providers: {
      genspark: { apiKey: '', model: 'claude-opus-5-5' },
      codex: { apiKey: '', model: '', cliPath: '' },
      openai: { apiKey: ' sk-kept ', model: 'gpt-5.6-terra' },
      'vendor-from-the-future': { apiKey: 'x', model: 'y' },
    },
    gskToolsEnabled: false,
    media: {
      imageProvider: 'genspark',
      analysisProvider: 'genspark',
      videoAnalysisProvider: 'genspark',
      providers: {
        genspark: { apiKey: '', imageModel: '', analysisModel: '' },
        gemini: { apiKey: 'AIza-kept', imageModel: '', analysisModel: '' },
        'vendor-from-the-future': { apiKey: 'x', imageModel: 'y', analysisModel: 'z' },
      },
    },
    search: { provider: 'genspark', providers: { tavily: { apiKey: 'tvly-kept' } } },
    maxOutputTokens: 4096,
  }
}

describe('normalizeAiSettings', () => {
  it('names the new defaults', () => {
    expect(DEFAULT_AI_PROVIDER_SELECTION).toBe('auto')
    expect(DEFAULT_AI_IMAGE_PROVIDER).toBe('codex')
    expect(DEFAULT_AI_ANALYSIS_PROVIDER).toBe('chat')
    expect(DEFAULT_AI_VIDEO_ANALYSIS_PROVIDER).toBe('none')
    expect(DEFAULT_AI_SEARCH_PROVIDER).toBe('parallel')
  })

  it('replaces every Genspark selection with its default', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    expect(settings.provider).toBe('auto')
    expect(settings.media?.imageProvider).toBe('codex')
    expect(settings.media?.analysisProvider).toBe('chat')
    expect(settings.media?.videoAnalysisProvider).toBe('none')
    expect(settings.search?.provider).toBe('parallel')
  })

  it('the default search provider is the keyless free route', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    expect(settings.search?.providers.parallel.apiKey).toBe('')
    expect(activeSearchProvider(settings)).toBe('parallel')
  })

  it('drops the cloud-tools switch so the next save no longer writes it', () => {
    for (const gskToolsEnabled of [true, false]) {
      const settings = normalizeAiSettings({ ...gensparkEraFile(), gskToolsEnabled })
      expect('gskToolsEnabled' in settings).toBe(false)
      // the save path is the IPC guard: it must not bring the field back
      expect('gskToolsEnabled' in sanitizeAiSettings(settings)!).toBe(false)
    }
  })

  it('keeps the keys, models and other choices the user made', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    expect(settings.providers.openai).toMatchObject({ apiKey: 'sk-kept', model: 'gpt-5.6-terra' })
    expect(settings.media?.providers.gemini.apiKey).toBe('AIza-kept')
    expect(settings.search?.providers.tavily.apiKey).toBe('tvly-kept')
    expect(settings.maxOutputTokens).toBe(4096)
  })

  it('drops provider configs under unknown ids, like the IPC guard does', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    expect(Object.keys(settings.providers)).not.toContain('vendor-from-the-future')
    expect(Object.keys(settings.media!.providers)).not.toContain('vendor-from-the-future')
    // every current provider still has its slot
    expect(settings.providers['claude-code']).toBeDefined()
    expect(settings.providers.codex).toBeDefined()
  })

  it('keeps valid selections as they are', () => {
    const file = gensparkEraFile()
    const settings = normalizeAiSettings({
      ...file,
      provider: 'openai',
      media: {
        ...file.media,
        imageProvider: 'gemini',
        analysisProvider: 'gemini',
        videoAnalysisProvider: 'gemini',
      },
      search: { ...file.search, provider: 'tavily' },
    })
    expect(settings.provider).toBe('openai')
    expect(settings.media?.imageProvider).toBe('gemini')
    expect(settings.media?.analysisProvider).toBe('gemini')
    expect(settings.media?.videoAnalysisProvider).toBe('gemini')
    expect(settings.search?.provider).toBe('tavily')
    for (const provider of ['auto', 'claude-code', 'codex', 'custom']) {
      expect(normalizeAiSettings({ ...file, provider }).provider).toBe(provider)
    }
    for (const imageProvider of ['codex', 'none']) {
      const media = { ...file.media, imageProvider }
      expect(normalizeAiSettings({ ...file, media }).media?.imageProvider).toBe(imageProvider)
    }
  })

  it('replaces unknown ids and ids without the capability with the default', () => {
    const file = gensparkEraFile()
    const settings = normalizeAiSettings({
      ...file,
      provider: 'vendor-from-the-future',
      media: {
        ...file.media,
        // deepseek reads images but neither generates them nor reads video
        imageProvider: 'deepseek',
        analysisProvider: 'vendor-from-the-future',
        videoAnalysisProvider: 'deepseek',
      },
      search: { ...file.search, provider: 'vendor-from-the-future' },
    })
    expect(settings.provider).toBe('auto')
    expect(settings.media?.imageProvider).toBe('codex')
    expect(settings.media?.analysisProvider).toBe('chat')
    expect(settings.media?.videoAnalysisProvider).toBe('none')
    expect(settings.search?.provider).toBe('parallel')
  })

  it('the selection values of one slot are not valid in another', () => {
    const file = gensparkEraFile()
    const settings = normalizeAiSettings({
      ...file,
      media: {
        ...file.media,
        imageProvider: 'chat',
        analysisProvider: 'codex',
        videoAnalysisProvider: 'chat',
      },
    })
    expect(settings.media?.imageProvider).toBe('codex')
    expect(settings.media?.analysisProvider).toBe('chat')
    expect(settings.media?.videoAnalysisProvider).toBe('none')
  })

  it('fills the new settings with their defaults', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    expect(settings.meteredAccepted).toEqual({ 'claude-code': false, codex: false })
    expect(settings.headlessSubscriptionEnabled).toBe(false)
    expect(settings.subscriptionNoticeSeen).toBe(false)
  })

  it('keeps the new settings once stored and ignores malformed values', () => {
    const kept = normalizeAiSettings({
      ...gensparkEraFile(),
      meteredAccepted: { 'claude-code': true, codex: false, anthropic: true },
      headlessSubscriptionEnabled: true,
      headlessSubscriptionConsentVersion: HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
      subscriptionNoticeSeen: true,
    })
    expect(kept.meteredAccepted).toEqual({ 'claude-code': true, codex: false })
    expect(kept.headlessSubscriptionEnabled).toBe(true)
    expect(kept.subscriptionNoticeSeen).toBe(true)

    const malformed = normalizeAiSettings({
      ...gensparkEraFile(),
      meteredAccepted: { 'claude-code': 'yes', codex: 1 },
      headlessSubscriptionEnabled: 'true',
      subscriptionNoticeSeen: 1,
    })
    expect(malformed.meteredAccepted).toEqual({ 'claude-code': false, codex: false })
    expect(malformed.headlessSubscriptionEnabled).toBe(false)
    expect(malformed.subscriptionNoticeSeen).toBe(false)
  })

  it('never throws, whatever the file holds', () => {
    const garbage: unknown[] = [
      undefined,
      null,
      42,
      'settings',
      [],
      {},
      { provider: 7, providers: 'nope' },
      { provider: 'genspark', providers: { openai: 'not-an-object', codex: null } },
      { providers: {}, media: 'x', search: 9, customEndpoints: 'y', maxOutputTokens: 'big' },
      { providers: {}, media: { providers: 3, imageProvider: {} }, search: { providers: [] } },
      { providers: {}, meteredAccepted: 'all', customEndpoints: [null, 4, { id: 5 }] },
    ]
    for (const stored of garbage) {
      const settings = normalizeAiSettings(stored)
      expect(settings.provider).toBe('auto')
      expect(settings.media?.imageProvider).toBe('codex')
      expect(settings.search?.provider).toBe('parallel')
      expect(settings.providers.codex).toBeDefined()
    }
  })

  it('is stable: normalizing its own output changes nothing', () => {
    const once = normalizeAiSettings(gensparkEraFile())
    expect(normalizeAiSettings(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('a normalized Genspark-era file selects a ready subscription', () => {
    const settings = normalizeAiSettings(gensparkEraFile())
    const ready = { provider: 'codex', state: 'ready', meteredAccepted: false } as const
    // Claude's check answered too: `auto` decides nothing while it is still out
    const out = { provider: 'claude-code', state: 'signed-out', meteredAccepted: false } as const
    const direct = { provider: 'chatgpt', state: 'signed-out', meteredAccepted: false } as const
    expect(
      selectAiProvider(settings, { 'claude-code': out, chatgpt: direct, codex: ready }),
    ).toEqual({
      connected: true,
      provider: 'codex',
      metered: false,
    })
  })

  it('keeps a read_url GitHub token through a save and a read', () => {
    const saved = sanitizeAiSettings({
      provider: 'auto',
      providers: {},
      readUrl: { githubToken: '  github_pat_test  ' },
    })
    expect(saved?.readUrl).toEqual({ githubToken: 'github_pat_test' })
    const reread = normalizeAiSettings(JSON.parse(JSON.stringify(saved)))
    expect(reread.readUrl).toEqual({ githubToken: 'github_pat_test' })
  })

  it('reads a missing, blank or non-string read_url token as no token', () => {
    const slots: unknown[] = [
      undefined,
      null,
      'github_pat_test',
      [],
      {},
      { githubToken: '' },
      { githubToken: '   ' },
      { githubToken: 42 },
      { githubToken: null },
      { githubToken: { value: 'x' } },
      { githubToken: ['x'] },
    ]
    for (const readUrl of slots) {
      const file = {
        providers: {},
        ...(readUrl === undefined ? {} : { readUrl }),
      }
      expect(normalizeAiSettings(file).readUrl).toBeUndefined()
      expect(sanitizeAiSettings({ provider: 'auto', ...file })?.readUrl).toBeUndefined()
    }
  })

  it('keeps the read_url token when there are no provider slots to merge', () => {
    const settings = normalizeAiSettings({
      apiKey: 'sk-old',
      readUrl: { githubToken: 'github_pat_test' },
    })
    expect(settings.readUrl).toEqual({ githubToken: 'github_pat_test' })
    expect(settings.providers.custom).toMatchObject({ apiKey: 'sk-old' })
  })

  it('does not touch the other settings when the read_url slot is unusable', () => {
    const settings = normalizeAiSettings({
      providers: { openai: { apiKey: 'sk-kept', model: 'gpt-4o' } },
      readUrl: 'github_pat_test',
    })
    expect(settings.providers.openai).toMatchObject({ apiKey: 'sk-kept', model: 'gpt-4o' })
    expect(settings.provider).toBe('auto')
  })

  it('still migrates the pre-provider single-endpoint shape into custom', () => {
    const settings = normalizeAiSettings({ apiKey: 'sk-old', model: 'gpt-4o', baseUrl: '' })
    expect(settings.providers.custom).toMatchObject({ apiKey: 'sk-old', model: 'gpt-4o' })
    expect(settings.provider).toBe('auto')
  })
})

describe('the CLIs turned off in this app (decision 0114)', () => {
  it('reads only a literal true under a CLI id as off', () => {
    const settings = normalizeAiSettings({
      providers: {},
      subscriptionOff: { 'claude-code': true, codex: 'true', chatgpt: true, openai: true },
    })
    expect(settings.subscriptionOff).toEqual({ 'claude-code': true })
    expect(selectAiProvider(settings, {})).toMatchObject({ connected: false })
  })

  it('leaves the field out when nothing is off, so the file keeps its shape', () => {
    expect('subscriptionOff' in normalizeAiSettings({ providers: {} })).toBe(false)
    expect(
      'subscriptionOff' in
        normalizeAiSettings({ providers: {}, subscriptionOff: { codex: false } }),
    ).toBe(false)
  })

  it('keeps a CLI off even in a file from before the provider table', () => {
    expect(normalizeAiSettings({ subscriptionOff: { codex: true } }).subscriptionOff).toEqual({
      codex: true,
    })
  })

  it('carries what a renderer read on its requests, checked the same way', () => {
    const sent = sanitizeAiSettings({
      provider: 'auto',
      providers: {},
      subscriptionOff: { codex: true, 'claude-code': 1, chatgpt: true },
    })
    expect(sent?.subscriptionOff).toEqual({ codex: true })
  })
})
