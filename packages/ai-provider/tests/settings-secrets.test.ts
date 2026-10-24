import { afterEach, describe, expect, it } from 'vitest'
import { normalizeAiSettings } from '../src/legacy-settings'
import {
  SEALED_PREFIX,
  mapAiSecrets,
  openAiSecrets,
  sealAiSecrets,
  sealedAiSecretsIn,
  setAiSecretCodec,
  type AiSecretCodec,
} from '../src/settings-secrets'

/** A stand-in for the OS: "sealing" reverses the text */
const reversing: AiSecretCodec = {
  seal: (plain) => SEALED_PREFIX + [...plain].reverse().join(''),
  open: (sealed) =>
    sealed.startsWith(SEALED_PREFIX)
      ? [...sealed.slice(SEALED_PREFIX.length)].reverse().join('')
      : null,
}

const stored = {
  provider: 'openai',
  providers: { openai: { apiKey: 'sk-chat', model: 'm' }, anthropic: { apiKey: '', model: '' } },
  customEndpoints: [{ id: 'e1', name: 'mine', baseUrl: 'https://x.example/v1', apiKey: 'sk-own' }],
  media: { imageProvider: 'openai', providers: { openai: { apiKey: 'sk-img' } } },
  search: { provider: 'serper', providers: { serper: { apiKey: 'sk-search' } } },
  readUrl: { githubToken: 'ghp-token' },
}

afterEach(() => setAiSecretCodec(null))

describe('mapAiSecrets', () => {
  it('reaches every key and token, and nothing else', () => {
    const seen: string[] = []
    mapAiSecrets(stored, (v) => {
      seen.push(v)
      return v
    })
    expect(seen.sort()).toEqual(['', 'ghp-token', 'sk-chat', 'sk-img', 'sk-own', 'sk-search'])
  })

  it('leaves what is not settings alone', () => {
    expect(mapAiSecrets(null, () => 'x')).toBeNull()
    expect(mapAiSecrets('text', () => 'x')).toBe('text')
  })
})

describe('sealing and opening', () => {
  it('seals plain, non-empty values on the way to disk and opens them on the way back', () => {
    setAiSecretCodec(reversing)
    const disk = sealAiSecrets(stored)
    expect(JSON.stringify(disk)).not.toMatch(/sk-chat|sk-own|sk-img|sk-search|ghp-token/)
    expect(disk.providers.anthropic.apiKey).toBe('')
    expect(sealedAiSecretsIn(disk)).toHaveLength(5)
    expect(openAiSecrets(disk)).toEqual(stored)
  })

  it('keeps values plain when the PC cannot seal, and never seals twice', () => {
    setAiSecretCodec({ seal: () => null, open: () => null })
    expect(sealAiSecrets(stored)).toEqual(stored)
    setAiSecretCodec(reversing)
    const once = sealAiSecrets(stored)
    expect(sealAiSecrets(once)).toEqual(once)
  })

  it('reads a sealed value it cannot open as empty, never as the sealed text', () => {
    setAiSecretCodec(reversing)
    const disk = sealAiSecrets(stored)
    setAiSecretCodec(null)
    expect(openAiSecrets(disk).providers.openai.apiKey).toBe('')
    setAiSecretCodec({
      seal: () => null,
      open: () => {
        throw new Error('DPAPI failed')
      },
    })
    expect(openAiSecrets(disk).readUrl.githubToken).toBe('')
  })

  it('opens sealed values for every reader of the file (normalizeAiSettings)', () => {
    setAiSecretCodec(reversing)
    const settings = normalizeAiSettings(sealAiSecrets(stored))
    expect(settings.providers.openai.apiKey).toBe('sk-chat')
    expect(settings.search?.providers.serper.apiKey).toBe('sk-search')
    expect(settings.readUrl?.githubToken).toBe('ghp-token')
  })

  it('still reads a key written by hand in plain text', () => {
    setAiSecretCodec(reversing)
    expect(normalizeAiSettings(stored).providers.openai.apiKey).toBe('sk-chat')
  })
})
