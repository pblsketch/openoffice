import type { Mermaid } from 'mermaid'
import type { DiagramResult } from './diagrams'

export const MERMAID_LANGUAGE = 'mermaid'

export const MERMAID_TEMPLATE = [
  '```mermaid',
  'flowchart LR',
  '    A[Start] --> B{Decision}',
  '    B -->|Yes| C[Done]',
  '    B -->|No| A',
  '```',
].join('\n')

let loading: Promise<Mermaid> | null = null

/** Loaded on first use so documents without diagrams never pay for the bundle */
export function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // diagrams are document content: one fixed theme in both UI themes
      theme: 'default',
      // SVG text labels instead of <foreignObject> so the diagram can be drawn
      // onto a canvas (docx export) without tainting it
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    })
    return mermaid
  })
  return loading
}

const ROOT_TAG_RE = /<svg\b[^>]*>/
const MAX_WIDTH_RE = /max-width:\s*([\d.]+)px;?\s*/
const VIEWBOX_SIZE_RE = /\sviewBox="\s*[^\s,"]+[\s,]+[^\s,"]+[\s,]+([^\s,"]+)[\s,]+([^\s,"]+)\s*"/

/**
 * Mermaid sizes its SVG as width="100%" capped by an inline max-width, so a
 * diagram wider than the column shrinks its text to fit. Pin that natural size
 * instead: the editor preview scrolls a wide diagram, and the print CSS still
 * scales it down to the page.
 */
export function pinMermaidNaturalSize(svg: string): string {
  return svg.replace(ROOT_TAG_RE, (tag) => {
    const maxWidth = MAX_WIDTH_RE.exec(tag)
    const box = VIEWBOX_SIZE_RE.exec(tag)
    if (!/\swidth="100%"/.test(tag) || !maxWidth || !box) return tag
    const width = Number(maxWidth[1])
    const height = (width * Number(box[2])) / Number(box[1])
    if (!(width > 0) || !(height > 0) || !Number.isFinite(height)) return tag
    return tag
      .replace(/\sheight="[^"]*"/, '')
      .replace(/\swidth="100%"/, ` width="${width}" height="${height}"`)
      .replace(maxWidth[0], '')
      .replace(/\sstyle="\s*"/, '')
  })
}

let renderSeq = 0

export async function renderMermaid(source: string): Promise<DiagramResult> {
  const mermaid = await loadMermaid()
  try {
    const { svg } = await mermaid.render(`md-mermaid-${++renderSeq}`, source)
    return { ok: true, svg: pinMermaidNaturalSize(svg) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
