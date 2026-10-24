import { app, dialog } from 'electron'
import type { BrowserWindow, RenderProcessGoneDetails, WebContents } from 'electron'
import { freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { appendCrashLog, CRASH_LOG_FILE, errorReason } from './crash-log'
import type { CrashEntry, CrashMemory } from './crash-log'
import { wasReleasedRenderer } from './renderer-disposal'

/**
 * Records abnormal process ends in `<userData>/crash-log.jsonl` (see
 * crash-log.ts for what a line may hold) and tells the user when the renderer
 * of an open document dies. Before this, a renderer or GPU crash left no trace
 * anywhere: a tester could only say "the app closed by itself".
 */

export type CrashStringKey =
  'crashTitle' | 'crashBody' | 'crashReopen' | 'crashReload' | 'crashClose' | 'crashLater'

export interface CrashedDocument {
  kind: string
  title: string
  filePath?: string
}

/** an untitled document's recovery copy, as the shell identifies it (opaque here) */
export type UntitledCrashCopy = object

export interface CrashWatchOptions {
  /** editor family for the log line: 'docs', 'sheets', …, 'home', 'other' */
  editorOf: (wc: WebContents) => string
  /** the open document a renderer shows; null for chrome renderers (Home, dialogs) */
  documentOf: (wc: WebContents) => CrashedDocument | null
  parentWindow: (wc: WebContents) => BrowserWindow | null
  /** close the document's tab or window with no save prompt (its renderer, which
   *  held the unsaved state, is gone); true once it is closed */
  closeDocument: (wc: WebContents) => boolean
  reopen: (filePath: string) => void
  /**
   * The recovery copy of an untitled document in this renderer (null when it
   * is not untitled or has no copy). Read the moment the renderer is gone,
   * before the tab can close, so the editor still knows the document.
   */
  untitledCopyOf?: (wc: WebContents) => UntitledCrashCopy | null
  /**
   * Open the untitled document again from that copy in a new tab, without the
   * per-file recovery question (crash recovery spec 8).
   */
  reopenUntitled?: (doc: CrashedDocument, copy: UntitledCrashCopy) => void
  t: (key: CrashStringKey, params?: Record<string, string | number>) => string
  /** false for unattended runs (headless export): record only, never prompt */
  prompt: boolean
  /** memory figures written with every entry (see `memoryFigures`) */
  memory?: () => CrashMemory
}

/** a normal exit is not a failure */
const NOT_A_CRASH = new Set(['clean-exit'])

/** whether a gone renderer warrants telling the user (the app's own kills do not) */
export function shouldPromptForGoneRenderer(reason: string): boolean {
  return reason !== 'clean-exit' && reason !== 'killed'
}

export function crashLogPath(): string {
  return join(app.getPath('userData'), CRASH_LOG_FILE)
}

let memoryOf: (() => CrashMemory) | undefined

function record(entry: CrashEntry): void {
  let memory: CrashMemory = {}
  try {
    memory = memoryOf?.() ?? {}
  } catch {
    /* the line goes out without figures */
  }
  appendCrashLog(crashLogPath(), { ...memory, ...entry })
}

const MB = 1024 * 1024

/**
 * Memory figures for a log line: the working set of all the app's own
 * processes (the subscription CLIs are not among them, so their count goes
 * along), the PC's free and total physical memory, and the AI requests in flight.
 */
export function memoryFigures(counts: {
  aiStreams: () => number
  cliChildren: () => number
}): CrashMemory {
  let appKB = 0
  for (const metric of app.getAppMetrics()) appKB += metric.memory.workingSetSize
  return {
    appMB: Math.round(appKB / 1024),
    freeMB: Math.round(freemem() / MB),
    totalMB: Math.round(totalmem() / MB),
    aiStreams: counts.aiStreams(),
    cliChildren: counts.cliChildren(),
  }
}

/** below this much free memory the PC counts as short, whatever its size */
export const LOW_MEMORY_FLOOR_MB = 512
/** …and below this share of its physical memory */
export const LOW_MEMORY_SHARE = 0.08

export function isLowMemory(freeMB: number, totalMB: number): boolean {
  return freeMB < Math.max(LOW_MEMORY_FLOOR_MB, totalMB * LOW_MEMORY_SHARE)
}

export interface LowMemoryWatchOptions {
  /** AI requests in flight: the PC is looked at only while there is one */
  aiStreams: () => number
  memory: () => CrashMemory
  sampleMs?: number
  /** minimum gap between two `low-memory` lines */
  cooldownMs?: number
  now?: () => number
}

/**
 * While an AI request runs, look at the PC's free memory every `sampleMs` and
 * write a `low-memory` line when it runs short. It only records: nothing is
 * stopped or delayed. A PC that freezes instead of crashing leaves this trace.
 * Returns the stop function.
 */
export function startLowMemoryWatch(options: LowMemoryWatchOptions): () => void {
  const cooldownMs = options.cooldownMs ?? 10 * 60_000
  const now = options.now ?? Date.now
  let lastAt = -Infinity
  const timer = setInterval(() => {
    try {
      if (options.aiStreams() <= 0) return
      if (now() - lastAt < cooldownMs) return
      const memory = options.memory()
      if (memory.freeMB === undefined || memory.totalMB === undefined) return
      if (!isLowMemory(memory.freeMB, memory.totalMB)) return
      lastAt = now()
      appendCrashLog(crashLogPath(), { kind: 'low-memory', ...memory })
    } catch {
      /* best effort */
    }
  }, options.sampleMs ?? 15_000)
  timer.unref?.()
  return () => clearInterval(timer)
}

export function startCrashWatch(options: CrashWatchOptions): void {
  memoryOf = options.memory
  // the *Monitor* event only observes: Electron's own uncaught-exception
  // handling (an error box, the app keeps running) stays exactly as it was
  process.on('uncaughtExceptionMonitor', (error) => {
    record({ kind: 'main-exception', reason: errorReason(error) })
  })
  process.on('unhandledRejection', (error) => {
    record({ kind: 'main-rejection', reason: errorReason(error) })
    // a listener silences Node's own warning, so keep it on the console
    console.warn('[main] unhandled rejection:', error)
  })

  app.on('child-process-gone', (_event, details) => {
    if (NOT_A_CRASH.has(details.reason)) return
    // utility processes (document jobs, converters) are ended on purpose all the time
    if (details.reason === 'killed' && details.type === 'Utility') return
    record({
      kind: 'child-process',
      reason: details.reason,
      exitCode: details.exitCode,
      process: details.type,
    })
  })

  const prompting = new Set<number>()
  app.on('render-process-gone', (_event, wc: WebContents, details: RenderProcessGoneDetails) => {
    // a closed document's renderer the shell ended to free its memory
    if (wasReleasedRenderer(wc.id)) return
    if (NOT_A_CRASH.has(details.reason)) return
    let editor = 'other'
    try {
      editor = options.editorOf(wc)
    } catch {
      /* keep 'other' */
    }
    record({ kind: 'renderer', reason: details.reason, exitCode: details.exitCode, editor })
    if (!options.prompt || !shouldPromptForGoneRenderer(details.reason)) return
    let untitledCopy: UntitledCrashCopy | null = null
    try {
      untitledCopy = options.untitledCopyOf?.(wc) ?? null
    } catch {
      /* no copy known: the tab is handled as before */
    }
    void promptForCrashedDocument(wc, options, prompting, untitledCopy)
  })
}

async function promptForCrashedDocument(
  wc: WebContents,
  options: CrashWatchOptions,
  prompting: Set<number>,
  untitledCopy: UntitledCrashCopy | null,
): Promise<void> {
  if (wc.isDestroyed() || prompting.has(wc.id)) return
  const doc = options.documentOf(wc)
  if (!doc) return
  prompting.add(wc.id)
  try {
    // slides keeps the open deck in the main process, so a reload brings it all back;
    // an untitled document comes back from its recovery copy (a working file it
    // may point at, like a PDF template copy's, is not the user's document)
    const copy = options.reopenUntitled ? untitledCopy : null
    const action: 'reload' | 'reopen' | 'reopenUntitled' | 'close' =
      doc.kind === 'slides' ? 'reload' : copy ? 'reopenUntitled' : doc.filePath ? 'reopen' : 'close'
    const actionLabel =
      action === 'reload'
        ? options.t('crashReload')
        : action === 'reopen' || action === 'reopenUntitled'
          ? options.t('crashReopen')
          : options.t('crashClose')
    const dialogOptions = {
      type: 'warning' as const,
      message: options.t('crashTitle'),
      detail: options.t('crashBody', { title: doc.title }),
      buttons: [actionLabel, options.t('crashLater')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }
    const parent = options.parentWindow(wc)
    const { response } =
      parent && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, dialogOptions)
        : await dialog.showMessageBox(dialogOptions)
    if (response !== 0 || wc.isDestroyed()) return
    if (action === 'reload') {
      wc.reload()
      return
    }
    const gone = options.closeDocument(wc)
    if (!gone) return
    if (action === 'reopenUntitled' && copy) options.reopenUntitled?.(doc, copy)
    else if (action === 'reopen' && doc.filePath) options.reopen(doc.filePath)
  } catch {
    /* a failed prompt leaves the tab as it is */
  } finally {
    prompting.delete(wc.id)
  }
}
