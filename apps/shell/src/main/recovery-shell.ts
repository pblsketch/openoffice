import { app } from 'electron'
import type { WebContents, WebContentsView } from 'electron'
import {
  createRecoveryStore,
  isUntitledIdentity,
  recoveryEditor,
  type RecoveryIdentity,
  type RecoveryOpenUntitledRequest,
  type RecoveryStore,
  type RecoveryUntitledIdentity,
} from '@genoffice/electron-utils'
import { discardDocsRecovery, docsRecoveryIdentity } from '../../../docs/src/main/docs-main'
import {
  createSheetsView,
  discardSheetsRecovery,
  migrateSheetsLegacyRecovery,
  sheetsRecoveryIdentity,
} from '../../../sheets/src/main/sheets-main'
import { createPdfView, pdfRecoveryIdentity } from '../../../pdf/src/main/pdf-main'
import { slidesRecoveryIdentity } from '../../../slides/src/main/slides-main'
import {
  markdownRecoveryIdentity,
  setMarkdownRecoveryTitleSource,
} from '../../../markdown/src/main/markdown-main'
import { htmlRecoveryIdentity, setHtmlRecoveryTitleSource } from '../../../html/src/main/html-main'
import {
  discardMindmapRecovery,
  mindmapRecoveryIdentity,
  setMindmapRecoveryTitleHook,
} from '../../../mindmap/src/main/mindmap-main'
import {
  hwpDiscardRecoveryCopy,
  hwpRecoveryIdentity,
  setHwpRecoveryTitle,
} from '../../../hwp/src/main/hwp-main'
import type { DocumentTabKind, TabKind } from '../shared/tabs-api'
import {
  planLaunch,
  resolveLaunchDecisions,
  type LaunchListGate,
  type LaunchOutcome,
  type PlannedTab,
} from './launch-recovery'
import { initSessionRecord, judgePreviousExit, type SessionUntitledCopy } from './session-record'
import {
  createPlainEditorView,
  type TabManager,
  type UnloadedTabOpener,
  type UnloadedTabSpec,
} from './tab-manager'

/**
 * The shell's Electron side of crash recovery: its one recovery store, the
 * editors' answers about an untitled document's copy, the openers restored
 * tabs load through, and the launch flow that carries out launch-recovery.ts.
 * Only the normal app path reaches it (never a headless export or a second
 * instance).
 */

let store: RecoveryStore | null = null

/** the shell's recovery store (the same folder and on-disk state every editor uses) */
export function shellRecoveryStore(): RecoveryStore {
  store ??= createRecoveryStore({ userDataDir: () => app.getPath('userData') })
  return store
}

/** the copy a tab's editor writes (its file's or its untitled slot); null when it does not say */
export function editorRecoveryIdentity(
  kind: TabKind,
  contents: WebContents,
): RecoveryIdentity | null {
  if (contents.isDestroyed()) return null
  try {
    switch (kind) {
      case 'docs':
        return docsRecoveryIdentity(contents.id)
      case 'sheets':
        return sheetsRecoveryIdentity(contents.id)
      case 'pdf':
        return pdfRecoveryIdentity(contents.id)
      case 'markdown':
        return markdownRecoveryIdentity(contents.id)
      case 'html':
        return htmlRecoveryIdentity(contents.id)
      case 'mindmap':
        return mindmapRecoveryIdentity(contents.id)
      case 'hwp':
        return hwpRecoveryIdentity(contents)
      case 'slides':
        return slidesRecoveryIdentity(contents.id)
      default:
        return null
    }
  } catch {
    return null
  }
}

/** untitled-copy identities of restored tabs, by tab id, until their editor answers itself */
const plannedUntitled = new Map<string, RecoveryUntitledIdentity>()

function asSessionCopy(identity: RecoveryUntitledIdentity): SessionUntitledCopy {
  return { untitledId: identity.untitledId, ext: identity.ext }
}

/**
 * The untitled copy a tab stands for in the session record: the editor's
 * answer for a live document, else (a restored tab not loaded yet, or an
 * editor without a lookup) the copy it was restored from while it has no file.
 */
