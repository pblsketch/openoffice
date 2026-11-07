import { isRecord } from './types'

/**
 * A topic's note as plain text, or null when it has none.
 *
 * A note can hold a plain form and a rich (HTML) form side by side. The plain
 * one is used as stored; a note that only has the rich form is reduced to its
 * text, so it can still be read and edited as plain text.
 */
export function noteText(notes: unknown): string | null {
  if (!isRecord(notes)) return null
  const plain = contentOf(notes.plain)
  if (plain !== null) return plain
  // The engine writes `realHTML`; XMind 8 and some exported maps store `html`.
  const rich = contentOf(notes.realHTML) ?? contentOf(notes.html)
  return rich === null ? null : htmlToPlainText(rich)
}

function contentOf(form: unknown): string | null {
  return isRecord(form) && typeof form.content === 'string' ? form.content : null
}

const ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

/**
 * The text of a rich note: one line per block, tags dropped, entities decoded.
 * Works on the string alone, because the engine has no DOM to lean on.
 */
export function htmlToPlainText(html: string): string {
  return (
    html
      // a break that only holds an empty block open is not a second line
      .replace(/<br\s*\/?>(?=\s*<\/(?:div|p|li)\s*>)/gi, '')
      .replace(/<br\s*\/?>|<\/(?:div|p|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole: string, name: string) =>
        decodeEntity(name, whole),
      )
  )
}

function decodeEntity(name: string, whole: string): string {
  if (name.startsWith('#')) {
    const hex = name[1] === 'x' || name[1] === 'X'
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : whole
  }
  const key = name.toLowerCase()
  return Object.hasOwn(ENTITIES, key) ? ENTITIES[key]! : whole
}
