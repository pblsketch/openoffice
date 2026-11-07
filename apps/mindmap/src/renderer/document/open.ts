/**
 * Opening a map: bytes in, a session out, or the reason there is none.
 *
 * Only a file that opens as `ok` becomes a session. Every other result is a
 * status the screen shows as a message; there is no document, so nothing can
 * be saved over the file (the main process refuses as well).
 */
import {
  createXmindDocument,
  createXmindDocumentFromOutline,
  openXmind,
  type XmindOpenStatus,
} from '@genoffice/xmind-engine'
import type { MindmapCopySeed, MindmapOutlineSeed } from '../../shared/ipc'
import { freeMindToXmind, parseFreeMind } from './freemind'
import { DocumentSession } from './session'

export type OpenFailure = Exclude<XmindOpenStatus, 'ok'>

/** What to tell the user once after a file opened. */
export interface OpenNotices {
  /** preserve-only elements in the file; 0 when there are none */
  preserved: number
  /** a sheet carries a theme this app did not write and is drawn with the default look */
  unknownTheme: boolean
  /** the map was made from another program's file (a `.mm`), which stays as it was */
  imported?: boolean
}

export type OpenedMap =
  { status: 'ok'; session: DocumentSession; notices: OpenNotices } | { status: OpenFailure }

export async function openMapBytes(bytes: Uint8Array): Promise<OpenedMap> {
  const opened = await openXmind(bytes)
  if (opened.status !== 'ok') return { status: opened.status }
  const session = new DocumentSession(opened.document, bytes)
  return {
    status: 'ok',
    session,
    notices: { preserved: session.preservedTotal(), unknownTheme: session.hasUnknownTheme() },
  }
}

/** A new map: one sheet, one central topic, the default theme. The titles come in the user's language. */
export async function newMap(titles: {
  sheetTitle: string
  rootTitle: string
}): Promise<DocumentSession> {
  return new DocumentSession(await createXmindDocument(titles))
}

/**
 * A new map with given content (spec 8.6: a markdown document read as an
 * outline, 4.9), from the engine's own reader. It is a NEW, UNSAVED map: it
 * has no path, and it is marked changed so it counts as unsaved until written.
 * `untitled` names a sheet without a `# ` heading (and its central topic when
 * the text has no single outermost item), in the user's language.
 */
export async function seededMap(
  seed: MindmapOutlineSeed,
  untitled: string,
): Promise<DocumentSession> {
  const document = await createXmindDocumentFromOutline(seed.outline, { untitled })
  // the baseline, taken while the document is still unchanged (that save changes nothing)
  const baseline = await document.save()
  document.markChanged()
  return new DocumentSession(document, baseline)
}

/**
 * A byte copy of a map file opened as a NEW, UNSAVED map (a skill's template,
 * spec 5.7, or an untitled map's crash-recovery copy): read like any file,
 * then marked changed, so it has no path and counts as unsaved until written;
 * the first save asks where. A restored copy of a file opens the same way and
 * keeps the file's path (`App.tsx`): its save rewrites `content.json` over the
 * copy, whose other entries are the file's own bytes.
 */
export async function openCopiedMap(seed: MindmapCopySeed): Promise<OpenedMap> {
  const opened = await openXmind(seed.bytes)
  if (opened.status !== 'ok') return { status: opened.status }
  opened.document.markChanged()
  const session = new DocumentSession(opened.document, seed.bytes)
  return {
    status: 'ok',
    session,
    notices: { preserved: session.preservedTotal(), unknownTheme: session.hasUnknownTheme() },
  }
}

/**
 * A FreeMind or Freeplane file (`.mm`) read into a NEW, UNSAVED map named
 * `title`, like a seeded map: the `.mm` is never its path, and the first save
 * asks where to put the `.xmind`. A file that cannot be read is `unreadable`.
 */
export async function importedMap(bytes: Uint8Array, title: string): Promise<OpenedMap> {
  const read = parseFreeMind(bytes)
  if (!read.ok) {
    console.warn(`[mindmap] the .mm file cannot be read (${read.problem})`)
    return { status: 'unreadable' }
  }
  const document = await freeMindToXmind(read.root, title)
  const baseline = await document.save()
  document.markChanged()
  return {
    status: 'ok',
    session: new DocumentSession(document, baseline),
    notices: { preserved: 0, unknownTheme: false, imported: true },
  }
}
