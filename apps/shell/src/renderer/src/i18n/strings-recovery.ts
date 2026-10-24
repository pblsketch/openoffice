import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './recovery/zh'
import { en } from './recovery/en'
import { ja } from './recovery/ja'
import { ko } from './recovery/ko'
import { fr } from './recovery/fr'
import { de } from './recovery/de'
import { es } from './recovery/es'
import { th } from './recovery/th'
import { id } from './recovery/id'
import { ru } from './recovery/ru'
import { ar } from './recovery/ar'
import { pt } from './recovery/pt'
import { it } from './recovery/it'
import { pl } from './recovery/pl'
import { cs } from './recovery/cs'
import { nl } from './recovery/nl'
import { ms } from './recovery/ms'
import { he } from './recovery/he'
import { hi } from './recovery/hi'
import { zhTW } from './recovery/zh-TW'
import { vi } from './recovery/vi'

/**
 * The Home screen's launch recovery list (documents with unsaved content
 * left). Sharded per language; `zh` defines the key set.
 */
export const recoveryListStrings = defineStrings({
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

export type RecoveryListStringKey = keyof typeof zh

const translate = createI18n(recoveryListStrings)

export function recoveryListText(lang: Lang, key: RecoveryListStringKey, params?: Params): string {
  return translate(lang, key, params)
}
