/**
 * The one font set the slide, document and sheet design templates share.
 *
 * The files live in packages/ui/template-fonts/ (outside src/, so no editor build
 * imports them as an asset) and ship once in the installer as resources/template-fonts
 * (apps/shell/electron-builder.cjs); main-process code finds the folder through
 * templateFontsDir in @genoffice/electron-utils/template-fonts-dir. Every file keeps the
 * distributor's name, family names and metrics: no subsetting, no renaming, so the family
 * a document stores is the one a machine with the real font installed resolves. All but
 * Noto Serif KR are the distributor's files byte for byte; its two CFF faces carry
 * TrueType outlines instead (see `modified`). The folder holds only these files, each
 * family's license text and README.md, which records the license evidence and the
 * downloaded versions.
 *
 * Plain data and string helpers with no imports at all: renderer and main-process code
 * both read it (the main-process answer to a font URL is templateFontResponse in
 * @genoffice/electron-utils/template-font-response).
 */

export type TemplateFontScript = 'korean' | 'latin'

/**
 * One shipped file. Every face's family (name ID 1) is its family's name, so Office
 * lists it under that family: only regular and bold faces ship (spec 4.1, the weights
 * the templates use), and font-metrics' template-font-names test holds the files to it.
 */
export interface TemplateFontFace {
  /** file name in the folder, exactly as the distributor names it */
  readonly file: string
  /** OS/2 weight class: the face's weight, or a variable file's default instance */
  readonly weight: number
  /** the wght range of a variable file; absent for a static face */
  readonly variableWeight?: { readonly min: number; readonly max: number }
}

export interface TemplateFontFamily {
  /** the family exactly as the font's name table states it (typographic family, else family) */
  readonly family: string
  readonly script: TemplateFontScript
  readonly faces: readonly TemplateFontFace[]
  /** SPDX identifier, confirmed from the distributor's license file */
  readonly license: 'OFL-1.1'
  /** the license text shipped in the folder */
  readonly licenseFile: string
  /** the distributor's license file that was read */
  readonly licenseUrl: string
  /** the original distributor */
  readonly distributorUrl: string
  /** the exact source of the files: the distributor's tree at the downloaded commit or tag */
  readonly sourceUrl: string
  /** the version the files report (name ID 5) */
  readonly version: string
  /** the day the files were downloaded (ISO date) */
  readonly downloaded: string
  /**
   * How the shipped files differ from the distributor's, when they do. Names, cmap,
   * advances and layout tables never change; the license still applies as a Modified
   * Version, so a family whose name is a Reserved Font Name is never modified.
   */
  readonly modified?: string
}

/** The readme beside the font files: font, license, distributor, version and date. */
export const TEMPLATE_FONTS_README = 'README.md'

/**
 * Budget for the font files together (raw bytes). The installer compresses them, so its
 * growth is smaller still; the budget bounds what lands on disk. Tune it here.
 * 55 MiB: the files total 51.1 MiB since Noto Serif KR moved to TrueType outlines (its
 * two faces grew 15.6 MB -> 24.2 MB raw, yet compress smaller than the CFF originals).
 */
export const TEMPLATE_FONTS_MAX_BYTES = 55 * 1024 * 1024

const DOWNLOADED = '2026-10-14'
const GOOGLE_FONTS = 'https://github.com/google/fonts'
const GOOGLE_FONTS_COMMIT = '66928797f271fed5ee428544e7229685e2d90127'
const googleFonts = (dir: string) => ({
  distributorUrl: `${GOOGLE_FONTS}/tree/main/ofl/${dir}`,
  sourceUrl: `${GOOGLE_FONTS}/tree/${GOOGLE_FONTS_COMMIT}/ofl/${dir}`,
  licenseUrl: `${GOOGLE_FONTS}/blob/${GOOGLE_FONTS_COMMIT}/ofl/${dir}/OFL.txt`,
})

