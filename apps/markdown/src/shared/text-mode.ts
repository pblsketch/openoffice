// plain text and JSON open as source: the block editor would reinterpret
// `---`, `*x*`, `1.` and normalise line endings, rewriting an unedited file
import { looksLikeDrawingNote } from '@genoffice/excalidraw-engine'

export type TextMode = 'markdown' | 'plain' | 'json'

const JSON_RE = /\.json$/i
const MARKDOWN_RE = /\.(md|markdown)$/i

/** 'markdown' for an untitled path: that is what New and AI auto-naming mean by it. */
export function textModeForPath(path: string | null | undefined): TextMode {
  if (!path) return 'markdown'
  if (JSON_RE.test(path)) return 'json'
  if (MARKDOWN_RE.test(path)) return 'markdown'
  return 'plain'
}

/**
 * The surface for a file's actual text. An Obsidian drawing note (Excalidraw)
 * is a `.md` whose data block the block editor would rewrite; when one is
 * opened here anyway it is edited as source, byte for byte. The shell sends
 * such notes to the drawing editor, so this is the fallback.
 */
export function textModeForContent(path: string | null | undefined, raw: string): TextMode {
  const mode = textModeForPath(path)
  return mode === 'markdown' && looksLikeDrawingNote(raw) ? 'plain' : mode
}

export function isSourceMode(mode: TextMode): boolean {
  return mode !== 'markdown'
}
