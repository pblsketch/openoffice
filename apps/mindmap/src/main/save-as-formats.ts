/**
 * Save As format list of the mind map editor. XMind (.xmind) is the map's own
 * format; a picture of the sheet on screen (PNG, SVG), its page as a PDF and
 * the outline of the whole file (Markdown) are copies written by the export
 * code, so picking one of them leaves the open map as it was. Kept free of
 * Electron so the rules are unit-tested.
 */
import type { ExportFormat } from '../shared/ipc'

export type MapSaveAsKind = 'xmind' | ExportFormat

export type SaveAsLabelKey =
  'filterMindmap' | 'filterPng' | 'filterSvg' | 'filterPdf' | 'filterOutline'

export interface SaveAsFilter {
  name: string
  extensions: string[]
}

/** export kinds in the order the dialog lists them, with the extensions each accepts */
const EXPORT_KINDS: ReadonlyArray<{
  kind: ExportFormat
  label: SaveAsLabelKey
  extensions: string[]
}> = [
  { kind: 'png', label: 'filterPng', extensions: ['png'] },
  { kind: 'svg', label: 'filterSvg', extensions: ['svg'] },
  { kind: 'pdf', label: 'filterPdf', extensions: ['pdf'] },
  { kind: 'markdown', label: 'filterOutline', extensions: ['md'] },
]

/** The dialog's filters: the map's own format first (the dialog's default), then — for Save As — every export. */
export function saveAsFilters(
  offerExports: boolean,
  label: (key: SaveAsLabelKey) => string,
): SaveAsFilter[] {
  const map = { name: label('filterMindmap'), extensions: ['xmind'] }
  if (!offerExports) return [map]
  return [map, ...EXPORT_KINDS.map((k) => ({ name: label(k.label), extensions: k.extensions }))]
}

/**
 * With exports offered the suggestion carries no .xmind, so the file type
 * chosen in the dialog supplies the extension (a typed name keeps its own).
 */
export function saveAsDefaultPath(suggestion: string, offerExports: boolean): string {
  return offerExports ? suggestion.replace(/\.xmind$/i, '') : suggestion
}

/**
 * What the dialog's answer means. With exports offered, a known export
 * extension writes that copy. Anything else — .xmind, a bare name from a
 * dialog that does not add the chosen type's extension (some Linux desktops),
 * or an unknown extension — saves the map as .xmind, as before.
 */
export function saveAsTarget(
  filePath: string,
  offerExports: boolean,
): { path: string; kind: MapSaveAsKind } {
  if (offerExports) {
    const ext = /\.([^./\\]+)$/.exec(filePath)?.[1]?.toLowerCase()
    const hit = ext ? EXPORT_KINDS.find((k) => k.extensions.includes(ext)) : undefined
    if (hit) return { path: filePath, kind: hit.kind }
  }
  return {
    path: /\.xmind$/i.test(filePath) ? filePath : `${filePath}.xmind`,
    kind: 'xmind',
  }
}
