import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import {
  detectDiagramFormat,
  extractDiagramXml,
  formatDiagramText,
  openDiagram,
  type DiagramFormat,
  type DiagramOpenFailure,
} from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { ATTACHABLE_MAX_BYTES, diagramPictureExtOfName, type DiagramPictureExt } from './attachable'

/** The diagram format of a file name; `null` for any other name, `.vsdx` included (not read here). */
export function diagramFormatOf(filePath: string): DiagramFormat | null {
  const format = detectDiagramFormat(basename(filePath))
  return format === 'vsdx' ? null : format
}

/**
 * A draw.io file to the read table of all its pages (the text the diagram
 * editor's own AI reads), or why it does not open. A `.drawio.svg`/`.drawio.png`
 * without the diagram inside fails with `no_original`; the caller treats it as
 * the picture it is.
 */
export function readDiagramText(
  fileName: string,
  bytes: Uint8Array,
): { ok: true; text: string } | DiagramOpenFailure {
  const opened = openDiagram(basename(fileName), bytes, nodePageCodec)
  if (!opened.ok) return opened
  return { ok: true, text: formatDiagramText(opened.file.state) }
}

/** Diagram text for `parseFileToText`; throws when the diagram does not open. */
export function diagramToText(fileName: string, bytes: Uint8Array): string {
  const read = readDiagramText(fileName, bytes)
  if (!read.ok) throw new Error(`Cannot read diagram (${read.reason}): ${read.message}`)
  return read.text
}

/**
 * The attachment extension of a draw.io picture: `drawio.svg`/`drawio.png` when
 * the file is named so and holds its diagram, so editors read it as diagram
 * text, not as a picture. `null` for every other file, and for a picture that
 * only carries the name (it stays a picture). A file that cannot be read, or is
 * past the attachment cap, keeps its diagram name; the text reader then
 * reports why it fails. Reads the file (synchronously) only for these two names.
 */
export function diagramPictureExtOf(filePath: string): DiagramPictureExt | null {
  const ext = diagramPictureExtOfName(basename(filePath))
  if (!ext) return null
  try {
    if (statSync(filePath).size > ATTACHABLE_MAX_BYTES) return ext
    const extracted = extractDiagramXml(basename(filePath), readFileSync(filePath), nodePageCodec)
    return !extracted.ok && extracted.reason === 'no_original' ? null : ext
  } catch {
    return ext
  }
}
