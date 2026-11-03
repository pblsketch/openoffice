/**
 * The diagram tab sends nothing off this PC (spec 6). Three layers:
 *
 * 1. draw.io is started offline and configured without its outside services
 *    (`shared/drawio-start.ts`, the bridge).
 * 2. The tab has its own persistent session partition. That session refuses
 *    every request whose address is not the app's renderer scheme, the
 *    draw.io scheme, `data:` or `blob:`. Only a development run also lets the
 *    renderer's dev server through (a loopback address named by
 *    `DIAGRAM_RENDERER_URL` / `ELECTRON_RENDERER_URL`).
 * 3. New windows are always refused and the page may not navigate away;
 *    the draw.io frame may only stay on draw.io's own page.
 *
 * Every request the session sees is counted (allowed and refused), so a
 * scripted run can prove that nothing was refused because nothing tried.
 */
import { RENDERER_SCHEME } from '@genoffice/electron-utils/renderer-scheme'
import { DRAWIO_HOST, DRAWIO_SCHEME } from '../shared/bridge-protocol'

/** The tab's session partition: draw.io's own storage (scratchpad, libraries, recent colors) stays in it. */
export const DIAGRAM_PARTITION = 'persist:ieum-diagram'

const ALWAYS_ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  `${RENDERER_SCHEME}:`,
  `${DRAWIO_SCHEME}:`,
  'data:',
  'blob:',
])

/** Loopback hosts a dev server may run on. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The dev server origins a development run allows: loopback `http(s)` origins
 * of the given addresses. Nothing in a packaged app.
 */
export function devServerOrigins(
  addresses: readonly (string | undefined)[],
  packaged: boolean,
): string[] {
  if (packaged) return []
  const out = new Set<string>()
  for (const address of addresses) {
    if (!address) continue
    let url: URL
    try {
      url = new URL(address)
    } catch {
      continue
    }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK.has(url.hostname)) {
      out.add(url.origin)
    }
  }
  return [...out]
}

/** Whether the diagram session lets a request through. */
export function isAllowedDiagramRequest(url: string, devOrigins: readonly string[] = []): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (ALWAYS_ALLOWED_SCHEMES.has(parsed.protocol)) return true
  // the dev server's page, scripts and hot-reload socket
  if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
    const asHttp = `${parsed.protocol === 'ws:' ? 'http' : 'https'}://${parsed.host}`
    return devOrigins.includes(asHttp)
  }
  return devOrigins.includes(parsed.origin)
}

/** New windows from the tab: never, whatever the address (links go through `openLink`). */
export function windowOpenAction(): { action: 'deny' } {
  return { action: 'deny' }
}

/**
 * Whether a frame of the tab may go to `url`. The tab's own page stays where
 * it is (any address change of the main frame is refused unless it is the
 * same page); the draw.io frame may only (re)load draw.io's own start page.
 */
export function isAllowedNavigation(input: {
  url: string
  isMainFrame: boolean
  currentUrl: string
}): boolean {
  if (input.isMainFrame) return input.url === input.currentUrl
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    return false
  }
  // a custom scheme has no URL origin in Node (`null`): compare scheme and host
  return (
    parsed.protocol === `${DRAWIO_SCHEME}:` &&
    parsed.host === DRAWIO_HOST &&
    parsed.pathname === '/index.html'
  )
}

/** How many refused addresses the log keeps (the newest); `refused` counts them all. */
export const REFUSED_ADDRESSES_KEPT = 100

export interface RequestLog {
  allowed: number
  /** every refused request since the log began */
  refused: number
  /** the last `REFUSED_ADDRESSES_KEPT` refused addresses, oldest first */
  blocked: string[]
  /** schemes seen among allowed requests */
  schemes: Set<string>
}

export function newRequestLog(): RequestLog {
  return { allowed: 0, refused: 0, blocked: [], schemes: new Set() }
}

/** Notes one request in the log and answers whether it may go. */
export function screenRequest(
  log: RequestLog,
  url: string,
  devOrigins: readonly string[],
): boolean {
  if (isAllowedDiagramRequest(url, devOrigins)) {
    log.allowed++
    try {
      log.schemes.add(new URL(url).protocol)
    } catch {
      // counted already
    }
    return true
  }
  // keep the address short and never the query: it might carry content
  log.refused++
  log.blocked.push(url.split('?')[0]!.slice(0, 200))
  if (log.blocked.length > REFUSED_ADDRESSES_KEPT) log.blocked.shift()
  return false
}
