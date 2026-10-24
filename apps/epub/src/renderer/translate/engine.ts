/**
 * The parts of the book translation core the page runs (spec §8): the job on
 * pdf-structure's job engine with the EPUB batching and model call, the
 * pre-start estimate, and the default target language.
 *
 * They come from the engine's own modules, not from the package entry (the
 * entry also carries the result-book builder, which only the main process
 * runs). Their pdf-structure helpers reach the page through
 * `pdf-structure-browser.ts` (see there). Types still come from the package
 * entries.
 */
export {
  estimateEpubTranslationJob,
  startEpubTranslationJob,
} from '../../../../../packages/epub-engine/src/translate/job'
export {
  defaultEpubTargetLanguage,
  epubBookLanguage,
  epubSampleText,
} from '../../../../../packages/epub-engine/src/translate/language'
export { EPUB_METADATA_PAGE } from '../../../../../packages/epub-engine/src/translate/units'
export {
  DocumentJobBusyError,
  TRANSLATION_LANGUAGES,
  documentJobs,
  isTranslationLanguage,
} from './pdf-structure-browser'
