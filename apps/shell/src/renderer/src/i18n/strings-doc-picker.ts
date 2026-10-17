import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './doc-picker/zh'
import { en } from './doc-picker/en'
import { ja } from './doc-picker/ja'
import { ko } from './doc-picker/ko'
import { fr } from './doc-picker/fr'
import { de } from './doc-picker/de'
import { es } from './doc-picker/es'
import { th } from './doc-picker/th'
import { id } from './doc-picker/id'
import { ru } from './doc-picker/ru'
import { ar } from './doc-picker/ar'
import { pt } from './doc-picker/pt'
import { it } from './doc-picker/it'
import { pl } from './doc-picker/pl'
import { cs } from './doc-picker/cs'
import { nl } from './doc-picker/nl'
import { ms } from './doc-picker/ms'
import { he } from './doc-picker/he'
import { hi } from './doc-picker/hi'
import { zhTW } from './doc-picker/zh-TW'
import { vi } from './doc-picker/vi'

/**
 * The "Attach from GenOffice documents" window: strings for its two groups,
 * its notices and its buttons. Sharded per language; `zh` defines the key set.
 */
export const docPickerStrings = defineStrings({
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

export type DocPickerStringKey = keyof typeof zh

const translate = createI18n(docPickerStrings)

export function docPickerText(lang: Lang, key: DocPickerStringKey, params?: Params): string {
  return translate(lang, key, params)
}
