/**
 * Document translation core (spec §8): units, batching, placeholders, the
 * translation instruction, the model call with its resends, the default
 * target language, and the translated / bilingual / partial builds. The job
 * itself (resume, restart, stops) runs on the job engine (../jobs/translate).
 * The easy explanation is the second mode of all of it (`TranslationMode`).
 */
export { TRANSLATION_MODES, isTranslationMode, type TranslationMode } from '../store/job-keys'
export {
  BLOCK_OVERHEAD_TOKENS,
  SENTENCE_OVERHEAD_TOKENS,
  TRANSLATION_BATCH_TOKENS,
  batchTranslationItems,
  blockTokens,
  estimateTokens,
  type BatchOptions,
} from './batch'
export {
  decodeTranslation,
  encodeRuns,
  type DecodedTranslation,
  type EncodedBlock,
  type PlaceholderFailure,
} from './placeholders'
export {
  SENTENCE_ABBREVIATIONS,
  placeholderTags,
  splitSentences,
  type EncodedSentence,
  type SentenceSplit,
} from './sentences'
export {
  buildTranslationRequest,
  parseSentenceTranslationOutput,
  parseTranslationOutput,
  translationSystemPrompt,
  type TranslationRequest,
  type TranslationRequestBlock,
} from './prompt'
export {
  TRANSLATION_MAX_RESENDS,
  createTranslationModelCall,
  type TranslationFailureReason,
  type TranslationModelCallOptions,
  type TranslationModelRequest,
  type TranslationSend,
} from './call'
export {
  TRANSLATION_LANGUAGES,
  defaultTargetLanguage,
  defaultTargetLanguageForTree,
  isTranslationLanguage,
  translationLanguageName,
  translationSentenceSeparator,
  translationSourceLanguage,
} from './language'
export { EASY_LENGTH_FACTOR, easyStyleLines, translationStyleLines } from './style'
export { easyExplanationLabel } from './easy-label'
export {
  buildBilingualTree,
  buildTranslatedTree,
  translationJobParts,
  translationReport,
  translationUnits,
  type TranslationJobPartsOptions,
  type TranslationReport,
  type TranslationUnitOptions,
  type UntranslatedBlock,
} from './result'
