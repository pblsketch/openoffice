/**
 * The default target language of a book translation (spec §8): the UI
 * language, or English when the book is already in the UI language. The
 * book's language is its first `dc:language`; a book that names none (or
 * only `und`) gets pdf-structure's script-based guess from its text, with
 * that guess's limits (every Latin-script book reads as `en`).
 */
import {
  LANGUAGE_SAMPLE_CHARS,
  defaultTargetLanguage,
  guessLanguageFromText,
} from '@genoffice/pdf-structure'
import { EPUB_METADATA_PAGE, type EpubTranslationUnit } from './units'

type TargetLanguage = ReturnType<typeof defaultTargetLanguage>

const primary = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0]!

/** the book's language: the first named `dc:language`, else the guess from `sampleText` */
export function epubBookLanguage(
  languages: readonly string[],
  sampleText: string,
): string | undefined {
  const named = languages.map((l) => l.trim()).find((l) => l !== '' && primary(l) !== 'und')
  return named ?? guessLanguageFromText(sampleText)
}

/**
 * The default target: the UI language (normalized to one of the 21), or
 * English when the book's language has the same primary subtag.
 */
export function defaultEpubTargetLanguage(
  uiLanguage: string,
  bookLanguages: readonly string[],
  sampleText: string,
): TargetLanguage {
  // with no text to guess from, the PDF rule gives the normalized UI language
  const ui = defaultTargetLanguage(uiLanguage, '')
  const book = epubBookLanguage(bookLanguages, sampleText)
  return book !== undefined && primary(book) === primary(ui) ? 'en' : ui
}

/** the chapter text of the units, in order, up to the guess's sample size */
export function epubSampleText(units: readonly EpubTranslationUnit[]): string {
  const parts: string[] = []
  let length = 0
  for (const unit of units) {
    if (unit.page === EPUB_METADATA_PAGE) continue
    parts.push(unit.plainText)
    length += unit.plainText.length + 1
    if (length >= LANGUAGE_SAMPLE_CHARS) break
  }
  return parts.join('\n')
}
