/**
 * An open drawing file: the original bytes, where the scene sits in them, and
 * the stored scene. Documents come only from `openDrawing` and the new-file
 * functions, so only a file that opened as `ok` can produce bytes to save.
 */
import LZString from 'lz-string'
import { locateNoteParts } from './note-layout'
import type { NoteLayout } from './note-layout'
import { parseEmbeddedFiles, parseTextElements, writeTextElements } from './note-sections'
import { asScene, sceneForEditor, sceneForSave } from './scene'
import type { SceneObject } from './scene'
import type {
  DrawingBlockEncoding,
  DrawingFormat,
  DrawingOpenStatus,
  DrawingScene,
  EmbeddedFileRef,
  SceneEdit,
} from './types'

/** Larger files are refused before decoding. Notes with many pictures stay far below. */
export const MAX_DRAWING_BYTES = 64 * 1024 * 1024

/** The plugin breaks compressed data into lines of this length, separated by a blank line. */
const COMPRESSED_LINE = 256

// strict, so broken bytes are never read as replacement characters and saved;
// the BOM stays in the text so a rewritten note keeps it
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const encoder = new TextEncoder()

export function decompressDrawing(content: string): string | null {
  const joined = content.replace(/[\r\n]/g, '')
  if (!joined) return null
  return LZString.decompressFromBase64(joined) || null
}

export function compressDrawing(json: string, eol: string, wrapped: boolean): string {
  const data = LZString.compressToBase64(json)
  if (!wrapped) return data
  const lines: string[] = []
  for (let i = 0; i < data.length; i += COMPRESSED_LINE) {
    lines.push(data.slice(i, i + COMPRESSED_LINE))
  }
  return lines.join(`${eol}${eol}`)
}

interface MarkdownSource {
  format: 'markdown'
  text: string
  layout: NoteLayout & { drawing: NonNullable<NoteLayout['drawing']> }
  /** the compressed block was broken into lines */
  wrapped: boolean
  noteTexts: Map<string, string>
  embedded: EmbeddedFileRef[]
}

interface JsonSource {
  format: 'json'
  /** the indent of the stored JSON, reused by a changed save */
  indent: string | number
}

type Source = MarkdownSource | JsonSource

const sealed = Symbol('drawing-document')

export class DrawingDocument {
  readonly #bytes: Uint8Array
  readonly #source: Source
  readonly #stored: SceneObject

  /** @internal use `openDrawing` or a new-file function */
  constructor(key: typeof sealed, bytes: Uint8Array, source: Source, stored: SceneObject) {
    if (key !== sealed) throw new Error('DrawingDocument is created by openDrawing only')
    this.#bytes = bytes
    this.#source = source
    this.#stored = stored
  }

  get format(): DrawingFormat {
    return this.#source.format
  }

  /** How a note stores its scene; undefined for a plain `.excalidraw` file. */
  get blockEncoding(): DrawingBlockEncoding | undefined {
    return this.#source.format === 'markdown' ? this.#source.layout.drawing.encoding : undefined
  }

  /** The bytes the file had when it opened (or the new file's bytes). */
  get originalBytes(): Uint8Array {
    return this.#bytes.slice()
  }

