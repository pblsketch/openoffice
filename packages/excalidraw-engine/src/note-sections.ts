/**
 * The two plain-text sections of an Obsidian Excalidraw note.
 *
 * `Text Elements` lists every text on the canvas as `<text> ^<elementId>`,
 * entries separated by a blank line. Obsidian searches and links through it,
 * and the plugin reads it back over the JSON when the note opens, so text
 * edited in the note's markdown wins. This engine does the same on open and
 * rewrites the list from the scene on a changed save.
 *
 * `Embedded Files` maps a picture's file id to where the picture lives:
 * `<fileId>: [[picture.png]]`. It is only read here, never rewritten.
 */
import type { DrawingElement, EmbeddedFileRef } from './types'

/** ` ^id` at the end of a line closes one entry; ids are block-reference safe. */
const ENTRY_END = /[ \t]\^([A-Za-z0-9_-]+)[ \t]*(?=\r?\n|$)/g

/** Text of each listed element by id, as the note has it (LF line breaks). */
export function parseTextElements(body: string): Map<string, string> {
  const texts = new Map<string, string>()
  let from = 0
  for (const match of body.matchAll(ENTRY_END)) {
    const raw = body.slice(from, match.index)
    texts.set(match[1]!, raw.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\r\n/g, '\n'))
    from = match.index + match[0].length
  }
  return texts
}

/** The text an element shows, as the plugin lists it: the unwrapped source text. */
export function elementSourceText(element: DrawingElement): string | undefined {
  for (const key of ['rawText', 'originalText', 'text'] as const) {
    const value = element[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

/** The section body for a scene: one entry per live text element, in scene order. */
export function writeTextElements(elements: readonly DrawingElement[], eol: string): string {
  let body = ''
  for (const element of elements) {
    if (element.type !== 'text' || element.isDeleted === true) continue
    const text = elementSourceText(element)
    if (text === undefined) continue
    body += `${text.replace(/\r?\n/g, eol)} ^${element.id}${eol}${eol}`
  }
  return body
}

const EMBEDDED_LINE = /^([^\s:]+):[ \t]*(.+?)[ \t]*\r?$/gm

/** Wiki targets drop the `|alias` and `#heading` parts; only the file is looked up. */
function wikiTarget(inner: string): string {
  return inner.split('|')[0]!.split('#')[0]!.trim()
}

export function parseEmbeddedFiles(body: string): EmbeddedFileRef[] {
  const refs: EmbeddedFileRef[] = []
  for (const match of body.matchAll(EMBEDDED_LINE)) {
    const fileId = match[1]!
    const value = match[2]!
    const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(value)
    const link = /^!?\[[^\]]*\]\(([^)]+)\)$/.exec(value)
    if (wiki) refs.push({ fileId, target: wikiTarget(wiki[1]!), kind: 'wiki' })
    else if (link) refs.push({ fileId, target: link[1]!.trim(), kind: 'link' })
    else if (/^\$\$[\s\S]*\$\$$/.test(value)) refs.push({ fileId, target: value, kind: 'formula' })
    else refs.push({ fileId, target: value, kind: 'other' })
  }
  return refs
}
