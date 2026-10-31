import { createSystemFontSource, useSystemFontSource, type SystemFonts } from '@genoffice/ui'
import { TEMPLATE_FONT_FAMILY_NAMES } from '@genoffice/ui/template-fonts'

/// The families to ask the main process about: the enumeration plus the bundled
/// template families, which it cannot see but the main process reads from their
/// folder (Hangul coverage routes a Pretendard pick to the East Asian slot too).
export function familiesForInfo(families: readonly string[]): readonly string[] {
  const listed = new Set(families)
  return [...families, ...TEMPLATE_FONT_FAMILY_NAMES.filter((f) => !listed.has(f))]
}

/// The enumeration names every family in English only, so the main process
/// reads the Korean names from the font files; without them the list still works.
const source = createSystemFontSource((families) =>
  window.desktop.fontFamilyInfo(familiesForInfo(families)),
)

/// Loads when the first picker mounts (and again from a picker's open click if
/// that failed); every picker of the page shares the list. Returns every
/// family: the pickers dedupe the candidate names where the two sections
/// merge (docs keeps every candidate visible, so it never partitions).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  return useSystemFontSource(source)
}
