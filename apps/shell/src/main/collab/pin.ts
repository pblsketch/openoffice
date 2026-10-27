/**
 * Session PINs and the brakes on guessing them. Six digits are a million
 * tries, which a script on the same LAN could walk through; so an address
 * that misses a few times is shut out for a while, and once misses pile up
 * across addresses every open PIN is replaced and the hosts are told.
 */
import { randomInt, timingSafeEqual } from 'node:crypto'
import { COLLAB_PIN_LENGTH } from '@genoffice/electron-utils/collab-channels'

export const MAX_MISSES_PER_ADDRESS = 5
export const ADDRESS_LOCK_MS = 10 * 60_000
/** misses from all addresses since the PINs were last replaced */
export const MAX_MISSES_BEFORE_NEW_PINS = 20

export function newPin(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** COLLAB_PIN_LENGTH)).padStart(COLLAB_PIN_LENGTH, '0')
    if (!taken.has(pin)) return pin
  }
}

export function samePin(typed: string, pin: string): boolean {
  const a = Buffer.from(typed, 'utf8')
  const b = Buffer.from(pin, 'utf8')
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}

export interface MissVerdict {
  /** this address may not try again until its lock runs out */
  locked: boolean
  /** enough misses overall that every PIN should be replaced now */
  replacePins: boolean
}

export class PinAttempts {
  private readonly misses = new Map<string, { count: number; lockedUntil: number }>()
  private total = 0

  constructor(private readonly now: () => number = Date.now) {}

  isLocked(address: string): boolean {
    const entry = this.misses.get(address)
    if (!entry || entry.lockedUntil === 0) return false
    if (entry.lockedUntil > this.now()) return true
    this.misses.delete(address)
    return false
  }

  miss(address: string): MissVerdict {
    const entry = this.misses.get(address) ?? { count: 0, lockedUntil: 0 }
    entry.count += 1
    if (entry.count >= MAX_MISSES_PER_ADDRESS) entry.lockedUntil = this.now() + ADDRESS_LOCK_MS
    this.misses.set(address, entry)
    this.total += 1
    const replacePins = this.total >= MAX_MISSES_BEFORE_NEW_PINS
    if (replacePins) this.total = 0
    return { locked: entry.lockedUntil > 0, replacePins }
  }

  /** a right PIN clears that address's misses and gives back the guess it spent overall */
  admit(address: string): void {
    this.misses.delete(address)
    this.total = Math.max(0, this.total - 1)
  }
}
