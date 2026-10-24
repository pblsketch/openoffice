import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { OdtNotTextError, isOdtOpenError } from '@genoffice/odt-engine'
import { docToText } from './doc'
import { docxToText } from './docx'
import { epubToText } from './epub'
import { hwpToText } from './hwp'
import { odtToText } from './odt'
import { pdfToText } from './pdf'
import { pptToText } from './ppt'
import { pptxToText } from './pptx'
import { xlsxToText } from './xlsx'
import { xmindToText } from './xmind'
import { redactHtmlSource } from './html-redaction'
import { redactMarkdownSource } from './markdown-redaction'

export type ParsedFileKind = 'text' | 'image' | 'unsupported'

export interface ParsedFile {
  ok: boolean
  text?: string
  kind: ParsedFileKind
  mime?: string
  error?: string
}

/** No text extraction for images: callers read raw bytes and go multimodal (see @genoffice/ai-provider images support) */
const IMAGE_MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'py',
])

/**
 * Formats whose own editor can withhold a span from a model: the text is handed
 * over with each withheld span as its `{{label}}` marker. These throw on a mark
 * they cannot process, which the catch below turns into a failed read.
 */
const TEXT_REDACTORS: Record<string, (source: string) => string> = {
  md: redactMarkdownSource,
  markdown: redactMarkdownSource,
  // the markdown editor opens these two as well, and its Save As writes a
  // document under them with the withheld spans it holds
  txt: redactMarkdownSource,
  json: redactMarkdownSource,
  html: redactHtmlSource,
  htm: redactHtmlSource,
}

const FATAL_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })
// windows-1252 maps every byte, so this fallback can never fail
const WINDOWS_1252_DECODER = new TextDecoder('windows-1252')

/**
 * BOM-aware text decode; invalid UTF-8 falls back to windows-1252 so callers
 * index what survives. null only for a BOM-declared UTF-32 file.
 */
function decodeTextBytes(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (bytes[2] === 0 && bytes[3] === 0) return null // UTF-32LE BOM
    return bytes.toString('utf16le', 2)
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    // Node buffers have no 'utf-16be'; TextDecoder (full ICU, Node >= 14) does
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const payload = bom ? bytes.subarray(3) : bytes
  try {
    return FATAL_UTF8_DECODER.decode(payload)
  } catch {
    return WINDOWS_1252_DECODER.decode(payload)
  }
}

type BinaryKind = 'zip' | 'pdf' | 'ole2' | 'hwp3' | 'unknown'

/** How a Hangul 3.x document begins; Hangul 5 is an OLE2 file and HWPX a zip. */
const HWP3_SIGNATURE = Buffer.from('HWP Document File')

/** pdf.js scans the first 1024 bytes for the header, and leading junk before it
 *  (HTTP header remnants, whitespace) is common in the wild, so match the header
 *  where a real parser does rather than pinning it to bytes 0..3. */
const PDF_HEADER_WINDOW = 1024

/** The stream an encrypted OOXML package lives in (OLE2 directory names are UTF-16LE). */
const ENCRYPTED_PACKAGE_STREAM = Buffer.from('EncryptedPackage', 'utf16le')

function sniffBinary(bytes: Buffer): BinaryKind {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'
  if (bytes.subarray(0, PDF_HEADER_WINDOW).includes(Buffer.from('%PDF-'))) return 'pdf'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
    return 'ole2'
  if (bytes.subarray(0, HWP3_SIGNATURE.length).equals(HWP3_SIGNATURE)) return 'hwp3'
  return 'unknown'
}

/**
 * An ODT is a zip whose `mimetype` names an OpenDocument text document; the
 * engine checks that after its zip gate, so a zip with any other media type
 * (a docx, a spreadsheet, a template) surfaces here as a content mismatch.
 */
