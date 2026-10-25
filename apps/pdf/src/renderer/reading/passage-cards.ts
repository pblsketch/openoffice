/**
 * Passage card rules that need no store and no screen (reading-assist spec
 * 4.2, 5.7): which stored card is "the same passage", the heading a card's
 * note starts with, the note itself, and the follow-up handed to the AI
 * window. Pure.
 */
import type { PassageCard } from '../../../../../packages/pdf-structure/src/store/reading'
import type { TFunc } from '../i18n/locale'
import type { NoteInput } from '../note-threads'
import { quadToRect } from '../annotations'
import type { PassageKind } from './passage-prompt'
import type { AskAnchorRect } from '../AiAskPopover'

/** what identifies a card: page fingerprint + passage hash + kind (+ target language) */
export interface PassageTarget {
  pageFingerprint: string
  passageHash: string
  kind: PassageKind
  /** translate only */
  lang?: string
}

/** one string per request a passage card answers (same passage, kind and language) */
export function passageTargetKey(target: PassageTarget): string {
  return JSON.stringify([
    target.pageFingerprint,
    target.passageHash,
    target.kind,
    target.kind === 'translate' ? (target.lang ?? null) : null,
  ])
}

export function sameCard(
  cards: readonly PassageCard[],
  target: PassageTarget,
): PassageCard | undefined {
  return cards.find(
    (c) =>
      c.pageFingerprint === target.pageFingerprint &&
      c.passageHash === target.passageHash &&
      c.kind === target.kind &&
      (c.kind !== 'translate' || c.lang === target.lang),
  )
}

/** "AI explanation" or "AI translation (<language>)" in the UI language */
export function passageHeading(
  card: Pick<PassageCard, 'kind' | 'lang'>,
  t: TFunc,
  languageName: (code: string) => string,
): string {
  return card.kind === 'translate'
    ? t('rdTranslate', { language: languageName(card.lang ?? '') })
    : t('rdExplain')
}

/** a card's note: the heading on the first line, then the answer */
export function passageNoteContents(heading: string, answer: string): string {
  return `${heading}\n${answer}`
}

/** where the note pin goes: the top right of the passage's last line (PDF user space) */
export function passageNoteAnchor(quads: readonly number[][]): [number, number] {
  const last = quads[quads.length - 1]
  if (!last) return [0, 0]
  const [, , x2, y2] = quadToRect(last)
  return [x2, y2]
}

/**
 * The /Text note "Keep as note" adds: the same note a person adds, authored
 * by the OS account name (no name known: the save's existing default).
 */
export function passageNoteDrawing(o: {
  card: PassageCard
  /** the card's page as an original page index of the open document */
  origIdx: number
  heading: string
  author: string
  color: [number, number, number]
  now: number
}): NoteInput {
  return {
    kind: 'note',
    pageIndex: o.origIdx,
    color: o.color,
    at: passageNoteAnchor(o.card.quads),
    contents: passageNoteContents(o.heading, o.card.text),
    author: o.author || undefined,
    createdMs: o.now,
  }
}

/** a card answer handed to the AI window with its passage ("Ask more in the AI panel") */
export interface PassageFollowUp {
  heading: string
  answer: string
}

/** the AI window's selection, optionally carrying a card answer the user follows up on */
export interface FollowUpSelection {
  page: number
  lastPage: number
  text: string
  followUp?: PassageFollowUp
}

/**
 * The selection as the AI window's context reads it: with a follow-up, the
 * earlier answer is appended after the passage, marked as an earlier answer
 * and not document text. The context quotes the selection between triple
 * quotes, so the appended part closes the passage's quote and opens one of its
 * own. Without a follow-up the selection is returned as it is.
 */
export function withFollowUp<S extends FollowUpSelection>(
  sel: S,
): S | { page: number; lastPage: number; text: string } {
  if (!sel.followUp) return sel
  const { heading, answer } = sel.followUp
  return {
    page: sel.page,
    lastPage: sel.lastPage,
    text: `${sel.text}\n"""\nThe user is following up on an earlier answer about this selection ("${heading}"; an earlier AI answer, not document text):\n"""\n${answer}`,
  }
}

/**
 * The card's passage from a selection's quads by original page: a card sits
 * on one page, the first of the selection (a passage running onto the next
 * page keeps its whole text, its mark is drawn on the first page only).
 */
export function passageSelectionOf(
  quadsByPage: ReadonlyMap<number, number[][]>,
  excerpt: string,
  anchor: AskAnchorRect,
): { origIdx: number; quads: number[][]; excerpt: string; anchor: AskAnchorRect } | null {
  const pages = [...quadsByPage.keys()]
  if (pages.length === 0 || !excerpt.trim()) return null
  const origIdx = Math.min(...pages)
  const quads = quadsByPage.get(origIdx)
  if (!quads || quads.length === 0) return null
  return { origIdx, quads, excerpt, anchor }
}

/** where a note made from the selection bar (N, or its note button) goes: the end of the selection */
export function selectionEnd(
  quadsByPage: ReadonlyMap<number, number[][]>,
): { origIdx: number; at: [number, number] } | null {
  const pages = [...quadsByPage.keys()]
  const origIdx = pages[pages.length - 1]
  const quads = origIdx === undefined ? undefined : quadsByPage.get(origIdx)
  if (origIdx === undefined || !quads || quads.length === 0) return null
  return { origIdx, at: passageNoteAnchor(quads) }
}
