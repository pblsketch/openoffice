/// LAN co-editing: the contract between an editor renderer and the shell's
/// collaboration service. The shell only relays opaque sync messages between
/// PCs; it never reads document content (decision 0073).

export const COLLAB_CHANNELS = {
  available: 'collab:available',
  profile: 'collab:profile',
  setProfile: 'collab:set-profile',
  host: 'collab:host',
  newPin: 'collab:new-pin',
  join: 'collab:join',
  take: 'collab:take',
  leave: 'collab:leave',
  send: 'collab:send',
  message: 'collab:message',
  event: 'collab:event',
  discover: 'collab:discover',
  discoverStop: 'collab:discover-stop',
  discovered: 'collab:discovered',
} as const

/** the renderer-exposed bridge name every editor shares */
export const COLLAB_BRIDGE_KEY = 'aiOfficeCollab'

/** the editors a session can carry; a guest's tab opens in the same one */
export const COLLAB_KINDS = [
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
  'epub',
] as const
export type CollabKind = (typeof COLLAB_KINDS)[number]

/** the peer id every guest uses to address the host */
export const COLLAB_HOST_PEER = 'host'

export const COLLAB_NAME_MAX = 32
export const COLLAB_TITLE_MAX = 200
export const COLLAB_COLOR_COUNT = 8
export const COLLAB_PIN_LENGTH = 6
export const COLLAB_DEFAULT_PORT = 47631
/** the host's file as it would be saved now; the cap keeps one join bounded */
export const COLLAB_MAX_BASE_BYTES = 128 * 1024 * 1024
/** one sync message; a first sync carries the whole shared state */
export const COLLAB_MAX_MESSAGE_BYTES = 128 * 1024 * 1024

export interface CollabProfile {
  name: string
  /** index into the caret palette, so every peer draws one person in one color */
  color: number
}

export interface CollabHostRequest {
  kind: CollabKind
  title: string
  fileName: string
  /** what a save would write right now; guests open a copy of it */
  base: Uint8Array
}

export interface CollabHostInfo {
  pin: string
  port: number
  /** this PC's LAN IPv4 addresses, for a guest who types one in */
  addresses: string[]
}

export type CollabHostFail = 'busy' | 'too-large' | 'network' | 'invalid' | 'unavailable'
export type CollabHostResult =
  { ok: true; info: CollabHostInfo } | { ok: false; reason: CollabHostFail }

export interface CollabJoinRequest {
  address: string
  port?: number
  pin: string
}

export type CollabJoinFail =
  'pin' | 'locked' | 'full' | 'version' | 'unreachable' | 'timeout' | 'invalid' | 'unavailable'
export type CollabJoinResult = { ok: true } | { ok: false; reason: CollabJoinFail }

/** what a guest tab learns about its session when it takes it */
export interface CollabTicket {
  peerId: string
  kind: CollabKind
  title: string
  hostName: string
  hostColor: number
}

export interface CollabOutgoing {
  /** a peer id, or absent for everyone else in the session */
  to?: string
  data: Uint8Array
}

export interface CollabIncoming {
  from: string
  data: Uint8Array
}

export type CollabEndReason = 'stopped' | 'host-left' | 'connection-lost'

export type CollabEvent =
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }
  /** host only: the PIN was replaced after too many wrong tries */
  | { type: 'pin'; pin: string }
  | { type: 'ended'; reason: CollabEndReason }

export interface CollabDiscoveredSession {
  kind: CollabKind
  title: string
}

export interface CollabDiscovered {
  address: string
  port: number
  hostName: string
  sessions: CollabDiscoveredSession[]
}

export function isCollabKind(value: unknown): value is CollabKind {
  return typeof value === 'string' && (COLLAB_KINDS as readonly string[]).includes(value)
}

// control, zero-width and bidi-override characters: a name must not hide or reorder text
const HIDDEN_RANGES: Array<[number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
]
const hex4 = (n: number) => n.toString(16).padStart(4, '0')
const HIDDEN_CHARS = new RegExp(
  `[${HIDDEN_RANGES.map(([a, b]) => `\\u${hex4(a)}-\\u${hex4(b)}`).join('')}]`,
  'g',
)

/** one line of display text: hidden characters dropped, whitespace collapsed */
function displayTextOf(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw
    .slice(0, max * 4)
    .replace(HIDDEN_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** a nickname as shown beside a caret; '' when nothing is left */
export function collabNameOf(raw: unknown): string {
  return displayTextOf(raw, COLLAB_NAME_MAX)
}

export function collabTitleOf(raw: unknown): string {
  return displayTextOf(raw, COLLAB_TITLE_MAX)
}

export function collabColorOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < COLLAB_COLOR_COUNT
    ? raw
    : 0
}

export function collabProfileOf(raw: unknown): CollabProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { name?: unknown; color?: unknown }
  const name = collabNameOf(r.name)
  return name ? { name, color: collabColorOf(r.color) } : null
}

/** a PIN as typed: spaces and dashes allowed, exactly COLLAB_PIN_LENGTH digits */
export function collabPinOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[\s-]/g, '')
  return digits.length === COLLAB_PIN_LENGTH && /^\d+$/.test(digits) ? digits : null
}
