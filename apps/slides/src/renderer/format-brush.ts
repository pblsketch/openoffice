/**
 * Format painter (renderer side) — extracts formatting from a RenderNode and converts it into
 * IPC call parameters.
 *
 * Format scope:
 *  - shape/text: fill (none/solid/gradient; picture and pattern fills stay on the target),
 *    line (color, width, dash, cap, join, compound, gradient line; no line clears it),
 *    effects (shadow, glow, reflection, soft edge), the first text run's character format
 *    (font, size, bold, italic, underline, strike, color) and the first paragraph's alignment
 *  - lines/connectors: line and effects
 *  - picture: line and effects
 *  - cross-type application takes the intersection
 *
 * This module has no side effects; clipboard-actions.ts calls it.
 */
import type {
  ShapeRenderNode,
  PictureRenderNode,
  RenderNode,
  RenderFill,
  RenderStroke,
  RenderShadow,
  RenderGlow,
  RenderReflection,
} from '@genoffice/pptx-render'
import type { EditStrokeOp, GradientFillSpec, SetEffectsPatch } from '../shared/ipc'

type StrokeSpec = EditStrokeOp['stroke']

/** Format container captured by the render layer (pure data, serializable) */
export interface BrushFormat {
  sourceType: 'shape' | 'text' | 'picture' | 'line'
  /** 'none', solid color (#RRGGBB or #RRGGBBAA) or gradient; undefined = no fill info */
  fill?: string | GradientFillSpec
  /** Line spec; null = no line; undefined = no line info */
  stroke?: StrokeSpec
  /** Every effect key is set: a value applies it, null clears it on the target */
  effects?: SetEffectsPatch
  /** Character format of the first text run (sizes in pt) */
  run?: {
    /** The run's own font name; absent when the run inherits it (theme/placeholder font) */
    fontFamily?: string
    fontSize?: number
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strike?: boolean
    color?: string
  }
  /** Paragraph alignment (first paragraph) */
  align?: 'left' | 'center' | 'right' | 'justify'
}

/** px→pt conversion (96dpi) at render scale 1 */
function pxToPt(px: number): number {
  return Math.round(((px * 72) / 96) * 100) / 100
}

/** Canvas px (scaled by the slide's render scale) → EMU */
function pxToEmu(px: number, scale: number): number {
  return Math.round((px / (scale || 1)) * 9525)
}

/** RenderFill → fill spec; undefined when the fill can't be carried over (picture/pattern) */
function renderFillToSpec(fill: RenderFill | undefined): string | GradientFillSpec | undefined {
  if (!fill || fill.kind === 'none') return 'none'
  if (fill.kind === 'solid') return fill.color
  if (fill.kind === 'gradient' && fill.stops.length) {
    const path = fill.path ?? (fill.radial ? 'circle' : undefined)
    return {
      gradient: {
        from: fill.stops[0]!.color.slice(0, 7),
        to: fill.stops[fill.stops.length - 1]!.color.slice(0, 7),
        stops: fill.stops.map((s) => ({ pos: s.pos, color: s.color })),
        angleDeg: fill.angleDeg,
        ...(path ? { path } : {}),
        ...((path === 'circle' || path === 'rect') && fill.center ? { center: fill.center } : {}),
      },
    }
  }
  return undefined
}

const CAP_TO_OP = { butt: 'flat', round: 'rnd', square: 'sq' } as const

/** RenderStroke → editStroke spec; a missing stroke means "no line" */
function renderStrokeToSpec(stroke: RenderStroke | undefined): StrokeSpec {
  if (!stroke) return null
  return {
    color: stroke.color,
    widthPt: stroke.widthPt,
    dash: stroke.dashPreset ?? 'solid',
    ...(stroke.cap ? { cap: CAP_TO_OP[stroke.cap] } : {}),
    ...(stroke.join ? { join: stroke.join } : {}),
    ...(stroke.compound ? { compound: stroke.compound } : {}),
    ...(stroke.gradient
      ? { gradient: { stops: stroke.gradient.stops, angleDeg: stroke.gradient.angleDeg } }
      : {}),
  }
}

