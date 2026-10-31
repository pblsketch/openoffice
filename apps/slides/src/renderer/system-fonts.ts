import {
  createSystemFontSource,
  partitionFontFamilies,
  useSystemFontSource,
  type SystemFonts,
} from '@genoffice/ui'
import { TEMPLATE_FONT_FAMILY_NAMES } from '@genoffice/ui/template-fonts'

/// The enumeration names every family in English only, so the main process
/// reads the Korean names from the font files; without them the list still works.
const source = createSystemFontSource(async (families) =>
  families.length === 0 ? [] : window.slidesApi.fontFamilyInfo(families),
)

/// The picker's sections: the bundled template fonts count as present although
/// the OS enumeration cannot see them (the main process serves their files).
export function pickerFontSections(
  candidates: readonly string[],
  systemFamilies: readonly string[],
): ReturnType<typeof partitionFontFamilies> {
  return partitionFontFamilies(candidates, systemFamilies, TEMPLATE_FONT_FAMILY_NAMES)
}

/// Loads when the first picker mounts (and again from a picker's open click if
/// that failed); every picker of the page shares the list. Returns every
/// family: candidates vs system section is decided per render by
/// partitionFontFamilies (which also hides candidates the machine lacks).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  return useSystemFontSource(source)
}
