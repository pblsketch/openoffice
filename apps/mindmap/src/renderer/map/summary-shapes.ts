/**
 * The bracket of a summary in each shape a file can name, drawn by this app.
 *
 * The library places the bracket and its title: beside the branches it
 * covers (to the right, to the left) or under them (downward). Its path is a
 * rounded bracket whose spine stands 10 pixels from the branches, with a
 * short stem towards the title. Where it put it is read back from that path
 * (`parseSummaryFrame`; the form of the path is the library's, version
 * 5.15.1), and each shape is drawn in the same room: from 10 pixels before
 * the spine to 10 past it, over the same span, so the title stays where the
 * library put it.
 *
 * `bracket` is the library's own path; a summary without a shape, or with one
 * this app does not know, keeps it. Every shape reaches as far as the
 * library's stem (10 past the spine), so the title stands as far from each.
 */
import type { ViewSummaryStyle } from '@genoffice/xmind-engine'
import { safeSummaryShape, type SummaryShape } from './style-values'

export interface SummaryFrame {
  /** where the bracket stands from the branches it covers */
  side: 'right' | 'left' | 'down'
  /** the spine: x for a bracket beside the branches, y for one under them */
  spine: number
  /** the span the bracket covers, along the spine */
  from: number
  to: number
  /** where the stem leaves towards the title */
  mid: number
}

/** How far the bracket reaches before and past its spine. */
const DEPTH = 10

const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi

/** Where the library drew a bracket, read from its path; null for a path of another form. */
export function parseSummaryFrame(d: string): SummaryFrame | null {
  const values = (d.match(NUMBER) ?? []).map(Number)
  if (values.length !== 19 || values.some((value) => !Number.isFinite(value))) return null
  const stem = d.trim()
  if (/v\s*10$/.test(stem)) {
    return {
      side: 'down',
      spine: values[9]!,
      from: values[0]!,
      to: values[8]! + DEPTH,
      mid: values[16]!,
    }
  }
  const side = /h\s*-10$/.test(stem) ? 'left' : /h\s*10$/.test(stem) ? 'right' : null
  if (side === null) return null
  return { side, spine: values[8]!, from: values[1]!, to: values[9]! + DEPTH, mid: values[17]! }
}

export interface SummaryPaint {
  /** null: the bracket the library draws */
  shape: SummaryShape | null
}

/** The values a summary's bracket is drawn with. */
export function summaryPaint(style: ViewSummaryStyle | null | undefined | unknown): SummaryPaint {
  const shape =
    typeof style === 'object' && style !== null
      ? (style as Record<string, unknown>).shape
      : undefined
  return { shape: safeSummaryShape(shape) }
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * The path of a bracket of this shape in the room the library gave it. The
 * shapes are drawn along the span (`u`) and away from the branches (`v`: -10
 * where the bracket meets the branches, 0 on the spine, 10 at the stem's end).
 */
export function summaryBracketPath(shape: SummaryShape, frame: SummaryFrame): string {
  const a = Math.min(frame.from, frame.to)
  const b = Math.max(frame.from, frame.to)
  const m = Math.min(b, Math.max(a, frame.mid))
  const d = DEPTH
  const r = Math.min(d, (b - a) / 4)
  const out = frame.side === 'left' ? -1 : 1
  const at = (u: number, v: number): string =>
    frame.side === 'down' ? `${n(u)} ${n(frame.spine + v)}` : `${n(frame.spine + v * out)} ${n(u)}`
  switch (shape) {
    case 'curly':
      return [
        `M ${at(a, -d)}`,
        `Q ${at(a, 0)} ${at(a + r, 0)}`,
        `L ${at(m - r, 0)}`,
        `Q ${at(m, 0)} ${at(m, d)}`,
        `Q ${at(m, 0)} ${at(m + r, 0)}`,
        `L ${at(b - r, 0)}`,
        `Q ${at(b, 0)} ${at(b, -d)}`,
      ].join(' ')
    case 'angle':
      return `M ${at(a, -d)} L ${at(m, d)} L ${at(b, -d)}`
    case 'square':
      return `M ${at(a, -d)} L ${at(a, 0)} L ${at(b, 0)} L ${at(b, -d)} M ${at(m, 0)} L ${at(m, d)}`
    case 'round':
      return `M ${at(a, -d)} Q ${at(a, d)} ${at(m, d)} Q ${at(b, d)} ${at(b, -d)}`
    case 'bracket':
      return [
        `M ${at(a, -d)}`,
        `Q ${at(a, 0)} ${at(a + r, 0)}`,
        `L ${at(b - r, 0)}`,
        `Q ${at(b, 0)} ${at(b, -d)}`,
        `M ${at(m, 0)} L ${at(m, d)}`,
      ].join(' ')
    case 'sharp':
      return [a, a + r, m - r, m, m + r, b - r, b]
        .map(
          (u, place) =>
            `${place === 0 ? 'M' : 'L'} ${at(u, place === 0 || place === 6 ? -d : place === 3 ? d : 0)}`,
        )
        .join(' ')
    case 'fold':
      return `M ${at(a, -d)} L ${at(m, 0)} L ${at(b, -d)} M ${at(m, 0)} L ${at(m, d)}`
    case 'straight':
      // with the stem every other shape reaches the title by, so it stands as near it
      return `M ${at(a, 0)} L ${at(b, 0)} M ${at(m, 0)} L ${at(m, d)}`
  }
}