export const TEMPLATE_FONTS: readonly TemplateFontFamily[] = [
  {
    family: 'Pretendard',
    script: 'korean',
    faces: [
      { file: 'Pretendard-Regular.otf', weight: 400 },
      { file: 'Pretendard-Bold.otf', weight: 700 },
    ],
    license: 'OFL-1.1',
    licenseFile: 'Pretendard-OFL.txt',
    licenseUrl:
      'https://github.com/orioncactus/pretendard/blob/v1.3.9/packages/pretendard/dist/LICENSE.txt',
    distributorUrl: 'https://github.com/orioncactus/pretendard',
    sourceUrl:
      'https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/public/static',
    version: '1.309',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Noto Serif KR',
    script: 'korean',
    faces: [
      { file: 'NotoSerifKR-Regular.otf', weight: 400 },
      { file: 'NotoSerifKR-Bold.otf', weight: 700 },
    ],
    license: 'OFL-1.1',
    licenseFile: 'NotoSerifKR-OFL.txt',
    licenseUrl:
      'https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/LICENSE',
    distributorUrl: 'https://github.com/notofonts/noto-cjk',
    sourceUrl:
      'https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/SubsetOTF/KR',
    version: '2.003',
    downloaded: DOWNLOADED,
    // Chromium's PDF export cannot embed CFF faces (it draws them as Type3 paths); the
    // Reserved Font Name is "Source", not the family name, so the outlines may change
    modified:
      'CFF outlines converted to TrueType (glyf) by tools/convert-cff-to-glyf.py; file names, names, cmap, advances and layout tables unchanged',
  },
  {
    family: 'Black Han Sans',
    script: 'korean',
    faces: [{ file: 'BlackHanSans-Regular.ttf', weight: 400 }],
    license: 'OFL-1.1',
    licenseFile: 'BlackHanSans-OFL.txt',
    ...googleFonts('blackhansans'),
    version: '1.001',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Do Hyeon',
    script: 'korean',
    faces: [{ file: 'DoHyeon-Regular.ttf', weight: 400 }],
    license: 'OFL-1.1',
    licenseFile: 'DoHyeon-OFL.txt',
    ...googleFonts('dohyeon'),
    version: '1.001',
    downloaded: DOWNLOADED,
  },
  {
    // the distributor publishes a Regular only
    family: 'Gowun Dodum',
    script: 'korean',
    faces: [{ file: 'GowunDodum-Regular.ttf', weight: 400 }],
    license: 'OFL-1.1',
    licenseFile: 'GowunDodum-OFL.txt',
    licenseUrl:
      'https://github.com/yangheeryu/Gowun-Dodum/blob/6d9ef10fc745cf3b0a4aba02dad1c740f94d029b/OFL.txt',
    distributorUrl: 'https://github.com/yangheeryu/Gowun-Dodum',
    sourceUrl:
      'https://github.com/yangheeryu/Gowun-Dodum/tree/6d9ef10fc745cf3b0a4aba02dad1c740f94d029b/fonts/ttf',
    version: '2.000',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Gowun Batang',
    script: 'korean',
    faces: [
      { file: 'GowunBatang-Regular.ttf', weight: 400 },
      { file: 'GowunBatang-Bold.ttf', weight: 700 },
    ],
    license: 'OFL-1.1',
    licenseFile: 'GowunBatang-OFL.txt',
    licenseUrl:
      'https://github.com/yangheeryu/Gowun-Batang/blob/4e73f5a9a004927220354f4b68a4c720da538147/OFL.txt',
    distributorUrl: 'https://github.com/yangheeryu/Gowun-Batang',
    sourceUrl:
      'https://github.com/yangheeryu/Gowun-Batang/tree/4e73f5a9a004927220354f4b68a4c720da538147/fonts/ttf',
    version: '2.000',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Bebas Neue',
    script: 'latin',
    faces: [{ file: 'BebasNeue-Regular.ttf', weight: 400 }],
    license: 'OFL-1.1',
    licenseFile: 'BebasNeue-OFL.txt',
    ...googleFonts('bebasneue'),
    version: '2.000',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Space Grotesk',
    script: 'latin',
    faces: [{ file: 'SpaceGrotesk-Bold.ttf', weight: 700 }],
    license: 'OFL-1.1',
    licenseFile: 'SpaceGrotesk-OFL.txt',
    licenseUrl:
      'https://github.com/floriankarsten/space-grotesk/blob/03507d024a01282884232081fc6011c09ff4e849/OFL.txt',
    distributorUrl: 'https://github.com/floriankarsten/space-grotesk',
    sourceUrl:
      'https://github.com/floriankarsten/space-grotesk/tree/03507d024a01282884232081fc6011c09ff4e849/fonts/ttf/static',
    version: '2.000',
    downloaded: DOWNLOADED,
  },
  {
    // the distributor ships Playfair Display as a variable font only; Bold is wght 700
    family: 'Playfair Display',
    script: 'latin',
    faces: [
      {
        file: 'PlayfairDisplay[wght].ttf',
        weight: 400,
        variableWeight: { min: 400, max: 900 },
      },
    ],
    license: 'OFL-1.1',
    licenseFile: 'PlayfairDisplay-OFL.txt',
    ...googleFonts('playfairdisplay'),
    version: '1.203',
    downloaded: DOWNLOADED,
  },
  {
    family: 'Archivo Black',
    script: 'latin',
    faces: [{ file: 'ArchivoBlack-Regular.ttf', weight: 400 }],
    license: 'OFL-1.1',
    licenseFile: 'ArchivoBlack-OFL.txt',
    ...googleFonts('archivoblack'),
    version: '1.006',
    downloaded: DOWNLOADED,
  },
]

