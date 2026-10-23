/**
 * The names a drawing is saved under.
 */
import type { DrawingFormat } from '@genoffice/excalidraw-engine'

/** The name a new note is saved with: Obsidian's own naming. */
export const NOTE_EXTENSION = '.excalidraw.md'
export const SCENE_EXTENSION = '.excalidraw'

/**
 * The picked name with the format's extension. A note may be any `.md`
 * (Obsidian reads the front matter, not the name); a bare name gets
 * `.excalidraw.md`, Obsidian's own naming.
 */
export function withDrawingExtension(path: string, format: DrawingFormat): string {
  if (format === 'json') return /\.excalidraw$/i.test(path) ? path : `${path}${SCENE_EXTENSION}`
  if (/\.md$/i.test(path)) return path
  return /\.excalidraw$/i.test(path) ? `${path}.md` : `${path}${NOTE_EXTENSION}`
}
