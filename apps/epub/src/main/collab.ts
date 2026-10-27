/**
 * Co-editing (decision 0073) as the main process sees an EPUB view,
 * Electron-free.
 *
 * A guest's tab is a window onto the book of the person sharing it: its
 * reads and edits go to the host's tab and are saved there. Its own book is
 * the temp copy the shell opened, so while the session runs this view writes
 * nothing and has nothing unsaved. When the session ends the copy takes the
 * chapter texts the session changed and becomes the person's own document,
 * unsaved until it is saved somewhere of its own (the first save asks where).
 */
import type { EpubBookSession } from './book-session'

interface GuestView {
  live: boolean
  /** the temp copy the view opened */
  path: string
}

const guests = new Map<number, GuestView>()

/** The renderer says this view joined someone's book (`live`) or that the session ended (`copy`). */
export function setCollabGuest(wcId: number, state: unknown, path: string | undefined): void {
  const known = guests.get(wcId)
  if (state === 'live' && path) guests.set(wcId, { live: true, path })
  else if (state === 'copy' && known) guests.set(wcId, { live: false, path: known.path })
}

/** A guest in a live session: the person sharing saves, this view does not. */
export function isCollabGuest(wcId: number): boolean {
  return guests.get(wcId)?.live === true
}

/** The view's save target is still the copy a session left: it has no file of its own yet. */
export function isCollabCopy(wcId: number, savePath: string | undefined): boolean {
  const guest = guests.get(wcId)
  return guest !== undefined && !guest.live && guest.path === savePath
}

export function forgetCollabView(wcId: number): void {
  guests.delete(wcId)
}

/** What a save would write now: the bytes the people who join open. */
export async function collabBase(session: EpubBookSession): Promise<Uint8Array | null> {
  const { result } = await session.prepareSave()
  if (!result.ok) return null
  return result.changed ? result.bytes : session.bytes
}

/** The shared book's chapter texts a guest's copy takes over; how many it took. */
export async function adoptChapters(session: EpubBookSession, raw: unknown): Promise<number> {
  if (!Array.isArray(raw)) return 0
  let taken = 0
  for (const item of raw.slice(0, session.book.spine.items.length)) {
    const { spineIndex, source } = (item ?? {}) as Record<string, unknown>
    if (await session.adoptText(spineIndex, source)) taken++
  }
  return taken
}
