import { basename, dirname } from 'node:path'
import type {
  RecoveryCopyFilter,
  RecoveryCopyInfo,
  RecoveryIdentity,
  RecoveryLaunchDecision,
} from '@genoffice/electron-utils'
import type { DocumentTabKind } from '../shared/tabs-api'
import type { SplitOrientation } from '../shared/split-view-api'
import type {
  RecoveryChoice,
  RecoveryListItem,
  RecoveryListResult,
} from '../shared/recovery-list-api'
import {
  sessionRestoreLayout,
  type PreviousExitJudgment,
  type SessionDetachedTab,
  type SessionRecordReadResult,
  type SessionSnapshotSource,
  type SessionStripState,
  type SessionUntitledCopy,
} from './session-record'

/**
 * The launch side of crash recovery, as decisions without Electron (spec 4,
 * 5.1, 5.2, 5.3, 6, 8): which tabs come back after an abnormal exit, which
 * copies the launch list asks about, what the list's answer does to the
 * store and the strip, the list's IPC semantics, the order of an OS shutdown,
 * and how an MCP / `@` lookup treats a restored tab that waits on the user.
 * index.ts only carries the results out.
 */

/** the part of a recovery copy's description the launch needs */
export type LaunchCopy = Pick<
  RecoveryCopyInfo,
  | 'identity'
  | 'kind'
  | 'filePath'
  | 'untitledId'
  | 'title'
  | 'writtenAt'
  | 'state'
  | 'fileChangedAfterCopy'
  | 'originalMissing'
  | 'originalPath'
>

export interface LaunchCopySource {
  listCopies(filter?: RecoveryCopyFilter): LaunchCopy[]
}

/** how a planned tab makes its editor view when it is first loaded */
export type PlannedOpen =
  /** the tab's file as a plain open: the editor settles any copy of it itself */
  | { type: 'file' }
  /** a copy opened as an untitled document (an untitled copy, or one whose original is gone) */
  | { type: 'untitledCopy'; copy: RecoveryIdentity; saveAsDefaultPath?: string }

/** one document tab the launch puts in the strip, unloaded */
export interface PlannedTab {
  /** stable within one launch: front, split, remove and replace refer to it */
  key: string
  kind: DocumentTabKind
  title: string
  filePath?: string
  open: PlannedOpen
}

export interface PlannedSplit {
  a: string
  b: string
  orientation: SplitOrientation
  ratio: number
  focus: 'a' | 'b'
}

export interface LaunchPlan {
  /** the previous run ended abnormally: this run restores (the session record's restoreRun) */
  restoreRun: boolean
  /** the previous run was a restore that died right away: nothing is loaded up front */
  crashLoop: boolean
  /** nothing to rebuild or ask: today's launch (the files, else the remembered split or Home) */
  plainLaunch: boolean
  /** the strip to rebuild, in order */
  tabs: PlannedTab[]
  /** the tab to load and bring forward (absent = Home) */
  front?: string
  split?: PlannedSplit
  /** the launch list's rows; empty = no list */
  items: RecoveryListItem[]
  /** the copy behind each row, by row id */
  copies: Map<string, LaunchCopy>
  /** files the launch was asked to open: last in the strip and in front */
  launchPaths: string[]
}

export interface PlanLaunchInput {
  judgment: Pick<PreviousExitJudgment, 'abnormal' | 'crashLoop'>
  previous: SessionRecordReadResult
  copies: LaunchCopySource
  launchPaths: readonly string[]
}

/** one key per document a copy belongs to (the store's own identity) */
export function recoveryIdentityKey(identity: RecoveryIdentity): string {
  return 'filePath' in identity
    ? `${identity.kind}\u0000file\u0000${identity.filePath}`
    : `${identity.kind}\u0000untitled\u0000${identity.untitledId}`
}

/**
 * The path an untitled copy opens with as its first Save As: the old path of
 * a copy whose original is gone, or the file an untitled copy came from (a
 * CSV or converted workbook). Undefined for a plain untitled document.
 */
function saveAsDefaultOf(copy: LaunchCopy): string | undefined {
  return copy.filePath ?? copy.originalPath ?? undefined
}

/** an untitled copy opened from `copy`, with its first Save As when it has one */
function untitledOpen(copy: LaunchCopy): PlannedOpen {
  const saveAsDefaultPath = saveAsDefaultOf(copy)
  return {
    type: 'untitledCopy',
    copy: copy.identity,
    ...(saveAsDefaultPath ? { saveAsDefaultPath } : {}),
  }
}

