/**
 * Texts the main process shows itself (the save and export dialogs, the
 * question before closing a diagram with unsaved changes), in the app's
 * language. They live in the editor's one dictionary (`renderer/i18n/app`).
 */
import { createI18n, getUiLang, type Params } from '@genoffice/i18n'
import { appStrings } from '../renderer/i18n/strings-app'

const translate = createI18n(appStrings)

export type MainStringKey = keyof typeof appStrings.zh

export function tm(key: MainStringKey, params?: Params): string {
  return translate(getUiLang(), key, params)
}