export function tabUntitledCopy(
  tab: { id: string; filePath?: string },
  kind: TabKind,
  contents: WebContents | undefined,
): SessionUntitledCopy | undefined {
  if (contents && !contents.isDestroyed()) {
    const identity = editorRecoveryIdentity(kind, contents)
    if (identity) return isUntitledIdentity(identity) ? asSessionCopy(identity) : undefined
  }
  if (tab.filePath) return undefined
  const planned = plannedUntitled.get(tab.id)
  return planned ? asSessionCopy(planned) : undefined
}

/**
 * The untitled copy to reopen a crashed tab from (spec 8): only an untitled
 * document whose copy is on disk.
 */
export function crashedUntitledCopy(
  tab: { id?: string; kind: TabKind; filePath?: string },
  contents: WebContents,
): RecoveryUntitledIdentity | null {
  if (tab.kind === 'home' || tab.kind === 'help') return null
  // editorRecoveryIdentity never throws: it answers null instead
  let identity: RecoveryIdentity | null = editorRecoveryIdentity(tab.kind, contents)
  if (!identity && !tab.filePath && tab.id) identity = plannedUntitled.get(tab.id) ?? null
  if (!identity || !isUntitledIdentity(identity)) return null
  return shellRecoveryStore().copyInfo(identity) ? identity : null
}

/** a fresh editor view with no document, to load an untitled copy into */
function createUntitledEditorView(kind: DocumentTabKind): WebContentsView {
  if (kind === 'pdf') return createPdfView()
  if (kind === 'sheets')
    return createSheetsView({ includeAiHandlers: false, openingWorkbook: true })
  return createPlainEditorView(kind)
}

/**
 * A new editor view with a copy queued as an untitled document. The editor
 * contract runs in the same tick as the view is made, before its page can ask
 * for a document.
 */
function openUntitledCopyView(
  kind: DocumentTabKind,
  request: RecoveryOpenUntitledRequest,
): WebContentsView {
  const contract = recoveryEditor(kind)
  if (!contract) throw new Error(`the ${kind} editor cannot open a recovery copy`)
  const view = createUntitledEditorView(kind)
  try {
    void Promise.resolve(contract.openUntitledCopy(view.webContents, request)).catch(
      (error: unknown) => console.warn('[recovery] the copy could not be opened:', error),
    )
  } catch (error) {
    console.warn('[recovery] the copy could not be opened:', error)
  }
  return view
}

export interface RestoredTabOpenerDeps {
  /** the launch list is not answered yet: nothing may load */
  blocked(): boolean
  /** a sheets view was made for a file: nudge its queued workbook if it is in front */
  afterSheetsOpen(): void
}

/** how a restored (unloaded) tab makes its editor view on first activation */
export function restoredTabOpener(
  planned: PlannedTab,
  deps: RestoredTabOpenerDeps,
): UnloadedTabOpener {
  const open = planned.open
  if (open.type === 'untitledCopy') {
    return {
      open: ({ kind, title }) => {
        if (deps.blocked()) throw new Error('the launch recovery list is not answered yet')
        const view = openUntitledCopyView(kind, {
          copy: open.copy,
          title,
          ...(open.saveAsDefaultPath ? { saveAsDefaultPath: open.saveAsDefaultPath } : {}),
        })
        return { view }
      },
      needsUser: () => deps.blocked(),
    }
  }
  return {
    open: ({ kind, filePath }) => {
      if (deps.blocked()) throw new Error('the launch recovery list is not answered yet')
      const view = createPlainEditorView(kind, filePath)
      if (kind === 'sheets') setImmediate(() => deps.afterSheetsOpen())
      return { view }
    },
    // an unsettled copy of the file asks the user first (5.4): nobody else may wait on it
    needsUser: ({ kind, filePath }) => {
      if (deps.blocked()) return true
      if (!filePath) return false
      try {
        return shellRecoveryStore().openPlan({ kind, filePath }).action === 'ask'
      } catch {
        return false
      }
    },
  }
}

function tabSpec(planned: PlannedTab, deps: RestoredTabOpenerDeps): UnloadedTabSpec {
  return {
    kind: planned.kind,
    title: planned.title,
    ...(planned.filePath ? { filePath: planned.filePath } : {}),
    opener: restoredTabOpener(planned, deps),
  }
}

