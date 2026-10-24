/**
 * One workbook save at a time. Two saves in flight race in the main process:
 * the first finisher tears the workbook session down while the second is
 * still reading, and the survivor fails with "Unknown workbook session."
 * although the file was written. Manual saves queue behind the running one;
 * the periodic ticks below skip and retry on their next wake-up.
 */
export interface SaveGate {
  readonly busy: boolean
  run<T>(task: () => Promise<T>): Promise<T>
}

export function createSaveGate(): SaveGate {
  let inFlight: Promise<unknown> | null = null
  return {
    get busy() {
      return inFlight !== null
    },
    run(task) {
      const next = (inFlight ?? Promise.resolve()).catch(() => undefined).then(task)
      inFlight = next
      next
        .finally(() => {
          if (inFlight === next) inFlight = null
        })
        .catch(() => undefined)
      return next
    },
  }
}

export interface SaveTickState {
  /** a save of either kind is currently running */
  saveInFlight: boolean
  /** no workbook open */
  hasWorkbook: boolean
  /** nothing unsaved since the last flush */
  journalEmpty: boolean
  /** the in-cell editor is open (its pending text is not in the journal yet; a save reloads the workbook and would wipe the edit) */
  editingCell: boolean
  /** AutoSave only: converted .xls import whose first save must open a Save As dialog (a new unsaved workbook saves its backing file quietly instead) */
  needsSaveAsNotUnsavedNew: boolean
  /** AutoSave only: CSV sessions, which AutoSave would silently flatten (their recovery copy is an untitled one) */
  isCsv: boolean
  kind: 'save' | 'recovery'
  /** recovery-only: this workbook writes no recovery copy (password, oversized sheets) */
  automaticRecoveryDisabled: boolean
}

export function shouldRunSaveTick(s: SaveTickState): boolean {
  if (s.saveInFlight || !s.hasWorkbook || s.journalEmpty) return false
  if (s.editingCell) return false
  // a CSV or converted workbook keeps its copy (an untitled one) but is never auto-saved
  if (s.kind === 'save') return !s.needsSaveAsNotUnsavedNew && !s.isCsv
  return !s.automaticRecoveryDisabled
}
