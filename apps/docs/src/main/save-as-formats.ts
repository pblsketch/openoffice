/**
 * Save As format list of the Word editor. Word (.docx) and ODT (.odt) are the
 * document's own formats; PDF, HTML, Markdown and page images (one PNG per
 * page) are copies written by the export code, so picking one of them leaves
 * the open document as it was. Kept free of Electron so the rules are
 * unit-tested.
 */
import type { SaveAsKind } from '../shared/open-file'
import { docFormatOfPath, withDocExtension, type DocFormat } from './doc-format'

export type SaveAsLabelKey =
  'filterWord' | 'filterOdt' | 'filterPdf' | 'filterHtml' | 'filterMarkdown' | 'filterPageImages'

export interface SaveAsFilter {
  name: string
  extensions: string[]
}

/** export kinds in the order the dialog lists them, with the extensions each accepts */
const EXPORT_KINDS: ReadonlyArray<{
  kind: Exclude<SaveAsKind, DocFormat>
  label: SaveAsLabelKey
  extensions: string[]
}> = [
  { kind: 'pdf', label: 'filterPdf', extensions: ['pdf'] },
  { kind: 'html', label: 'filterHtml', extensions: ['html', 'htm'] },
  { kind: 'md', label: 'filterMarkdown', extensions: ['md', 'markdown'] },
  { kind: 'png', label: 'filterPageImages', extensions: ['png'] },
]

/**
 * The dialog's filters: the document's own format first (the dialog's
 * default), then the other native format, then — for Save As — every export.
 */
export function saveAsFilters(
  current: DocFormat,
  offerExports: boolean,
  label: (key: SaveAsLabelKey) => string,
): SaveAsFilter[] {
  const word = { name: label('filterWord'), extensions: ['docx'] }
  const odt = { name: label('filterOdt'), extensions: ['odt'] }
  const native = current === 'odt' ? [odt, word] : [word, odt]
  if (!offerExports) return native
  return [
    ...native,
    ...EXPORT_KINDS.map((k) => ({ name: label(k.label), extensions: k.extensions })),
  ]
}

/**
 * With exports offered the suggestion carries no document extension, so the
 * file type chosen in the dialog supplies one (a typed name keeps its own).
 */
export function saveAsDefaultPath(suggestion: string, offerExports: boolean): string {
  return offerExports ? suggestion.replace(/\.(?:docx|odt)$/i, '') : suggestion
}

/**
 * What the dialog's answer means. A Word or ODT extension saves the document;
 * with exports offered, a known export extension writes that copy. Anything
 * else — a bare name from a dialog that does not add the chosen type's
 * extension (some Linux desktops), or an unknown extension — is saved in the
 * document's own format, as before.
 */
export function saveAsTarget(
  filePath: string,
  current: DocFormat,
  offerExports: boolean,
): { path: string; kind: SaveAsKind } {
  const native = docFormatOfPath(filePath)
  if (native) return { path: filePath, kind: native }
  if (offerExports) {
    const ext = /\.([^./\\]+)$/.exec(filePath)?.[1]?.toLowerCase()
    const hit = ext ? EXPORT_KINDS.find((k) => k.extensions.includes(ext)) : undefined
    if (hit) return { path: filePath, kind: hit.kind }
  }
  return { path: withDocExtension(filePath, current), kind: current }
}