function rowName(copy: LaunchCopy, fallback: string | undefined): string {
  if (copy.filePath) return basename(copy.filePath)
  return copy.title.trim() || fallback || copy.kind
}

/**
 * What this launch rebuilds and asks.
 *
 * - The list after an abnormal exit holds every undecided and restore-chosen
 *   copy (also of documents outside the previous tabs and from earlier runs);
 *   after either kind of exit it holds the untitled "later" copies. File
 *   "later" copies are asked about when their file opens (5.4).
 * - After an abnormal exit the previous tabs come back unloaded, detached ones
 *   into the strip. An untitled tab comes back only while its copy is there.
 *   A crash loop keeps the strip but loads nothing; a launch file takes the
 *   front instead of the previous front tab and split.
 */
export function planLaunch(input: PlanLaunchInput): LaunchPlan {
  const { judgment } = input
  const launchPaths = [...input.launchPaths]

  const rows: LaunchCopy[] = []
  const seen = new Set<string>()
  const addRows = (copies: LaunchCopy[]): void => {
    for (const copy of copies) {
      const key = recoveryIdentityKey(copy.identity)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(copy)
    }
  }
  if (judgment.abnormal)
    addRows(input.copies.listCopies({ states: ['undecided', 'restoreChosen'] }))
  addRows(input.copies.listCopies({ states: ['later'], untitled: true }))
  const rowByKey = new Map(rows.map((copy) => [recoveryIdentityKey(copy.identity), copy]))

  const tabs: PlannedTab[] = []
  let front: string | undefined
  let split: PlannedSplit | undefined
  const untitledTitles = new Map<string, string>()
  if (judgment.abnormal && input.previous.status === 'ok') {
    const layout = sessionRestoreLayout(input.previous.record, { crashLoop: judgment.crashLoop })
    const keyByIndex = new Map<number, string>()
    layout.tabs.forEach((tab, index) => {
      const key = `s${index}`
      if (tab.filePath) {
        tabs.push({
          key,
          kind: tab.kind,
          title: tab.title,
          filePath: tab.filePath,
          open: { type: 'file' },
        })
        keyByIndex.set(index, key)
        return
      }
      if (!tab.untitled) return
      const identity: RecoveryIdentity = {
        kind: tab.kind,
        untitledId: tab.untitled.untitledId,
        ext: tab.untitled.ext,
      }
      const copy = rowByKey.get(recoveryIdentityKey(identity))
      // an untitled document without its copy has nothing to come back with
      if (!copy) return
      untitledTitles.set(recoveryIdentityKey(identity), tab.title)
      tabs.push({ key, kind: tab.kind, title: tab.title, open: untitledOpen(copy) })
      keyByIndex.set(index, key)
    })
    if (launchPaths.length === 0) {
      front = layout.active !== undefined ? keyByIndex.get(layout.active) : undefined
      const s = layout.split
      const a = s ? keyByIndex.get(s.a) : undefined
      const b = s ? keyByIndex.get(s.b) : undefined
      if (s && a && b) split = { a, b, orientation: s.orientation, ratio: s.ratio, focus: s.focus }
    }
  }

  const copies = new Map<string, LaunchCopy>()
  const items: RecoveryListItem[] = rows.map((copy, index) => {
    const id = `r${index}`
    copies.set(id, copy)
    return {
      id,
      editorKind: copy.kind,
      name: rowName(copy, untitledTitles.get(recoveryIdentityKey(copy.identity))),
      // an untitled copy of a CSV or converted workbook shows where that file is
      folder: copy.filePath
        ? dirname(copy.filePath)
        : copy.originalPath
          ? dirname(copy.originalPath)
          : null,
      lastCopyTime: copy.writtenAt,
      untitled: copy.filePath === null,
      fileChangedAfterCopy: copy.fileChangedAfterCopy,
      originalMissing: copy.originalMissing,
    }
  })

  return {
    restoreRun: judgment.abnormal,
    crashLoop: judgment.abnormal && judgment.crashLoop,
    plainLaunch: tabs.length === 0 && items.length === 0,
    tabs,
    ...(front ? { front } : {}),
    ...(split ? { split } : {}),
    items,
    copies,
    launchPaths,
  }
}

