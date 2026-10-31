import {
  BUILTIN_FONT_FAMILIES,
  createSystemFontSource,
  partitionFontFamilies,
  splitHangulFamilies,
  useSystemFontSource,
  type FontFamilyInfoMap,
  type SystemFonts,
} from '@genoffice/ui'
import { TEMPLATE_FONT_FAMILY_NAMES } from '@genoffice/ui/template-fonts'

/** Suite-wide font dropdown candidates, kept under the historical sheets-side name. */
export const DEFAULT_FONT_FAMILIES: readonly string[] = BUILTIN_FONT_FAMILIES

/// The enumeration names every family in English only, so the main process
/// reads the Korean names from the font files; without them the list still works.
const source = createSystemFontSource(async (families) =>
  families.length === 0 ? [] : window.desktopApi.fontFamilyInfo(families),
)

/// Loads when the first picker mounts (and again from a picker's open click if
/// that failed); every picker of the page shares the list. Returns every
/// family: candidates vs system section is decided per render by
/// partitionFontFamilies (which also hides candidates the machine lacks).
export function useSystemFontFamilies(): SystemFonts & { readonly load: () => void } {
  return useSystemFontSource(source)
}

/// The echoed value stays listed even when uninstalled (document echo). The
/// bundled template families stay listed too: the OS enumeration cannot see
/// them, yet template-fonts.ts registers them for the grid. With
/// `hangulInfo` (the Korean UI passes it) the installed Korean fonts are split
/// out of the system section so they can be listed right below the common ones.
export function fontFamilyGroups(
  systemFamilies: readonly string[],
  echoFamily: string | null | undefined,
  hangulInfo?: FontFamilyInfoMap,
): {
  readonly common: readonly string[]
  readonly hangul: readonly string[]
  readonly system: readonly string[]
} {
  const { builtin, system } = partitionFontFamilies(
    DEFAULT_FONT_FAMILIES,
    systemFamilies,
    TEMPLATE_FONT_FAMILY_NAMES,
  )
  const known = !echoFamily || builtin.includes(echoFamily) || systemFamilies.includes(echoFamily)
  const { hangul, other } = splitHangulFamilies(system, hangulInfo)
  return {
    common: known ? builtin : [echoFamily, ...builtin],
    hangul,
    system: other,
  }
}
