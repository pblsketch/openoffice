import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './home-kinds/zh'
import { en } from './home-kinds/en'
import { ja } from './home-kinds/ja'
import { ko } from './home-kinds/ko'
import { fr } from './home-kinds/fr'
import { de } from './home-kinds/de'
import { es } from './home-kinds/es'
import { th } from './home-kinds/th'
import { id } from './home-kinds/id'
import { ru } from './home-kinds/ru'
import { ar } from './home-kinds/ar'
import { pt } from './home-kinds/pt'
import { it } from './home-kinds/it'
import { pl } from './home-kinds/pl'
import { cs } from './home-kinds/cs'
import { nl } from './home-kinds/nl'
import { ms } from './home-kinds/ms'
import { he } from './home-kinds/he'
import { hi } from './home-kinds/hi'
import { zhTW } from './home-kinds/zh-TW'
import { vi } from './home-kinds/vi'

/**
 * Settings → General "new documents on Home" row.
 * Sharded per language; `zh` defines the key set.
 */
export const homeKindsStrings = defineStrings({
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

export type HomeKindsStringKey = keyof typeof zh

const translate = createI18n(homeKindsStrings)

export function homeKindsText(lang: Lang, key: HomeKindsStringKey, params?: Params): string {
  return translate(lang, key, params)
}
