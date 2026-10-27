/**
 * Finding sessions on the LAN without typing an address. While this PC shares
 * something it broadcasts a small UDP announcement every few seconds: the
 * host's nickname, the TCP port, and each shared document's title and editor.
 * Nothing else goes out, and the PIN never does. A join dialog listens while
 * it is open and lists what it hears.
 */
import { createSocket, type Socket } from 'node:dgram'
import {
  COLLAB_DEFAULT_PORT,
  collabNameOf,
  collabTitleOf,
  isCollabKind,
  type CollabDiscovered,
  type CollabDiscoveredSession,
} from '@genoffice/electron-utils/collab-channels'
import { broadcastAddresses } from './lan'
import { WIRE_APP, WIRE_PROTOCOL } from './wire'

export const DISCOVERY_PORT = COLLAB_DEFAULT_PORT + 2
const ANNOUNCE_EVERY_MS = 2_000
/** an announcement not repeated for this long is a session that went away */
const FORGET_AFTER_MS = 7_000
const MAX_SESSIONS = 8
const MAX_DATAGRAM = 4096

export interface Announcement {
  port: number
  hostName: string
  sessions: CollabDiscoveredSession[]
}

export function encodeAnnouncement(announcement: Announcement): Buffer {
  return Buffer.from(
    JSON.stringify({
      app: WIRE_APP,
      protocol: WIRE_PROTOCOL,
      port: announcement.port,
      hostName: announcement.hostName,
      sessions: announcement.sessions.slice(0, MAX_SESSIONS).map((s) => ({
        kind: s.kind,
        title: s.title.slice(0, 80),
      })),
    }),
    'utf8',
  )
}

export function announcementOf(message: Buffer): Announcement | null {
  if (message.byteLength > MAX_DATAGRAM) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(message.toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || raw.app !== WIRE_APP || raw.protocol !== WIRE_PROTOCOL) return null
  const port = raw.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null
  if (!Array.isArray(raw.sessions)) return null
  const sessions: CollabDiscoveredSession[] = []
  for (const entry of raw.sessions.slice(0, MAX_SESSIONS)) {
    const s = entry as { kind?: unknown; title?: unknown }
    if (isCollabKind(s?.kind)) sessions.push({ kind: s.kind, title: collabTitleOf(s.title) })
  }
  if (sessions.length === 0) return null
  return { port, hostName: collabNameOf(raw.hostName), sessions }
}

/** Broadcasts `current()` until stopped; a null answer skips that round. */
export function startAnnouncing(current: () => Announcement | null): () => void {
  const socket = createSocket({ type: 'udp4', reuseAddr: true })
  let ready = false
  socket.on('error', () => {})
  socket.bind(0, () => {
    socket.setBroadcast(true)
    ready = true
    announce()
  })
  const announce = () => {
    const announcement = ready ? current() : null
    if (!announcement) return
    const message = encodeAnnouncement(announcement)
    for (const address of broadcastAddresses()) {
      socket.send(message, DISCOVERY_PORT, address, () => {})
    }
  }
  const timer = setInterval(announce, ANNOUNCE_EVERY_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
    socket.close()
  }
}

/** Calls `onChange` with every session heard recently, until stopped. */
export function listenForSessions(
  onChange: (found: CollabDiscovered[]) => void,
  now: () => number = Date.now,
): () => void {
  const heard = new Map<string, { found: CollabDiscovered; at: number }>()
  const publish = () => onChange([...heard.values()].map((entry) => entry.found))
  const socket: Socket = createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('error', () => {})
  socket.on('message', (message, remote) => {
    const announcement = announcementOf(message)
    if (!announcement) return
    const key = `${remote.address}:${announcement.port}`
    const isNew = !heard.has(key)
    heard.set(key, { found: { address: remote.address, ...announcement }, at: now() })
    if (isNew) publish()
  })
  socket.bind(DISCOVERY_PORT)
  const sweep = setInterval(() => {
    let changed = false
    for (const [key, entry] of heard) {
      if (now() - entry.at > FORGET_AFTER_MS) {
        heard.delete(key)
        changed = true
      }
    }
    if (changed) publish()
  }, 1_000)
  sweep.unref()
  return () => {
    clearInterval(sweep)
    socket.close()
  }
}
