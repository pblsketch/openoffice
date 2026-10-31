/**
 * BCP-47 tags `numfmt` uses for cell number formats (weekday/month names,
 * decimal and grouping marks). This is deliberately separate from the React
 * i18n module so plain modules (Univer locale wiring, format previews) do not
 * pull the translation dictionaries into their graph.
 *
 * Malay has no numfmt pack, so it keeps English formatting (the rest of the
 * UI still renders in Malay).
 */
const NUMFMT_LOCALES: Record<string, string> = {
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

export function numfmtLocaleFor(lang: string): string {
  return NUMFMT_LOCALES[lang] ?? 'en'
}
