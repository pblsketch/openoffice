import { existsSync, readFileSync } from 'node:fs'
import {
  SEALED_PREFIX,
  isSealedSecret,
  mapAiSecrets,
  openSecretValue,
  sealAiSecrets,
  sealSecretValue,
  type AiSecretCodec,
} from '@genoffice/ai-provider'
import { writeJsonAtomic } from '@genoffice/electron-utils/atomic-write'

/**
 * Keys and tokens in ai-settings.json under the operating system's protection
 * (decision 0063). The app seals them with Electron safeStorage on Windows
 * (DPAPI under the user's account) and on Linux when a real keyring holds the
 * key (GNOME Keyring, KWallet). macOS keeps them plain: an ad hoc signed app
 * (decision 0031) would meet a Keychain prompt after every update. Any
 * platform opens a sealed value it can.
 *
 * The terminal command runs without Electron, so it starts this app hidden
 * with REVEAL_FLAG, hands it the sealed values on stdin and reads the plain
 * ones back on stdout (packages/cli/src/secrets.ts). That is no wider than
 * the protection itself: any program running as the same user can ask DPAPI.
 */

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(sealed: Buffer): string
  /** Linux only: which password store holds the key */
  getSelectedStorageBackend?(): string
}

/**
 * Linux password stores that really protect the key. Without a keyring
 * Chromium falls back to `basic_text`, a key built into the program: a value
 * "sealed" that way only looks protected, so it stays plain.
 */
const LINUX_KEYRINGS: ReadonlySet<string> = new Set([
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
])

/** Whether this platform seals at all, apart from the key being ready */
export function platformSeals(storage: SafeStorageLike, platform: NodeJS.Platform): boolean {
  if (!storage.isEncryptionAvailable()) return false
  if (platform === 'win32') return true
  if (platform === 'linux') return LINUX_KEYRINGS.has(storage.getSelectedStorageBackend?.() ?? '')
  return false
}

/**
 * Whether Chromium's key for safeStorage is on disk yet (`Local State`,
 * `os_crypt.encrypted_key`). Chromium makes the key on first use and writes it
 * some seconds later or at a clean quit; a value sealed before that and an app
 * killed in between could never be opened again, by the app or the command.
 */
export function sealingKeyOnDisk(localStatePath: string): boolean {
  try {
    const state = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
      os_crypt?: { encrypted_key?: unknown }
    }
    return typeof state.os_crypt?.encrypted_key === 'string' && state.os_crypt.encrypted_key !== ''
  } catch {
    return false
  }
}

export function safeStorageCodec(
  storage: SafeStorageLike,
  platform: NodeJS.Platform = process.platform,
  /** Windows: values stay plain until this says the key would survive a crash */
  keyOnDisk: () => boolean = () => true,
): AiSecretCodec {
  return {
    // Linux keeps the key in the keyring itself, so only Windows waits for Local State
    seal: (plain) =>
      platformSeals(storage, platform) && (platform !== 'win32' || keyOnDisk())
        ? SEALED_PREFIX + storage.encryptString(plain).toString('base64')
        : null,
    open: (sealed) => {
      if (!isSealedSecret(sealed) || !storage.isEncryptionAvailable()) return null
      try {
        return storage.decryptString(Buffer.from(sealed.slice(SEALED_PREFIX.length), 'base64'))
      } catch {
        return null
      }
    },
  }
}

/** Whether a stored settings object still holds a plain, non-empty key or token */
export function holdsPlainSecrets(stored: unknown): boolean {
  let found = false
  mapAiSecrets(stored, (v) => {
    if (v !== '' && !isSealedSecret(v)) found = true
    return v
  })
  return found
}

/**
 * Seal the plain keys an existing file holds (written by an earlier version,
 * or by hand). Leaves the file alone when it cannot be read, holds nothing
 * plain, or this PC cannot seal. Returns whether it rewrote the file.
 */
