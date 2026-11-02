/**
 * The fonts the format panel offers: the suite's candidate list in the order
 * for the user's language, the ones this PC proves it lacks left out, then the
 * rest of the PC's fonts. Every editor of the suite offers the same list.
 *
 * Only names a topic can carry are offered (`safeFontFamily`): one plain name.
 * The Korean names of the PC's fonts are not asked for; the list shows each
 * font by the name the PC reports.
 */
import type { Lang } from '@genoffice/i18n'
import {
  createSystemFontSource,
  fontFamiliesFor,
  partitionFontFamilies,
  type SystemFonts,
  useSystemFontSource,
} from '@genoffice/ui'
import { safeFontFamily } from './map/style-values'

const source = createSystemFontSource(async () => [])

/** Starts reading the PC's fonts when the first list mounts; every list of the page shares them. */
export function useSystemFonts(): SystemFonts & { readonly load: () => void } {
  return useSystemFontSource(source)
}

/** The fonts to list, candidates first. */
export function fontChoices(lang: Lang, systemFamilies: readonly string[]): string[] {
  const { builtin, system } = partitionFontFamilies(fontFamiliesFor(lang), systemFamilies)
  const seen = new Set<string>()
  const out: string[] = []
  for (const family of [...builtin, ...system]) {
    if (safeFontFamily(family) === null || seen.has(family)) continue
    seen.add(family)
    out.push(family)
  }
  return out
}
