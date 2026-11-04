/**
 * Target languages (spec §8): the 21 UI languages. The default is the UI
 * language, or English when the document is already in the UI language.
 *
 * The document language comes from the EPUB writer's script-based guess
 * (guessLanguageFromText), so it inherits that guess's limits: every
 * Latin-script document reads as `en` and every Han-only one as `zh`.
 * Languages are compared by their primary subtag, so a Chinese document
 * matches both Chinese UIs (`zh`, `zh-TW`).
 */
import { LANGS, isLang, normalizeLang, type Lang } from '../../../i18n/src/index'
import { guessLanguageFromText, treeSampleText } from '../epub/language'
import type { DocumentTree } from '../tree/types'

/** the languages a document can be translated into: the UI languages */
export const TRANSLATION_LANGUAGES: readonly Lang[] = LANGS

export function isTranslationLanguage(code: unknown): code is Lang {
  return isLang(code)
}

/** English names the translation instruction uses */
const LANGUAGE_NAMES: Record<Lang, string> = {
  zh: 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  th: 'Thai',
  id: 'Indonesian',
  ru: 'Russian',
  ar: 'Arabic',
  pt: 'Portuguese',
  it: 'Italian',
  pl: 'Polish',
  cs: 'Czech',
  nl: 'Dutch',
  ms: 'Malay',
  he: 'Hebrew',
  hi: 'Hindi',
  'zh-TW': 'Traditional Chinese',
  vi: 'Vietnamese',
}

/** English name of a target language; the code itself when unknown */
export function translationLanguageName(code: string): string {
  return isLang(code) ? LANGUAGE_NAMES[code] : code
}

const primary = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0]!

/** default target for a document whose text is `documentText` */
export function defaultTargetLanguage(uiLanguage: string, documentText: string): Lang {
  const ui = isLang(uiLanguage) ? uiLanguage : normalizeLang(uiLanguage)
  const doc = guessLanguageFromText(documentText)
  return doc !== undefined && primary(doc) === primary(ui) ? 'en' : ui
}

/**
 * The document language of a tree, guessed once from its original
 * (untranslated) text; undefined when the text is too thin to guess. A
 * translation splits its units into sentences by this language's rules.
 */
export function translationSourceLanguage(tree: DocumentTree): string | undefined {
  return guessLanguageFromText(treeSampleText(tree, (b) => b.translationOf === undefined))
}

/** default target for a tree, guessed from its original (untranslated) text */
export function defaultTargetLanguageForTree(tree: DocumentTree, uiLanguage: string): Lang {
  return defaultTargetLanguage(
    uiLanguage,
    treeSampleText(tree, (b) => b.translationOf === undefined),
  )
}

/** target languages whose sentences follow one another with no space between them */
const UNSPACED_SENTENCES = new Set(['zh', 'ja'])

/**
 * What goes between two translated sentences when they are joined into the
 * block's text (spec 4.2): nothing for Chinese (`zh`, `zh-TW`) and Japanese,
 * one space for every other target language.
 */
export function translationSentenceSeparator(lang: string): string {
  return UNSPACED_SENTENCES.has(primary(lang)) ? '' : ' '
}
