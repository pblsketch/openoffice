import { aiStrings } from './strings-ai'
import { appStrings } from './strings-app'
import { editStrings } from './strings-edit'
import { translateStrings } from './strings-translate'

/**
 * Every dictionary of the editor, merged per language: reading (`app/`),
 * editing (`edit/`), the AI panel (`ai/`) and book translation
 * (`translate/`). The per-language shards are never merged into one object.
 */
export const strings = {
  zh: {
    ...appStrings.zh,
    ...editStrings.zh,
    ...aiStrings.zh,
    ...translateStrings.zh,
  },
  en: {
    ...appStrings.en,
    ...editStrings.en,
    ...aiStrings.en,
    ...translateStrings.en,
  },
  ja: {
    ...appStrings.ja,
    ...editStrings.ja,
    ...aiStrings.ja,
    ...translateStrings.ja,
  },
  ko: {
    ...appStrings.ko,
    ...editStrings.ko,
    ...aiStrings.ko,
    ...translateStrings.ko,
  },
  fr: {
    ...appStrings.fr,
    ...editStrings.fr,
    ...aiStrings.fr,
    ...translateStrings.fr,
  },
  de: {
    ...appStrings.de,
    ...editStrings.de,
    ...aiStrings.de,
    ...translateStrings.de,
  },
  es: {
    ...appStrings.es,
    ...editStrings.es,
    ...aiStrings.es,
    ...translateStrings.es,
  },
  th: {
    ...appStrings.th,
    ...editStrings.th,
    ...aiStrings.th,
    ...translateStrings.th,
  },
  id: {
    ...appStrings.id,
    ...editStrings.id,
    ...aiStrings.id,
    ...translateStrings.id,
  },
  ru: {
    ...appStrings.ru,
    ...editStrings.ru,
    ...aiStrings.ru,
    ...translateStrings.ru,
  },
  ar: {
    ...appStrings.ar,
    ...editStrings.ar,
    ...aiStrings.ar,
    ...translateStrings.ar,
  },
  pt: {
    ...appStrings.pt,
    ...editStrings.pt,
    ...aiStrings.pt,
    ...translateStrings.pt,
  },
  it: {
    ...appStrings.it,
    ...editStrings.it,
    ...aiStrings.it,
    ...translateStrings.it,
  },
  pl: {
    ...appStrings.pl,
    ...editStrings.pl,
    ...aiStrings.pl,
    ...translateStrings.pl,
  },
  cs: {
    ...appStrings.cs,
    ...editStrings.cs,
    ...aiStrings.cs,
    ...translateStrings.cs,
  },
  nl: {
    ...appStrings.nl,
    ...editStrings.nl,
    ...aiStrings.nl,
    ...translateStrings.nl,
  },
  ms: {
    ...appStrings.ms,
    ...editStrings.ms,
    ...aiStrings.ms,
    ...translateStrings.ms,
  },
  he: {
    ...appStrings.he,
    ...editStrings.he,
    ...aiStrings.he,
    ...translateStrings.he,
  },
  hi: {
    ...appStrings.hi,
    ...editStrings.hi,
    ...aiStrings.hi,
    ...translateStrings.hi,
  },
  vi: {
    ...appStrings.vi,
    ...editStrings.vi,
    ...aiStrings.vi,
    ...translateStrings.vi,
  },
  'zh-TW': {
    ...appStrings['zh-TW'],
    ...editStrings['zh-TW'],
    ...aiStrings['zh-TW'],
    ...translateStrings['zh-TW'],
  },
}
