/**
 * The EPUB engine without book translation: opening, the block map and its
 * notation, range edits, text extraction and saving. It does not reach the PDF
 * translation machinery, so callers that only read or edit books (attachment
 * parsing, renderers) stay free of it.
 */
export { openEpub, EPUB_ZIP_LIMITS } from './open'
export type { EpubOpenOptions } from './open'
export type {
  EpubBook,
  EpubBookInfo,
  EpubIdentifier,
  EpubLayout,
  EpubManifestItem,
  EpubMetadata,
  EpubObfuscatedFont,
  EpubOpenResult,
  EpubRefusalReason,
  EpubSpine,
  EpubSpineItem,
  EpubToc,
  EpubTocEntry,
} from './types'
export { directoryOf, fileNameOf, hasUrlScheme, normalizeZipPath, resolveHref } from './paths'
export type { ResolvedHref } from './paths'
export {
  ADOBE_FONT_OBFUSCATION,
  IDPF_FONT_OBFUSCATION,
  deobfuscateFont,
  fontObfuscationKey,
  isFontObfuscationAlgorithm,
  obfuscateFont,
  obfuscateFontWithKey,
} from './fonts'
export type { FontObfuscationAlgorithm } from './fonts'
export { decodeEntryText, encodeEntryText } from './encoding'
export type { DecodedText, EpubTextEncoding } from './encoding'
export { cssDeclaresVerticalWriting, isVerticalWritingMode } from './writing-mode'
export * from './xml-positions'
export * from './ranges'
export * from './blocks'
export {
  blockNotation,
  blockPlainText,
  checkNotation,
  escapeNotationText,
  newBlockNotationToXhtml,
  notationToXhtml,
  type BlockNotation,
  type MarkSource,
  type NotationContext,
  type NotationOptions,
  type NotationResult,
  type PlaceholderSource,
} from './notation'
export * from './edits'
export * from './text'
export { formatModifiedTimestamp, modifiedReplacements, saveEpub } from './save'
export type {
  EpubChapterEdits,
  EpubSaveOptions,
  EpubSaveRefusalReason,
  EpubSaveResult,
} from './save'
