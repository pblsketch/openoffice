/**
 * Save As format list: the deck's own format first, then every format the
 * open deck can be copied to (PDF, one PNG per slide). A copy pick writes
 * nothing here — the Save As handler hands the path back so the renderer runs
 * the existing export for it, and the open deck keeps its path, its unsaved
 * edits and its recovery identity.
 */
import { numberedExportPaths } from '@genoffice/electron-utils/numbered-export-paths'

export type SlidesSaveAsPick =
  | { readonly kind: 'pptx'; readonly path: string }
  | { readonly kind: 'pdf'; readonly path: string }
  | { readonly kind: 'png'; readonly path: string }

/** The dialog's file types; format names stay as they are, the PNG label says one file per slide. */
export function slidesSaveAsFilters(
  label: (key: 'filterPngSlides') => string,
): { name: string; extensions: string[] }[] {
  return [
    { name: 'PowerPoint', extensions: ['pptx'] },
    { name: 'PDF', extensions: ['pdf'] },
    { name: label('filterPngSlides'), extensions: ['png'] },
  ]
}

/** The suggested path without its .pptx: the file type chosen in the dialog supplies the extension. */
export function slidesSaveAsSuggestion(defaultPath: string): string {
  return defaultPath.replace(/\.pptx$/i, '')
}

/**
 * What the person picked. A typed .pdf or .png selects that copy; a bare name
 * (dialogs that add no extension, e.g. some Linux desktops) is the deck as
 * .pptx; any other name is the deck, written as typed.
 */
export function resolveSlidesSaveAsPick(filePath: string): SlidesSaveAsPick {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.pdf')) return { kind: 'pdf', path: filePath }
  if (lower.endsWith('.png')) return { kind: 'png', path: filePath }
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const hasExt = filePath.lastIndexOf('.') > slash + 1
  return { kind: 'pptx', path: hasExt ? filePath : `${filePath}.pptx` }
}

/**
 * One-shot authorization of a Save As › PNG target: the Save As handler
 * records the name the dialog returned for a tab, and the image export
 * accepts that exact name once, writing one file per slide beside it
 * (`deck.png` for one slide, `deck-01.png`, `deck-02.png`, … for more).
 */
export class SaveAsImageTargets {
  private readonly targets = new Map<number, string>()

  authorize(wcId: number, filePath: string): void {
    this.targets.set(wcId, filePath)
  }

  /** The numbered paths for `count` slides, or null when the target was not authorized for this tab. */
  take(wcId: number, filePath: string, count: number): string[] | null {
    if (this.targets.get(wcId) !== filePath) return null
    this.targets.delete(wcId)
    return numberedExportPaths(filePath, count)
  }

  forget(wcId: number): void {
    this.targets.delete(wcId)
  }
}
