/**
 * Which links on a shape are opened (spec 6, the mind map editor's rule).
 *
 * A diagram shows every link it holds; showing is not opening. An address is
 * handed to the system only when it passes `safeExternalUrl` with the
 * protocols below, and only when a person clicked it. The main process
 * applies this before it opens anything.
 */
import { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'

/** `file:`, `javascript:`, `data:` and app schemes are refused by `safeExternalUrl` whatever is listed here. */
export const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']

/** The address to open, or null when this one is never opened. */
export function openableLink(url: unknown): string | null {
  return safeExternalUrl(url, { allowedProtocols: LINK_PROTOCOLS })
}
