import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './pdf-tools/zh'
import { en } from './pdf-tools/en'
import { ja } from './pdf-tools/ja'
import { ko } from './pdf-tools/ko'
import { fr } from './pdf-tools/fr'
import { de } from './pdf-tools/de'
import { es } from './pdf-tools/es'
import { th } from './pdf-tools/th'
import { id } from './pdf-tools/id'
import { ru } from './pdf-tools/ru'
import { ar } from './pdf-tools/ar'
import { pt } from './pdf-tools/pt'
import { it } from './pdf-tools/it'
import { pl } from './pdf-tools/pl'
import { cs } from './pdf-tools/cs'
import { nl } from './pdf-tools/nl'
import { ms } from './pdf-tools/ms'
import { he } from './pdf-tools/he'
import { hi } from './pdf-tools/hi'
import { zhTW } from './pdf-tools/zh-TW'
import { vi } from './pdf-tools/vi'

/**
 * The PDF tools window. Sharded per language; `zh` defines the key set. The
 * tool and option names (`tool*`, `optPerSheet` … `optRotateLeft`) are the PDF
 * editor's own ribbon strings, copied so both places name a command the same.
 */
export const pdfToolsStrings = defineStrings({
  zh,
  en,
  ja,
  ko,
  fr,
  de,
  es,
  th,
  id,
  ru,
  ar,
  pt,
  it,
  pl,
  cs,
  nl,
  ms,
  he,
  hi,
  'zh-TW': zhTW,
  vi,
})

export type PdfToolsStringKey = keyof typeof zh

const translate = createI18n(pdfToolsStrings)

export function pdfToolsText(lang: Lang, key: PdfToolsStringKey, params?: Params): string {
  return translate(lang, key, params)
}
