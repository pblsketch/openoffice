/**
 * Finding text in the whole book (spec §4 "in-book search"): every chapter,
 * read-only ones included, in spine order. A hit is an offset into the
 * chapter's reading text, the text of its drawing copy with white space
 * collapsed. The same text built from the chapter frame's document maps a hit
 * back to a DOM range there, because the frame shows that same copy.
 */
import { findInText } from '@genoffice/ui'

/** Text that is not read: styles, ruby annotations and the like. */
const SKIPPED = new Set(['style', 'script', 'noscript', 'template', 'title', 'rt', 'rp'])

/** Elements that start a new line of reading: a space separates their text from the text before. */
const BREAKING = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

/** The reading text of a subtree, with where each of its characters is in the DOM. */
export interface TextIndex {
  text: string
  nodes: Text[]
  /** per character of `text`: index into `nodes` */
  nodeOf: number[]
  /** per character of `text`: offset in that node */
  offsetOf: number[]
}

const SPACE = /\s/

export function buildTextIndex(root: Node): TextIndex {
  const index: TextIndex = { text: '', nodes: [], nodeOf: [], offsetOf: [] }
  const parts: string[] = []
  let last = ''
  let pendingBreak = false

  const push = (ch: string, node: number, offset: number): void => {
    parts.push(ch)
    index.nodeOf.push(node)
    index.offsetOf.push(offset)
    last = ch
  }

  const visit = (node: Node): void => {
    if (node.nodeType === 3 /* text */) {
      const text = (node as Text).data
      let nodeIndex = -1
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!
        if (SPACE.test(ch)) {
          if (last !== '' && last !== ' ') pendingBreak = true
          continue
        }
        if (nodeIndex < 0) {
          nodeIndex = index.nodes.length
          index.nodes.push(node as Text)
        }
        if (pendingBreak && last !== '' && last !== ' ') push(' ', nodeIndex, i)
        pendingBreak = false
        push(ch, nodeIndex, i)
      }
      return
    }
    if (node.nodeType !== 1 /* element */) return
    const name = (node as Element).localName.toLowerCase()
    if (SKIPPED.has(name)) return
    const breaking = BREAKING.has(name)
    if (breaking) pendingBreak = true
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child)
    if (breaking) pendingBreak = true
  }

  visit(root)
  index.text = parts.join('')
  return index
}

/** The DOM range of `length` characters of the reading text from `start`; null when out of range. */
export function rangeOf(
  doc: Document,
  index: TextIndex,
  start: number,
  length: number,
): Range | null {
  const endChar = start + length - 1
  if (length <= 0 || start < 0 || endChar >= index.text.length) return null
  const range = doc.createRange()
  range.setStart(index.nodes[index.nodeOf[start]!]!, index.offsetOf[start]!)
  range.setEnd(index.nodes[index.nodeOf[endChar]!]!, index.offsetOf[endChar]! + 1)
  return range
}

/** White space in what was typed counts as one space, as in the reading text. */
export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

export interface BookSearchHit {
  spineIndex: number
  /** offset in the chapter's reading text */
  start: number
  length: number
  before: string
  match: string
  after: string
}

export interface BookSearchResult {
  hits: BookSearchHit[]
  /** more hits were found than `limit` */
  truncated: boolean
  /** chapters whose text could not be read */
  unreadable: number[]
  /** a newer search took over; the result is partial */
  cancelled: boolean
}

export interface BookSearchOptions {
  query: string
  chapterCount: number
  /** the reading text of a chapter; null when it could not be read */
  chapterText(spineIndex: number): Promise<string | null>
  /** most hits listed */
  limit?: number
  /** characters of context on each side */
  context?: number
  isCancelled?(): boolean
  onProgress?(done: number, total: number): void
}

export const SEARCH_LIMIT = 500

/** Searches every chapter in spine order, case-insensitively. */
export async function searchBook(options: BookSearchOptions): Promise<BookSearchResult> {
  const query = normalizeQuery(options.query)
  const limit = options.limit ?? SEARCH_LIMIT
  const context = options.context ?? 30
  const result: BookSearchResult = { hits: [], truncated: false, unreadable: [], cancelled: false }
  if (!query) return result
  for (let i = 0; i < options.chapterCount; i++) {
    if (options.isCancelled?.()) {
      result.cancelled = true
      return result
    }
    const text = await options.chapterText(i)
    if (text === null) {
      result.unreadable.push(i)
    } else {
      for (const start of findInText(text, query, { matchCase: false, wholeWord: false })) {
        if (result.hits.length >= limit) {
          result.truncated = true
          break
        }
        result.hits.push({
          spineIndex: i,
          start,
          length: query.length,
          before: text.slice(Math.max(0, start - context), start),
          match: text.slice(start, start + query.length),
          after: text.slice(start + query.length, start + query.length + context),
        })
      }
    }
    options.onProgress?.(i + 1, options.chapterCount)
    if (result.truncated) break
  }
  return result
}
