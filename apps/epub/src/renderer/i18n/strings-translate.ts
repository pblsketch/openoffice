import { defineStrings } from '@genoffice/i18n'
import { zh } from './translate/zh'
import { en } from './translate/en'
import { ja } from './translate/ja'
import { ko } from './translate/ko'
import { fr } from './translate/fr'
import { de } from './translate/de'
import { es } from './translate/es'
import { th } from './translate/th'
import { id } from './translate/id'
import { ru } from './translate/ru'
import { ar } from './translate/ar'
import { pt } from './translate/pt'
import { it } from './translate/it'
import { pl } from './translate/pl'
import { cs } from './translate/cs'
import { nl } from './translate/nl'
import { ms } from './translate/ms'
import { he } from './translate/he'
import { hi } from './translate/hi'
import { zhTW } from './translate/zh-TW'
import { vi } from './translate/vi'

/** User-visible strings: book translation: dialog, confirmation, progress, report */
export const translateStrings = defineStrings({
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
