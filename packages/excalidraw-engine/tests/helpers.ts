import LZString from 'lz-string'
import type { DrawingElement } from '../src'

export const enc = (text: string): Uint8Array => new TextEncoder().encode(text)
/** keeps a BOM, so a test sees one the engine wrote */
export const dec = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)

export function rect(id: string, extra: Record<string, unknown> = {}): DrawingElement {
  return { id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, version: 1, ...extra }
}

export function text(
  id: string,
  value: string,
  extra: Record<string, unknown> = {},
): DrawingElement {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    text: value,
    originalText: value,
    rawText: value,
    version: 1,
    ...extra,
  }
}

export function scene(elements: unknown[], extra: Record<string, unknown> = {}) {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'test',
    elements,
    appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
    files: {},
    ...extra,
  }
}

/** The plugin's line-broken compressed form. */
export function compressed(value: unknown): string {
  const data = LZString.compressToBase64(JSON.stringify(value, null, '\t'))
  return (data.match(/.{1,256}/g) ?? []).join('\n\n')
}

interface NoteOptions {
  /** user text written above the plugin's data */
  body?: string
  texts?: Array<[string, string]>
  embedded?: string[]
  encoding?: 'compressed-json' | 'json'
  /** `# Text Elements` / `# Drawing` with no `# Excalidraw Data` */
  oldLayout?: boolean
}

/** A note laid out the way the plugin writes one. */
export function note(value: unknown, options: NoteOptions = {}): string {
  const level = options.oldLayout ? '#' : '##'
  const encoding = options.encoding ?? 'compressed-json'
  const block = encoding === 'json' ? JSON.stringify(value, null, '\t') : compressed(value)
  const list = (options.texts ?? []).map(([id, t]) => `${t} ^${id}\n\n`).join('')
  const embedded = options.embedded
    ? `## Embedded Files\n${options.embedded.map((line) => `${line}\n`).join('')}\n`
    : ''
  return [
    '---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n',
    options.body ?? '==⚠  Switch to EXCALIDRAW VIEW ⚠==\n\n',
    options.oldLayout ? '' : '\n# Excalidraw Data\n\n',
    `${level} Text Elements\n${list}`,
    embedded,
    `%%\n${level} Drawing\n\`\`\`${encoding}\n${block}\n\`\`\`\n%%`,
  ].join('')
}