export interface LaunchOutcome {
  /** the store decision for every row */
  storeDecisions: Array<{ identity: RecoveryIdentity; decision: RecoveryLaunchDecision }>
  /** planned tabs to drop: untitled copies that were not restored */
  remove: string[]
  /** planned tabs to swap in place, keeping their key (a restore whose original is gone) */
  replace: PlannedTab[]
  /** new tabs at the end of the strip: restored copies that had no tab */
  append: PlannedTab[]
  front?: string
  split?: PlannedSplit
  /** open these files last; they end up in front */
  launchPaths: string[]
  /** nothing else comes forward: run today's launch (the remembered split, else Home) */
  splitMemoryOrHome: boolean
}

function untitledTabFor(key: string, copy: LaunchCopy, title: string): PlannedTab {
  // a file copy here has lost its original: it opens untitled under the old file name
  const name = copy.filePath !== null ? basename(copy.filePath) : title
  return { key, kind: copy.kind, title: name, open: untitledOpen(copy) }
}

/**
 * What the launch list's answer does (spec 6). `null` = there was no list.
 *
 * - restore: the copy is "restore-chosen" (its tab opens it without asking);
 *   an untitled copy gets its tab; a copy whose original is gone opens as an
 *   untitled document with the old path as the first Save As, and so does an
 *   untitled copy that names the file it came from (a CSV's, in Excel).
 * - discard: the copy goes; a file tab opens the saved file; an untitled
 *   copy gets no tab.
 * - a dismissed list, or a row without a choice: "later" for that row;
 *   nothing is deleted, file tabs ask again when first opened, untitled
 *   copies get no tab and come back in the next launch's list.
 *
 * Restored copies outside the strip are appended. When nothing else is in
 * front, the first of them comes forward (never in a crash loop); launch
 * files always take the front.
 */
export function resolveLaunchDecisions(
  plan: LaunchPlan,
  result: RecoveryListResult | null,
): LaunchOutcome {
  const decisionOf = (id: string): RecoveryLaunchDecision => {
    if (!result || 'dismissed' in result) return 'later'
    return result.decisions[id] ?? 'later'
  }
  const storeDecisions: LaunchOutcome['storeDecisions'] = []
  const decisionByKey = new Map<string, RecoveryLaunchDecision>()
  if (result) {
    for (const item of plan.items) {
      const copy = plan.copies.get(item.id)
      if (!copy) continue
      const decision = decisionOf(item.id)
      storeDecisions.push({ identity: copy.identity, decision })
      decisionByKey.set(recoveryIdentityKey(copy.identity), decision)
    }
  }

  const remove: string[] = []
  const replace: PlannedTab[] = []
  const inStrip = new Set<string>()
  for (const tab of plan.tabs) {
    if (tab.open.type === 'untitledCopy') {
      const key = recoveryIdentityKey(tab.open.copy)
      inStrip.add(key)
      if (result && decisionByKey.get(key) !== 'restore') remove.push(tab.key)
      continue
    }
    if (!tab.filePath) continue
    const key = recoveryIdentityKey({ kind: tab.kind, filePath: tab.filePath })
    inStrip.add(key)
    const copy = [...plan.copies.values()].find((c) => recoveryIdentityKey(c.identity) === key)
    if (copy && copy.originalMissing && decisionByKey.get(key) === 'restore') {
      replace.push(untitledTabFor(tab.key, copy, tab.title))
    }
  }

  const append: PlannedTab[] = []
  plan.items.forEach((item, index) => {
    const copy = plan.copies.get(item.id)
    if (!copy) return
    const key = recoveryIdentityKey(copy.identity)
    if (inStrip.has(key) || decisionByKey.get(key) !== 'restore') return
    const tabKey = `a${index}`
    if (copy.filePath === null || copy.originalMissing) {
      append.push(untitledTabFor(tabKey, copy, item.name))
    } else {
      append.push({
        key: tabKey,
        kind: copy.kind,
        title: basename(copy.filePath),
        filePath: copy.filePath,
        open: { type: 'file' },
      })
    }
  })

  const removed = new Set(remove)
  let split = plan.split
  if (split && (removed.has(split.a) || removed.has(split.b))) split = undefined
  let front = plan.front && !removed.has(plan.front) ? plan.front : undefined
  const launchPaths = [...plan.launchPaths]
  if (!front && !split && launchPaths.length === 0 && append.length > 0 && !plan.crashLoop) {
    front = append[0].key
  }
  const splitMemoryOrHome = !plan.restoreRun && !front && !split && launchPaths.length === 0
  return {
    storeDecisions,
    remove,
    replace,
    append,
    ...(front ? { front } : {}),
    ...(split ? { split } : {}),
    launchPaths,
    splitMemoryOrHome,
  }
}

