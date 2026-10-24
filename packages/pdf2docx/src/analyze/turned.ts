/**
 * Turned text on an upright page: a margin stamp ("arXiv:… [cs.CL] 24 May
 * 2019" up the left edge), a rotated label. Too few chars to trip the
 * vertical-text gate, so the page is analyzed as usual, but each turned
 * char lands on some body line's baseline and the row pass splices it into
 * that line ("representa 9 tion"). Runs of turned chars leave the upright
 * stream and come back as one paragraph each, read along their direction.
 */
import type { Rect } from '../geometry'
import { median, rectUnion } from '../geometry'
import type { PdfChar, TextBlock } from '../ir'
import { buildSpans } from './spans'
import { groupIntoWords } from './words'

/** |angle| above this (radians, ~15°) is a turned char (the extract layer's gate) */
const TURNED_RAD = 0.26
/** chars of one run keep their direction within this (radians) */
const SAME_RUN_RAD = 0.1
/** consecutive chars of one run sit within this many ems */
const RUN_STEP_EMS = 2
/** shorter runs (a rotated arrow, a lone symbol) stay where they are */
const RUN_MIN_VISIBLE = 3

const isBlank = (c: PdfChar): boolean => c.code <= 0x20 || c.code === 0xa0 || c.code === 0x3000

const turned = (c: PdfChar): boolean => !isBlank(c) && Math.abs(c.angle) > TURNED_RAD

/**
 * The page's chars split into the upright stream (content order kept) and
 * the runs of turned chars long enough to stand as text of their own.
 */
export function splitTurnedRuns(chars: readonly PdfChar[]): {
  upright: PdfChar[]
  runs: PdfChar[][]
} {
  const runs: PdfChar[][] = []
  let run: PdfChar[] = []
  let last: PdfChar | null = null
  const close = () => {
    while (run.length > 0 && isBlank(run[run.length - 1]!)) run.pop()
    if (run.filter((c) => !isBlank(c)).length >= RUN_MIN_VISIBLE) runs.push(run)
    run = []
    last = null
  }
  for (const c of chars) {
    if (isBlank(c)) {
      if (last) run.push(c)
      continue
    }
    if (!turned(c)) {
      close()
      continue
    }
    if (last) {
      const em = Math.max(c.fontSize, last.fontSize, 1)
      const step = Math.hypot(c.originX - last.originX, c.originY - last.originY)
      if (Math.abs(c.angle - last.angle) > SAME_RUN_RAD || step > RUN_STEP_EMS * em) close()
    }
    run.push(c)
    last = c
  }
  close()
  if (runs.length === 0) return { upright: [...chars], runs }
  const taken = new Set(runs.flat())
  return { upright: chars.filter((c) => !taken.has(c)), runs }
}

/** a point turned by -angle about the origin: the run's direction becomes +x */
function unturn(angle: number): (x: number, y: number) => [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return (x, y) => [x * cos + y * sin, -x * sin + y * cos]
}

function unturnRect(r: Rect, at: (x: number, y: number) => [number, number]): Rect {
  const pts = [at(r.x0, r.y0), at(r.x1, r.y0), at(r.x0, r.y1), at(r.x1, r.y1)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * One turned run as a one-line paragraph: words and spaces are read with
 * the run turned upright, and the block keeps the run's place on the page.
 */
export function turnedBlock(run: readonly PdfChar[]): TextBlock | null {
  const visible = run.filter((c) => !isBlank(c))
  if (visible.length === 0) return null
  const at = unturn(median(visible.map((c) => c.angle)))
  const upright = run.map((c) => {
    const [originX, originY] = at(c.originX, c.originY)
    return {
      ...c,
      box: unturnRect(c.box, at),
      looseBox: unturnRect(c.looseBox, at),
      originX,
      originY,
      angle: 0,
    }
  })
  const box = visible.map((c) => c.box).reduce(rectUnion)
  const spans = buildSpans(groupIntoWords(upright)).map((s) => ({ ...s, box }))
  if (spans.length === 0) return null
  return {
    kind: 'text',
    lines: [{ spans, box, baseline: box.y0, endsWithHyphen: false }],
    box,
    align: 'left',
    firstLineIndentPt: 0,
    dir: spans[0]!.dir,
  }
}
