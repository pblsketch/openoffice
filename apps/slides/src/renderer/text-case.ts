/**
 * Change Case (PowerPoint Home ▸ Font ▸ Aa): pure text transforms plus the paragraph
 * rebuild that rewrites a whole box's text while every run keeps its formatting.
 *
 * Every transform keeps the string length (a character whose case mapping changes the
 * length, like ß → SS, is left as it is), so a transformed string can be cut back at the
 * original run and DOM text-node boundaries.
 */
import type { ShapeRenderNode, TextLine } from '@genoffice/pptx-render'
import type { EditParagraph, EditRun } from '../shared/ipc'

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle'

function up(c: string): string {
  const u = c.toUpperCase()
  return u.length === c.length ? u : c
}

function down(c: string): string {
  const l = c.toLowerCase()
  return l.length === c.length ? l : c
}

const isLetter = (c: string) => up(c) !== down(c)
const SENTENCE_END = /[.!?。！？]/
const WORD_BREAK = /[\s\-/("'“‘[{]/

export function changeCase(text: string, mode: CaseMode): string {
  const chars = Array.from(text)
  switch (mode) {
    case 'lower':
      return chars.map(down).join('')
    case 'upper':
      return chars.map(up).join('')
    case 'toggle':
      return chars.map((c) => (up(c) === c ? down(c) : up(c))).join('')
    case 'title': {
      let atWord = true
      return chars
        .map((c) => {
          const out = atWord && isLetter(c) ? up(c) : down(c)
          if (isLetter(c) || /\d/.test(c)) atWord = false
          else if (WORD_BREAK.test(c)) atWord = true
          return out
        })
        .join('')
    }
    case 'sentence': {
      // A sentence starts the text, follows a line break, or follows an end mark and a space
      let atStart = true
      let sawEnd = false
      return chars
        .map((c) => {
          if (c === '\n') {
            atStart = true
            sawEnd = false
            return c
          }
          if (isLetter(c)) {
            const out = atStart ? up(c) : down(c)
            atStart = false
            sawEnd = false
            return out
          }
          if (SENTENCE_END.test(c)) sawEnd = true
          else if (/\s/.test(c) && sawEnd) atStart = true
          return c
        })
        .join('')
    }
  }
}

/** Layout lines → model paragraphs (paraStart marks a new paragraph; continuation lines join the previous one). */
function paragraphLines(lines: TextLine[]): TextLine[][] {
  const paras: TextLine[][] = []
  for (const line of lines) {
    if (line.paraStart === false && paras.length) paras[paras.length - 1]!.push(line)
    else paras.push([line])
  }
  return paras
}

interface Seg {
  srcRun?: number
  text: string
  /** <a:br/> sentinel: kept as is, never merged */
  br?: boolean
}

/** One paragraph's source runs in logical order, wrap-swallowed spaces restored, layout fragments merged back. */
function paragraphSegs(lines: TextLine[]): Seg[] {
  const segs: Seg[] = []
  lines.forEach((line, li) => {
    if (li > 0 && lines[li - 1]!.trailingSpace) {
      const restored = lines[li - 1]!.trailingText ?? ' '
      const prev = segs[segs.length - 1]
      if (prev && !prev.br) prev.text += restored
    }
    const logical = [...line.runs].sort(
      (a, b) =>
        (a.logicalOrder ?? Number.MAX_SAFE_INTEGER) - (b.logicalOrder ?? Number.MAX_SAFE_INTEGER),
    )
    for (const run of logical) {
      if (run.isBullet || run.text === '') continue
      const prev = segs[segs.length - 1]
      if (prev && !prev.br && prev.srcRun != null && prev.srcRun === run.srcRunIdx) {
        prev.text += run.text
      } else {
        segs.push({ srcRun: run.srcRunIdx, text: run.text })
      }
    }
    if (line.softBreakAfter != null)
      segs.push({ srcRun: line.softBreakAfter, text: '\n', br: true })
  })
  return segs
}

/**
 * The box's paragraphs with every run's text case-changed. Runs carry srcPara/srcRun and
 * only text, so the main process keeps each run's formatting, links and fields as they are.
 * null when the box has no text runs that a case change would touch.
 */
export function caseChangedParagraphs(
  node: ShapeRenderNode,
  mode: CaseMode,
): EditParagraph[] | null {
  const lines = node.text?.lines
  if (!lines?.length) return null
  let changed = false
  const paras = paragraphLines(lines).map((group, pi): EditParagraph => {
    const segs = paragraphSegs(group)
    // Transform the paragraph as one string so sentences and words spanning runs read whole
    const joined = segs.map((s) => s.text).join('')
    const out = changeCase(joined, mode)
    if (out !== joined) changed = true
    let at = 0
    const runs: EditRun[] = segs.map((s) => {
      const text = out.slice(at, at + s.text.length)
      at += s.text.length
      return { text: s.br ? '\n' : text, ...(s.srcRun != null ? { srcRun: s.srcRun } : {}) }
    })
    return { runs: runs.length ? runs : [{ text: '' }], srcPara: pi }
  })
  return changed ? paras : null
}
