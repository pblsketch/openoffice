import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { SEALED_PREFIX, setAiSecretCodec } from '@genoffice/ai-provider'
import { normalizeFileSearchSettings } from '../src/main/file-index/rerank'
import {
  MAX_REVEAL_VALUES,
  fileSearchHoldsPlainKeys,
  openFileSearchKeys,
  sealFileSearchKeys,
  holdsPlainSecrets,
  revealAnswer,
  revealRequestOf,
  safeStorageCodec,
  sealStoredAiSettings,
  sealingKeyOnDisk,
  type SafeStorageLike,
} from '../src/main/ai-secrets'

/** safeStorage stand-in: "encryption" reverses the bytes */
const fakeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from([...Buffer.from(plain, 'utf8')].reverse()),
  decryptString: (sealed) => Buffer.from([...sealed].reverse()).toString('utf8'),
})

const dirs: string[] = []
afterEach(() => {
  setAiSecretCodec(null)
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('safeStorageCodec', () => {
  it('seals on Windows and opens what it sealed', () => {
    const codec = safeStorageCodec(fakeStorage(), 'win32')
    const sealed = codec.seal('sk-키')!
    expect(sealed.startsWith(SEALED_PREFIX)).toBe(true)
    expect(sealed).not.toContain('sk-')
    expect(codec.open(sealed)).toBe('sk-키')
  })

  it('seals on Linux only with a real keyring', () => {
    const withBackend = (backend: string) => ({
      ...fakeStorage(),
      getSelectedStorageBackend: () => backend,
    })
    for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']) {
      const codec = safeStorageCodec(withBackend(backend), 'linux', () => false)
      const sealed = codec.seal('sk')
      expect(sealed, backend).not.toBeNull()
      expect(codec.open(sealed!)).toBe('sk')
    }
    // no keyring: Chromium's built-in key protects nothing
    expect(safeStorageCodec(withBackend('basic_text'), 'linux').seal('sk')).toBeNull()
    expect(safeStorageCodec(withBackend('unknown'), 'linux').seal('sk')).toBeNull()
    expect(safeStorageCodec(fakeStorage(), 'linux').seal('sk')).toBeNull()
  })

  it('does not seal on macOS, or without encryption, but still opens', () => {
    const sealed = safeStorageCodec(fakeStorage(), 'win32').seal('sk')!
    expect(safeStorageCodec(fakeStorage(), 'darwin').seal('sk')).toBeNull()
    expect(safeStorageCodec(fakeStorage(false), 'win32').seal('sk')).toBeNull()
    expect(safeStorageCodec(fakeStorage(), 'darwin').open(sealed)).toBe('sk')
    expect(safeStorageCodec(fakeStorage(false), 'win32').open(sealed)).toBeNull()
  })
})

describe('sealing waits for the key on disk', () => {
  it('keeps values plain until Chromium has written its key', () => {
    let onDisk = false
    const codec = safeStorageCodec(fakeStorage(), 'win32', () => onDisk)
    expect(codec.seal('sk')).toBeNull()
    onDisk = true
    expect(codec.seal('sk')).not.toBeNull()
  })

  it('reads the key from Local State', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-secrets-ls-'))
    dirs.push(dir)
    const path = join(dir, 'Local State')
    expect(sealingKeyOnDisk(path)).toBe(false)
    writeFileSync(path, JSON.stringify({ os_crypt: {} }))
    expect(sealingKeyOnDisk(path)).toBe(false)
    writeFileSync(path, JSON.stringify({ os_crypt: { encrypted_key: 'RFBBUEk=' } }))
    expect(sealingKeyOnDisk(path)).toBe(true)
  })
})

describe('sealStoredAiSettings', () => {
  const file = (content: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-secrets-'))
    dirs.push(dir)
    const path = join(dir, 'ai-settings.json')
    writeFileSync(path, JSON.stringify(content))
    return path
  }
  const stored = {
    provider: 'auto',
    providers: { openai: { apiKey: 'sk-plain', model: '' } },
    meteredAccepted: { codex: true },
  }

  it('seals the plain keys an older file holds and keeps everything else', () => {
    setAiSecretCodec(safeStorageCodec(fakeStorage(), 'win32'))
    const path = file(stored)
    expect(sealStoredAiSettings(path)).toBe(true)
    const after = JSON.parse(readFileSync(path, 'utf8'))
    expect(readFileSync(path, 'utf8')).not.toContain('sk-plain')
    expect(after.meteredAccepted).toEqual({ codex: true })
    expect(holdsPlainSecrets(after)).toBe(false)
    expect(sealStoredAiSettings(path)).toBe(false)
  })

  it('leaves the file alone where it cannot seal', () => {
    setAiSecretCodec(safeStorageCodec(fakeStorage(), 'darwin'))
    const path = file(stored)
    const before = readFileSync(path, 'utf8')
    expect(sealStoredAiSettings(path)).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(before)
  })
})

describe('the reveal entry', () => {
  const codec = safeStorageCodec(fakeStorage(), 'win32')

  it('opens the sealed values it is handed', () => {
    const sealed = codec.seal('sk-a')!
    const answer = JSON.parse(revealAnswer(revealRequestOf(JSON.stringify([sealed])), codec))
    expect(answer).toEqual({ status: 'ok', secrets: { [sealed]: 'sk-a' } })
  })

  it('refuses anything but a short list of sealed values', () => {
    for (const text of [
      'not json',
      '{"a":1}',
      JSON.stringify(['plain-key']),
      JSON.stringify(Array.from({ length: MAX_REVEAL_VALUES + 1 }, () => `${SEALED_PREFIX}x`)),
    ]) {
      expect(revealRequestOf(text), text.slice(0, 30)).toBeNull()
    }
    expect(JSON.parse(revealAnswer(null, codec)).status).toBe('error')
  })

  it('runs before the single-instance lock and any window', () => {
    const index = readFileSync(
      fileURLToPath(new URL('../src/main/index.ts', import.meta.url)),
      'utf8',
    )
    const reveal = index.indexOf('app.exit(await runRevealEntry(secretCodec))')
    expect(reveal).toBeGreaterThan(0)
    expect(reveal).toBeLessThan(index.indexOf('app.requestSingleInstanceLock('))
    expect(reveal).toBeLessThan(index.indexOf('installRendererProtocol({'))
    expect(index.indexOf('setAiSecretCodec(secretCodec)')).toBeLessThan(reveal)
  })
})

describe('home search reranking keys', () => {
  it('seal on write and open before the settings are normalized', () => {
    setAiSecretCodec(safeStorageCodec(fakeStorage(), 'win32'))
    const settings = normalizeFileSearchSettings({ rerank: true, keys: { openrouter: 'sk-or' } })
    const disk = sealFileSearchKeys(settings)
    expect(disk.keys.openrouter.startsWith(SEALED_PREFIX)).toBe(true)
    expect(disk.keys.kev).toBe('')
    expect(fileSearchHoldsPlainKeys(disk)).toBe(false)
    expect(normalizeFileSearchSettings(openFileSearchKeys(disk))).toEqual(settings)
    // a pre-decision-model file keeps its old field name
    const old = openFileSearchKeys({ jevKeys: { openrouter: disk.keys.openrouter } })
    expect(normalizeFileSearchSettings(old).keys.openrouter).toBe('sk-or')
  })
})
