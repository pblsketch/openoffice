/** Labels: plain text out of draw.io's HTML labels, and plain text into them. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, ref: string) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) {
      return String.fromCodePoint(parseInt(ref.slice(2), 16))
    }
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
    return NAMED_ENTITIES[ref] ?? match
  })
}

/**
 * The text of an HTML label: `<br>` and block ends become line breaks, table
 * cells are tab-separated, other tags go, entities are decoded, and leading
 * or trailing line breaks are trimmed.
 */
export function htmlLabelToText(html: string): string {
  const text = html
    .replace(/\r\n?/g, '\n')
    // `<div><br></div>` is one empty line, not two.
    .replace(/<br\s*\/?>(?=<\/(?:div|p|li)\s*>)/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\/(?:td|th)\s*>/gi, '\t')
    .replace(/<(?:div|p|li|h[1-6]|tr)(?:\s[^>]*)?>/gi, (_match, offset: number, whole: string) =>
      offset > 0 && whole[offset - 1] !== '\n' ? '\n' : '',
    )
    .replace(/<[^>]*>/g, '')
  return decodeHtmlEntities(text)
    .replace(/\t+\n/g, '\n')
    .replace(/\t+$/g, '')
    .replace(/^\n+|\n+$/g, '')
}

/** The text of a cell label, whatever its kind. */
export function labelText(value: string, html: boolean): string {
  return html ? htmlLabelToText(value) : value.replace(/\r\n?/g, '\n')
}

/** Plain text written into an HTML label: escaped, line breaks as `<br>`. */
export function textToHtmlLabel(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>')
}

/** Plain text written into a cell whose style decides whether the label is HTML. */
export function textToLabel(text: string, html: boolean): string {
  return html ? textToHtmlLabel(text) : text.replace(/\r\n?/g, '\n')
}