export function sealStoredAiSettings(path: string): boolean {
  let stored: unknown
  try {
    if (!existsSync(path)) return false
    stored = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return false
  }
  if (!holdsPlainSecrets(stored)) return false
  const sealed = sealAiSecrets(stored)
  if (holdsPlainSecrets(sealed)) return false
  writeJsonAtomic(path, sealed)
  return true
}

/**
 * The home search's reranking keys (`fileSearch.keys` in app-settings.json)
 * under the same protection. Only the app reads that file, so no command needs
 * them opened. Opened before the settings are normalized (which trims and
 * cuts each key), sealed after.
 */
export function openFileSearchKeys(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null) return stored
  const s = stored as Record<string, unknown>
  const open = (keys: unknown) =>
    typeof keys === 'object' && keys !== null
      ? Object.fromEntries(
          Object.entries(keys).map(([id, v]) => [
            id,
            typeof v === 'string' ? openSecretValue(v) : v,
          ]),
        )
      : keys
  return {
    ...s,
    ...('keys' in s ? { keys: open(s.keys) } : {}),
    ...('jevKeys' in s ? { jevKeys: open(s.jevKeys) } : {}),
  }
}

export function sealFileSearchKeys<T extends { keys: Record<string, string> }>(settings: T): T {
  return {
    ...settings,
    keys: Object.fromEntries(
      Object.entries(settings.keys).map(([id, v]) => [id, sealSecretValue(v)]),
    ) as T['keys'],
  }
}

/** Whether stored reranking settings still hold a plain, non-empty key */
export function fileSearchHoldsPlainKeys(stored: unknown): boolean {
  const keys = (stored as { keys?: unknown } | null)?.keys
  return (
    typeof keys === 'object' &&
    keys !== null &&
    Object.values(keys).some((v) => typeof v === 'string' && v !== '' && !isSealedSecret(v))
  )
}

/** The hidden entry the terminal command starts to open sealed values */
export const REVEAL_FLAG = '--reveal-ai-secrets'
export const MAX_REVEAL_VALUES = 64
const MAX_SEALED_LENGTH = 16_384
const MAX_STDIN_BYTES = 2 * 1024 * 1024
const STDIN_TIMEOUT_MS = 5_000

/** The sealed values a reveal request asks for, or null when it is not one */
export function revealRequestOf(text: string): string[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(raw) || raw.length > MAX_REVEAL_VALUES) return null
  const values: string[] = []
  for (const v of raw) {
    if (!isSealedSecret(v) || v.length > MAX_SEALED_LENGTH) return null
    values.push(v)
  }
  return values
}

/** The answer line: every value this PC could open, keyed by its sealed form */
export function revealAnswer(values: string[] | null, codec: AiSecretCodec): string {
  if (!values) return JSON.stringify({ status: 'error', error: 'bad request' })
  const secrets: Record<string, string> = {}
  for (const v of values) {
    const plain = codec.open(v)
    if (plain !== null) secrets[v] = plain
  }
  return JSON.stringify({ status: 'ok', secrets })
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    const done = () => {
      clearTimeout(timer)
      process.stdin.removeAllListeners()
      process.stdin.pause()
      resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const timer = setTimeout(done, STDIN_TIMEOUT_MS)
    process.stdin.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_STDIN_BYTES) {
        chunks.length = 0
        done()
        return
      }
      chunks.push(chunk)
    })
    process.stdin.on('end', done)
    process.stdin.on('error', done)
  })
}

/** The whole hidden run: read the request, print one line, return the exit code */
export async function runRevealEntry(codec: AiSecretCodec): Promise<number> {
  const line = revealAnswer(revealRequestOf(await readStdin()), codec) + '\n'
  await new Promise<void>((resolve) => {
    const bail = setTimeout(resolve, 2000)
    process.stdout.write(line, () => {
      clearTimeout(bail)
      resolve()
    })
  })
  return line.startsWith('{"status":"ok"') ? 0 : 1
}