/** The bundled families, e.g. for a picker's `knownAvailable` (the OS enumeration cannot see them). */
export const TEMPLATE_FONT_FAMILY_NAMES: readonly string[] = TEMPLATE_FONTS.map((f) => f.family)

// ── What the editors register, and the URLs they load it from ─────────────────

/** One face as an editor registers it (a FontFace, or an @font-face rule). */
export interface TemplateFontFaceRegistration {
  /** the family a document names */
  readonly family: string
  /** file name in the template font folder */
  readonly file: string
  /** CSS font-weight descriptor: one weight, or a variable file's "min max" range */
  readonly weight: string
}

/** Every face under its family at its own weight; a variable file over its wght range. */
export const TEMPLATE_FONT_FACE_REGISTRATIONS: readonly TemplateFontFaceRegistration[] =
  TEMPLATE_FONTS.flatMap(({ family, faces }) =>
    faces.map((face) => ({
      family,
      file: face.file,
      weight: face.variableWeight
        ? `${face.variableWeight.min} ${face.variableWeight.max}`
        : String(face.weight),
    })),
  )

/** Each bundled font file once. */
export const TEMPLATE_FONT_FILES: readonly string[] = [
  ...new Set(TEMPLATE_FONTS.flatMap((f) => f.faces.map((face) => face.file))),
]

/**
 * Where a renderer loads a bundled file from: the template-fonts host of the Word
 * editor's privileged media scheme (LAZY_MEDIA_SCHEME in @genoffice/docx-engine,
 * DOCX_MEDIA_SCHEME_PRIVILEGE in @genoffice/electron-utils; the docs and sheets tests
 * hold the three equal). Inside the shell the Word editor's main serves these URLs for
 * every editor; a standalone sheets app serves them itself.
 */
export const TEMPLATE_FONT_SCHEME = 'genoffice-docx-media'
/** the URL host the template fonts are served under (never a 64-hex lazy-media hash) */
export const TEMPLATE_FONT_HOST = 'template-fonts'

/** The URL of a bundled font file; the name is encoded (`PlayfairDisplay[wght].ttf`). */
export function templateFontUrl(file: string): string {
  return `${TEMPLATE_FONT_SCHEME}://${TEMPLATE_FONT_HOST}/${encodeURIComponent(file)}`
}

/** The listed font file a URL names, or null for any other URL (other hosts, unlisted names). */
export function templateFontFileOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${TEMPLATE_FONT_SCHEME}:` || parsed.hostname !== TEMPLATE_FONT_HOST) {
    return null
  }
  let name: string
  try {
    name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  } catch {
    return null
  }
  return TEMPLATE_FONT_FILES.includes(name) ? name : null
}
