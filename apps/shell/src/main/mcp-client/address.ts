import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/**
 * Which addresses a remote MCP server may have (user MCP spec 4.3). `https`
 * passes. Plain `http` passes only to this PC and to private ranges, and the
 * person is warned that keys and document text travel unencrypted. Judged
 * when registering and again when connecting, then by the addresses the name
 * really resolves to, so a private-looking name that resolves to a public
 * address is refused.
 */

export type AddressProblem =
  /** not a URL */
  | 'invalid'
  /** neither https nor http */
  | 'scheme'
  /** http to an address outside this PC and the private ranges */
  | 'public-http'
  /** an http host name that does not resolve */
  | 'unresolved'

export type AddressCheck =
  | {
      ok: true
      /** http: show the unencrypted warning and ask for confirmation */
      plain: boolean
      /** an http host name; only `checkResolvedServerAddress` can clear it */
      mustResolve: boolean
    }
  | { ok: false; problem: AddressProblem }

const PLAIN_HTTP_ALLOWED = (() => {
  const list = new BlockList()
  list.addSubnet('127.0.0.0', 8, 'ipv4')
  list.addSubnet('10.0.0.0', 8, 'ipv4')
  list.addSubnet('172.16.0.0', 12, 'ipv4')
  list.addSubnet('192.168.0.0', 16, 'ipv4')
  list.addAddress('::1', 'ipv6')
  list.addSubnet('fc00::', 7, 'ipv6')
  list.addSubnet('fe80::', 10, 'ipv6')
  return list
})()

/** The eight 16-bit groups of an IPv6 address, or null */
function ipv6Groups(ip: string): number[] | null {
  let text = ip
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const parts = dotted[1].split('.').map(Number)
    text = `${text.slice(0, -dotted[1].length)}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array<string>(Math.max(fill, 0)).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const values = groups.map((g) => parseInt(g, 16))
  return values.some((v) => Number.isNaN(v) || v < 0 || v > 0xffff) ? null : values
}

/** `::ffff:a.b.c.d` (in any spelling) as the IPv4 address it carries */
function unmapIpv4(ip: string): string | null {
  const g = ipv6Groups(ip)
  if (!g || g.slice(0, 5).some((v) => v !== 0) || g[5] !== 0xffff) return null
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.')
}

/** Whether plain http may reach this literal address: loopback or a private range */
export function plainHttpAllowedIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '')
  const family = isIP(bare)
  if (family === 4) return PLAIN_HTTP_ALLOWED.check(bare, 'ipv4')
  if (family !== 6) return false
  const mapped = unmapIpv4(bare)
  if (mapped) return PLAIN_HTTP_ALLOWED.check(mapped, 'ipv4')
  return PLAIN_HTTP_ALLOWED.check(bare, 'ipv6')
}

type Parsed = { url: URL; host: string } | { problem: AddressProblem }

function parse(raw: string): Parsed {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { problem: 'invalid' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { problem: 'scheme' }
  if (url.hostname === '') return { problem: 'invalid' }
  return { url, host: url.hostname.replace(/^\[|\]$/g, '') }
}

/** The check at registration, without looking anything up */
export function checkServerAddress(raw: string): AddressCheck {
  const parsed = parse(raw)
  if ('problem' in parsed) return { ok: false, problem: parsed.problem }
  if (parsed.url.protocol === 'https:') return { ok: true, plain: false, mustResolve: false }
  if (isIP(parsed.host) !== 0) {
    return plainHttpAllowedIp(parsed.host)
      ? { ok: true, plain: true, mustResolve: false }
      : { ok: false, problem: 'public-http' }
  }
  if (parsed.host.toLowerCase() === 'localhost')
    return { ok: true, plain: true, mustResolve: false }
  return { ok: true, plain: true, mustResolve: true }
}

/** Every address a host name resolves to; throws when it does not resolve */
export type HostResolver = (host: string) => Promise<string[]>

/** The operating system's resolver, hosts file included */
export const systemResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

/**
 * The check when connecting: an http host name (localhost included) passes
 * only when every address it resolves to is allowed for plain http.
 */
export async function checkResolvedServerAddress(
  raw: string,
  resolve: HostResolver = systemResolver,
): Promise<AddressCheck> {
  const first = checkServerAddress(raw)
  if (!first.ok || !first.plain) return first
  const parsed = parse(raw)
  if ('problem' in parsed || isIP(parsed.host) !== 0) return { ...first, mustResolve: false }
  let addresses: string[]
  try {
    addresses = await resolve(parsed.host)
  } catch {
    return { ok: false, problem: 'unresolved' }
  }
  if (addresses.length === 0) return { ok: false, problem: 'unresolved' }
  if (!addresses.every(plainHttpAllowedIp)) return { ok: false, problem: 'public-http' }
  return { ok: true, plain: true, mustResolve: false }
}
