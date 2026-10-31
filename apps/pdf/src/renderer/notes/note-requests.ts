/**
 * What "Add to note" sends for each kind of item (reading-assist spec 4.9):
 * text parts only. The main process knows the view's PDF and its note and
 * builds the inserted Markdown (quote with the page link, body, or the
 * overview heading). Pages are the PDF file's own: an original page index + 1,
 * which is where `#page=N` lands in any viewer.
 */
import type { PdfNoteInsertRequest, PdfNoteResult } from '../../shared/ipc'
import type { PassageCard } from '../../../../../packages/pdf-structure/src/store/reading'
import type { InsightsSectionText } from '../ai/insights/InsightsCard'
import type { AnnotItem } from '../annot-panel/items'
import type { TFunc } from '../i18n/locale'

const withTitle = (title: string | undefined) => (title?.trim() ? { title: title.trim() } : {})

/** a passage card: its passage quoted, its answer as the body */
export function cardNoteRequest(
  card: Pick<PassageCard, 'excerpt' | 'text' | 'page'>,
  /** the card's original page index in the open file (found by fingerprint); null when unknown */
  origIdx: number | null,
  title?: string,
): PdfNoteInsertRequest {
  return {
    kind: 'quote',
    excerpt: card.excerpt,
    page: origIdx !== null ? origIdx + 1 : card.page,
    body: card.text,
    ...withTitle(title),
  }
}

const MARKUPS = new Set(['highlight', 'underline', 'squiggly', 'strikeout'])

/** an annotation panel item; null for items that cannot go to the note (no page, drawings, suggestions) */
export function annotNoteRequest(item: AnnotItem, title?: string): PdfNoteInsertRequest | null {
  if (item.page === null || item.notFound) return null
  const page = item.page + 1
  if (MARKUPS.has(item.kind)) {
    return { kind: 'quote', excerpt: item.text, page, ...withTitle(title) }
  }
  if (item.kind === 'note') {
    const memo = [item.memo ?? item.text, ...(item.replyTexts ?? [])]
      .map((text) => text.trim())
      .filter(Boolean)
      .join('\n\n')
    return { kind: 'quote', excerpt: '', page, body: memo, ...withTitle(title) }
  }
  if (item.kind === 'card') {
    return { kind: 'quote', excerpt: item.text, page, body: item.body ?? '', ...withTitle(title) }
  }
  return null
}

/** an overview section, under the overview's own heading */
export function overviewNoteRequest(
  section: Pick<InsightsSectionText, 'text'>,
  heading: string,
  title?: string,
): PdfNoteInsertRequest | null {
  if (!section.text.trim()) return null
  return { kind: 'overview', heading, body: section.text, ...withTitle(title) }
}

/** the notice after a note call; null when nothing needs saying (a cancelled dialog, a second click) */
export function noteResultNotice(
  result: PdfNoteResult,
  t: TFunc,
  action: 'open' | 'insert',
): string | null {
  if (result.ok) return action === 'insert' ? t('ntInserted') : null
  switch (result.reason) {
    case 'unsaved':
      return t('ntSaveFirst')
    case 'unavailable':
      return t('ntUnavailable')
    case 'cancelled':
    case 'busy':
      return null
    default:
      return t('ntFailed', { reason: result.message ?? '' }).trim()
  }
}
