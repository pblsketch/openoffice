import { SEALED_PREFIX, isSealedSecret } from '@genoffice/ai-provider'
import type { SafeStorageLike } from '../ai-secrets'
import { driveTokenSeals } from '../drive/drive-vault'
import type { McpSecretView } from '../../shared/mcp-servers-api'

/**
 * The secrets of user MCP servers (spec 10): header values, the OAuth client
 * secret and tokens, and env values of local servers. On disk they are
 * sealed with the operating system's encryption; where that is unavailable
 * the file field stays empty and the value lives in memory until the app
 * closes. They never reach a screen, a log or an error text.
 */

export interface McpSecretCodec {
  /** whether a value sealed now is really protected (the Drive vault rule) */
  canSeal(): boolean
  /** the `sealed:v1:` form; only called when `canSeal()` */
  seal(plain: string): string
  /** the plain value, or null when it cannot be opened here */
  open(sealed: string): string | null
}

/**
 * Electron safeStorage under the same rule as the Drive token: Windows
 * (DPAPI) and macOS (the keychain) seal; Linux only with a real keyring, since
 * `basic_text` would only look sealed. Unlike `ai-settings.json`, macOS seals
 * here: no terminal command reads this file.
 */
export function safeStorageMcpCodec(
  storage: SafeStorageLike,
  platform: NodeJS.Platform = process.platform,
): McpSecretCodec {
  return {
    canSeal: () => driveTokenSeals(storage, platform),
    seal: (plain) => SEALED_PREFIX + storage.encryptString(plain).toString('base64'),
    open: (sealed) => {
      if (!isSealedSecret(sealed) || !storage.isEncryptionAvailable()) return null
      try {
        return storage.decryptString(Buffer.from(sealed.slice(SEALED_PREFIX.length), 'base64'))
      } catch {
        // sealed by another account or PC
        return null
      }
    },
  }
}

/** Where a secret sits in one server: `headers:<name>`, `env:<name>`, `oauth:clientSecret`, `oauth:tokens` */
export type McpSecretRef = string

/** The secret-bearing fields of a stored server */
export interface McpSecretFields {
  headers: Record<string, string>
  env: Record<string, string>
  oauth: { clientId: string; clientSecret: string; tokens: string } | null
}

const mapValues = (
  record: Record<string, string>,
  prefix: string,
  fn: (value: string, ref: McpSecretRef) => string,
): Record<string, string> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v, `${prefix}:${k}`)]))

/** Apply `fn` to every secret value of a server, leaving everything else as it is */
export function mapServerSecrets<T extends McpSecretFields>(
  server: T,
  fn: (value: string, ref: McpSecretRef) => string,
): T {
  return {
    ...server,
    headers: mapValues(server.headers, 'headers', fn),
    env: mapValues(server.env, 'env', fn),
    oauth: server.oauth
      ? {
          ...server.oauth,
          clientSecret: fn(server.oauth.clientSecret, 'oauth:clientSecret'),
          tokens: fn(server.oauth.tokens, 'oauth:tokens'),
        }
      : null,
  }
}

/**
 * The form written to the file: each non-empty value sealed, or left empty
 * when this PC cannot seal (`memoryOnly` names those, for the card's notice).
 */
export function sealServerSecrets<T extends McpSecretFields>(
  server: T,
  codec: McpSecretCodec,
): { server: T; memoryOnly: McpSecretRef[] } {
  const memoryOnly: McpSecretRef[] = []
  const canSeal = codec.canSeal()
  const sealed = mapServerSecrets(server, (value, ref) => {
    if (value === '' || isSealedSecret(value)) return value
    if (canSeal) {
      try {
        return codec.seal(value)
      } catch {
        // fall through: an unsealable value is never written plain
      }
    }
    memoryOnly.push(ref)
    return ''
  })
  return { server: sealed, memoryOnly }
}

/**
 * The plain form for this run. A value that cannot be opened (sealed by
 * another account or PC) becomes empty and is listed in `unreadable`; a plain
 * value written by hand is taken as it is and sealed on the next save.
 */
export function openServerSecrets<T extends McpSecretFields>(
  server: T,
  codec: McpSecretCodec,
): { server: T; unreadable: McpSecretRef[] } {
  const unreadable: McpSecretRef[] = []
  const opened = mapServerSecrets(server, (value, ref) => {
    if (!isSealedSecret(value)) return value
    let plain: string | null
    try {
      plain = codec.open(value)
    } catch {
      plain = null
    }
    if (plain === null) {
      unreadable.push(ref)
      return ''
    }
    return plain
  })
  return { server: opened, unreadable }
}

/** Shorter values show no characters at all, so the last four never reveal most of one */
const MIN_LENGTH_TO_SHOW_LAST4 = 8

/** A secret as a screen may see it */
export function secretView(value: string, memoryOnly: boolean): McpSecretView {
  if (value === '') return { state: 'missing', last4: '' }
  return {
    state: memoryOnly ? 'memory-only' : 'saved',
    last4: value.length >= MIN_LENGTH_TO_SHOW_LAST4 ? value.slice(-4) : '',
  }
}
