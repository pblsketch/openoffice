/**
 * The book model `openEpub` returns (spec §3). Plain data, apart from the
 * entry readers on `EpubBook`; nothing here is read from the zip until asked.
 */
import type { DecodedText } from './encoding'
import type { FontObfuscationAlgorithm } from './fonts'

/**
 * Why a book was not opened. The screen text for each (spec §3):
 * - `damaged`, `too-large`: the file is damaged or too large (the zip gate refused it)
 * - `not-epub`: not an EPUB file, or a damaged one (no container, no package, no manifest or spine)
 * - `drm`: the book is copy-protected and opens only in the store's own app
 */
export type EpubRefusalReason = 'damaged' | 'too-large' | 'not-epub' | 'drm'

/** `rendition:layout`: the whole book's, or one spine item's override. */
export type EpubLayout = 'reflowable' | 'pre-paginated'

export interface EpubIdentifier {
  /** the element's `id`, which `unique-identifier` may point at */
  id: string | null
  value: string
  /** `opf:scheme` (EPUB 2), when given */
  scheme: string | null
}

export interface EpubMetadata {
  /** the main title: the `dc:title` refined as `title-type` main, else the first one */
  title: string
  /** every `dc:title`, in order, trimmed */
  titles: string[]
  /** every `dc:creator`, in order, trimmed */
  creators: string[]
  /** every `dc:language`, in order, trimmed */
  languages: string[]
  identifiers: EpubIdentifier[]
  /** the value of the `dc:identifier` that `package@unique-identifier` names; null if none */
  uniqueIdentifier: string | null
  /** the global `rendition:layout`; `reflowable` when absent or unrecognised */
  layout: EpubLayout
  /** the `primary-writing-mode` meta's content, when present */
  primaryWritingMode: string | null
}

export interface EpubManifestItem {
  id: string
  /** the href as written in the package document */
  href: string
  /**
   * The zip entry path the href resolves to (percent-decoded, `..` stopped at
   * the zip root, matched case-insensitively when the exact name is missing).
   * Null when the href carries a scheme: such an item is never a zip entry.
   * The entry may still be absent from the archive; see `EpubBook.has`.
   */
  path: string | null
  mediaType: string
  properties: string[]
}

export interface EpubSpineItem {
  /** position among the usable spine items, from 0 */
  index: number
  idref: string
  /** zip entry path of the chapter; always present in the archive */
  path: string
  mediaType: string
  /** false for `linear="no"` */
  linear: boolean
  properties: string[]
  /** the itemref's own `rendition:layout-*` property, if any */
  layout: EpubLayout | null
  /** read-only because of fixed layout: the whole book or this item is pre-paginated */
  fixedLayout: boolean
}

export interface EpubSpine {
  /**
   * The itemrefs whose idref names a manifest item that is a zip entry, in
   * order. Itemrefs pointing elsewhere are left out.
   */
  items: EpubSpineItem[]
  /** `page-progression-direction` as written, or null when absent */
  pageProgressionDirection: 'ltr' | 'rtl' | 'default' | null
  /** the spine's `toc` attribute (EPUB 2 NCX id), or null */
  tocId: string | null
}

export interface EpubTocEntry {
  title: string
  /** zip entry path of the target; null for a label without a link or an outside link */
  path: string | null
  fragment: string | null
  /** index of the target in `spine.items`, or null when the target is not a spine item */
  spineIndex: number | null
  /** nesting depth, 1 for the top level */
  depth: number
}

export interface EpubToc {
  /** where the entries came from: EPUB 3 nav, EPUB 2 NCX, or built from the spine */
  source: 'nav' | 'ncx' | 'spine'
  /** flattened in document order */
  entries: EpubTocEntry[]
}

export interface EpubObfuscatedFont {
  path: string
  algorithm: FontObfuscationAlgorithm
}

/** Everything about an opened book that is plain data. */
export interface EpubBookInfo {
  /** zip entry path of the package document */
  opfPath: string
  /** major version: '3' for 3.x packages, '2' otherwise */
  version: '2' | '3'
  /** `package@version` as written */
  packageVersion: string
  metadata: EpubMetadata
  manifest: EpubManifestItem[]
  spine: EpubSpine
  toc: EpubToc
  /** the whole book is pre-paginated (read-only) */
  fixedLayout: boolean
  /** vertical writing per `primary-writing-mode` or the book's CSS */
  verticalWriting: boolean
  /** fonts listed in `encryption.xml` under one of the two obfuscation algorithms */
  obfuscatedFonts: EpubObfuscatedFont[]
  /** every file entry in the archive, in the archive's order */
  entryNames: string[]
}

/** An opened book: the plain data plus lazy access to its entries. */
export interface EpubBook extends EpubBookInfo {
  /** Whether `path` (normalised; `..` stops at the root) is a file entry. */
  has(path: string): boolean
  /** The entry's stored bytes (fonts still obfuscated), a fresh copy; null if absent. */
  read(path: string): Promise<Uint8Array | null>
  /** The entry decoded as text (see `decodeEntryText`); null if absent. */
  readText(path: string): Promise<DecodedText | null>
  /**
   * The bytes to draw with: an obfuscated font revealed, anything else as
   * stored. Never use this for saving.
   */
  readForRendering(path: string): Promise<Uint8Array | null>
}

export type EpubOpenResult =
  | { ok: true; book: EpubBook }
  | {
      ok: false
      reason: EpubRefusalReason
      /** English, for the log; not for the screen */
      detail: string
    }