function notePlanned(tabId: string, planned: PlannedTab): void {
  if (planned.open.type === 'untitledCopy' && isUntitledIdentity(planned.open.copy)) {
    plannedUntitled.set(tabId, planned.open.copy)
  }
}

/**
 * Reopen an untitled document from its copy in a new tab (a crashed renderer,
 * spec 8): no per-file question, the copy simply comes back.
 */
export function reopenUntitledCopy(
  manager: TabManager,
  kind: DocumentTabKind,
  title: string,
  copy: RecoveryUntitledIdentity,
  deps: RestoredTabOpenerDeps,
): void {
  const planned: PlannedTab = { key: 'crash', kind, title, open: { type: 'untitledCopy', copy } }
  const id = manager.addUnloadedTab(tabSpec(planned, deps))
  notePlanned(id, planned)
  manager.activateTab(id)
}

/** the editors' own "Don't Save" for their copy when MCP / AI closes a tab without saving */
export function discardEditorRecovery(kind: TabKind, contents: WebContents): void {
  if (contents.isDestroyed()) return
  if (kind === 'docs') discardDocsRecovery(contents)
  else if (kind === 'sheets') discardSheetsRecovery(contents)
  else if (kind === 'mindmap') discardMindmapRecovery(contents)
  else if (kind === 'hwp') hwpDiscardRecoveryCopy(contents)
}

/** the untitled documents' copies are listed under their real tab titles */
export function installRecoveryTitleSources(
  titleOf: (contents: WebContents) => string | undefined,
): void {
  setMarkdownRecoveryTitleSource(titleOf)
  setHtmlRecoveryTitleSource(titleOf)
  setMindmapRecoveryTitleHook(titleOf)
}

/** hwp is told its untitled tabs' titles (it does not ask) */
export function pushHwpRecoveryTitles(manager: TabManager): void {
  for (const tab of manager.list()) {
    if (tab.kind !== 'hwp' || tab.filePath) continue
    const contents = manager.webContentsForTab(tab.id)
    if (contents && !contents.isDestroyed()) setHwpRecoveryTitle(contents, tab.title)
  }
}

export interface LaunchRecoveryDeps {
  userDataDir: string
  gate: LaunchListGate
  manager(): TabManager
  launchPaths: readonly string[]
  /** today's launch with files */
  openLaunchPaths(paths: readonly string[]): void
  /** today's launch without files: the remembered split, else Home */
  restoreSplitMemoryOrHome(): void
  afterSheetsOpen(): void
  /** the launch has settled (files that arrived meanwhile can open now) */
  settled(): void
  /**
   * The open tabs changed in a way the tab manager did not announce: the
   * session record is written again (restored untitled tabs know their copy
   * only after the strip was rebuilt).
   */
  sessionChanged(): void
}

/**
 * The whole launch (spec 4, 5.1, 5.2, 5.3, 6): drop month-old copies, move
 * Excel's old unsaved-workbook list into the store, judge the previous exit,
 * start this run's session record, rebuild the previous tabs unloaded after
 * an abnormal exit, and either load the front tab and split at once or keep
 * Home in front and load nothing until the launch list is answered.
 */
