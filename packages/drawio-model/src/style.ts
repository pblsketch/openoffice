/** draw.io style strings: parsing, merging and the shape names ops and the read table use. */

export interface StyleEntry {
  key: string
  /** `undefined` for a bare token such as `ellipse` or `text`. */
  value?: string
}

export function parseStyle(style: string): StyleEntry[] {
  return style
    .split(';')
    .filter((part) => part !== '')
    .map((part) => {
      const eq = part.indexOf('=')
      return eq < 0 ? { key: part } : { key: part.slice(0, eq), value: part.slice(eq + 1) }
    })
}

export function formatStyle(entries: StyleEntry[]): string {
  return entries
    .map((entry) => (entry.value === undefined ? entry.key : `${entry.key}=${entry.value}`))
    .map((part) => `${part};`)
    .join('')
}

export function styleValue(style: string, key: string): string | undefined {
  let found: string | undefined
  for (const entry of parseStyle(style)) if (entry.key === key) found = entry.value
  return found
}

export function hasHtmlLabel(style: string): boolean {
  return styleValue(style, 'html') === '1'
}

/**
 * Parses a `key=value;` patch. Returns null when a part has no `=` (a bare
 * token cannot be merged) or an empty key.
 */
export function parseStylePatch(patch: string): { key: string; value: string }[] | null {
  const result: { key: string; value: string }[] = []
  for (const entry of parseStyle(patch)) {
    if (entry.value === undefined || entry.key.trim() === '') return null
    result.push({ key: entry.key.trim(), value: entry.value })
  }
  return result
}

/** Merges a patch over a style: values replace in place, new keys go last, empty values delete. */
export function mergeStyle(style: string, patch: { key: string; value: string }[]): string {
  const entries = parseStyle(style)
  for (const { key, value } of patch) {
    const matches = entries.filter((entry) => entry.key === key && entry.value !== undefined)
    if (value === '') {
      for (const match of matches) entries.splice(entries.indexOf(match), 1)
    } else if (matches.length > 0) {
      matches[0]!.value = value
      for (const extra of matches.slice(1)) entries.splice(entries.indexOf(extra), 1)
    } else {
      entries.push({ key, value })
    }
  }
  return formatStyle(entries)
}

export const SHAPE_NAMES = [
  'rectangle',
  'rounded',
  'ellipse',
  'rhombus',
  'parallelogram',
  'hexagon',
  'cylinder',
  'document',
  'cloud',
  'actor',
  'text',
  'note',
] as const

export type ShapeName = (typeof SHAPE_NAMES)[number]

/** The styles draw.io's own palette uses for these shapes. */
export const SHAPE_STYLES: Record<ShapeName, string> = {
  rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  rhombus: 'rhombus;whiteSpace=wrap;html=1;',
  parallelogram:
    'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  document: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;',
  cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
  text: 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;',
  note: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;',
}

export const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;html=1;'

export const ARROWS = ['end', 'none', 'both'] as const
export type ArrowName = (typeof ARROWS)[number]

export const ARROW_PATCHES: Record<ArrowName, { key: string; value: string }[]> = {
  end: [
    { key: 'startArrow', value: 'none' },
    { key: 'endArrow', value: 'classic' },
  ],
  none: [
    { key: 'startArrow', value: 'none' },
    { key: 'endArrow', value: 'none' },
  ],
  both: [
    { key: 'startArrow', value: 'classic' },
    { key: 'endArrow', value: 'classic' },
  ],
}

/** Style shape names that the read table reports under the op's name. */
const SHAPE_ALIASES: Record<string, string> = {
  cylinder3: 'cylinder',
  umlActor: 'actor',
}

/**
 * The shape name of a vertex style: `shape=` wins over a leading bare token;
 * none of either is a `rectangle` (or `rounded` with `rounded=1`).
 */
export function shapeName(style: string): string {
  const entries = parseStyle(style)
  let name = styleValue(style, 'shape')
  name ??= entries.find((entry) => entry.value === undefined)?.key
  if (name === undefined || name === 'rect' || name === 'rectangle') {
    return styleValue(style, 'rounded') === '1' ? 'rounded' : 'rectangle'
  }
  return SHAPE_ALIASES[name] ?? name
}