// ---- the launch list over IPC ----

const CHOICES: readonly RecoveryChoice[] = ['restore', 'discard']

/**
 * Check what the Home screen sent back. Decisions for rows the list never
 * showed are dropped; a missing row counts as "later" when applied.
 */
export function normalizeLaunchListResult(
  raw: unknown,
  ids: readonly string[],
): RecoveryListResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid launch recovery result')
  }
  const value = raw as Record<string, unknown>
  if (value.dismissed === true) return { dismissed: true }
  const decisions = value.decisions
  if (decisions === null || typeof decisions !== 'object' || Array.isArray(decisions)) {
    throw new Error('invalid launch recovery result')
  }
  const known = new Set(ids)
  const out: Record<string, RecoveryChoice> = {}
  for (const [id, choice] of Object.entries(decisions as Record<string, unknown>)) {
    if (!CHOICES.includes(choice as RecoveryChoice)) {
      throw new Error('invalid launch recovery choice')
    }
    if (known.has(id)) out[id] = choice as RecoveryChoice
  }
  return { decisions: out }
}

export interface LaunchListGate {
  /**
   * The rows to ask about. Waits until the launch flow knows them, then keeps
   * answering the same rows until a result is applied (a reloaded Home shows
   * the list again); null once answered or when there is nothing to ask.
   */
  get(): Promise<RecoveryListItem[] | null>
  /** apply the Home screen's answer once; a failed apply leaves the list up */
  submit(raw: unknown): Promise<void>
  /** the launch flow asks these rows; `apply` carries out the answer */
  publish(
    items: RecoveryListItem[],
    apply: (result: RecoveryListResult) => void | Promise<void>,
  ): void
  /** the launch flow has nothing to ask */
  publishNone(): void
  /**
   * True until the launch has its answer (the list is not known yet, or shown
   * and not answered): no restored tab may load meanwhile. False while an
   * answer is being applied, since applying it loads the front tabs.
   */
  blocking(): boolean
}

export function createLaunchListGate(): LaunchListGate {
  type State =
    | { kind: 'unknown' }
    | {
        kind: 'asking'
        items: RecoveryListItem[]
        apply: (result: RecoveryListResult) => void | Promise<void>
      }
    | { kind: 'done' }
  let state: State = { kind: 'unknown' }
  let waiters: Array<() => void> = []
  let applying: Promise<void> | null = null
  /** an answer is being applied (set before `apply` runs, which may be synchronous) */
  let answering = false

  const settle = (next: State): void => {
    state = next
    const pending = waiters
    waiters = []
    for (const wake of pending) wake()
  }

  const current = (): RecoveryListItem[] | null =>
    state.kind === 'asking' ? state.items.map((item) => ({ ...item })) : null

  return {
    async get() {
      if (state.kind === 'unknown') await new Promise<void>((resolve) => waiters.push(resolve))
      return current()
    },

    submit(raw) {
      if (state.kind !== 'asking') return Promise.resolve()
      if (answering) return applying ?? Promise.resolve()
      const asking = state
      let result: RecoveryListResult
      try {
        result = normalizeLaunchListResult(
          raw,
          asking.items.map((item) => item.id),
        )
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
      answering = true
      applying = (async () => {
        try {
          await asking.apply(result)
          if (state === asking) settle({ kind: 'done' })
        } finally {
          answering = false
          applying = null
        }
      })()
      return applying
    },

    publish(items, apply) {
      if (state.kind !== 'unknown') return
      settle(items.length > 0 ? { kind: 'asking', items, apply } : { kind: 'done' })
    },

    publishNone() {
      if (state.kind === 'unknown') settle({ kind: 'done' })
    },

    blocking() {
      return state.kind === 'unknown' || (state.kind === 'asking' && !answering)
    },
  }
}

// ---- the OS ending the session ----

/** how long an OS shutdown waits for the editors' copies before ending anyway */
export const OS_SESSION_END_WRITE_TIMEOUT_MS = 10_000

export interface OsSessionEndDeps {
  /** latch the app as ending (the shared recovery latch and the sheets one) */
  markShuttingDown(): void
  /** stop the session record without its clean mark (markSessionOsEnd) */
  markSessionOsEnd(): void
  /** every registered editor contract */
  editors(): ReadonlyArray<{ writeCopiesNow(): Promise<void> }>
  /** end the app with no close prompt and no editor clean-up that could delete a copy */
  finish(): void
  timeoutMs?: number
}

/**
 * The OS is shutting down, restarting or logging out (spec 4): no save
 * prompt. The latch goes up first, so no editor clean-up can delete a copy
 * from then on, and the session record stops without its clean mark (the
 * next run treats the exit as abnormal). Then every editor writes its copies
 * at once, as far as time allows, and the app ends. Runs once.
 */
export function createOsSessionEnd(deps: OsSessionEndDeps): () => Promise<void> {
  let running: Promise<void> | null = null
  return () => {
    running ??= (async () => {
      try {
        deps.markShuttingDown()
      } catch (error) {
        console.warn('[recovery] could not latch the shutdown:', error)
      }
      try {
        deps.markSessionOsEnd()
      } catch (error) {
        console.warn('[recovery] could not close the session record:', error)
      }
      let editors: ReadonlyArray<{ writeCopiesNow(): Promise<void> }>
      try {
        editors = deps.editors()
      } catch {
        editors = []
      }
      const writes = Promise.all(
        editors.map((editor) =>
          Promise.resolve()
            .then(() => editor.writeCopiesNow())
            .catch((error: unknown) => console.warn('[recovery] copy at shutdown failed:', error)),
        ),
      )
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, deps.timeoutMs ?? OS_SESSION_END_WRITE_TIMEOUT_MS)
      })
      await Promise.race([writes, timeout])
      if (timer) clearTimeout(timer)
      deps.finish()
    })()
    return running
  }
}

