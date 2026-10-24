/**
 * Keys and tokens in ai-settings.json, sealed by the operating system
 * (decision 0063).
 *
 * A sealed value is a string `sealed:v1:<base64>` in the same field the plain
 * value would take, so the file keeps its shape and a hand-written plain key
 * still reads. Sealing and opening need the platform's protection (Electron
 * safeStorage, which the app's main process has and the terminal command does
 * not), so this module only holds the codec someone registers:
 * - the app's main process registers safeStorage;
 * - the terminal command registers one that asks the app, run hidden, to open
 *   the values (`--reveal-ai-secrets`).
 * With no codec, or when opening fails, a sealed value reads as empty: the
 * request then fails as "no key", and a sealed string is never sent as a key.
 */

export const SEALED_PREFIX = 'sealed:v1:'

export interface AiSecretCodec {
  /** the sealed form, or null when this PC cannot seal now (the value stays plain) */
  seal(plain: string): string | null
  /** the plain value, or null when it cannot be opened */
  open(sealed: string): string | null
}

let codec: AiSecretCodec | null = null

export function setAiSecretCodec(next: AiSecretCodec | null): void {
  codec = next
}

export function isSealedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SEALED_PREFIX)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A copy of `record` with `fn` applied to the string at `key`, if there is one */
function mapField(record: Record<string, unknown>, key: string, fn: (v: string) => string) {
  const value = record[key]
  return typeof value === 'string' ? { ...record, [key]: fn(value) } : record
}

/** `fn` applied to every `apiKey` of a provider table (`{ id: { apiKey } }`) */
function mapTable(table: unknown, fn: (v: string) => string): unknown {
  if (!isRecord(table)) return table
  const out: Record<string, unknown> = {}
  for (const [id, config] of Object.entries(table)) {
    out[id] = isRecord(config) ? mapField(config, 'apiKey', fn) : config
  }
  return out
}

/**
 * A copy of a stored or working settings object with `fn` applied to every
 * secret it can hold: the chat providers' keys, the custom endpoints' keys,
 * the media and search providers' keys, and read_url's GitHub token.
 * Anything not shaped like settings passes through untouched.
 */
export function mapAiSecrets<T>(settings: T, fn: (value: string) => string): T {
  if (!isRecord(settings)) return settings
  const s: Record<string, unknown> = { ...settings }
  if ('providers' in s) s.providers = mapTable(s.providers, fn)
  if (Array.isArray(s.customEndpoints)) {
    s.customEndpoints = s.customEndpoints.map((e: unknown) =>
      isRecord(e) ? mapField(e, 'apiKey', fn) : e,
    )
  }
  if (isRecord(s.media)) s.media = { ...s.media, providers: mapTable(s.media.providers, fn) }
  if (isRecord(s.search)) s.search = { ...s.search, providers: mapTable(s.search.providers, fn) }
  if (isRecord(s.readUrl)) s.readUrl = mapField(s.readUrl, 'githubToken', fn)
  return s as T
}

/** Every sealed value in a stored settings object, without repeats */
export function sealedAiSecretsIn(settings: unknown): string[] {
  const found = new Set<string>()
  mapAiSecrets(settings, (v) => {
    if (isSealedSecret(v)) found.add(v)
    return v
  })
  return [...found]
}

/** One stored value opened: plain stays plain, a sealed one that cannot be opened is empty */
export function openSecretValue(value: string): string {
  if (!isSealedSecret(value)) return value
  try {
    return codec?.open(value) ?? ''
  } catch {
    return ''
  }
}

/** One value as it goes to disk: sealed when it is plain, non-empty and this PC can seal */
export function sealSecretValue(value: string): string {
  if (value === '' || isSealedSecret(value) || !codec) return value
  try {
    return codec.seal(value) ?? value
  } catch {
    return value
  }
}

/** The settings as they were read, with sealed values opened (empty when they cannot be) */
export function openAiSecrets<T>(stored: T): T {
  return mapAiSecrets(stored, openSecretValue)
}

/** The settings as they go to disk: plain non-empty values sealed when this PC can */
export function sealAiSecrets<T>(settings: T): T {
  return mapAiSecrets(settings, sealSecretValue)
}
