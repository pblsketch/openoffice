/**
 * The PC's fonts in the editor's font lists from the start.
 *
 * The studio reads only the fonts it found last time; looking at the PC again is the
 * 찾기 button in its options dialog, so a user who never pressed it saw the seven base
 * fonts and the document's own, and a font installed later stayed out of the list. On a
 * website that is deliberate (the browser asks the user before listing the fonts); the app
 * already lets its pages list them, as the Word, Excel and PowerPoint pickers do.
 *
 * At start-up the editor asks the PC for its font list. That answer is cheap: names only.
 * The studio's own detection then reads each font file's name table for the Korean names,
 * which touches every installed file, so it runs only when the list differs from what the
 * studio kept (first run, a font installed or removed). Nothing is shown or asked; a refused
 * or failed look leaves the kept list and the 찾기 button as they were.
 */

/** Module specifier the studio-pc-fonts patch imports; build-studio.mjs aliases it. */
export const PC_FONTS_MODULE = '@ieum/pc-fonts'

/** A font name the way the studio compares them (its `normalizeFontAlias`). */
const alias = (value) =>
  typeof value === 'string'
    ? value
        .replaceAll('\u0000', '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-US')
    : ''

/** The name the studio keys one listed face by: PostScript name, else full name, else family. */
const faceKey = (face) => alias(face.postscriptName) || alias(face.fullName) || alias(face.family)

/**
 * Whether the kept records already hold exactly the faces the PC lists now: as many faces,
 * and each listed one known under some name of a record (a record merges the names the
 * enumeration gave with those read from the file). Records the studio found by trying a
 * name (a presence probe) are not part of the list and are left out.
 */
export function sameFaces(listed, kept) {
  const faces = kept.filter((record) => record.detectionSource !== 'font-presence-probe')
  const now = new Set(listed.map(faceKey).filter(Boolean))
  if (now.size !== faces.length) return false
  const known = new Set(
    faces.flatMap((record) =>
      [record.postscriptName, record.fullName, record.family, ...(record.aliases ?? [])].map(alias),
    ),
  )
  for (const key of now) if (!known.has(key)) return false
  return true
}

/** Resolves once the page is visible: the enumeration refuses a hidden page (a tab opened behind another). */
function whenVisible(doc) {
  if (!doc || doc.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    const onShow = () => {
      if (doc.visibilityState !== 'visible') return
      doc.removeEventListener('visibilitychange', onShow)
      resolve()
    }
    doc.addEventListener('visibilitychange', onShow)
  })
}

/**
 * @param {{
 *   queryLocalFonts?: () => Promise<ReadonlyArray<{ family?: string; fullName?: string; postscriptName?: string }>>,
 *   loadStored: () => Promise<unknown>,
 *   records: () => ReadonlyArray<{ family?: string; fullName?: string; postscriptName?: string; aliases?: readonly string[]; detectionSource?: string }>,
 *   detect: () => Promise<unknown>,
 *   changed: () => void,
 *   document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
 * }} studio
 * @returns {Promise<boolean>} whether the studio's list was detected anew
 */
export async function refreshPcFonts(studio) {
  if (!studio.queryLocalFonts) return false
  try {
    await whenVisible(studio.document)
    await studio.loadStored()
    const listed = await studio.queryLocalFonts()
    if (listed.length === 0 || sameFaces(listed, studio.records())) return false
    await studio.detect()
    studio.changed()
    return true
  } catch (error) {
    console.warn('[pc-fonts] PC font list not refreshed; the kept list stays:', error)
    return false
  }
}
