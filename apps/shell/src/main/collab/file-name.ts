/**
 * The name a shared copy is written under on the guest's PC. It comes from
 * the other PC, so it is reduced to a plain file name, and its extension has
 * to be one the session's editor opens: anything else becomes `document.<ext>`.
 */
import type { CollabKind } from '@genoffice/electron-utils/collab-channels'

const EXTENSIONS: Record<CollabKind, readonly string[]> = {
  docs: ['.docx', '.odt'],
  sheets: ['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'],
  slides: ['.pptx'],
  pdf: ['.pdf'],
  markdown: ['.md', '.markdown', '.txt', '.json'],
  html: ['.html', '.htm'],
  mindmap: ['.xmind'],
  hwp: ['.hwp', '.hwpx'],
  epub: ['.epub'],
}

const MAX_STEM = 120

export function collabFileName(raw: unknown, kind: CollabKind): string {
  const allowed = EXTENSIONS[kind]
  const fallback = `document${allowed[0]}`
  if (typeof raw !== 'string') return fallback
  const base = raw.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''
  if (!allowed.includes(ext)) return fallback
  const stem = base
    .slice(0, dot)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, MAX_STEM)
  // names Windows reserves for devices cannot be files
  if (!stem || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) return fallback
  return `${stem}${ext}`
}
