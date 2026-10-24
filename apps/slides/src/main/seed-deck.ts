/**
 * A new slides tab that starts with a given deck (spec 8.6, "convert without
 * AI": a map's PPT skeleton). The shell builds the deck from the outline with
 * the existing outline → ops code, opens a new untitled slides tab and queues
 * the deck's bytes for that tab's webContents, in the same tick, before its
 * renderer can ask.
 *
 * The tab takes it once, when its renderer asks for the pending open after
 * mounting: the deck becomes the view's session as a NEW, UNSAVED document
 * (no path, marked changed, so Save asks for a path and closing asks first).
 * A reload restores that session like any other and takes nothing again; a
 * tab that closes first drops its deck.
 *
 * Nothing here runs an AI or touches the AI code.
 */
import type { WebContents } from 'electron'
import { openPptx, type OpenedPptx } from '@genoffice/pptx-engine'
import type { OpenResult } from '../shared/ipc'
import {
  buildAllRenderSlides,
  markMetaDirty,
  scheduleHistoryNotify,
  sessions,
  type Session,
} from './session-state'
import { shapedMetricsReady } from './shaped-metrics'
import { takeSlidesSeedEntry } from './seed-queue'

/**
 * The pending-open step for a view with a queued deck: the view's session
 * becomes the new unsaved deck and the renderer gets what an open returns.
 * Null when nothing is queued for this view.
 */
export async function openSlidesSeed(
  wc: WebContents,
  fitWidthPx: number,
  defaultFontOf: (opened: OpenedPptx) => string | undefined,
): Promise<OpenResult | null> {
  const entry = takeSlidesSeedEntry(wc.id)
  if (!entry) return null
  const bytes = entry.deck
  // lay out only after the complex-script metrics are ready, like any open
  await shapedMetricsReady()
  const opened = await openPptx(bytes)
  const session: Session = {
    path: '',
    opened,
    fitWidthPx,
    undoStack: [],
    redoStack: [],
    ...(entry.options.askPathOnFirstSave
      ? { askPathOnFirstSave: true, firstSaveName: entry.options.suggestedName }
      : {}),
    ...(entry.options.recoveryId ? { recoveryId: entry.options.recoveryId } : {}),
    ...(entry.options.password === undefined ? {} : { password: entry.options.password }),
  }
  // never saved: the deck holds what the disk does not
  markMetaDirty(session)
  sessions.set(wc.id, session)
  scheduleHistoryNotify(session)
  const slides = buildAllRenderSlides(opened, fitWidthPx)
  const size = { cx: opened.deck.size.cx, cy: opened.deck.size.cy }
  // An open shows the deck as clean; the deck-changed message right after it
  // makes the renderer ask the session, which answers "unsaved".
  setImmediate(() => {
    if (!wc.isDestroyed()) wc.send('slides:deck-changed', { slides, size })
  })
  return { path: '', slides, size, defaultFont: defaultFontOf(opened) }
}
