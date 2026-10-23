/**
 * Which file names are drawings. Obsidian names a new drawing
 * `<name>.excalidraw.md`; the Excalidraw web app saves `<name>.excalidraw`.
 * A plain `.md` can be a drawing too (renamed in Obsidian); that is decided by
 * its content (`looksLikeDrawingNote`), not here.
 */
import type { DrawingFormat } from './types'

const NOTE_NAME = /\.excalidraw\.md$/i
const SCENE_NAME = /\.excalidraw$/i

export function isDrawingPath(path: string): boolean {
  return NOTE_NAME.test(path) || SCENE_NAME.test(path)
}

/** The format a drawing path is opened in: a note for any `.md`, a scene for `.excalidraw`. */
export function drawingFormatOfPath(path: string): DrawingFormat {
  return SCENE_NAME.test(path) ? 'json' : 'markdown'
}
