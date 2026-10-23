/**
 * New drawing files. A new note uses the plugin's current layout, so Obsidian
 * opens it as a drawing; a new `.excalidraw` file is the bare scene.
 */
import { PRODUCT_NAME } from '@genoffice/i18n'
import { compressDrawing, openBuilt } from './document'
import type { DrawingDocument } from './document'
import type { DrawingFormat } from './types'

/** The scene a new file starts with. */
function emptyScene(): Record<string, unknown> {
  return {
    type: 'excalidraw',
    version: 2,
    source: PRODUCT_NAME,
    elements: [],
    appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
    files: {},
  }
}

export function newDrawingNoteText(): string {
  const block = compressDrawing(JSON.stringify(emptyScene(), null, '\t'), '\n', true)
  return [
    '---',
    '',
    'excalidraw-plugin: parsed',
    'tags: [excalidraw]',
    '',
    '---',
    '',
    '# Excalidraw Data',
    '',
    '## Text Elements',
    '%%',
    '## Drawing',
    '```compressed-json',
    block,
    '```',
    '%%',
    '',
  ].join('\n')
}

/** A new, empty drawing in the given format. */
export function createDrawing(format: DrawingFormat): DrawingDocument {
  const text =
    format === 'markdown' ? newDrawingNoteText() : `${JSON.stringify(emptyScene(), null, 2)}\n`
  return openBuilt(new TextEncoder().encode(text), format)
}
