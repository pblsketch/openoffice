/** This PC's LAN addresses: what a guest types in, and where announcements go. */
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

type Interfaces = ReturnType<typeof networkInterfaces>

function ipv4Entries(interfaces: Interfaces): NetworkInterfaceInfo[] {
  return Object.values(interfaces)
    .flat()
    .filter(
      (entry): entry is NetworkInterfaceInfo =>
        !!entry &&
        entry.family === 'IPv4' &&
        !entry.internal &&
        !entry.address.startsWith('169.254.'),
    )
}

/** private-range addresses first: those are the ones a guest on the LAN can reach */
export function lanAddresses(interfaces: Interfaces = networkInterfaces()): string[] {
  const addresses = [...new Set(ipv4Entries(interfaces).map((entry) => entry.address))]
  const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)
  return addresses.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)))
}

function toInt(address: string): number {
  return address.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
}

function toAddress(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** each interface's subnet broadcast, plus the limited broadcast some routers keep local */
export function broadcastAddresses(interfaces: Interfaces = networkInterfaces()): string[] {
  const out = new Set<string>(['255.255.255.255'])
  for (const entry of ipv4Entries(interfaces)) {
    const mask = toInt(entry.netmask)
    out.add(toAddress((toInt(entry.address) & mask) | (~mask >>> 0)))
  }
  return [...out]
}