// ---- the live strip as the session record keeps it ----

export interface LiveSessionInput {
  strip: SessionStripState | null
  detached: readonly SessionDetachedTab[]
  /**
   * The untitled-copy identity of a tab, when its document is untitled (the
   * editor's own answer for a loaded tab, the planned copy for an unloaded one).
   */
  untitledOf: (tab: {
    id: string
    kind: DocumentTabKind
    filePath?: string
  }) => SessionUntitledCopy | undefined
}

/**
 * The snapshot source for noteSessionChanged. A tab whose editor says its
 * document is untitled is recorded by its copy even when the tab points at a
 * working file (a new workbook's temp file, a PDF template copy): that file
 * is not the user's document and must not come back as one.
 */
export function liveSessionSource(input: LiveSessionInput): SessionSnapshotSource {
  const untitled = new Map<string, SessionUntitledCopy>()
  const withoutWorkingFile = <T extends { id: string; kind: DocumentTabKind; filePath?: string }>(
    tab: T,
  ): T => {
    const copy = input.untitledOf(tab)
    if (!copy) return tab
    untitled.set(tab.id, copy)
    const rest = { ...tab }
    delete rest.filePath
    return rest
  }
  return {
    strip: input.strip ? { ...input.strip, tabs: input.strip.tabs.map(withoutWorkingFile) } : null,
    detached: input.detached.map(withoutWorkingFile),
    untitledCopyFor: (tab) => untitled.get(tab.id),
  }
}

// ---- MCP and `@` lookups of a restored tab ----

/** the failure an MCP / AI caller gets for a document that waits on the user's answer */
export const LAUNCH_NEEDS_USER_MESSAGE = 'the user must open this document in the app first'

export interface LiveTabContentsDeps<C> {
  ensureLoaded(
    tabId: string,
  ): Promise<{ status: 'ready'; webContents: C } | { status: 'needs-user' } | { status: 'missing' }>
  /** a document in a detached window */
  detached(tabId: string): C | undefined
  titleOf(tabId: string): string | undefined
}

/**
 * The live webContents of an open document for a caller that cannot wait on
 * a person: an unloaded tab is loaded first and its editor page waited for
 * (not the document inside it); a document that must first ask the user (the
 * launch list unanswered, or its file's copy still to be settled, while the
 * page is not up yet) fails with a message the agent can relay (spec 5.3).
 * Undefined when no such document is open.
 */
export async function liveTabContents<C>(
  tabId: string,
  deps: LiveTabContentsDeps<C>,
): Promise<C | undefined> {
  const loaded = await deps.ensureLoaded(tabId)
  if (loaded.status === 'ready') return loaded.webContents
  if (loaded.status === 'needs-user') {
    const title = deps.titleOf(tabId)
    throw new Error(
      title
        ? `"${title}" has recovered changes to decide on: ${LAUNCH_NEEDS_USER_MESSAGE}`
        : `this document has recovered changes to decide on: ${LAUNCH_NEEDS_USER_MESSAGE}`,
    )
  }
  return deps.detached(tabId)
}