export function runLaunchRecovery(deps: LaunchRecoveryDeps): void {
  const recoveryStore = shellRecoveryStore()
  const openerDeps: RestoredTabOpenerDeps = {
    blocked: () => deps.gate.blocking(),
    afterSheetsOpen: deps.afterSheetsOpen,
  }
  const plainLaunch = (): void => {
    if (deps.launchPaths.length > 0) deps.openLaunchPaths(deps.launchPaths)
    else deps.restoreSplitMemoryOrHome()
  }
  try {
    recoveryStore.pruneStaleCopies()
  } catch (error) {
    console.warn('[recovery] stale copies could not be removed:', error)
  }
  migrateSheetsLegacyRecovery()

  let ids = new Map<string, string>()
  let plan: ReturnType<typeof planLaunch> | null
  try {
    const record = initSessionRecord({ userDataDir: deps.userDataDir })
    const judgment = judgePreviousExit(record.previous, recoveryStore)
    plan = planLaunch({
      judgment,
      previous: record.previous,
      copies: recoveryStore,
      launchPaths: deps.launchPaths,
    })
    record.startRun({ restoreRun: plan.restoreRun })
    if (!plan.plainLaunch) {
      const tabs = plan.tabs
      const tabIds = deps
        .manager()
        .hydrateSession({ tabs: tabs.map((t) => tabSpec(t, openerDeps)) })
      ids = new Map(tabs.map((t, index) => [t.key, tabIds[index]]))
      tabs.forEach((t, index) => notePlanned(tabIds[index], t))
      // the strip's change notice went out before the untitled copies were noted
      try {
        deps.sessionChanged()
      } catch (error) {
        console.warn('[recovery] the session record could not be updated:', error)
      }
    }
  } catch (error) {
    console.warn('[recovery] the launch could not restore the previous session:', error)
    plan = null
  }
  if (!plan || plan.plainLaunch) {
    deps.gate.publishNone()
    plainLaunch()
    deps.settled()
    return
  }
  const launchPlan = plan

  const layOut = (outcome: LaunchOutcome): void => {
    const manager = deps.manager()
    for (const key of outcome.remove) {
      const id = ids.get(key)
      if (id) manager.closeTabWithoutPrompt(id)
      ids.delete(key)
    }
    for (const planned of outcome.replace) {
      const oldId = ids.get(planned.key)
      const slot = manager.list().findIndex((tab) => tab.id === oldId)
      const newId = manager.addUnloadedTab(tabSpec(planned, openerDeps))
      notePlanned(newId, planned)
      if (slot > 0) manager.reorderTab(newId, slot)
      if (oldId) manager.closeTabWithoutPrompt(oldId)
      ids.set(planned.key, newId)
    }
    for (const planned of outcome.append) {
      const id = manager.addUnloadedTab(tabSpec(planned, openerDeps))
      notePlanned(id, planned)
      ids.set(planned.key, id)
    }
    const front = outcome.front ? ids.get(outcome.front) : undefined
    const split = outcome.split
    const a = split ? ids.get(split.a) : undefined
    const b = split ? ids.get(split.b) : undefined
    if (split && a && b) {
      const focus = outcome.front === split.a ? 'a' : outcome.front === split.b ? 'b' : split.focus
      manager.beginSplit(a, b, split.orientation, split.ratio, focus)
    }
    if (!manager.splitState() && front) manager.activateTab(front)
    if (outcome.launchPaths.length > 0) deps.openLaunchPaths(outcome.launchPaths)
    else if (outcome.splitMemoryOrHome) deps.restoreSplitMemoryOrHome()
    else if (!front && !manager.splitState()) manager.openHomeTab()
  }

  /**
   * Carry out the outcome. A failure while laying out the tabs never escapes:
   * the rest of the app start (and the launch list's answer) must go on, so
   * Home comes to the front and the launch settles anyway. Decisions already
   * recorded in the store stay recorded; the list is not asked again.
   */
  const finish = (outcome: LaunchOutcome): void => {
    try {
      layOut(outcome)
    } catch (error) {
      console.warn('[recovery] the restored session could not be laid out:', error)
      try {
        deps.manager().openHomeTab()
      } catch (homeError) {
        console.warn('[recovery] Home could not be shown:', homeError)
      }
    }
    try {
      deps.settled()
    } catch (error) {
      console.warn('[recovery] the files that arrived during the launch could not open:', error)
    }
  }

  if (launchPlan.items.length === 0) {
    deps.gate.publishNone()
    finish(resolveLaunchDecisions(launchPlan, null))
    return
  }
  // Home stays in front while the list is up: an editor view would cover it,
  // and what a restored tab loads depends on the answer
  deps.manager().openHomeTab()
  deps.gate.publish(launchPlan.items, (result) => {
    const outcome = resolveLaunchDecisions(launchPlan, result)
    for (const { identity, decision } of outcome.storeDecisions) {
      try {
        recoveryStore.applyLaunchDecision(identity, decision)
      } catch (error) {
        console.warn('[recovery] a launch decision could not be recorded:', error)
      }
    }
    finish(outcome)
  })
}
