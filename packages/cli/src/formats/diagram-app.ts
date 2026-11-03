import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { PRODUCT_NAME } from '@genoffice/i18n'
import { appLaunch } from '../resources'
import { CliError, EXIT } from '../result'
import { describeExit, exitCodeFor, parseEnvelope, waitFor } from './app-export'

/**
 * Diagram work only draw.io can do (pictures, PDF pages, Mermaid, writing a
 * `.drawio.svg` / `.drawio.png`) runs in the app binary's `--headless-export`
 * entry, in a hidden window of the diagram tab's own session
 * (apps/diagram/src/main/headless-main.ts). This spawns it and reads the
 * envelope: the files it wrote and, for a batch, the per-op results.
 */
export type DiagramAppTarget =
  'pdf' | 'png' | 'svg' | 'drawio' | 'dio' | 'drawio.svg' | 'drawio.png'

export interface DiagramAppJob {
  input: string
  to: DiagramAppTarget
  /** the file to write; with several pages, the name each page's `-p<n>` is put beside */
  out: string
  /** 1-based page */
  page?: number
  /** a JSON file holding the ops (diagram file targets only) */
  ops?: string
  batch?: 'all-or-nothing' | 'best-effort' | 'stop-on-error'
}

export interface DiagramAppResult {
  summary: string
  /** the files the app wrote; empty when a batch had nothing to write */
  paths: string[]
  detail: Record<string, unknown>
}

export interface DiagramAppOptions {
  env: NodeJS.ProcessEnv
  log?: (message: string) => void
  timeoutMs?: number
  /** test seam */
  spawn?: typeof nodeSpawn
}

const DEFAULT_TIMEOUT_MS = 180_000

/** Exit 4 `app_unavailable`: the work needs the app and there is none to start. */
export function diagramAppUnavailable(what: string): CliError {
  return new CliError(
    EXIT.app,
    `${what} needs the ${PRODUCT_NAME} app, which was not found`,
    { hint: `install ${PRODUCT_NAME}, or set GENOFFICE_APP_BIN to its executable` },
    {
      reason: 'app_unavailable',
      suggestion: `install ${PRODUCT_NAME} (or set GENOFFICE_APP_BIN) and run the command again`,
    },
  )
}

export async function runDiagramApp(
  job: DiagramAppJob,
  what: string,
  opts: DiagramAppOptions,
): Promise<DiagramAppResult> {
  const launch = appLaunch(opts.env)
  // a configured path that is not there is no app either: spawning it would only fail later
  if (!launch || (launch.args.length === 0 && !existsSync(launch.command))) {
    throw diagramAppUnavailable(what)
  }
  const args = [
    ...launch.args,
    '--headless-export',
    job.input,
    '--to',
    job.to,
    '--out',
    job.out,
    ...(job.page !== undefined ? ['--page', String(job.page)] : []),
    ...(job.ops !== undefined ? ['--ops', job.ops] : []),
    ...(job.batch !== undefined ? ['--batch', job.batch] : []),
    '--json',
  ]
  const childEnv = { ...opts.env }
  delete childEnv.ELECTRON_RUN_AS_NODE
  opts.log?.(`starting ${PRODUCT_NAME} for the diagram (${job.to})`)
  const spawn = opts.spawn ?? nodeSpawn
  const child = spawn(launch.command, args, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { code, signal, stdout, stderr, timedOut } = await waitFor(child, timeoutMs, 2000)
  const envelope = parseEnvelope(stdout)
  if (envelope?.status === 'ok') {
    const paths = envelope.output_paths ?? (envelope.output_path ? [envelope.output_path] : [])
    if (paths.every((path) => existsSync(path))) {
      return { summary: envelope.summary ?? '', paths, detail: envelope.detail ?? {} }
    }
  }
  if (timedOut) {
    throw new CliError(
      EXIT.conversion,
      `${PRODUCT_NAME} did not finish the diagram within ${Math.round(timeoutMs / 1000)}s`,
      { app: launch.command },
    )
  }
  const tail = stderr.trim().split('\n').filter(Boolean).slice(-3).join(' ')
  if (!envelope && (signal || code === null)) {
    throw new CliError(
      EXIT.app,
      `${PRODUCT_NAME} ${describeExit(code, signal)} while working on ${job.input}${tail ? `: ${tail}` : ''}`,
      { app: launch.command, exit_code: code, signal },
      {
        reason: 'app_crashed',
        suggestion: 'retry once; if it crashes again, report it with the diagram',
      },
    )
  }
  const message =
    envelope?.error ??
    envelope?.summary ??
    (tail ||
      (code === 0
        ? `${PRODUCT_NAME} exited without an answer; this ${PRODUCT_NAME} version may not support diagrams in --headless-export`
        : `${PRODUCT_NAME} exited with code ${code}`))
  throw new CliError(exitCodeFor(code), message, { app: launch.command, exit_code: code })
}
