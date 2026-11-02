/**
 * What one branch line is drawn with: the line from a parent P into a topic
 * X, its colour, width, pattern and shape. Pure: the values come from the
 * topics' own line values (as the file holds them, each through the filter
 * in `style-values.ts`), the map-wide rainbow and the theme.
 *
 * The order, for each value:
 *
 * - colour: X's own; else the nearest ancestor of X with a colour written;
 *   else the rainbow colour of the main branch the line is on; else, with the
 *   rainbow off, the theme's line colour (that of the central topic). When the
 *   nearest ancestor with a colour is the central topic, the rainbow goes
 *   before it.
 * - width and pattern: X's own; else the value P draws with (P's own, else
 *   the nearest ancestor's of P, else the theme's at P's level).
 * - shape: X's own; else P's own; else the theme's at P's level. A shape is
 *   not handed down from further up.
 *
 * A colour, width or pattern the filter does not take counts as not written.
 * A shape written but not drawn by this app (another program's word, or no
 * word at all) is drawn as the nearest shape, or the theme's, and is still
 * X's: it does not fall back to P's.
 *
 * A topic whose lines a user formats takes "the values it draws with now"
 * from here too, inherited ones included (the format painter).
 */
import type { NodeObj } from 'mind-elixir'
import type { ThemeBranchShape, ThemeLook, ViewBranchLine } from '@genoffice/xmind-engine'
import {
  type BranchLineShape,
  isPickableBranchShape,
  type LinePattern,
  safeBranchLineWidth,
  safeBranchShape,
  safeColor,
  safeLinePattern,
} from './style-values'

/** The map-wide line settings a sheet is drawn with (`sheetLineSettings` of the engine). */
export interface MapLineSettings {
  /** the lines from the centre to the main topics narrow towards the topic */
  tapered: boolean
  /** each main branch line takes its own colour of the band */
  rainbow: boolean
}

/** The settings of a sheet without any: even lines, the rainbow on. */
export const DEFAULT_LINE_SETTINGS: MapLineSettings = { tapered: false, rainbow: true }

/** What a line is drawn with besides the topics' own values. */
export interface BranchLineContext {
  look: ThemeLook
  rainbow: boolean
  /** the place of the main branch the line is on among the central topic's children (from 0) */
  branchIndex: number
}

/** Where a value came from: the topic itself, a topic above it, the rainbow, or the theme. */
export type LineValueSource = 'own' | 'inherited' | 'rainbow' | 'theme'

export interface ResolvedBranchLine {
  /** `#rrggbb` or `#rrggbbaa`: a filtered value of the file or a colour of the look */
  color: string
  colorFrom: LineValueSource
  /** CSS pixels */
  width: number
  widthFrom: Exclude<LineValueSource, 'rainbow'>
  pattern: LinePattern
  patternFrom: Exclude<LineValueSource, 'rainbow'>
  shape: BranchLineShape
  /** `parent`: P's own shape; `theme`: no shape written on X or P */
  shapeFrom: 'own' | 'parent' | 'theme'
  /** the shape written is not one a user can pick: it is drawn as a nearby shape and kept in the file */
  shapeOther: boolean
}

type Line = ViewBranchLine | null | undefined

const SOLID: LinePattern = 'solid'

function fromTheme(shape: ThemeBranchShape): BranchLineShape {
  return shape === 'rounded-elbow' ? 'roundedElbow' : 'curve'
}

/** The theme's values for the lines leaving a topic: the central topic's, or those of the levels below. */
function themeLine(
  look: ThemeLook,
  fromCentral: boolean,
): { width: number; shape: BranchLineShape } {
  const level = fromCentral ? look.lines.main : look.lines.sub
  return { width: level.width, shape: fromTheme(level.shape) }
}

/** The first value of the chain from `start` up that passes `read`, with how far up it was. */
function firstWritten<T>(
  chain: readonly Line[],
  start: number,
  read: (line: Line) => T | null,
): { value: T; at: number } | null {
  for (let at = start; at < chain.length; at++) {
    const value = read(chain[at])
    if (value !== null) return { value, at }
  }
  return null
}

