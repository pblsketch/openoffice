import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isSealedSecret, sealedAiSecretsIn, type AiSecretCodec } from '@genoffice/ai-provider'
import { aiSettingsPath } from './cloud'
import { appLaunch } from './resources'

/**
 * Opening the keys the app sealed in ai-settings.json (decision 0063).
 *
 * The command line has no Electron and so no safeStorage. When it meets a
 * sealed value it starts the app hidden with `--reveal-ai-secrets`, passes
 * every sealed value of the settings file on stdin, and keeps the plain ones
 * in this process's memory. Nothing is written anywhere. That costs one app
 * start (a second or two) the first time a command reads a sealed key; a
 * value the app cannot open (no app, another account's file) reads as empty,
 * which the commands report as a missing key.
 * The command line never seals: the app does that when it next saves.
 */

const REVEAL_FLAG = '--reveal-ai-secrets'
const REVEAL_TIMEOUT_MS = 30_000

type Spawn = (
  command: string,
  args: string[],
  options: { input: string; env: NodeJS.ProcessEnv; timeout: number; encoding: 'utf8' },
) => Pick<SpawnSyncReturns<string>, 'stdout' | 'status'>

export interface CliSecretCodecOptions {
  /** test seam */
  spawn?: Spawn
  log?: (message: string) => void
}

/** The plain values in the app's answer line, or an empty map */
export function revealedSecretsOf(stdout: string): Record<string, string> {
  const line = stdout.trim().split('\n').pop() ?? ''
  try {
    const parsed = JSON.parse(line) as { status?: unknown; secrets?: unknown }
    if (parsed.status !== 'ok' || typeof parsed.secrets !== 'object' || !parsed.secrets) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.secrets as Record<string, unknown>)) {
      if (isSealedSecret(k) && typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function cliSecretCodec(
  env: NodeJS.ProcessEnv,
  opts: CliSecretCodecOptions = {},
): AiSecretCodec {
  const opened = new Map<string, string | null>()
  const spawn: Spawn = opts.spawn ?? ((c, a, o) => spawnSync(c, a, o))

  const reveal = (wanted: string[]) => {
    const launch = appLaunch(env)
    if (!launch) {
      opts.log?.('cannot open saved keys: the app was not found')
      return
    }
    const childEnv: NodeJS.ProcessEnv = {
      ...env,
      // an unpacked app honours this; an installed one already uses this folder
      GENOFFICE_USER_DATA: dirname(aiSettingsPath(env)),
    }
    delete childEnv.ELECTRON_RUN_AS_NODE
    const result = spawn(launch.command, [...launch.args, REVEAL_FLAG], {
      input: JSON.stringify(wanted),
      env: childEnv,
      timeout: REVEAL_TIMEOUT_MS,
      encoding: 'utf8',
    })
    const secrets = revealedSecretsOf(result.stdout ?? '')
    for (const v of wanted) opened.set(v, secrets[v] ?? null)
  }

  return {
    seal: () => null,
    open: (sealed) => {
      if (!opened.has(sealed)) {
        // every sealed value of the file at once: one app start per process
        let wanted = [sealed]
        try {
          const path = aiSettingsPath(env)
          if (existsSync(path)) {
            const all = sealedAiSecretsIn(JSON.parse(readFileSync(path, 'utf8')))
            wanted = [...new Set([sealed, ...all.filter((v) => !opened.has(v))])]
          }
        } catch {
          // an unreadable file: ask for this one value only
        }
        reveal(wanted.slice(0, 64))
      }
      return opened.get(sealed) ?? null
    },
  }
}

const codecs = new Map<string, AiSecretCodec>()

/**
 * The codec for the settings file this environment uses, one per file and
 * process, so a long-lived MCP server starts the app once, not per call.
 */
export function cliSecretCodecFor(env: NodeJS.ProcessEnv): AiSecretCodec {
  const path = aiSettingsPath(env)
  let codec = codecs.get(path)
  if (!codec) {
    codec = cliSecretCodec(env)
    codecs.set(path, codec)
  }
  return codec
}
