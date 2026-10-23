/**
 * Which links of an element are opened. The main process applies this before
 * it hands an address to the system; anything else is never opened.
 */
import { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'

/** `file:`, `javascript:` and app schemes are refused by `safeExternalUrl` whatever is listed here. */
export const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']

/** The address to open, or null when this one is never opened. */
export function openableLink(url: unknown): string | null {
  return safeExternalUrl(url, { allowedProtocols: LINK_PROTOCOLS })
}
