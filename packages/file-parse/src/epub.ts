import { extractChapterText, openEpub, type EpubRefusalReason } from '@genoffice/epub-engine/core'

/** What each refusal tells the reader (spec §3), in the order the engine checks. */
const REFUSALS: Record<EpubRefusalReason, string> = {
  'too-large': 'Cannot read EPUB: the file is too large to unpack safely',
  damaged: 'Cannot read EPUB: the file is damaged',
  'not-epub': 'Cannot read EPUB: not an EPUB file, or a damaged one',
  drm: 'Copy-protected EPUB: the book is protected by DRM and cannot be read; open it in the app of the store it was bought from',
}

/**
 * Book to plain text: every spine item's text in spine order, headings as `#`
 * lines, a blank line between chapters (the engine's chapter text; a chapter
 * that is not well-formed XML is read with an HTML parser there). The engine
 * runs the zip gate before it inflates anything. Throws for a book that does
 * not open: refused by the gate, not an EPUB, or copy-protected.
 *
 * A chapter whose bytes are not valid text is left out behind a marker rather
 * than handed on as replacement characters, and a book with no chapter that
 * decodes is refused: garbled text never reaches the index or a model.
 */
export async function epubToText(bytes: Uint8Array): Promise<string> {
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error(`${REFUSALS[opened.reason]} (${opened.detail})`)
  const { book } = opened
  const parts: string[] = []
  let decoded = 0
  for (const item of book.spine.items) {
    const source = await book.readText(item.path)
    if (source === null) continue
    if (!source.valid) {
      parts.push(
        `[Chapter ${item.index + 1} (${item.path}) left out: its bytes are not valid ${source.encoding} text]`,
      )
      continue
    }
    decoded++
    const text = extractChapterText(source.text)
    if (text) parts.push(text)
  }
  if (decoded === 0) {
    throw new Error('Cannot read EPUB: no chapter decodes as text (the book may be copy-protected)')
  }
  return parts.join('\n\n')
}
