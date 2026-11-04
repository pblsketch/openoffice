/**
 * Headless export host: the single entry every dialog-free export path can be
 * driven through without a visible editor window.
 *
 *   <app binary> --headless-export <input> --to <format> --out <path> [--json]
 *
 * Routing is by input extension; each editor module owns the hidden-window
 * export of its own format and reuses the very same renderer pipeline the
 * File menu uses, so GUI and CLI output cannot drift.
 */
import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import {
  HEADLESS_EXIT,
  HEADLESS_SUPPORTED_EXTENSIONS,
  HEADLESS_TARGETS,
  headlessModuleFor,
  isDiagramFileTarget,
  type HeadlessExportFormat,
  type HeadlessExportModule,
  type HeadlessExportOutcome,
  type HeadlessExportProduct,
  type HeadlessExportRequest,
} from '@genoffice/electron-utils'

type HeadlessFailure = Extract<HeadlessExportOutcome, { ok: false }>

/**
 * Per-module hidden-window exporters, injected so this file stays testable. An
 * exporter that writes something other than the one file at `outPath` (several
 * pages, or nothing) reports the files it wrote.
 */
export type HeadlessExporters = Record<
  HeadlessExportModule,
  (
    input: string,
    outPath: string,
    format: HeadlessExportFormat,
    request: HeadlessExportRequest,
  ) => Promise<void | HeadlessExportProduct>
>

/** Disk probes, injected so the host is testable without touching the filesystem. */
export interface HeadlessFs {
  exists(path: string): boolean
  isFile(path: string): boolean
  /** Canonical path (symlinks resolved); the input itself when it cannot be resolved. */
  realpath?(path: string): string
  mtimeMs?(path: string): number
}

const realFs: HeadlessFs = {
  exists: existsSync,
  isFile: (path) => statSync(path).isFile(),
  realpath: (path) => {
    try {
      return realpathSync.native(path)
    } catch {
      return path
    }
  },
  mtimeMs: (path) => statSync(path).mtimeMs,
}

/** The output may not exist yet, so only its directory is canonicalised. */
function canonical(path: string, fs: HeadlessFs): string {
  const real = fs.realpath ?? ((p: string) => p)
  const full = fs.exists(path) ? real(path) : join(real(dirname(path)), basename(path))
  return process.platform === 'win32' ? full.toLowerCase() : full
}

/** mtime granularity on FAT/exFAT is 2 s, so a fresh write may stamp slightly before `start`. */
const MTIME_SLACK_MS = 2_000

/** Checks a caller-supplied path pair before any window is created. */
export function validateHeadlessPaths(
  request: HeadlessExportRequest,
  fs: HeadlessFs = realFs,
): { ok: true; input: string; outPath: string; module: HeadlessExportModule } | HeadlessFailure {
  const input = resolve(request.input)
  if (!fs.exists(input)) {
    return { ok: false, code: HEADLESS_EXIT.inputError, message: `input file not found: ${input}` }
  }
  if (!fs.isFile(input)) {
    return { ok: false, code: HEADLESS_EXIT.inputError, message: `input is not a file: ${input}` }
  }
  const module = headlessModuleFor(input)
  if (!module) {
    return {
      ok: false,
      code: HEADLESS_EXIT.inputError,
      message: `cannot export ${input} (supported inputs: ${HEADLESS_SUPPORTED_EXTENSIONS})`,
    }
  }
  if (!HEADLESS_TARGETS[module].includes(request.targetFormat)) {
    return {
      ok: false,
      code: HEADLESS_EXIT.badArgs,
      message: `cannot export ${input} to ${request.targetFormat} (this input supports: ${HEADLESS_TARGETS[module].join(', ')})`,
    }
  }
  const switches = diagramSwitchProblem(request, module)
  if (switches) return { ok: false, code: HEADLESS_EXIT.badArgs, message: switches }
  const outPath = resolve(request.outPath)
  if (!fs.exists(dirname(outPath))) {
    return {
      ok: false,
      code: HEADLESS_EXIT.badArgs,
      message: `output directory does not exist: ${dirname(outPath)}`,
    }
  }
  if (fs.exists(outPath) && !fs.isFile(outPath)) {
    return {
      ok: false,
      code: HEADLESS_EXIT.badArgs,
      message: `output path is a directory: ${outPath}`,
    }
  }
  if (canonical(input, fs) === canonical(outPath, fs)) {
    return {
      ok: false,
      code: HEADLESS_EXIT.badArgs,
      message: `output path must differ from the input: ${outPath}`,
    }
  }
  return { ok: true, input, outPath, module }
}

/** `--page`, `--ops` and `--batch` belong to diagrams; ops and batch only where a diagram file is written. */
function diagramSwitchProblem(
  request: HeadlessExportRequest,
  module: HeadlessExportModule,
): string | null {
  const given = (['page', 'ops', 'batch'] as const).filter((key) => request[key] !== undefined)
  if (given.length === 0) return null
  if (module !== 'diagram') return `--${given[0]} is for diagram inputs only`
  if (isDiagramFileTarget(request.targetFormat)) {
    if (!request.outPath.toLowerCase().endsWith(`.${request.targetFormat}`)) {
      return `--out must end in .${request.targetFormat} for --to ${request.targetFormat}`
    }
    return null
  }
  const wrong = given.find((key) => key !== 'page')
  return wrong ? `--${wrong} goes with --to drawio, dio, drawio.svg or drawio.png` : null
}

/**
 * Runs one export end to end. Returns the outcome instead of throwing so the
 * caller can render the envelope and pick the exit code in one place.
 */
export async function runHeadlessExport(
  request: HeadlessExportRequest,
  exporters: HeadlessExporters,
  fs: HeadlessFs = realFs,
): Promise<HeadlessExportOutcome> {
  const checked = validateHeadlessPaths(request, fs)
  if (!checked.ok) return checked
  const startedAt = Date.now()
  let product: void | HeadlessExportProduct
  try {
    product = await exporters[checked.module](
      checked.input,
      checked.outPath,
      request.targetFormat,
      request,
    )
  } catch (err) {
    return {
      ok: false,
      code: HEADLESS_EXIT.conversionFailure,
      message: err instanceof Error ? err.message : String(err),
    }
  }
  const written = product ? product.paths.map((path) => resolve(path)) : [checked.outPath]
  for (const path of written) {
    if (!fs.exists(path) || !fs.isFile(path)) {
      return {
        ok: false,
        code: HEADLESS_EXIT.conversionFailure,
        message: `export reported success but wrote no file at ${path}`,
      }
    }
    if (fs.mtimeMs && fs.mtimeMs(path) < startedAt - MTIME_SLACK_MS) {
      return {
        ok: false,
        code: HEADLESS_EXIT.conversionFailure,
        message: `export reported success but left a stale file at ${path}`,
      }
    }
  }
  if (!product) return { ok: true, input: checked.input, outPath: checked.outPath }
  return {
    ok: true,
    input: checked.input,
    outPath: checked.outPath,
    outPaths: written,
    ...(product.detail ? { detail: product.detail } : {}),
  }
}
