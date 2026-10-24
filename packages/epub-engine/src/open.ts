/**
 * Opening a book (spec §3). The checks run in the spec's order and the first
 * one that fails decides the refusal:
 *
 * 1. the zip gate (metered inflation, then declared sizes)   → `damaged` / `too-large`
 * 2. `META-INF/container.xml` names a package document        → `not-epub`
 * 3. no `rights.xml`; `encryption.xml` lists only obfuscated fonts → `drm`
 * 4. the package document is XML with a manifest and a spine   → `not-epub`
 *
 * The order and compression of the `mimetype` entry are not checked. Nothing
 * is unpacked before the zip gate passes, and chapters are read only when
 * asked for (the spine-built table of contents, used when a book has none,
 * is the one exception).
 */
import {
  assertDeclaredSizesWithinLimits,
  assertZipInflatesWithinLimits,
  DEFAULT_ZIP_LIMITS,
  type ZipLimits,
} from '@genoffice/zip-gate'
import JSZip from 'jszip'
import { decodeEntryText, type DecodedText } from './encoding'
import {
  ADOBE_FONT_OBFUSCATION,
  fontObfuscationKey,
  obfuscateFontWithKey,
  type FontObfuscationAlgorithm,
} from './fonts'
import {
  CONTAINER_PATH,
  ENCRYPTION_PATH,
  NotEpubError,
  packagePathFromContainer,
  parsePackage,
  RIGHTS_PATH,
  scanEncryption,
} from './package'
import { normalizeZipPath } from './paths'
import { buildToc } from './toc'
import type {
  EpubBook,
  EpubBookInfo,
  EpubIdentifier,
  EpubObfuscatedFont,
  EpubOpenResult,
  EpubRefusalReason,
  EpubSpineItem,
} from './types'
import { cssDeclaresVerticalWriting, isVerticalWritingMode } from './writing-mode'
import { parseXml } from './xml'

/** The limits a book is opened with: the ones the other document engines share. */
export const EPUB_ZIP_LIMITS: ZipLimits = DEFAULT_ZIP_LIMITS

export interface EpubOpenOptions {
  /** zip limits to open with; `EPUB_ZIP_LIMITS` when left out */
  limits?: ZipLimits
  /**
   * The caller hands the bytes over: the book reads from them as they are,
   * with no copy of its own, and the caller must not change them afterwards.
   * Left out, the book works on its own copy.
   */
  takeOwnership?: boolean
}

/** The archive each book this engine opened reads from, for saving it without a reopen. */
const bookArchives = new WeakMap<EpubBook, JSZip>()

/**
 * @internal The loaded archive of a book `openEpub` gave out (it passed the
 * zip gate then); null for any other object.
 */
export function openedArchive(book: EpubBook): JSZip | null {
  return bookArchives.get(book) ?? null
}

