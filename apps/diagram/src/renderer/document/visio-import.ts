/**
 * Visio import (spec 3.5): a `.vsdx` becomes a new, untitled diagram. draw.io's
 * own importer converts it inside the draw.io frame (the bridge's
 * `importVisio`), on this PC: pictures it cannot convert stay out of sight
 * and are counted for the notice; nothing is sent anywhere to convert them.
 * A file the importer cannot read opens nothing and says why.
 */
import type { DrawioFrame } from '../drawio/frame-client'
import { t } from '../i18n/locale'
import { registerDiagramImporter, type DiagramImporter } from './importers'

/** What the importer needs of the frame: one bridge request. */
type VisioFrame = Pick<DrawioFrame, 'request'>

export const importVisioFile: DiagramImporter = async ({ bytes, frame }) => {
  if (bytes.length === 0) return { ok: false, reason: t('importVisioUnreadable') }
  let reply: { xml: string; pages: number; unconvertedPictures: number }
  try {
    reply = await (frame as VisioFrame).request('importVisio', { bytes })
  } catch (err) {
    console.warn('[diagram] the Visio import failed:', err instanceof Error ? err.message : err)
    return { ok: false, reason: t('importVisioUnreadable') }
  }
  if (reply.pages < 1) return { ok: false, reason: t('importVisioNoPages') }
  const pictures = Math.max(0, Math.floor(reply.unconvertedPictures || 0))
  return {
    ok: true,
    xml: reply.xml,
    ...(pictures > 0 ? { notices: { visioPictures: pictures } } : {}),
  }
}

/** Makes `.vsdx` files open as new diagrams. Called once when the editor screen starts. */
export function registerVisioImporter(): void {
  registerDiagramImporter('vsdx', importVisioFile)
}
