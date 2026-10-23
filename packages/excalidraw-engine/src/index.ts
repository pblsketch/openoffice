export * from './types'
export type { DrawingDocument, OpenDrawingResult } from './document'
export {
  MAX_DRAWING_BYTES,
  compressDrawing,
  decompressDrawing,
  looksLikeDrawingNote,
  openDrawing,
} from './document'
export { createDrawing, newDrawingNoteText } from './create'
export { locateNoteParts } from './note-layout'
export type { NoteLayout } from './note-layout'
export { parseEmbeddedFiles, parseTextElements } from './note-sections'
export { drawingFormatOfPath, isDrawingPath } from './paths'
