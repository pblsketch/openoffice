import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './projects/zh'
import { en } from './projects/en'
import { ja } from './projects/ja'
import { ko } from './projects/ko'
import { fr } from './projects/fr'
import { de } from './projects/de'
import { es } from './projects/es'
import { th } from './projects/th'
import { id } from './projects/id'
import { ru } from './projects/ru'
import { ar } from './projects/ar'
import { pt } from './projects/pt'
import { it } from './projects/it'
import { pl } from './projects/pl'
import { cs } from './projects/cs'
import { nl } from './projects/nl'
import { ms } from './projects/ms'
import { he } from './projects/he'
import { hi } from './projects/hi'
import { zhTW } from './projects/zh-TW'
import { vi } from './projects/vi'

/**
 * The home project screen (decision 0088). Words the AI panel already has
 * (pin, new project, tidy up, undo, …) come from `@genoffice/ui`'s project
 * panel strings. Sharded per language; `zh` defines the key set.
 */
export const projectsUiStrings = defineStrings({
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

export type ProjectsStringKey = keyof typeof zh

const translate = createI18n(projectsUiStrings)

export function projectsText(lang: Lang, key: ProjectsStringKey, params?: Params): string {
  return translate(lang, key, params)
}