class Refusal extends Error {
  constructor(
    readonly reason: EpubRefusalReason,
    detail: string,
  ) {
    super(detail)
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message || error.name : String(error)

/**
 * The zip gate's verdicts: a limit or a forged size is "too large"; anything
 * structural, including deflate data that does not inflate, is "damaged".
 */
function gateReason(error: unknown): EpubRefusalReason {
  const message = messageOf(error)
  return message.startsWith('zip rejected:') && !message.includes('cannot be inflated')
    ? 'too-large'
    : 'damaged'
}

/** File entries of a loaded archive, looked up exactly or, failing that, ignoring case. */
class Archive {
  readonly names: string[]
  private readonly byLowerCase = new Map<string, string>()

  constructor(private readonly zip: JSZip) {
    this.names = Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
    for (const name of this.names) {
      const lower = name.toLowerCase()
      if (!this.byLowerCase.has(lower)) this.byLowerCase.set(lower, name)
    }
  }

  /** The archive's own name for `path`, or null when there is no such file entry. */
  find(path: string): string | null {
    const normalized = normalizeZipPath(path)
    const file = this.zip.files[normalized]
    if (file && !file.dir) return normalized
    return this.byLowerCase.get(normalized.toLowerCase()) ?? null
  }

  async read(path: string): Promise<Uint8Array | null> {
    const name = this.find(path)
    if (name === null) return null
    // A copy: JSZip may hand back a view of its own buffer.
    return new Uint8Array(await this.zip.files[name]!.async('uint8array'))
  }

  async readText(path: string): Promise<DecodedText | null> {
    const bytes = await this.read(path)
    return bytes ? decodeEntryText(bytes) : null
  }

  declaredParts(): { name: string; usize: number }[] {
    return this.names.map((name) => ({
      name,
      usize:
        (this.zip.files[name] as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize ?? 0,
    }))
  }
}

/**
 * The identifier each algorithm keys from. IDPF uses the unique identifier;
 * Adobe needs a UUID, so it falls back to the first identifier that is one.
 */
function keyFor(
  algorithm: FontObfuscationAlgorithm,
  unique: string | null,
  identifiers: EpubIdentifier[],
): Uint8Array | null {
  const candidates = [...(unique !== null ? [unique] : []), ...identifiers.map((i) => i.value)]
  if (algorithm !== ADOBE_FONT_OBFUSCATION) {
    return candidates.length > 0 ? fontObfuscationKey(algorithm, candidates[0]!) : null
  }
  for (const candidate of candidates) {
    const key = fontObfuscationKey(algorithm, candidate)
    if (key) return key
  }
  return null
}

type FontKeys = Map<string, { algorithm: FontObfuscationAlgorithm; key: Uint8Array }>

function bookFrom(info: EpubBookInfo, zip: JSZip, archive: Archive, fontKeys: FontKeys): EpubBook {
  const book: EpubBook = {
    ...info,
    has: (path) => archive.find(path) !== null,
    read: (path) => archive.read(path),
    readText: (path) => archive.readText(path),
    readForRendering: async (path) => {
      const name = archive.find(path)
      if (name === null) return null
      const bytes = await archive.read(name)
      const font = fontKeys.get(name)
      return bytes && font ? obfuscateFontWithKey(bytes, font.algorithm, font.key) : bytes
    },
  }
  bookArchives.set(book, zip)
  return book
}

/**
 * Opens a book held in memory. Never throws for anything in the file and
 * never changes the bytes it is given; the book works on its own copy unless
 * the caller hands the bytes over (`takeOwnership`).
 */
export async function openEpub(
  input: Uint8Array,
  options: EpubOpenOptions = {},
): Promise<EpubOpenResult> {
  try {
    return { ok: true, book: await openOrRefuse(input, options) }
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.reason, detail: error.message }
    if (error instanceof NotEpubError) {
      return { ok: false, reason: 'not-epub', detail: error.message }
    }
    return { ok: false, reason: 'damaged', detail: messageOf(error) }
  }
}

async function openOrRefuse(input: Uint8Array, options: EpubOpenOptions): Promise<EpubBook> {
  // Handed over: a plain view of the same memory (a Node byte buffer is read
  // as one, as a copy would be). Otherwise a real copy: `slice` on a Node byte
  // buffer would only be another view.
  const bytes = options.takeOwnership
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input)
  const limits = options.limits ?? EPUB_ZIP_LIMITS

  // 1. zip gate
  try {
    await assertZipInflatesWithinLimits(bytes, limits)
  } catch (error) {
    throw new Refusal(gateReason(error), messageOf(error))
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch (error) {
    throw new Refusal('damaged', `the archive cannot be read: ${messageOf(error)}`)
  }
  const archive = new Archive(zip)
  try {
    assertDeclaredSizesWithinLimits(archive.declaredParts(), limits)
  } catch (error) {
    throw new Refusal('too-large', messageOf(error))
  }

  // 2. container
  const container = await archive.readText(CONTAINER_PATH)
  if (!container) throw new NotEpubError(`the archive has no ${CONTAINER_PATH}`)
  const opfPath = archive.find(packagePathFromContainer(parseOrNotEpub(container, CONTAINER_PATH)))
  if (opfPath === null) {
    throw new NotEpubError(`the package document named in ${CONTAINER_PATH} is missing`)
  }

  // 3. DRM
  if (archive.find(RIGHTS_PATH) !== null) throw new Refusal('drm', `the archive has ${RIGHTS_PATH}`)
  const encryption = await archive.readText(ENCRYPTION_PATH)
  const scan = encryption
    ? scanEncryption(parseOrNotEpub(encryption, ENCRYPTION_PATH))
    : { drm: null, fonts: [] }
  if (scan.drm !== null) throw new Refusal('drm', `${ENCRYPTION_PATH}: ${scan.drm}`)

  // 4. package document
  const opfText = (await archive.readText(opfPath))!
  const parsed = parsePackage(parseOrNotEpub(opfText, opfPath), opfPath, (p) => archive.find(p))
  const fixedLayout = parsed.metadata.layout === 'pre-paginated'
  const manifestById = new Map(parsed.manifest.map((m) => [m.id, m]))
  const spineItems: EpubSpineItem[] = []
  for (const ref of parsed.spineRefs) {
    const item = manifestById.get(ref.idref)
    const path = item?.path == null ? null : archive.find(item.path)
    if (!item || path === null) continue
    spineItems.push({
      index: spineItems.length,
      idref: ref.idref,
      path,
      mediaType: item.mediaType,
      linear: ref.linear,
      properties: ref.properties,
      layout: ref.layout,
      fixedLayout: fixedLayout || ref.layout === 'pre-paginated',
    })
  }
  if (spineItems.length === 0) throw new NotEpubError(`${opfPath} has no chapter in the archive`)
  const spine = {
    items: spineItems,
    pageProgressionDirection: parsed.pageProgressionDirection,
    tocId: parsed.tocId,
  }

  const fontKeys: FontKeys = new Map()
  const obfuscatedFonts: EpubObfuscatedFont[] = []
  for (const font of scan.fonts) {
    const name = archive.find(font.path)
    if (name === null || obfuscatedFonts.some((f) => f.path === name)) continue
    obfuscatedFonts.push({ path: name, algorithm: font.algorithm })
    const key = keyFor(
      font.algorithm,
      parsed.metadata.uniqueIdentifier,
      parsed.metadata.identifiers,
    )
    if (key) fontKeys.set(name, { algorithm: font.algorithm, key })
  }

  const toc = await buildToc({
    manifest: parsed.manifest,
    spine,
    findEntry: (p) => archive.find(p),
    readText: (p) => archive.readText(p),
  })

  const info: EpubBookInfo = {
    opfPath,
    version: parsed.version,
    packageVersion: parsed.packageVersion,
    metadata: parsed.metadata,
    manifest: parsed.manifest,
    spine,
    toc,
    fixedLayout,
    verticalWriting: await detectVerticalWriting(archive, parsed),
    obfuscatedFonts,
    entryNames: [...archive.names],
  }
  return bookFrom(info, zip, archive, fontKeys)
}

function parseOrNotEpub(decoded: DecodedText, path: string) {
  try {
    return parseXml(decoded.text)
  } catch (error) {
    throw new NotEpubError(`${path} is not well-formed XML: ${messageOf(error)}`)
  }
}

async function detectVerticalWriting(
  archive: Archive,
  parsed: { metadata: { primaryWritingMode: string | null }; manifest: EpubBookInfo['manifest'] },
): Promise<boolean> {
  if (isVerticalWritingMode(parsed.metadata.primaryWritingMode)) return true
  for (const item of parsed.manifest) {
    if (item.mediaType !== 'text/css' || item.path === null) continue
    const css = await archive.readText(item.path)
    if (css && cssDeclaresVerticalWriting(css.text)) return true
  }
  return false
}
