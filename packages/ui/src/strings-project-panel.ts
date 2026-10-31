import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './strings-project-panel/zh'
import { en } from './strings-project-panel/en'
import { ja } from './strings-project-panel/ja'
import { ko } from './strings-project-panel/ko'
import { fr } from './strings-project-panel/fr'
import { de } from './strings-project-panel/de'
import { es } from './strings-project-panel/es'
import { th } from './strings-project-panel/th'
import { id } from './strings-project-panel/id'
import { ru } from './strings-project-panel/ru'
import { ar } from './strings-project-panel/ar'
import { pt } from './strings-project-panel/pt'
import { it } from './strings-project-panel/it'
import { pl } from './strings-project-panel/pl'
import { cs } from './strings-project-panel/cs'
import { nl } from './strings-project-panel/nl'
import { ms } from './strings-project-panel/ms'
import { he } from './strings-project-panel/he'
import { hi } from './strings-project-panel/hi'
import { zhTW } from './strings-project-panel/zh-TW'
import { vi } from './strings-project-panel/vi'

/**
 * Project-folder wording of the AI panel (decision 0088): the project chip
 * and its list under the input, the [chat ▾] menu in the panel header, and
 * the notice and event lines. `zh` defines the key set.
 */
export const PROJECT_PANEL_STRINGS = defineStrings({
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

export type ProjectPanelStringKey = keyof typeof zh

/** `projectPanelText(lang, key, params)`: the string in that language with its `{name}` placeholders filled */
export const projectPanelText: (lang: Lang, key: ProjectPanelStringKey, params?: Params) => string =
  createI18n(PROJECT_PANEL_STRINGS)
