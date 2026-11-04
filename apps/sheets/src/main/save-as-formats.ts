/// Save As format list: the workbook's own format first, then every format the
/// open workbook can be copied to (CSV and PDF of the active sheet). A pick of
/// a copy format writes nothing here — the save handler hands the path back so
/// the renderer runs the existing export for it, and the open workbook keeps
/// its path, its unsaved edits and its recovery identity.

export type SheetsSaveAsPick =
  | { readonly kind: 'workbook'; readonly path: string }
  | { readonly kind: 'csv'; readonly path: string }
  | { readonly kind: 'pdf'; readonly path: string }

type FilterLabel = 'filterXlsx' | 'filterXlsm' | 'filterCsv' | 'filterPdfActiveSheet'

/// The dialog's file types. A macro workbook keeps .xlsm as its only workbook
/// type (the untouched VBA parts round-trip through the save); CSV stays off
/// that list as before. PDF is offered on an explicit Save As only: the first
/// Save of a new or converted workbook can be the save-before-close, where a
/// PDF pick would write a copy and then cancel the close.
export function sheetsSaveAsFilters(
  macroEnabled: boolean,
  offerPdf: boolean,
  label: (key: FilterLabel) => string,
): { name: string; extensions: string[] }[] {
  const pdf = offerPdf ? [{ name: label('filterPdfActiveSheet'), extensions: ['pdf'] }] : []
  return macroEnabled
    ? [{ name: label('filterXlsm'), extensions: ['xlsm'] }, ...pdf]
    : [
        { name: label('filterXlsx'), extensions: ['xlsx'] },
        { name: label('filterCsv'), extensions: ['csv'] },
        ...pdf,
      ]
}

/// The suggested path without its workbook extension: with copy formats on
/// offer, the file type chosen in the dialog supplies the extension.
export function sheetsSaveAsSuggestion(defaultPath: string): string {
  return defaultPath.replace(/\.(xlsx|xlsm|xls|csv|tsv)$/i, '')
}

/// What the person picked. A typed .pdf or .csv selects that copy where it is
/// offered; anything else is the workbook, whose extension is added when
/// missing (a bare name from dialogs that add none, e.g. some Linux desktops).
export function resolveSheetsSaveAsPick(
  filePath: string,
  macroEnabled: boolean,
  offerPdf: boolean,
): SheetsSaveAsPick {
  const lower = filePath.toLowerCase()
  if (offerPdf && lower.endsWith('.pdf')) return { kind: 'pdf', path: filePath }
  if (!macroEnabled && lower.endsWith('.csv')) return { kind: 'csv', path: filePath }
  const ext = macroEnabled ? 'xlsm' : 'xlsx'
  return {
    kind: 'workbook',
    path: lower.endsWith(`.${ext}`) ? filePath : `${filePath}.${ext}`,
  }
}

/// One-shot authorization of a Save As › PDF target: the save handler records
/// the path the dialog returned for a tab, and the PDF export accepts that
/// exact path once without opening its own dialog.
export class SaveAsExportTargets {
  private readonly targets = new Map<number, string>()

  authorize(wcId: number, filePath: string): void {
    this.targets.set(wcId, filePath)
  }

  take(wcId: number, filePath: string): boolean {
    if (this.targets.get(wcId) !== filePath) return false
    this.targets.delete(wcId)
    return true
  }

  forget(wcId: number): void {
    this.targets.delete(wcId)
  }
}
