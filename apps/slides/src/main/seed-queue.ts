/**
 * The queue behind a new slides tab that starts with a given deck (spec 8.6,
 * "convert without AI"): the shell queues the deck's bytes for the new tab's
 * webContents, and `seed-deck.ts` takes them once when that tab opens. Kept
 * apart from the opening code so the shell can queue without loading the
 * editor's layout machinery.
 */
import type { RecoveryIdentity } from '@genoffice/electron-utils'
import type { HandoffWebContents } from '@genoffice/electron-utils/generate-handoff'

export interface SlidesSeedOptions {
  /**
   * The first save asks where (a skill template's copy, spec 5.7) instead of
   * landing in the drafts folder like a new blank deck.
   */
  askPathOnFirstSave?: boolean | undefined
  /** the file name that first save suggests (a full path picks the folder too) */
  suggestedName?: string | undefined
  /** the crash-recovery copy the deck was restored from: later copies go to the same slot */
  recoveryId?: RecoveryIdentity | undefined
  /** the open password of a restored copy that was encrypted: every write re-encrypts with it */
  password?: string | undefined
}

/** queued decks by webContents id: one per new tab at most */
const seeds = new Map<number, { deck: Uint8Array; options: SlidesSeedOptions }>()

/** queue a deck for a new tab; dropped when the tab goes away before taking it */
export function queueSlidesSeedFor(
  contents: HandoffWebContents,
  deck: Uint8Array,
  options: SlidesSeedOptions = {},
): void {
  if (contents.isDestroyed()) return
  const id = contents.id
  seeds.set(id, { deck, options })
  contents.once('destroyed', () => seeds.delete(id))
}

/** the deck queued for this webContents, once; null afterwards and for any other view */
export function takeSlidesSeed(webContentsId: number): Uint8Array | null {
  return takeSlidesSeedEntry(webContentsId)?.deck ?? null
}

/** the deck and its options queued for this webContents, once */
export function takeSlidesSeedEntry(
  webContentsId: number,
): { deck: Uint8Array; options: SlidesSeedOptions } | null {
  const entry = seeds.get(webContentsId) ?? null
  seeds.delete(webContentsId)
  return entry
}
