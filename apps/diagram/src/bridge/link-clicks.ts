/**
 * Links a person clicks inside draw.io (spec 6): the link under a selected
 * shape, a link inside a label, a link in one of draw.io's dialogs. The
 * bridge stops the frame from following any of them and hands a web or mail
 * address to the host, which checks it again (`openableLink`) and opens it in
 * the default browser.
 *
 * One click can reach the bridge twice: draw.io's own link handling calls
 * `Graph.openLink` (a locked shape's label link, on mouse up) and the click
 * on the same anchor follows. The gate lets the first through.
 */

const HANDED_PROTOCOLS = /^(https?:|mailto:)$/

/** The address to hand to the host for a clicked `href`, or null when the click only stays in draw.io. */
export function clickedLinkUrl(href: string, base: string): string | null {
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  return HANDED_PROTOCOLS.test(url.protocol) ? url.href : null
}

/** Whether a click on `href` stays inside draw.io's page (an in-page anchor, a script link). */
export function isInPageHref(href: string, base: string): boolean {
  if (href === '' || href.startsWith('#') || /^\s*javascript:/i.test(href)) return true
  try {
    const url = new URL(href, base)
    const here = new URL(base)
    return url.origin === here.origin && url.pathname === here.pathname
  } catch {
    return false
  }
}

/**
 * A gate that passes an address once per click: the same address again
 * within `windowMs` is the same click reaching the bridge a second way.
 */
export function createLinkGate(
  windowMs = 1000,
  now: () => number = () => Date.now(),
): (url: string) => boolean {
  let last: { url: string; at: number } | null = null
  return (url) => {
    const at = now()
    if (last && last.url === url && at - last.at < windowMs) return false
    last = { url, at }
    return true
  }
}
