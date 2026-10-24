/**
 * Which outside links of a book are opened.
 *
 * A book's link to another place in the book moves the reader there; a link
 * outside the book is handed to the system only when it passes
 * `safeExternalUrl` with the protocols below (the mind map editor's rule). The
 * main process applies this before it opens anything; the renderer uses the
 * same function only to tell the user beforehand that an address will not be
 * opened.
 */
import { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'

/** `file:`, `javascript:` and app schemes are refused by `safeExternalUrl` whatever is listed here. */
export const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']

/** The address to open, or null when this one is never opened. */
export function openableLink(url: unknown): string | null {
  return safeExternalUrl(url, { allowedProtocols: LINK_PROTOCOLS })
}