/** Render effects → a full setEffects patch (absent effects become null so they clear) */
function renderEffectsToPatch(
  node: {
    shadow?: RenderShadow
    glow?: RenderGlow
    reflection?: RenderReflection
    softEdgePx?: number
  },
  scale: number,
): SetEffectsPatch {
  const s = node.shadow
  const shadow: SetEffectsPatch['shadow'] = s
    ? {
        color: s.color,
        blurRad: pxToEmu(s.blurPx, scale),
        // Prefer the source values: the offset vector loses the direction at distance 0
        dist: pxToEmu(s.distPx ?? Math.hypot(s.offsetX, s.offsetY), scale),
        dirDeg:
          s.dirDeg != null
            ? Math.round(((s.dirDeg % 360) + 360) % 360)
            : Math.round((Math.atan2(s.offsetY, s.offsetX) * 180) / Math.PI + 360) % 360,
        ...(s.inner ? { inner: true } : {}),
        ...(s.scaleX != null ? { sx: s.scaleX } : {}),
        ...(s.scaleY != null ? { sy: s.scaleY } : {}),
        ...(s.skewXDeg ? { kxDeg: s.skewXDeg } : {}),
        ...(s.skewYDeg ? { kyDeg: s.skewYDeg } : {}),
        ...(s.algn ? { algn: s.algn } : {}),
      }
    : null
  const glow = node.glow
    ? { color: node.glow.color, radius: pxToEmu(node.glow.blurPx, scale) }
    : null
  const r = node.reflection
  const reflection = r
    ? {
        blurRad: pxToEmu(r.blurPx, scale),
        startA: r.startAlpha,
        endPos: r.endPos,
        dist: pxToEmu(r.distPx, scale),
      }
    : null
  const softEdge = node.softEdgePx ? pxToEmu(node.softEdgePx, scale) : null
  return { shadow, glow, reflection, softEdge }
}

/** Extract format from a node; scale = the slide's render scale (RenderSlide.scale) */
export function extractBrushFormat(node: RenderNode, scale = 1): BrushFormat | null {
  if (node.type === 'shape' || node.type === 'text') {
    const shape = node as ShapeRenderNode
    if (shape.line) {
      return {
        sourceType: 'line',
        stroke: renderStrokeToSpec(shape.stroke),
        effects: renderEffectsToPatch(shape, scale),
      }
    }
    const fmt: BrushFormat = { sourceType: node.type as 'shape' | 'text' }

    const fill = renderFillToSpec(shape.fill)
    if (fill !== undefined) fmt.fill = fill
    fmt.stroke = renderStrokeToSpec(shape.stroke)
    fmt.effects = renderEffectsToPatch(shape, scale)

    // text: first non-bullet run of the first paragraph
    if (shape.text?.lines?.length) {
      const firstLine = shape.text.lines.find((l) => l.paraStart !== false) ?? shape.text.lines[0]
      const firstRun = shape.text.lines
        .flatMap((l) => l.runs)
        .find((r) => !r.isBullet && r.text.trim())
      if (firstRun) {
        // Glyph sizes carry the render scale and any autofit shrink; the file size has neither
        const fontScale = shape.text.fontScale || 1
        fmt.run = {
          ...(firstRun.srcFontFamily ? { fontFamily: firstRun.srcFontFamily } : {}),
          fontSize: pxToPt(firstRun.fontSizePx / (scale || 1) / fontScale),
          bold: firstRun.bold,
          italic: firstRun.italic,
          underline: firstRun.underline,
          strike: !!firstRun.strike,
          color: firstRun.color,
        }
      }
      if (firstLine?.align) fmt.align = firstLine.align
    }

    return fmt
  }

  if (node.type === 'picture') {
    const pic = node as PictureRenderNode
    return {
      sourceType: 'picture',
      stroke: renderStrokeToSpec(pic.stroke),
      effects: renderEffectsToPatch(pic, scale),
    }
  }

  return null
}

/** Format application result (caller invokes IPC as needed) */
export interface BrushApplyPlan {
  /** editFill parameters */
  fill?: string | GradientFillSpec
  /** editStroke parameters (null = no line) */
  stroke?: StrokeSpec
  /** setEffects parameters */
  effects?: SetEffectsPatch
  /** setElementFont parameters (applies to every run of the target) */
  runFormat?: BrushFormat['run']
  /** Paragraph alignment */
  align?: 'left' | 'center' | 'right' | 'justify'
}

/**
 * Apply BrushFormat to the target node type, producing an IPC call plan.
 * Cross-type takes the intersection: pictures and lines only receive line and effects,
 * tables, charts and groups receive nothing.
 */
export function computeBrushApply(fmt: BrushFormat, targetNode: RenderNode): BrushApplyPlan {
  const plan: BrushApplyPlan = {}
  const isLine = (targetNode.type === 'shape' || targetNode.type === 'text') && !!targetNode.line

  if (targetNode.type === 'picture' || isLine) {
    if (fmt.stroke !== undefined) plan.stroke = fmt.stroke
    if (fmt.effects) plan.effects = fmt.effects
    return plan
  }

  if (targetNode.type === 'shape' || targetNode.type === 'text') {
    if (fmt.fill !== undefined) plan.fill = fmt.fill
    if (fmt.stroke !== undefined) plan.stroke = fmt.stroke
    if (fmt.effects) plan.effects = fmt.effects
    if (fmt.run && (targetNode as ShapeRenderNode).text?.lines.length) plan.runFormat = fmt.run
    if (fmt.align && (targetNode as ShapeRenderNode).text?.lines.length) plan.align = fmt.align
    return plan
  }

  return plan
}
