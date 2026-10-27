/**
 * Co-editing in the Excel editor (decision 0073): the one hook App calls.
 * It shares what a save would write now, binds the op stream once a
 * workbook is on screen, and answers what a session allows (saves, ribbon
 * commands, AI runs) and what the close guard should count.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ICommandService, type ICommandInfo, type IExecutionOptions } from '@univerjs/core'
import {
  collabText,
  useCollab,
  type CollabController,
  type CollabShareBlock,
  type CollabStringKey,
} from '@genoffice/collab'
import type { Lang } from '@genoffice/i18n'
import type { WorkbookFile } from '../../shared/desktop-api'
import { journalSize } from '../edit-journal'
import { fitsFullLoad, workbookCellCounts } from '../load-budget'
import type { SaveGate } from '../save-scheduler'
import { getScrollAnchor } from '../univer-sync'
import { journalSuppression, type LazyWorkbookState, type UniverRuntime } from '../univer-state'
import { SheetsCollabBinding } from './binding'
import { commandVerdict, pendingForClose, saveVerdict, type SaveMode } from './session-rules'
import { isSharedMutation } from './sheet-ops'

/** where the person was, for a reopened workbook to land there */
export interface SheetView {
  sheetId: string
  row: number
  column: number
  viewRow: number
  viewColumn: number
}

export interface SheetsCollabOptions {
  lang: Lang
  /** the workbook on screen; a save or a guest's reload replaces it */
  workbookFile: WorkbookFile | null
  /** a workbook is on screen and its first range is in */
  ready: boolean
  runtime(): UniverRuntime | null
  state(): LazyWorkbookState | null
  isCellEditing(): boolean
  saveGate: SaveGate
  /** the save payload as bytes; the journal is read the moment it is called */
  templateBytes(): Promise<Uint8Array | null>
  commitEditor(): Promise<boolean>
  /** open a workbook in this tab; resolves once its first range is in */
  open(file: WorkbookFile): Promise<boolean>
  keepView(view: SheetView | null): void
  /** cover the grid while it is replaced */
  setBusy(busy: boolean): void
  fullLoad(): Promise<void>
  toast(text: string): void
}

export interface SheetsCollab {
  collab: CollabController
  /** a guest in a live session: nothing of its own to save */
  liveGuest: boolean
  /** false (after telling the person why) when the session refuses the command */
  allows(command: string): boolean
  /** whether a save of this kind runs now (a refused one says so) */
  save(mode: SaveMode, quiet: boolean): 'run' | 'skip' | 'refuse'
  /** the unsaved-edit count the close guard should see */
  pendingForClose(count: number): number
  /** a guest's copy after its session: unsaved even with nothing journaled */
  copyUnsaved(): boolean
}

type GuestState = 'live' | 'ended' | null

/** why this workbook cannot be shared now, or null */
export function shareBlockOf(state: LazyWorkbookState | null): CollabShareBlock | null {
  if (!state) return 'unsupported'
  if (state.file.encrypted) return 'encrypted'
  const journal = state.editJournal
  // a guest's copy gives new sheets and rules the ids a save gives them; here
  // they still have this session's own until a save
  if (
    journal.sheets.added.size > 0 ||
    journal.cfDirty.size > 0 ||
    journal.dvDirty.size > 0 ||
    journal.definedNames.dirty
  ) {
    return 'save-first'
  }
  // every peer holds the whole workbook (moves and sorts journal resident cells)
  if (!fitsFullLoad(workbookCellCounts(state.file.sheets))) return 'unsupported'
  return null
}

function sharedFileName(file: WorkbookFile): string {
  const stem = file.name.replace(/\.[^.]+$/, '').trim() || 'Workbook'
  return `${stem}${/\.xlsm$/i.test(file.path ?? file.name) ? '.xlsm' : '.xlsx'}`
}

function currentView(runtime: UniverRuntime | null): SheetView | null {
  const workbook = runtime?.univerAPI.getActiveWorkbook()
  const sheet = workbook?.getActiveSheet()
  if (!workbook || !sheet) return null
  try {
    const cell = workbook.getActiveCell()
    const row = cell?.getRow() ?? 0
    const column = cell?.getColumn() ?? 0
    const anchor = getScrollAnchor(workbook, sheet)
    return {
      sheetId: sheet.getSheetId(),
      row,
      column,
      viewRow: anchor?.row ?? row,
      viewColumn: anchor?.column ?? column,
    }
  } catch {
    return null
  }
}

