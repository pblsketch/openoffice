/**
 * The words that mark an easy explanation, in each of the 21 target
 * languages. A result made in the easy mode (the EPUB result book's title,
 * the result files of the PDF and EPUB editors) carries them in its own
 * language, so a reader can tell it from a plain translation.
 */
import { isLang, normalizeLang, type Lang } from '../../../i18n/src/index'

/** "easy explanation", in the language it labels */
const EASY_EXPLANATION_LABELS: Record<Lang, string> = {
  zh: '通俗易懂版',
  en: 'Plain-language version',
  ja: 'やさしい言葉版',
  ko: '쉬운 풀이',
  fr: 'Version facile à lire',
  de: 'Fassung in einfacher Sprache',
  es: 'Versión de lectura fácil',
  th: 'ฉบับอ่านง่าย',
  id: 'Versi bahasa sederhana',
  ru: 'Версия простым языком',
  ar: 'نسخة بلغة مبسطة',
  pt: 'Versão em linguagem simples',
  it: 'Versione in linguaggio semplice',
  pl: 'Wersja w prostym języku',
  cs: 'Verze v jednoduchém jazyce',
  nl: 'Versie in eenvoudige taal',
  ms: 'Versi bahasa mudah',
  he: 'גרסה בשפה פשוטה',
  hi: 'सरल भाषा संस्करण',
  'zh-TW': '淺顯易懂版',
  vi: 'Bản dễ hiểu',
}

/**
 * The easy-explanation marker in `lang` (a target language code); a tag that
 * is not one of the 21 is read the way the UI reads a locale (`zh-Hant` →
 * `zh-TW`, unknown → English).
 */
export function easyExplanationLabel(lang: string): string {
  return EASY_EXPLANATION_LABELS[isLang(lang) ? lang : normalizeLang(lang)]
}
