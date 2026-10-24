import { restoreFieldKinds } from './field-kinds'
import type { FieldKinds } from './field-kinds'
import { restoreSectionTails } from './section-tails'
import type { RestoreSkip, SectionTails } from './section-tails'
import { writeTabWidths } from './tab-widths'
import type { HwpFormat, MeasuredTab } from '../shared/ipc'

/**
 * What a save corrects against the file the view opened: kept when the file is
 * read (section tails and field kinds of an `.hwp`), applied to what the engine
 * exports.
 */
export interface SaveBase {
  tails?: SectionTails | undefined
  kinds?: FieldKinds | undefined
}

export interface SaveFixResult {
  bytes: Uint8Array
  /** why master pages or memos of the opened file could not be carried over */
  tailsSkipped?: RestoreSkip
}

/**
 * The corrections a save makes to the engine's bytes before they are written, in
 * their order: tabs, field kinds, section tails (see AGENTS.md). Both the save and
 * the recovery copy go through here, so a copy holds the bytes a save at that
 * moment would have written.
 */
export function applySaveFixes(
  data: Uint8Array,
  format: HwpFormat,
  tabs: readonly MeasuredTab[] | undefined,
  base: SaveBase,
): SaveFixResult {
  let bytes = data
  // the tabs first: their places were found in the engine's bytes, and putting the
  // tails back leaves the body of each section as it is
  if (tabs && tabs.length > 0) {
    bytes = writeTabWidths(bytes, format, tabs as MeasuredTab[]).bytes
  }
  const kinds = format === 'hwp' ? base.kinds : undefined
  if (kinds) bytes = restoreFieldKinds(bytes, kinds).bytes
  const tails = format === 'hwp' ? base.tails : undefined
  if (tails) {
    const result = restoreSectionTails(bytes, tails)
    if (result.skipped) return { bytes: result.bytes, tailsSkipped: result.skipped }
    bytes = result.bytes
  }
  return { bytes }
}
