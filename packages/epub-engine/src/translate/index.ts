// pdf-structure's root entry pulls in pdf2docx sources; their bidi-js shim is not on the include
// list of the packages that compile this one.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../pdf2docx/src/bidi-js.d.ts" />
/**
 * Book translation core (spec §8): units, store keys, the EPUB instruction,
 * the model call with its resends, the job on pdf-structure's engine, the
 * default target language, and the store migration after a save.
 */
export {
  EPUB_METADATA_FINGERPRINT,
  EPUB_METADATA_FINGERPRINT_SOURCE,
  epubBlockKeyString,
  epubChapterFingerprint,
  epubDocumentHash,
  epubTranslationKeys,
} from './keys'
export {
  EPUB_METADATA_PAGE,
  chapterTranslationUnits,
  epubTocLabels,
  epubTranslationUnits,
  metadataTranslationUnits,
  type EpubMetadataLabels,
  type EpubSkippedChapter,
  type EpubTranslationUnit,
  type EpubTranslationUnitOptions,
  type EpubTranslationUnits,
  type EpubUnitSource,
} from './units'
export {
  buildEpubTranslationRequest,
  epubTranslationSystemPrompt,
  type EpubTranslationRequestBlock,
} from './prompt'
export {
  EPUB_TRANSLATION_MAX_RESENDS,
  batchEpubTranslationItems,
  createEpubTranslationModelCall,
  epubUnitTokens,
  type EpubTranslationCallUnit,
  type EpubTranslationFailureReason,
} from './call'
export {
  epubTranslationJobParts,
  estimateEpubTranslationJob,
  planEpubTranslationJob,
  startEpubTranslationJob,
  type EpubTranslationJobPartsOptions,
  type EpubTranslationPlanInput,
  type StartEpubTranslationJobOptions,
} from './job'
export { defaultEpubTargetLanguage, epubBookLanguage, epubSampleText } from './language'
export { epubMigrationInfo, type EpubMigrationInfo } from './migrate'
export {
  EPUB_TRANSLATION_CLASS,
  buildTranslatedEpub,
  type BuildTranslatedEpubOptions,
  type BuildTranslatedEpubRefusal,
  type BuildTranslatedEpubResult,
  type EpubOriginalChapter,
  type EpubTranslationOutcome,
  type EpubTranslationOutputKind,
  type EpubTranslationReport,
  type EpubUntranslatedBlock,
  type EpubUntranslatedReason,
} from './output'
