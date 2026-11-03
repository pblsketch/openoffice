/**
 * What a save writes, decided without draw.io: which of draw.io's
 * serializations a format takes, whether pages are compressed, which name a
 * Save As gets, and when nothing is written at all (spec 3.1, 3.2).
 */
import { detectDiagramFormat, type DiagramFile, type DiagramFormat } from '@genoffice/drawio-model'

/** draw.io's embed export that produces a file of each format. */
export type DrawioFileExport = 'xml' | 'xmlsvg' | 'xmlpng'

export const EXPORT_OF_FORMAT: Readonly<Record<DiagramFormat, DrawioFileExport>> = {
  drawio: 'xml',
  dio: 'xml',
  'drawio.svg': 'xmlsvg',
  'drawio.png': 'xmlpng',
}

/** The serialization a save in `format` asks draw.io for. */
export function exportKindOf(format: DiagramFormat): DrawioFileExport {
  return EXPORT_OF_FORMAT[format]
}

/** The file-name endings, longest first so `.drawio.svg` wins over `.svg`. */
export const FORMAT_EXTENSIONS: Readonly<Record<DiagramFormat, string>> = {
  drawio: '.drawio',
  dio: '.dio',
  'drawio.svg': '.drawio.svg',
  'drawio.png': '.drawio.png',
}

/** The order Save As offers the formats in; a new diagram's first save proposes the first. */
export const SAVE_AS_FORMATS: readonly DiagramFormat[] = [
  'drawio',
  'dio',
  'drawio.svg',
  'drawio.png',
]

/** The dialog filter extensions (without the dot) for a format. */
export function filterExtension(format: DiagramFormat): string {
  return FORMAT_EXTENSIONS[format].slice(1)
}

/**
 * The format a path chosen in the save dialog is written in. The name decides
 * (spec 3.1); a name without a diagram ending takes the filter that was picked,
 * then `.drawio`.
 */
export function formatForSavePath(path: string, picked?: DiagramFormat | null): DiagramFormat {
  const byName = detectDiagramFormat(path)
  if (byName && byName !== 'vsdx') return byName
  return picked ?? 'drawio'
}

/**
 * The path a save writes: the chosen name, with the format's ending added
 * when the name does not carry it. A `.svg` or `.png` name chosen under a
 * diagram filter becomes `.drawio.svg` / `.drawio.png`, never a plain picture.
 */
export function withFormatExtension(path: string, format: DiagramFormat): string {
  const ending = FORMAT_EXTENSIONS[format]
  if (path.toLowerCase().endsWith(ending)) return path
  if (format === 'drawio.svg' && /\.svg$/i.test(path)) return `${path.slice(0, -4)}${ending}`
  if (format === 'drawio.png' && /\.png$/i.test(path)) return `${path.slice(0, -4)}${ending}`
  return `${path}${ending}`
}

/**
 * Whether the file stores its pages compressed, so saves keep compressing
 * (spec 3.2): an `mxfile compressed="true"`, or any page in the compressed
 * form. A new diagram is not compressed.
 */
export function isCompressedFile(file: Pick<DiagramFile, 'xml' | 'root' | 'pages'>): boolean {
  if (file.root !== 'mxfile') return false
  if (file.pages.some((page) => page.compressed)) return true
  const head = /<mxfile\b[^>]*>/.exec(file.xml)?.[0] ?? ''
  return /\scompressed\s*=\s*["']true["']/.test(head)
}

/**
 * Whether a save writes anything (spec 3.2): never for a diagram with no
 * change that already has its file. Save As, an untitled diagram and a
 * changed diagram are written.
 */
export function saveWrites(input: {
  mode: 'save' | 'saveAs'
  dirty: boolean
  hasPath: boolean
}): boolean {
  if (input.mode === 'saveAs') return true
  if (!input.hasPath) return true
  return input.dirty
}

/** The file name (no folders, no diagram ending) a path is shown and exported under. */
export function diagramBaseName(path: string | null | undefined): string {
  if (!path) return ''
  const name = path.split(/[\\/]/).pop() ?? ''
  const format = detectDiagramFormat(name)
  if (format) {
    const ending = format === 'vsdx' ? '.vsdx' : FORMAT_EXTENSIONS[format]
    return name.slice(0, name.length - ending.length)
  }
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** A file name base made safe for every file system. */
export function safeFileNameBase(name: string | undefined): string {
  return (name ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 80)
    .trim()
}