async function parseOdt(bytes: Buffer): Promise<ParsedFile> {
  try {
    return { ok: true, kind: 'text', text: await odtToText(bytes) }
  } catch (e) {
    if (isOdtOpenError(e, 'not-odt-text')) {
      const mediaType = e instanceof OdtNotTextError ? e.mediaType : null
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .odt file is not an OpenDocument text document (media type ${mediaType ?? 'missing'})`,
      }
    }
    if (isOdtOpenError(e, 'encrypted')) {
      return {
        ok: false,
        kind: 'text',
        error: 'Password-protected ODT: remove the password and attach it again',
      }
    }
    throw e
  }
}

/** parse an attachment into plain text (or flag it as image / unsupported) */
export async function parseFileToText(filePath: string): Promise<ParsedFile> {
  const ext = extname(filePath).slice(1).toLowerCase()
  const imageMime = IMAGE_MIMES[ext]
  if (imageMime) return { ok: true, kind: 'image', mime: imageMime }
  try {
    if (TEXT_EXTS.has(ext)) {
      const text = decodeTextBytes(await readFile(filePath))
      if (text === null) {
        return {
          ok: false,
          kind: 'text',
          error:
            'Unsupported text encoding: BOM-declared UTF-32 cannot be decoded (UTF-8 and UTF-16 are supported)',
        }
      }
      const redact = TEXT_REDACTORS[ext]
      if (redact) return { ok: true, kind: 'text', text: redact(text) }
      return { ok: true, kind: 'text', text }
    }
    const bytes = await readFile(filePath)
    const sniffed = sniffBinary(bytes)
    if (ext === 'pdf' && sniffed !== 'pdf') {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .pdf file has ${sniffed} magic bytes`,
      }
    }
    if (
      (ext === 'docx' || ext === 'odt' || ext === 'pptx' || ext === 'xlsx' || ext === 'xlsm') &&
      sniffed !== 'zip'
    ) {
      // an OOXML file with an open password is an OLE2 container around the
      // encrypted package, not a mislabeled file
      if (sniffed === 'ole2' && bytes.includes(ENCRYPTED_PACKAGE_STREAM)) {
        return {
          ok: false,
          kind: 'text',
          error: `Password-protected .${ext}: open it in its editor with the password, or remove the password and attach it again`,
        }
      }
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    if ((ext === 'xmind' || ext === 'epub') && sniffed !== 'zip') {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    // a DOCX saved under a .doc name is common enough that it parses as OOXML
    if (
      (ext === 'doc' && sniffed !== 'ole2' && sniffed !== 'zip') ||
      (ext === 'ppt' && sniffed !== 'ole2')
    ) {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    // .hwpx is a zip; a .hwp is Hangul 5 (OLE2) or Hangul 3, and now and then an
    // HWPX saved under the old name, which the engine reads by its content
    if (
      (ext === 'hwpx' && sniffed !== 'zip') ||
      (ext === 'hwp' && sniffed !== 'ole2' && sniffed !== 'hwp3' && sniffed !== 'zip')
    ) {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    switch (ext) {
      case 'hwp':
      case 'hwpx':
        return { ok: true, kind: 'text', text: await hwpToText(bytes) }
      case 'doc':
        return {
          ok: true,
          kind: 'text',
          text: sniffed === 'zip' ? await docxToText(bytes) : await docToText(bytes),
        }
      case 'docx':
        return { ok: true, kind: 'text', text: await docxToText(bytes) }
      case 'odt':
        return await parseOdt(bytes)
      case 'ppt':
        return { ok: true, kind: 'text', text: await pptToText(bytes) }
      case 'pptx':
        return { ok: true, kind: 'text', text: await pptxToText(bytes) }
      case 'xlsx':
      case 'xlsm':
        return { ok: true, kind: 'text', text: await xlsxToText(bytes) }
      case 'pdf':
        return { ok: true, kind: 'text', text: await pdfToText(bytes) }
      case 'xmind':
        return { ok: true, kind: 'text', text: await xmindToText(bytes) }
      case 'epub':
        return { ok: true, kind: 'text', text: await epubToText(bytes) }
    }
  } catch (e) {
    return { ok: false, kind: 'text', error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: false, kind: 'unsupported', error: `Unsupported file type: .${ext || 'unknown'}` }
}
