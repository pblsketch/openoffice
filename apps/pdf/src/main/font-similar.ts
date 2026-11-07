import { fontCoversText } from './font-cmap'
import { findSystemFont } from './font-locate'
import {
  classifyFontName,
  LOOKALIKE_FAMILIES,
  standInScript,
  type FontClass,
  type FontScript,
  type FontStyleClass,
} from '../shared/font-classes'

/** FontDescriptor flag bits (ISO 32000-1 table 123) */
const FLAG_FIXED_PITCH = 1
const FLAG_SERIF = 1 << 1
const FLAG_SYMBOLIC = 1 << 2
const FLAG_SCRIPT = 1 << 3
const FLAG_NONSYMBOLIC = 1 << 5
const FLAG_ITALIC = 1 << 6
const FLAG_FORCE_BOLD = 1 << 18

/** The document face a run was drawn with, as far as the file tells */
export interface SourceFace {
  /** BaseFont, subset tag stripped, decoded (decodeFontName) */
  psName: string
  /** FontDescriptor /Flags (0 when absent) */
  flags: number
  /** Embedded font program, when there is one */
  embedded: Buffer | null
}

interface Os2Traits {
  weight?: number
  style?: FontStyleClass
}

/** usWeightClass and the PANOSE classification of an sfnt's OS/2 table. Subsets
    usually keep OS/2, so this survives where the name says nothing (an
    all-numeric or undecodable BaseFont). Bare CFF programs have no OS/2. */
export function os2Traits(font: Buffer | null): Os2Traits {
  if (!font || font.length < 12) return {}
  try {
    const numTables = font.readUInt16BE(4)
    if (numTables > 64 || 12 + numTables * 16 > font.length) return {}
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16
      if (font.toString('latin1', rec, rec + 4) !== 'OS/2') continue
      const off = font.readUInt32BE(rec + 8)
      if (off + 42 > font.length) return {}
      const weight = font.readUInt16BE(off + 4) || undefined
      const [familyType, serifStyle, , proportion] = font.subarray(off + 32, off + 36)
      let style: FontStyleClass | undefined
      // PANOSE bytes are only meaningful for the Latin Text / Hand Written kinds
      if (familyType === 3) style = 'brush'
      else if (familyType === 2) {
        if (proportion === 9) style = 'mono'
        else if (serifStyle! >= 11 && serifStyle! <= 15) style = 'sans'
        else if (serifStyle! >= 2 && serifStyle! <= 10) style = 'serif'
      }
      return { weight, style }
    }
  } catch {
    /* truncated table directory: no traits */
  }
  return {}
}

/** Style from FontDescriptor flags; undefined when the flags carry nothing
    (neither symbolic bit set means the producer left them empty). Fixed pitch
    counts for Latin only: CJK faces are full-width by design and producers flag
    them fixed-pitch whatever their look. */
function flagStyle(flags: number, script: FontScript): FontStyleClass | undefined {
  if (!(flags & (FLAG_SYMBOLIC | FLAG_NONSYMBOLIC))) return undefined
  if (flags & FLAG_FIXED_PITCH && script === 'latin') return 'mono'
  if (flags & FLAG_SCRIPT && script !== 'latin') return 'brush'
  return flags & FLAG_SERIF ? 'serif' : 'sans'
}

/** What the document face looks like: the name first (explicit), then the
    embedded program's PANOSE, then the descriptor flags; sans when nothing says.
    `script`: the script the stand-in is drawn in (defaults to the name's). */
export function sourceTraits(
  face: SourceFace,
  script?: FontScript,
): FontClass & { style: FontStyleClass } {
  const named = classifyFontName(face.psName)
  const os2 = os2Traits(face.embedded)
  const flagged = flagStyle(face.flags, script ?? named.script ?? 'latin')
  return {
    script: named.script,
    style: named.style ?? os2.style ?? flagged ?? 'sans',
    bold: named.bold || (face.flags & FLAG_FORCE_BOLD) !== 0 || (os2.weight ?? 0) >= 600,
    italic: named.italic || (face.flags & FLAG_ITALIC) !== 0,
  }
}

/**
 * Installed face that looks most like the document face and draws every char
 * of `drawn`: same script and style class (a Korean serif run stays in a
 * Korean serif face), the source's weight and slant preferred. Null when no
 * look-alike is installed — the caller then takes the generic fallback.
 * `bold`: the chosen face itself is bold; `sourceBold`: the document face is,
 * so a non-bold pick needs stroking to keep the weight.
 */
export function similarFontFor(
  face: SourceFace,
  drawn: string,
  opts: { italic?: boolean } = {},
): { bytes: Buffer; bold: boolean; sourceBold: boolean } | null {
  const script = standInScript(classifyFontName(face.psName).script, drawn)
  const traits = sourceTraits(face, script)
  const italic = traits.italic || !!opts.italic
  const suffix = `${traits.bold ? 'Bold' : ''}${italic ? 'Italic' : ''}`
  for (const family of LOOKALIKE_FAMILIES[script][traits.style]) {
    // A "<family>-<style>" PostScript query ranks the family's faces by style tokens
    const bytes = findSystemFont(suffix ? `${family}-${suffix}` : '', family)
    if (!bytes || !fontCoversText(bytes, drawn)) continue
    return { bytes, bold: (os2Traits(bytes).weight ?? 400) >= 600, sourceBold: traits.bold }
  }
  return null
}