const colorOf = (line: Line) => safeColor(line?.color)
const widthOf = (line: Line) => safeBranchLineWidth(line?.width)
const patternOf = (line: Line) => safeLinePattern(line?.pattern)
const shapeWritten = (line: Line): string | null =>
  typeof line?.shape === 'string' ? line.shape : null

/**
 * The values of the line into the first topic of `chain`. The chain holds the
 * line values written on that topic, then on its parent, and so on up to the
 * central topic (the last). A chain of the central topic alone gives the
 * values its own lines start from.
 */
export function resolveBranchLine(
  chain: readonly Line[],
  context: BranchLineContext,
): ResolvedBranchLine {
  const { look } = context
  const central = chain.length - 1
  // the line leaves the central topic (or, for the central topic itself, would)
  const theme = themeLine(look, chain.length <= 2)
  const rainbowColor = look.branches[context.branchIndex % look.branches.length]!.color

  let color: string
  let colorFrom: LineValueSource
  const written = firstWritten(chain, 0, colorOf)
  if (written && written.at === 0) {
    color = written.value
    colorFrom = 'own'
  } else if (written && !(written.at === central && context.rainbow && central > 0)) {
    color = written.value
    colorFrom = 'inherited'
  } else if (context.rainbow && central > 0) {
    color = rainbowColor
    colorFrom = 'rainbow'
  } else {
    color = look.strongText
    colorFrom = 'theme'
  }

  const width = firstWritten(chain, 0, widthOf)
  const pattern = firstWritten(chain, 0, patternOf)

  let shape: BranchLineShape
  let shapeFrom: ResolvedBranchLine['shapeFrom']
  let shapeOther = false
  const ownShape = shapeWritten(chain[0])
  const parentShape = chain.length > 1 ? shapeWritten(chain[1]) : null
  const given = ownShape ?? parentShape
  if (given !== null) {
    shape = safeBranchShape(given) ?? theme.shape
    shapeFrom = ownShape !== null ? 'own' : 'parent'
    shapeOther = !isPickableBranchShape(given)
  } else {
    shape = theme.shape
    shapeFrom = 'theme'
  }

  return {
    color,
    colorFrom,
    width: width?.value ?? theme.width,
    widthFrom: width ? (width.at === 0 ? 'own' : 'inherited') : 'theme',
    pattern: pattern?.value ?? SOLID,
    patternFrom: pattern ? (pattern.at === 0 ? 'own' : 'inherited') : 'theme',
    shape,
    shapeFrom,
    shapeOther,
  }
}

/** The line values a library node carries in its metadata (`MapNodeMeta.line`); only strings are read. */
function lineOf(node: NodeObj): ViewBranchLine | undefined {
  const meta = (node as { metadata?: unknown }).metadata
  const line =
    typeof meta === 'object' && meta !== null ? (meta as { line?: unknown }).line : undefined
  if (typeof line !== 'object' || line === null) return undefined
  const out: ViewBranchLine = {}
  for (const key of ['shape', 'width', 'color', 'pattern'] as const) {
    const value = (line as Record<string, unknown>)[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** The chain `resolveBranchLine` takes for a library node: its line values, then its parent's, up to the central topic. */
export function lineChainOf(node: NodeObj): (ViewBranchLine | undefined)[] {
  const chain: (ViewBranchLine | undefined)[] = []
  for (let at: NodeObj | undefined = node; at; at = at.parent) chain.push(lineOf(at))
  return chain
}

/** The place among the central topic's children of the main branch a node is on; 0 for the central topic. */
export function branchIndexOf(node: NodeObj): number {
  let main = node
  while (main.parent?.parent) main = main.parent
  const mains = main.parent?.children ?? []
  return Math.max(0, mains.indexOf(main))
}

/** The values the line into a library node is drawn with. */
export function resolveNodeLine(
  node: NodeObj,
  options: { look: ThemeLook; rainbow: boolean },
): ResolvedBranchLine {
  return resolveBranchLine(lineChainOf(node), {
    look: options.look,
    rainbow: options.rainbow,
    branchIndex: branchIndexOf(node),
  })
}