  /** A fresh copy of the scene for the editor, with a note's listed texts applied. */
  scene(): DrawingScene {
    const texts = this.#source.format === 'markdown' ? this.#source.noteTexts : undefined
    return sceneForEditor(this.#stored, texts)
  }

  /** Pictures a note points at by file id. Empty for a plain `.excalidraw` file. */
  embeddedFiles(): EmbeddedFileRef[] {
    return this.#source.format === 'markdown'
      ? this.#source.embedded.map((ref) => ({ ...ref }))
      : []
  }

  /**
   * The bytes to write. With no edit (nothing changed since the file opened)
   * these are the original bytes. A note keeps every byte outside its text
   * list and drawing block; a picture the note only points at is never copied
   * into the file.
   */
  save(edit: SceneEdit | null): Uint8Array {
    if (!edit) return this.#bytes.slice()
    const source = this.#source
    if (source.format === 'json') {
      const out = sceneForSave(this.#stored, edit)
      return encoder.encode(`${JSON.stringify(out, null, source.indent)}\n`)
    }
    const pointedAt = new Set(source.embedded.map((ref) => ref.fileId))
    const files = edit.files
      ? Object.fromEntries(Object.entries(edit.files).filter(([id]) => !pointedAt.has(id)))
      : undefined
    const out = sceneForSave(this.#stored, { ...edit, files })
    return encoder.encode(rewriteNote(source, out))
  }
}

/** The note with its drawing block (and text list, when there is one) rewritten. */
function rewriteNote(source: MarkdownSource, scene: SceneObject): string {
  const { text, layout, wrapped } = source
  const { eol, drawing } = layout
  const json = JSON.stringify(scene, null, '\t')
  const content =
    drawing.encoding === 'compressed-json'
      ? compressDrawing(json, eol, wrapped)
      : json.replace(/\n/g, eol)
  // spans are replaced back to front so the earlier offsets stay valid
  let out = text.slice(0, drawing.start) + content + text.slice(drawing.end)
  const list = layout.textElements
  if (list && list.end <= drawing.start) {
    out = out.slice(0, list.start) + writeTextElements(scene.elements, eol) + out.slice(list.end)
  }
  return out
}

export type OpenDrawingResult =
  | { status: 'ok'; document: DrawingDocument }
  | { status: Exclude<DrawingOpenStatus, 'ok'>; detail: string }

function fail(status: Exclude<DrawingOpenStatus, 'ok'>, detail: string): OpenDrawingResult {
  return { status, detail }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The indent of a JSON text: the leading whitespace of its second line. */
function jsonIndent(text: string): string | number {
  const second = /\n([ \t]+)\S/.exec(text)
  return second ? second[1]! : 2
}

function openMarkdown(bytes: Uint8Array, text: string): OpenDrawingResult {
  const layout = locateNoteParts(text)
  if (!layout.drawing) {
    return layout.markedByFrontMatter
      ? fail('unreadable', 'the note is marked as a drawing but has no Drawing block')
      : fail('not-a-drawing', 'no Excalidraw front matter and no Drawing block')
  }
  const raw = text.slice(layout.drawing.start, layout.drawing.end)
  const json = layout.drawing.encoding === 'compressed-json' ? decompressDrawing(raw) : raw
  if (json === null) return fail('unreadable', 'the Drawing block does not decompress')
  const scene = asScene(parseJson(json))
  if (scene === 'not-a-drawing') return fail('unreadable', 'the Drawing block is not a scene')
  if (scene === 'unreadable') return fail('unreadable', 'the Drawing block has malformed elements')
  const list = layout.textElements
  const files = layout.embeddedFiles
  const source: MarkdownSource = {
    format: 'markdown',
    text,
    layout: { ...layout, drawing: layout.drawing },
    wrapped: /[\r\n]/.test(raw.trim()),
    noteTexts: list ? parseTextElements(text.slice(list.start, list.end)) : new Map(),
    embedded: files ? parseEmbeddedFiles(text.slice(files.start, files.end)) : [],
  }
  return { status: 'ok', document: new DrawingDocument(sealed, bytes, source, scene) }
}

function openJson(bytes: Uint8Array, text: string): OpenDrawingResult {
  const parsed = parseJson(text.replace(/^\uFEFF/, ''))
  if (parsed === undefined) return fail('unreadable', 'the file is not JSON')
  const scene = asScene(parsed)
  if (scene === 'not-a-drawing') return fail('not-a-drawing', 'the JSON is not an Excalidraw scene')
  if (scene === 'unreadable') return fail('unreadable', 'the scene has malformed elements')
  const source: JsonSource = { format: 'json', indent: jsonIndent(text) }
  return { status: 'ok', document: new DrawingDocument(sealed, bytes, source, scene) }
}

/**
 * Open a drawing file. `format` follows the file name: `markdown` for an
 * Obsidian note (`.md`), `json` for `.excalidraw`.
 */
export function openDrawing(bytes: Uint8Array, format: DrawingFormat): OpenDrawingResult {
  if (bytes.byteLength > MAX_DRAWING_BYTES) {
    return fail('too-large', `the file is over ${MAX_DRAWING_BYTES} bytes`)
  }
  let text: string
  try {
    text = decoder.decode(bytes)
  } catch {
    return fail('unreadable', 'the file is not UTF-8')
  }
  return format === 'markdown' ? openMarkdown(bytes, text) : openJson(bytes, text)
}

/** True when the text looks like an Obsidian Excalidraw note (front matter key or a Drawing block). */
export function looksLikeDrawingNote(text: string): boolean {
  const layout = locateNoteParts(text)
  return layout.markedByFrontMatter || layout.drawing !== undefined
}

/** @internal the new-file functions open what they build through the same path */
export function openBuilt(bytes: Uint8Array, format: DrawingFormat): DrawingDocument {
  const opened = openDrawing(bytes, format)
  if (opened.status !== 'ok') throw new Error(`a new drawing did not open: ${opened.detail}`)
  return opened.document
}
