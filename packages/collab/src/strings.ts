/** The share/join UI's words in all 21 languages; `zh` defines the keys. */
import type { Lang } from '@genoffice/i18n'
import { zh } from './strings/zh'
import { en } from './strings/en'
import { ja } from './strings/ja'
import { ko } from './strings/ko'
import { fr } from './strings/fr'
import { de } from './strings/de'
import { es } from './strings/es'
import { th } from './strings/th'
import { id } from './strings/id'
import { ru } from './strings/ru'
import { ar } from './strings/ar'
import { pt } from './strings/pt'
import { it } from './strings/it'
import { pl } from './strings/pl'
import { cs } from './strings/cs'
import { nl } from './strings/nl'
import { ms } from './strings/ms'
import { he } from './strings/he'
import { hi } from './strings/hi'
import { zhTW } from './strings/zh-TW'
import { vi } from './strings/vi'

export type CollabStringKey = keyof typeof zh

export const COLLAB_STRINGS: Record<Lang, Record<CollabStringKey, string>> = {
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
}

export function collabText(
  lang: Lang,
  key: CollabStringKey,
  params?: Record<string, string | number>,
): string {
  const text = (COLLAB_STRINGS[lang] ?? COLLAB_STRINGS.en)[key]
  return params
    ? text.replace(/\{(\w+)\}/g, (all, name: string) => String(params[name] ?? all))
    : text
}
