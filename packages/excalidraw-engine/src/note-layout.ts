/**
 * Where the drawing's parts sit inside an Obsidian Excalidraw note.
 *
 * The note is the user's text with the plugin's data appended. Two layouts are
 * in use: the current one puts `## Text Elements`, `## Embedded Files` and
 * `## Drawing` under `# Excalidraw Data`; older notes use `# Text Elements` and
 * `# Drawing`. Either way the drawing is a fenced block (`compressed-json` or
 * `json`) right under the `Drawing` heading, usually wrapped in `%%` comments.
 *
 * Only the offsets are found here. Everything outside the two spans that a
 * save rewrites (the text-element list and the drawing block's content) is
 * written back exactly as it was read.
 */
import type { DrawingBlockEncoding } from './types'

export interface TextSpan {
  /** offset of the first character after the heading line */
  start: number
  /** offset of the line that ends the section (next heading, `%%` or the end) */
  end: number
}

export interface DrawingBlock {
  encoding: DrawingBlockEncoding
  /** offset of the first character after the opening fence line */
  start: number
  /** offset of the line break before the closing fence */
  end: number
}

export interface NoteLayout {
  /** the note's line break, used for every line a save writes */
  eol: '\n' | '\r\n'
  /** the front matter carries the plugin's `excalidraw-plugin` key */
  markedByFrontMatter: boolean
  textElements?: TextSpan
  embeddedFiles?: TextSpan
  drawing?: DrawingBlock
}

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const PLUGIN_KEY = /^excalidraw-plugin[ \t]*:/m
/** a heading or a comment fence: where a data section ends */
const SECTION_END = /^(?:#{1,6}[ \t]|%%)/m

/** Every match of a heading regex, latest last. */
function headingMatches(text: string, title: string): RegExpExecArray[] {
  const re = new RegExp(`^#{1,2}[ \\t]+${title}[ \\t]*\\r?$`, 'gm')
  return [...text.matchAll(re)]
}

/** The offset just past the line that `match` ends on. */
function afterLine(text: string, match: RegExpExecArray): number {
  // the heading patterns end in `\r?$`, so a CR already belongs to the match
  const lineEnd = match.index + match[0].length
  return text[lineEnd] === '\n' ? lineEnd + 1 : lineEnd
}

function sectionAfter(text: string, heading: RegExpExecArray, limit: number): TextSpan {
  const start = afterLine(text, heading)
  const rest = text.slice(start, limit)
  const end = rest.search(SECTION_END)
  return { start, end: end < 0 ? limit : start + end }
}

/** The fenced block right under a `Drawing` heading, skipping blank lines. */
function blockAfter(text: string, heading: RegExpExecArray): DrawingBlock | undefined {
  const from = afterLine(text, heading)
  const open = /^(?:[ \t]*\r?\n)*```(compressed-json|json)[ \t]*\r?\n/.exec(text.slice(from))
  if (!open) return undefined
  const start = from + open[0].length
  const close = /\r?\n```[ \t]*(?:\r?\n|$)/.exec(text.slice(start))
  if (!close) return undefined
  return { encoding: open[1] as DrawingBlockEncoding, start, end: start + close.index }
}

export function locateNoteParts(text: string): NoteLayout {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n'
  const front = FRONT_MATTER.exec(text)
  const markedByFrontMatter = front ? PLUGIN_KEY.test(front[1] ?? '') : false
  const layout: NoteLayout = { eol, markedByFrontMatter }

  // The plugin appends its data at the end, so the last `Drawing` heading with
  // a block under it wins over one the user may have written in the note.
  const drawings = headingMatches(text, 'Drawing')
  let drawingAt = text.length
  for (let i = drawings.length - 1; i >= 0; i--) {
    const block = blockAfter(text, drawings[i]!)
    if (block) {
      layout.drawing = block
      drawingAt = drawings[i]!.index
      break
    }
  }

  const textHeading = headingMatches(text, 'Text Elements')
    .filter((m) => m.index < drawingAt)
    .at(-1)
  if (textHeading) layout.textElements = sectionAfter(text, textHeading, drawingAt)
  const filesHeading = headingMatches(text, 'Embedded Files')
    .filter((m) => m.index < drawingAt)
    .at(-1)
  if (filesHeading) layout.embeddedFiles = sectionAfter(text, filesHeading, drawingAt)
  return layout
}
