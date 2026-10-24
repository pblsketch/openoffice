/**
 * Which Drive files the app can open, and how. Office, PDF, Markdown, HTML,
 * mind map, Hangul and EPUB files download as they are; Google's own documents have
 * no file to download and are exported to the matching Office format.
 */

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** Google's own formats and the Office file each one is exported to */
export const GOOGLE_EXPORTS: Readonly<Record<string, { mime: string; extension: string }>> = {
  'application/vnd.google-apps.document': { mime: DOCX_MIME, extension: '.docx' },
  'application/vnd.google-apps.spreadsheet': { mime: XLSX_MIME, extension: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: PPTX_MIME, extension: '.pptx' },
}

/** Extensions the app's editors open; a Drive file outside this list is listed but not opened */
export const OPENABLE_EXTENSIONS: readonly string[] = [
  // the same set the shell routes to an editor (apps/shell/src/main/app-routing.ts)
  '.docx',
  '.xlsx',
  '.xlsm',
  '.xls',
  '.csv',
  '.tsv',
  '.pptx',
  '.pdf',
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.html',
  '.htm',
  '.xmind',
  '.hwp',
  '.hwpx',
  '.epub',
]

/** The upload type for an extension the app saves; octet-stream lets Drive keep its own guess */
const UPLOAD_MIME: Readonly<Record<string, string>> = {
  '.docx': DOCX_MIME,
  '.xlsx': XLSX_MIME,
  '.pptx': PPTX_MIME,
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
}

export function isGoogleNative(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.')
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/**
 * How the app gets a file's bytes: download as is, export to Office, or not at
 * all (folders, forms, drawings, and formats no editor opens).
 */
export type OpenPlan =
  | { kind: 'download'; extension: string }
  | { kind: 'export'; mime: string; extension: string }
  | { kind: 'none' }

export function openPlan(file: { name: string; mimeType: string }): OpenPlan {
  const exported = GOOGLE_EXPORTS[file.mimeType]
  if (exported) return { kind: 'export', mime: exported.mime, extension: exported.extension }
  if (isGoogleNative(file.mimeType)) return { kind: 'none' }
  const extension = extensionOf(file.name)
  return OPENABLE_EXTENSIONS.includes(extension)
    ? { kind: 'download', extension }
    : { kind: 'none' }
}

export function uploadMime(name: string): string {
  return UPLOAD_MIME[extensionOf(name)] ?? 'application/octet-stream'
}

/**
 * The name a local copy gets: the Drive name, made safe for Windows, ending
 * in the extension the bytes really have (an exported Google document gets
 * `.docx` and so on). Drive allows names Windows does not.
 */
export function localFileName(driveName: string, extension: string): string {
  const cleaned = driveName
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/[. ]+$/, '')
    .trim()
  const base = extensionOf(cleaned) === extension ? cleaned.slice(0, -extension.length) : cleaned
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)
  const safe = (reserved ? `_${base}` : base).slice(0, 120) || 'document'
  return `${safe}${extension}`
}

/** The Office copy a Google document is saved to: same name with the Office extension */
export function officeCopyName(driveName: string, extension: string): string {
  return extensionOf(driveName) === extension ? driveName : `${driveName}${extension}`
}
