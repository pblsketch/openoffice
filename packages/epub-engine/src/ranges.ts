/**
 * Range replacements: the only primitive every chapter edit compiles down to.
 * Offsets are UTF-16 string offsets into the chapter source, ranges are
 * half-open `[start, end)`. Text outside the replaced ranges is never touched.
 */
export interface RangeReplacement {
  start: number
  end: number
  text: string
}

/** Sorts by position; insertions at the same offset keep their given order. */
export function sortReplacements(replacements: readonly RangeReplacement[]): RangeReplacement[] {
  return replacements
    .map((r, index) => ({ r, index }))
    .sort((a, b) => a.r.start - b.r.start || a.r.end - b.r.end || a.index - b.index)
    .map(({ r }) => r)
}

/**
 * Returns a description of the first problem (out of bounds, overlapping), or
 * null when the list can be applied to a text of `length` code units.
 */
export function validateReplacements(
  replacements: readonly RangeReplacement[],
  length: number,
): string | null {
  let cursor = 0
  for (const r of sortReplacements(replacements)) {
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end)) return 'non-integer offset'
    if (r.start < 0 || r.end < r.start || r.end > length) {
      return `range [${r.start}, ${r.end}) is out of bounds`
    }
    if (r.start < cursor) return `range [${r.start}, ${r.end}) overlaps another`
    cursor = r.end
  }
  return null
}

/** Applies replacements (all in the coordinates of `source`). Throws on an invalid list. */
export function applyReplacements(
  source: string,
  replacements: readonly RangeReplacement[],
): string {
  const problem = validateReplacements(replacements, source.length)
  if (problem) throw new RangeError(problem)
  let out = ''
  let cursor = 0
  for (const r of sortReplacements(replacements)) {
    out += source.slice(cursor, r.start) + r.text
    cursor = r.end
  }
  return out + source.slice(cursor)
}

/**
 * Where an offset of the old text lands after the replacements, or null when a
 * non-empty replaced range covers it. An insertion at the offset itself pushes
 * it forward (the inserted text goes before it).
 */
export function mapOffset(
  offset: number,
  replacements: readonly RangeReplacement[],
): number | null {
  let delta = 0
  for (const r of replacements) {
    if (r.start <= offset && offset < r.end) return null
    if (r.end <= offset) delta += r.text.length - (r.end - r.start)
  }
  return offset + delta
}

type Piece = { kind: 'copy'; start: number; end: number } | { kind: 'text'; text: string }

function pieceLength(p: Piece): number {
  return p.kind === 'copy' ? p.end - p.start : p.text.length
}

function slicePieces(pieces: readonly Piece[], from: number, to: number): Piece[] {
  const out: Piece[] = []
  let pos = 0
  for (const p of pieces) {
    const len = pieceLength(p)
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + len)
    if (a < b) {
      out.push(
        p.kind === 'copy'
          ? { kind: 'copy', start: p.start + (a - pos), end: p.start + (b - pos) }
          : { kind: 'text', text: p.text.slice(a - pos, b - pos) },
      )
    }
    pos += len
  }
  return out
}

function applyToPieces(pieces: Piece[], replacements: readonly RangeReplacement[]): Piece[] {
  const total = pieces.reduce((n, p) => n + pieceLength(p), 0)
  const out: Piece[] = []
  let cursor = 0
  for (const r of sortReplacements(replacements)) {
    out.push(...slicePieces(pieces, cursor, r.start))
    if (r.text) out.push({ kind: 'text', text: r.text })
    cursor = r.end
  }
  out.push(...slicePieces(pieces, cursor, total))
  return out
}

/** Shrinks a replacement by the prefix and suffix it shares with the text it replaces. */
function trim(base: string, r: RangeReplacement): RangeReplacement | null {
  const old = base.slice(r.start, r.end)
  if (old === r.text) return null
  let head = 0
  const max = Math.min(old.length, r.text.length)
  while (head < max && old.charCodeAt(head) === r.text.charCodeAt(head)) head++
  let tail = 0
  while (
    tail < max - head &&
    old.charCodeAt(old.length - 1 - tail) === r.text.charCodeAt(r.text.length - 1 - tail)
  ) {
    tail++
  }
  return {
    start: r.start + head,
    end: r.end - tail,
    text: r.text.slice(head, r.text.length - tail),
  }
}

/**
 * Composes two edits into one list against the original text: `first` applies
 * to `base`, `second` to the result of `first`. The result applied to `base`
 * gives the same text, and every replacement is trimmed to what really changes,
 * so unchanged bytes stay outside all ranges.
 */
export function composeReplacements(
  base: string,
  first: readonly RangeReplacement[],
  second: readonly RangeReplacement[],
): RangeReplacement[] {
  const initial: Piece[] = [{ kind: 'copy', start: 0, end: base.length }]
  const pieces = applyToPieces(applyToPieces(initial, first), second)
  const out: RangeReplacement[] = []
  let cursor = 0
  let pending = ''
  const flush = (upTo: number): void => {
    if (upTo > cursor || pending) {
      const trimmed = trim(base, { start: cursor, end: upTo, text: pending })
      if (trimmed) out.push(trimmed)
    }
    pending = ''
  }
  for (const p of pieces) {
    if (p.kind === 'text') {
      pending += p.text
      continue
    }
    if (p.start !== cursor || pending) flush(p.start)
    cursor = p.end
  }
  flush(base.length)
  return out
}