export function useSheetsCollab(options: SheetsCollabOptions): SheetsCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const bindingRef = useRef<SheetsCollabBinding | null>(null)
  const [guest, setGuest] = useState<GuestState>(null)
  const guestRef = useRef<GuestState>(null)
  /** local edits that would travel, counted from before sharing starts */
  const localEdits = useRef(0)
  /** the untitled copy a former guest keeps, until it is saved somewhere */
  const copyPath = useRef<string | undefined>(undefined)

  const setGuestState = (next: GuestState): void => {
    guestRef.current = next
    setGuest(next)
    // the close guard counts differently now
    const state = optionsRef.current.state()
    window.desktopApi?.notifyPendingEdits?.(
      pendingForClose(state ? journalSize(state.editJournal) : 0, next),
    )
  }

  const collab = useCollab({
    kind: 'sheets',
    ready: options.ready,
    shareBlock: () => shareBlockOf(optionsRef.current.state()),
    describe: async () => {
      const o = optionsRef.current
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const state = o.state()
        if (!state || shareBlockOf(state)) return null
        const before = localEdits.current
        const bytes = await o.saveGate.run(() => o.templateBytes())
        if (!bytes || o.state() !== state) return null
        // an edit made while the bytes were written is in neither them nor the
        // op stream, which starts right after this
        if (localEdits.current !== before) continue
        return { title: state.file.name, fileName: sharedFileName(state.file), base: bytes }
      }
      return null
    },
    bind: (session) => {
      const o = optionsRef.current
      if (!o.runtime() || !o.state()) throw new Error('no workbook to share')
      const binding = new SheetsCollabBinding(session, {
        runtime: () => optionsRef.current.runtime(),
        state: () => optionsRef.current.state(),
        isCellEditing: () => optionsRef.current.isCellEditing(),
        saveIdle: () => optionsRef.current.saveGate.run(() => Promise.resolve()),
        snapshot: async (capture) => {
          const current = optionsRef.current
          const taken = await current.saveGate.run(async () => {
            const captured = capture()
            return { bytes: await current.templateBytes(), captured }
          })
          if (!taken.bytes) throw new Error('the workbook could not be written for the others')
          return { bytes: taken.bytes, captured: taken.captured }
        },
        commitEditor: async () => {
          await optionsRef.current.commitEditor()
        },
        replace: async (bytes) => {
          const current = optionsRef.current
          const state = current.state()
          const replace = window.desktopApi?.collabReplaceWorkbook
          if (!state || !replace) throw new Error('no workbook to replace')
          current.keepView(currentView(current.runtime()))
          current.setBusy(true)
          try {
            const file = await replace(state.file.sessionId, bytes)
            if (!(await current.open(file))) throw new Error('the shared workbook did not open')
          } finally {
            current.setBusy(false)
          }
        },
        fullLoad: () => optionsRef.current.fullLoad(),
        refuse: (key: CollabStringKey) =>
          optionsRef.current.toast(collabText(optionsRef.current.lang, key)),
      })
      bindingRef.current = binding
      if (session.role === 'guest') setGuestState('live')
      return () => {
        binding.dispose()
        if (bindingRef.current === binding) bindingRef.current = null
      }
    },
    onEnded: (role) => {
      // the copy is now this person's own unsaved workbook
      if (role !== 'guest') return
      copyPath.current = optionsRef.current.state()?.file.path
      setGuestState('ended')
    },
  })
  // count local edits before a session exists, so sharing can tell one raced its bytes
  const runtime = options.ready ? options.runtime() : null
  useEffect(() => {
    if (!runtime) return
    const commands = runtime.univer.__getInjector().get(ICommandService)
    const listener = commands.onMutationExecutedForCollab(
      (info: Readonly<ICommandInfo>, opts?: IExecutionOptions) => {
        if (journalSuppression.active || opts?.onlyLocal || opts?.fromCollab) return
        if (!opts?.fromFormula && isSharedMutation(info.id)) localEdits.current += 1
      },
    )
    return () => listener.dispose()
  }, [runtime])

  // a save (or a guest's reload) opened a new session over the workbook
  const sessionId = options.workbookFile?.sessionId
  useEffect(() => {
    bindingRef.current?.workbookOpened()
    // once the former guest's copy is saved somewhere, it is an ordinary file
    const file = options.workbookFile
    if (guestRef.current === 'ended' && file && file.path !== copyPath.current) {
      setGuestState(null)
    }
    // keyed on the session alone: everything else is read through refs
  }, [sessionId])

  const api = useMemo(() => {
    const role = () => bindingRef.current?.role ?? null
    const othersIn = () => bindingRef.current?.othersIn() ?? false
    return {
      allows(command: string): boolean {
        const verdict = commandVerdict(command, role(), othersIn())
        if (verdict === null) return true
        if ('refuse' in verdict) {
          optionsRef.current.toast(collabText(optionsRef.current.lang, verdict.refuse))
          return false
        }
        bindingRef.current?.hostChangedAlone()
        return true
      },
      save(mode: SaveMode, quiet: boolean): 'run' | 'skip' | 'refuse' {
        const verdict = saveVerdict(mode, quiet, role(), othersIn())
        if (verdict === 'refuse') {
          optionsRef.current.toast(collabText(optionsRef.current.lang, 'guestSaveBlocked'))
        }
        return verdict
      },
      pendingForClose: (count: number) => pendingForClose(count, guestRef.current),
      copyUnsaved: () => guestRef.current === 'ended',
    }
  }, [])

  return { collab, liveGuest: guest === 'live', ...api }
}
