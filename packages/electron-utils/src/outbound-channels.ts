/**
 * The two channels an editor's AI uses before it reaches off the PC
 * (decision 0062). The shell's main process answers both.
 */
export const OUTBOUND_CHANNELS = {
  /** whether "Let AI use internet tools" is on (absent in ai-settings.json = on) */
  internetTools: 'ai:internet-tools',
  /** asks the person in a dialog over the calling window; answers true only on "Allow" */
  confirmAddresses: 'ai:confirm-addresses',
  /** main → every window: ai-settings.json was saved (the editors' existing broadcast) */
  settingsChanged: 'ai:settings-changed',
} as const

/** Most addresses one question shows; a call with more is refused whole */
export const MAX_CONFIRM_ADDRESSES = 8
/** Longest address a question accepts */
export const MAX_CONFIRM_ADDRESS_LENGTH = 4096

/** The request as the main process accepts it, or null */
export function confirmRequestOf(raw: unknown): { tool: string; addresses: string[] } | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { tool?: unknown; addresses?: unknown }
  if (typeof r.tool !== 'string' || !/^[a-z_]{1,64}$/.test(r.tool)) return null
  if (!Array.isArray(r.addresses) || r.addresses.length === 0) return null
  if (r.addresses.length > MAX_CONFIRM_ADDRESSES) return null
  const addresses: string[] = []
  for (const a of r.addresses) {
    if (typeof a !== 'string' || a.length > MAX_CONFIRM_ADDRESS_LENGTH) return null
    if (!/^https?:\/\//i.test(a.trim())) return null
    addresses.push(a.trim())
  }
  return { tool: r.tool, addresses }
}
