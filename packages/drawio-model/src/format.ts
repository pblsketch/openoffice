/**
 * Which files are diagrams, and getting the draw.io XML out of them.
 *
 * - `.drawio`, `.dio`: the file is the XML (UTF-8).
 * - `.drawio.svg`: the XML is in the root's `content` attribute; draw.io may
 *   also have URI-encoded or base64-encoded it there.
 * - `.drawio.png`: the XML is in a `tEXt`/`zTXt`/`iTXt` chunk with the keyword
 *   `mxfile` (or the older `mxGraphModel`), usually URI-encoded.
 */
import { base64Decode, latin1Decode, type PageCodec } from './codec'
import { parseXmlTree, getAttr, XmlParseError } from './xml-tree'

export type DiagramFormat = 'drawio' | 'dio' | 'drawio.svg' | 'drawio.png'

/**
 * Why a file cannot be opened as a diagram:
 * - `unsupported`: the name is not a diagram (or is `.vsdx`, which only the app imports);
 * - `no_original`: a `.drawio.svg`/`.drawio.png` without the diagram inside;
 * - `corrupt_image`: a `.drawio.png` that is not a readable PNG;
 * - `not_xml`: the file or a page is not XML (or not UTF-8);
 * - `decompress_failed`: a compressed page or embedded original cannot be decoded;
 * - `no_diagram`: XML without an `mxfile`/`mxGraphModel`, or an `mxfile` without pages.
 */
export type DiagramOpenReason =
  'unsupported' | 'no_original' | 'corrupt_image' | 'not_xml' | 'decompress_failed' | 'no_diagram'

export interface DiagramOpenFailure {
  ok: false
  reason: DiagramOpenReason
  message: string
}

export function openFailure(reason: DiagramOpenReason, message: string): DiagramOpenFailure {
  return { ok: false, reason, message }
}

/** The format by file-name ending (case-insensitive); `null` when it is not a diagram name. */
export function detectDiagramFormat(fileName: string): DiagramFormat | 'vsdx' | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.drawio.svg')) return 'drawio.svg'
  if (name.endsWith('.drawio.png')) return 'drawio.png'
  if (name.endsWith('.drawio')) return 'drawio'
  if (name.endsWith('.dio')) return 'dio'
  if (name.endsWith('.vsdx')) return 'vsdx'
  return null
}

export type DiagramExtractResult =
  { ok: true; format: DiagramFormat; xml: string; bom: boolean } | DiagramOpenFailure

const strictUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * Normalises an embedded original as draw.io reads it: plain XML, a
 * URI-encoded string, or base64 of either.
 */
function decodeEmbedded(content: string): string | null {
  const text = content.trim()
  try {
    if (text.startsWith('<')) return text
    if (text.startsWith('%')) return decodeURIComponent(text)
    const bytes = base64Decode(text)
    if (!bytes) return null
    const latin1 = latin1Decode(bytes)
    if (latin1.startsWith('%')) return decodeURIComponent(latin1)
    if (latin1.trimStart().startsWith('<')) return strictUtf8(bytes)
    return null
  } catch {
    return null
  }
}

const BOM = new RegExp('^' + String.fromCharCode(0xfeff))

function extractFromSvg(bytes: Uint8Array): DiagramExtractResult {
  const text = strictUtf8(bytes)
  if (text === null) return openFailure('not_xml', 'the SVG is not UTF-8 text')
  let content: string | undefined
  try {
    const root = parseXmlTree(text.replace(BOM, '')).root
    content = root.name === 'svg' ? getAttr(root, 'content') : undefined
  } catch (error) {
    if (error instanceof XmlParseError) {
      return openFailure('not_xml', `the SVG is not XML: ${error.message}`)
    }
    throw error
  }
  if (content === undefined || content.trim() === '') {
    return openFailure('no_original', 'the SVG has no draw.io diagram inside')
  }
  const xml = decodeEmbedded(content)
  if (xml === null)
    return openFailure('decompress_failed', 'the diagram inside the SVG cannot be decoded')
  return { ok: true, format: 'drawio.svg', xml, bom: false }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_KEYWORDS = new Set(['mxfile', 'mxGraphModel'])

/** Inflates a zlib stream (2-byte header, raw deflate, 4-byte checksum). */
function inflateZlib(data: Uint8Array, codec: PageCodec): Uint8Array {
  if (data.length < 6 || (data[0]! & 0x0f) !== 8) throw new Error('not a zlib stream')
  return codec.inflateRaw(data.subarray(2, data.length - 4))
}

function readPngText(bytes: Uint8Array, codec: PageCodec): string | null | 'corrupt' {
  if (bytes.length < 8 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return 'corrupt'
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 8
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p)
    const type = latin1Decode(bytes.subarray(p + 4, p + 8))
    const end = p + 12 + length
    if (end > bytes.length) return 'corrupt'
    const data = bytes.subarray(p + 8, p + 8 + length)
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const nul = data.indexOf(0)
      const keyword = nul < 0 ? '' : latin1Decode(data.subarray(0, nul))
      if (PNG_KEYWORDS.has(keyword)) {
        if (type === 'tEXt') {
          const value = data.subarray(nul + 1)
          return strictUtf8(value) ?? latin1Decode(value)
        }
        if (type === 'zTXt') {
          return latin1Decode(inflateZlib(data.subarray(nul + 2), codec))
        }
        // iTXt: keyword, flag, method, language\0, translated keyword\0, text
        const compressed = data[nul + 1] === 1
        const langEnd = data.indexOf(0, nul + 3)
        const transEnd = langEnd < 0 ? -1 : data.indexOf(0, langEnd + 1)
        if (transEnd < 0) return 'corrupt'
        const value = data.subarray(transEnd + 1)
        const raw = compressed ? inflateZlib(value, codec) : value
        return new TextDecoder('utf-8', { fatal: true }).decode(raw)
      }
    }
    if (type === 'IEND') break
    p = end
  }
  return null
}

function extractFromPng(bytes: Uint8Array, codec: PageCodec): DiagramExtractResult {
  let text: string | null | 'corrupt'
  try {
    text = readPngText(bytes, codec)
  } catch {
    return openFailure('decompress_failed', 'the diagram inside the PNG cannot be decoded')
  }
  if (text === 'corrupt') return openFailure('corrupt_image', 'the file is not a readable PNG')
  if (text === null) return openFailure('no_original', 'the PNG has no draw.io diagram inside')
  const xml = decodeEmbedded(text)
  if (xml === null)
    return openFailure('decompress_failed', 'the diagram inside the PNG cannot be decoded')
  return { ok: true, format: 'drawio.png', xml, bom: false }
}

/** Gets the draw.io XML out of a file's bytes, choosing the way by its name. */
export function extractDiagramXml(
  fileName: string,
  bytes: Uint8Array,
  codec: PageCodec,
): DiagramExtractResult {
  const format = detectDiagramFormat(fileName)
  if (format === null || format === 'vsdx') {
    return openFailure(
      'unsupported',
      format === 'vsdx'
        ? 'Visio files are imported by the app, not read as diagrams'
        : 'only .drawio, .dio, .drawio.svg and .drawio.png files are diagrams',
    )
  }
  if (format === 'drawio.svg') return extractFromSvg(bytes)
  if (format === 'drawio.png') return extractFromPng(bytes, codec)
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const text = strictUtf8(bom ? bytes.subarray(3) : bytes)
  if (text === null) return openFailure('not_xml', 'the file is not UTF-8 text')
  return { ok: true, format, xml: text, bom }
}
