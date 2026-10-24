/**
 * The page's stand-in for `@genoffice/pdf-structure`'s package entry.
 *
 * The book translation core of the EPUB engine (`packages/epub-engine/src/
 * translate/{job,call,prompt,language,keys}.ts`) takes its helpers from the
 * pdf-structure package entry. That entry also carries the PDF tree builder,
 * which reaches Node-only modules (`node:zlib` through pdf2docx) and cannot be
 * bundled for the page. The renderer build points that one import name here
 * (`resolve.alias` in `electron.vite.config.ts` and `vite.renderer.config.ts`),
 * and this module hands out the same functions from pdf-structure's
 * environment-free modules, by relative path, the way the PDF editor's page
 * reads them. Nothing is copied: the engine's own code runs in the page.
 *
 * Every value the engine's translate modules import from the package entry
 * must be exported here; the renderer build fails on a missing one. Tests run
 * in Node without the alias and read the real entry.
 */
export * from '../../../../../packages/pdf-structure/src/jobs'
export * from '../../../../../packages/pdf-structure/src/translate'
export { runsText } from '../../../../../packages/pdf-structure/src/tree/inline'
export { sha256Hex } from '../../../../../packages/pdf-structure/src/tree/hash'
export {
  LANGUAGE_SAMPLE_CHARS,
  guessLanguageFromText,
} from '../../../../../packages/pdf-structure/src/epub/language'
export type { InlineRun } from '../../../../../packages/pdf-structure/src/tree/types'
