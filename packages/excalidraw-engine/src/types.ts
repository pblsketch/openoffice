/**
 * The shapes the engine hands out. Elements, app state and files are kept as
 * loose records: the engine never closes them, so keys it does not know travel
 * through a save untouched.
 */

/** One drawing element as stored in the file. Only `id` and `type` are checked. */
export interface DrawingElement {
  id: string
  type: string
  isDeleted?: boolean
  [key: string]: unknown
}

/** The scene stored in a file: what the editor shows and edits. */
export interface DrawingScene {
  elements: DrawingElement[]
  appState: Record<string, unknown>
  /** binary files by id (pictures pasted into a plain `.excalidraw` file) */
  files: Record<string, unknown>
}

/**
 * Where the drawing lives in its file.
 *
 * - `markdown`: an Obsidian Excalidraw note. The scene is the JSON in the
 *   `Drawing` code block (compressed or plain); the rest of the note is the
 *   user's and is kept byte for byte.
 * - `json`: a plain `.excalidraw` file, the whole file is the scene.
 */
export type DrawingFormat = 'markdown' | 'json'

/** How the scene JSON is stored inside an Obsidian note's `Drawing` block. */
export type DrawingBlockEncoding = 'compressed-json' | 'json'

/**
 * A picture an Obsidian note points at instead of carrying it: one line of the
 * `Embedded Files` section, `<fileId>: <target>`.
 */
export interface EmbeddedFileRef {
  fileId: string
  /** the target as written in the note, without the `[[ ]]` or `( )` */
  target: string
  /**
   * `wiki` for `[[note or picture]]` (vault-relative or a bare name),
   * `link` for `[label](url)`, `formula` for `$$latex$$`, `other` for anything else.
   */
  kind: 'wiki' | 'link' | 'formula' | 'other'
}

/**
 * The edited scene the editor hands back for a save. App state is merged over
 * the stored one, so keys the editor does not report stay as they were.
 */
export interface SceneEdit {
  elements: readonly DrawingElement[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

/**
 * How a file opened. Only `ok` leads to a document; every other value is shown
 * as a message and nothing is ever written to that file.
 *
 * - `not-a-drawing`: a markdown file without the Excalidraw front matter or a
 *   `Drawing` block, or a JSON file that is not an Excalidraw scene.
 * - `unreadable`: not UTF-8, a block that does not decompress, JSON that does
 *   not parse or a scene whose elements are not objects with an id and a type.
 * - `too-large`: over `MAX_DRAWING_BYTES`.
 */
export type DrawingOpenStatus = 'ok' | 'not-a-drawing' | 'unreadable' | 'too-large'
