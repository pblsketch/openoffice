/**
 * IR lines → inline runs: marks from the spans (bold / italic / link /
 * footnote marker), script-aware line joins and end-of-line hyphen repair.
 */
import type { Line, Span } from '../../../pdf2docx/src/ir'
import { isNoSpaceScript } from '../../../pdf2docx/src/script'
import { continuesWithParticle } from './korean'
import type { InlineRun, TextRun } from './types'

/** trailing hyphen glyphs (ASCII, soft hyphen, U+2010) */
const TRAILING_HYPHEN = /[-­‐]$/
/** a Latin letter, then a hyphen, at the end of a line */
const LATIN_THEN_HYPHEN = /\p{Script=Latin}[-­‐]$/u
const LOWER_LATIN = /^(?=\p{Script=Latin})\p{Ll}/u

export const lineText = (line: Line): string => line.spans.map((s) => s.text).join('')

/** `#_pdfpageN` in-document targets become `#page=N` in original numbering */
function mapHref(
  href: string,
  pageNumberOf: (index: number) => number | undefined,
): string | undefined {
  const m = /^#_pdfpage(\d+)$/.exec(href)
  if (!m) return href
  const original = pageNumberOf(Number(m[1]) - 1)
  return original === undefined ? undefined : `#page=${original}`
}

export interface RunContext {
  /** analyzed 0-based page index → original 1-based page number */
  pageNumberOf: (index: number) => number | undefined
  /** footnote ids known to the tree (markers to other ids stay markers too) */
  onNoteRef?: (id: string) => void
}

function pushText(runs: InlineRun[], run: TextRun): void {
  const last = runs[runs.length - 1]
  if (
    last?.kind === 'text' &&
    last.bold === run.bold &&
    last.italic === run.italic &&
    last.href === run.href
  ) {
    last.text += run.text
  } else {
    runs.push(run)
  }
}

function spanRun(span: Span, ctx: RunContext): TextRun {
  const run: TextRun = { kind: 'text', text: span.text }
  if (span.bold) run.bold = true
  if (span.italic) run.italic = true
  if (span.href) {
    const href = mapHref(span.href, ctx.pageNumberOf)
    if (href) run.href = href
  }
  return run
}

/** a seam hyphen splits one word: Latin letter + hyphen, then a lowercase Latin letter */
export function isSeamHyphenation(prev: Line, next: Line): boolean {
  if (prev.endsWithHyphen) return true
  const first = [...lineText(next).trimStart()][0]
  return (
    LATIN_THEN_HYPHEN.test(lineText(prev).trimEnd()) &&
    first !== undefined &&
    LOWER_LATIN.test(first)
  )
}

function lastTextRun(runs: InlineRun[]): TextRun | undefined {
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!
    if (r.kind === 'text') return r
    if (r.kind !== 'footnoteRef') return undefined
  }
  return undefined
}

/**
 * Flatten lines into runs. `seams` are line indexes that start a new source
 * page or column: there the IR never judged hyphenation, so the text rule
 * (Latin letter + hyphen, lowercase continuation) applies on top of the
 * IR's own `endsWithHyphen`. A hyphen before a capitalized continuation
 * stays and the halves join without a space ("x-" + "Ray").
 */
export function linesToRuns(
  lines: Line[],
  ctx: RunContext,
  seams: ReadonlySet<number> = new Set(),
): InlineRun[] {
  const runs: InlineRun[] = []
  for (const [i, line] of lines.entries()) {
    if (i > 0) {
      const prev = lines[i - 1]!
      const last = lastTextRun(runs)
      const prevTail = prev.spans[prev.spans.length - 1]
      const nextHead = line.spans[0]
      const seam = seams.has(i)
      if (line.hardBreakBefore && !seam) {
        runs.push({ kind: 'lineBreak' })
      } else if (prev.endsWithHyphen || (seam && isSeamHyphenation(prev, line))) {
        if (last) last.text = last.text.replace(/\s+$/, '').replace(TRAILING_HYPHEN, '')
      } else if (seam && last && TRAILING_HYPHEN.test(last.text.trimEnd())) {
        last.text = last.text.trimEnd()
      } else if (
        last &&
        prevTail &&
        nextHead &&
        !/\s$/.test(last.text) &&
        continuesWithParticle(last.text, lineText(line))
      ) {
        // Korean particles are suffixes: a line that opens with one continues
        // the word above ("별도" + "의" is 별도의), so no space belongs here
      } else if (
        last &&
        prevTail &&
        nextHead &&
        !isNoSpaceScript(prevTail.script) &&
        !isNoSpaceScript(nextHead.script) &&
        !/\s$/.test(last.text)
      ) {
        last.text += ' '
      }
    }
    for (const span of line.spans) {
      if (span.invisible) continue
      if (span.noteRef !== undefined) {
        ctx.onNoteRef?.(span.noteRef)
        runs.push({ kind: 'footnoteRef', id: span.noteRef })
        if (span.text.trim() !== '') pushText(runs, spanRun(span, ctx))
        continue
      }
      if (span.text === '') continue
      pushText(runs, spanRun(span, ctx))
    }
  }
  return trimRuns(runs)
}

/** drop leading/trailing whitespace and empty text runs */
export function trimRuns(runs: InlineRun[]): InlineRun[] {
  const out = runs.filter((r) => r.kind !== 'text' || r.text !== '')
  const first = out.find((r) => r.kind === 'text')
  if (first && first === out[0]) first.text = first.text.replace(/^\s+/, '')
  const last = out[out.length - 1]
  if (last?.kind === 'text') last.text = last.text.replace(/\s+$/, '')
  return out.filter((r) => r.kind !== 'text' || r.text !== '')
}

/** plain text of runs (markers and math omitted, line breaks as '\n') */
export function runsText(runs: readonly InlineRun[]): string {
  let s = ''
  for (const r of runs) {
    if (r.kind === 'text') s += r.text
    else if (r.kind === 'lineBreak') s += '\n'
    else if (r.kind === 'math') s += r.latex
  }
  return s
}
