/**
 * The canvas's own language for each app language. The drawing library has
 * no Malay; it falls back to English there.
 */
import type { Lang } from '@genoffice/i18n'

const CANVAS_LANG: Readonly<Record<Lang, string>> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  th: 'th-TH',
  id: 'id-ID',
  ru: 'ru-RU',
  ar: 'ar-SA',
  pt: 'pt-BR',
  it: 'it-IT',
  pl: 'pl-PL',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ms: 'en',
  he: 'he-IL',
  hi: 'hi-IN',
  'zh-TW': 'zh-TW',
  vi: 'vi-VN',
}

export function excalidrawLangCode(lang: Lang): string {
  return CANVAS_LANG[lang] ?? 'en'
}
