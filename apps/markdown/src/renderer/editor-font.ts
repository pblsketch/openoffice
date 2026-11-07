/**
 * The font the block editor shows its text in: a view setting of this PC,
 * never part of the .md file (Markdown has no font). `null` is the default
 * face, the paper theme's or the app's. The choice lives in localStorage
 * beside the editor's other view settings, so it is there synchronously at
 * boot and the first paint already uses it.
 *
 * Applied on the document root as `--md-editor-font` plus `data-md-font`
 * (styles.css): body text, headings and lists follow it, while code, math
 * and diagrams keep their own faces.
 */
import type { Lang } from '@genoffice/i18n'
import {
  createSystemFontSource,
  fontFamiliesFor,
  partitionFontFamilies,
  type SystemFonts,
  useSystemFontSource,
} from '@genoffice/ui'

export const EDITOR_FONT_KEY = 'mdapp.editorFont'

// eslint-disable-next-line no-control-regex -- keeping control characters out is the point here
const FONT_NAME = /^[^\u0000-\u001f\u007f"'`;:{}()<>\\[\]=@/*!,]{1,100}$/u

/** A plain family name, or null for anything that could be more than one name in CSS. */
export function safeEditorFont(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value || !FONT_NAME.test(value)) return null
  return value
}

export function storedEditorFont(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  return safeEditorFont(storage.getItem(EDITOR_FONT_KEY))
}

export function rememberEditorFont(
  font: string | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (font === null) storage.removeItem(EDITOR_FONT_KEY)
  else storage.setItem(EDITOR_FONT_KEY, font)
}

export function applyEditorFont(
  font: string | null,
  root: HTMLElement = document.documentElement,
): void {
  if (font === null) {
    root.removeAttribute('data-md-font')
    root.style.removeProperty('--md-editor-font')
  } else {
    root.setAttribute('data-md-font', '')
    root.style.setProperty('--md-editor-font', `"${font}"`)
  }
}

const source = createSystemFontSource(async () => [])

/** Starts reading the PC's fonts when the picker mounts. */
export function useSystemFonts(): SystemFonts & { readonly load: () => void } {
  return useSystemFontSource(source)
}

/**
 * The suite's candidates in the order for the user's language, minus the ones
 * this PC proves it lacks, then the rest of the PC's fonts.
 */
export function editorFontChoices(lang: Lang, systemFamilies: readonly string[]): string[] {
  const { builtin, system } = partitionFontFamilies(fontFamiliesFor(lang), systemFamilies)
  return [...new Set([...builtin, ...system])].filter((family) => safeEditorFont(family) !== null)
}
