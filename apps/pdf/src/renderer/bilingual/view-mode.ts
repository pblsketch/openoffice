/**
 * Which results the side-by-side view shows (translation-reading spec 5.3):
 * the plain translation (the default) or the easy explanation. The last
 * choice is remembered like the column's width and text size. Switching only
 * changes what is read from the store; it sends nothing.
 */
import type { TranslationMode } from '../../../../../packages/pdf-structure/src/store/job-keys'

export const BILINGUAL_MODE_KEY = 'genoffice-pdf-bilingual-mode'

export const loadBilingualMode = (): TranslationMode => {
  try {
    return localStorage.getItem(BILINGUAL_MODE_KEY) === 'easy' ? 'easy' : 'translate'
  } catch {
    return 'translate'
  }
}

export const saveBilingualMode = (mode: TranslationMode): void => {
  try {
    localStorage.setItem(BILINGUAL_MODE_KEY, mode)
  } catch {
    // storage full or blocked: the choice lasts for this tab only
  }
}
