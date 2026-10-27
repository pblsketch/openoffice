/**
 * LAN co-editing in the shell (decision 0073): the `collab:*` channels every
 * editor's preload exposes, wired to the host server, guest links and LAN
 * announcements.
 *
 * - A host tab hands over what a save would write now; the server keeps it
 *   only to give each joining guest a copy, and drops it with the session.
 * - A guest's copy is written to a temp folder and opened the way a template
 *   copy is: a new untitled document of the same editor, so it never writes
 *   the host's file and its first save asks where.
 * - Sync messages stay opaque here. The renderers own the shared state.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  COLLAB_CHANNELS,
  COLLAB_COLOR_COUNT,
  COLLAB_MAX_BASE_BYTES,
  COLLAB_MAX_MESSAGE_BYTES,
  collabPinOf,
  collabProfileOf,
  collabTitleOf,
  isCollabKind,
  type CollabEvent,
  type CollabHostResult,
  type CollabIncoming,
  type CollabJoinResult,
  type CollabKind,
  type CollabProfile,
  type CollabTicket,
} from '@genoffice/electron-utils/collab-channels'
import { CollabHostServer, type HostedRoom } from './host-server'
import { CollabJoinError, connectToHost, hostAddressOf, type GuestLink } from './guest-link'
import { listenForSessions, startAnnouncing } from './discovery'
import { lanAddresses } from './lan'
import { collabFileName } from './file-name'

export const COLLAB_PROFILE_KEY = 'collabProfile'
const TEMP_PREFIX = 'genoffice-collab-'
/** leftovers of a session the app did not get to clean up (a crash) */
const STALE_TEMP_MS = 24 * 60 * 60_000

export interface CollabGuestCopy {
  editor: CollabKind
  path: string
  /** the temp folder made for the copy */
  dir: string
  bytes: Uint8Array
  fileName: string
  title: string
}

export interface CollabServiceDeps {
  readProfile(): unknown
  writeProfile(profile: CollabProfile): void
  /** opens the copy as a new untitled tab of its editor; null when that editor cannot */
  openGuestTab(copy: CollabGuestCopy): Promise<WebContents | null>
  tempRoot?: string
}

interface HostSession {
  room: HostedRoom
}

interface GuestSession {
  link: GuestLink
  ticket: CollabTicket
  tempDir: string
  /** traffic for the tab until its renderer takes the session */
  pending: Array<() => void> | null
  ended: boolean
}

export interface CollabService {
  /** a guest tab still in a live session: closing it loses nothing, so it closes without asking */
  isLiveGuest(webContentsId: number): boolean
  /** a tab went away (closed, crashed or torn down): end what it hosted or joined */
  dropTab(webContentsId: number): void
  dispose(): void
}

function bytesOf(raw: unknown, max: number): Uint8Array | null {
  if (!(raw instanceof Uint8Array) || raw.byteLength > max) return null
  return raw
}

function defaultName(): string {
  try {
    return userInfo().username
  } catch {
    return ''
  }
}

function sweepStaleTemp(root: string): void {
  try {
    for (const name of readdirSync(root)) {
      if (!name.startsWith(TEMP_PREFIX)) continue
      const dir = join(root, name)
      if (Date.now() - statSync(dir).mtimeMs > STALE_TEMP_MS) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  } catch {
    // best effort: a temp folder we cannot list holds nothing of ours to clean
  }
}

let registered: CollabService | null = null

/** a guest tab still in a live session: closing it loses nothing, so it closes without asking */
export function isLiveCollabGuest(webContentsId: number): boolean {
  return registered?.isLiveGuest(webContentsId) ?? false
}

/** the tab manager removed a tab: end what it hosted or joined */
export function dropCollabTab(webContentsId: number): void {
  registered?.dropTab(webContentsId)
}

export function registerCollabIpc(deps: CollabServiceDeps): CollabService {
  const service = createCollabService(deps)
  registered = service
  return service
}

function createCollabService(deps: CollabServiceDeps): CollabService {
  const server = new CollabHostServer()
  const hosts = new Map<number, HostSession>()
  const guests = new Map<number, GuestSession>()
  const discoverers = new Map<number, () => void>()
  let stopAnnouncing: (() => void) | null = null
  const tempRoot = deps.tempRoot ?? tmpdir()
  sweepStaleTemp(tempRoot)

  const profile = (): CollabProfile => {
    const stored = collabProfileOf(deps.readProfile())
    if (stored) return stored
    const fresh = {
      name: collabProfileOf({ name: defaultName() })?.name ?? 'Guest',
      color: randomInt(0, COLLAB_COLOR_COUNT),
    }
    try {
      deps.writeProfile(fresh)
    } catch {
      // unwritable settings: the same default comes back next time anyway
    }
    return fresh
  }

  const send = (contents: WebContents, channel: string, value: unknown) => {
    if (!contents.isDestroyed()) contents.send(channel, value)
  }

  const refreshAnnouncing = () => {
    if (server.roomCount > 0 && !stopAnnouncing) {
      stopAnnouncing = startAnnouncing(() => {
        const rooms = server.openRooms()
        const port = server.port
        if (rooms.length === 0 || port === null) return null
        return {
          port,
          hostName: rooms[0].hostName,
          sessions: rooms.map(({ kind, title }) => ({ kind, title })),
        }
      })
    } else if (server.roomCount === 0 && stopAnnouncing) {
      stopAnnouncing()
      stopAnnouncing = null
    }
  }

  const endHost = (id: number, reason: 'stopped' | 'host-left') => {
    const session = hosts.get(id)
    if (!session) return
    hosts.delete(id)
    session.room.close(reason)
    refreshAnnouncing()
  }

  const endGuest = (id: number) => {
    const session = guests.get(id)
    if (!session) return
    guests.delete(id)
    session.link.close()
    void rm(session.tempDir, { recursive: true, force: true }).catch(() => {})
  }

  const dropTab = (id: number) => {
    endHost(id, 'host-left')
    endGuest(id)
    discoverers.get(id)?.()
    discoverers.delete(id)
  }

  const watched = new WeakSet<WebContents>()
  const watch = (contents: WebContents) => {
    if (watched.has(contents)) return
    watched.add(contents)
    const id = contents.id
    contents.once('destroyed', () => dropTab(id))
    // closed Word views are not destroyed, only their renderer is ended
    contents.once('render-process-gone', () => dropTab(id))
  }

  ipcMain.handle(COLLAB_CHANNELS.available, (): boolean => true)

  ipcMain.handle(COLLAB_CHANNELS.profile, (): CollabProfile => profile())

  ipcMain.handle(COLLAB_CHANNELS.setProfile, (_event, raw: unknown): CollabProfile | null => {
    const next = collabProfileOf(raw)
    if (!next) return null
    deps.writeProfile(next)
    return next
  })

  ipcMain.handle(
    COLLAB_CHANNELS.host,
    async (event: IpcMainInvokeEvent, raw: unknown): Promise<CollabHostResult> => {
      const contents = event.sender
      if (hosts.has(contents.id) || guests.has(contents.id)) return { ok: false, reason: 'busy' }
      const r = (raw ?? {}) as Record<string, unknown>
      if (!isCollabKind(r.kind)) return { ok: false, reason: 'invalid' }
      if (r.base instanceof Uint8Array && r.base.byteLength > COLLAB_MAX_BASE_BYTES) {
        return { ok: false, reason: 'too-large' }
      }
      const base = bytesOf(r.base, COLLAB_MAX_BASE_BYTES)
      if (!base) return { ok: false, reason: 'invalid' }
      const fileName = collabFileName(r.fileName, r.kind)
      const me = profile()
      try {
        const room = await server.open({
          kind: r.kind,
          title: collabTitleOf(r.title) || fileName,
          fileName,
          hostName: me.name,
          hostColor: me.color,
          base,
          endpoint: {
            message: (from, data) =>
              send(contents, COLLAB_CHANNELS.message, { from, data } satisfies CollabIncoming),
            event: (collabEvent: CollabEvent) => send(contents, COLLAB_CHANNELS.event, collabEvent),
          },
        })
        // the tab may have gone while the listener was starting
        if (contents.isDestroyed()) {
          room.close('host-left')
          return { ok: false, reason: 'unavailable' }
        }
        hosts.set(contents.id, { room })
        watch(contents)
        refreshAnnouncing()
        return { ok: true, info: { pin: room.pin, port: room.port, addresses: lanAddresses() } }
      } catch (err) {
        console.error('[collab] could not start sharing:', err)
        return { ok: false, reason: 'network' }
      }
    },
  )

  ipcMain.handle(COLLAB_CHANNELS.newPin, (event): string | null => {
    return hosts.get(event.sender.id)?.room.newPin() ?? null
  })

  ipcMain.handle(
    COLLAB_CHANNELS.join,
    async (_event: IpcMainInvokeEvent, raw: unknown): Promise<CollabJoinResult> => {
      const r = (raw ?? {}) as Record<string, unknown>
      const address = hostAddressOf(r.address)
      const pin = collabPinOf(r.pin)
      const port =
        r.port === undefined
          ? undefined
          : typeof r.port === 'number' && Number.isInteger(r.port) && r.port > 0 && r.port < 65536
            ? r.port
            : null
      if (!address || !pin || port === null) return { ok: false, reason: 'invalid' }
      let link: GuestLink
      try {
        link = await connectToHost({ address, port, pin })
      } catch (err) {
        return { ok: false, reason: err instanceof CollabJoinError ? err.reason : 'unreachable' }
      }
      const { welcome, base } = link
      const fileName = collabFileName(welcome.fileName, welcome.kind)
      let tempDir = ''
      let contents: WebContents | null = null
      try {
        tempDir = await mkdtemp(join(tempRoot, TEMP_PREFIX))
        const path = join(tempDir, fileName)
        await writeFile(path, base)
        contents = await deps.openGuestTab({
          editor: welcome.kind,
          path,
          dir: tempDir,
          bytes: base,
          fileName,
          title: welcome.title || fileName,
        })
      } catch (err) {
        console.error('[collab] could not open the shared copy:', err)
      }
      if (!contents) {
        link.close()
        if (tempDir) void rm(tempDir, { recursive: true, force: true }).catch(() => {})
        return { ok: false, reason: 'unavailable' }
      }
      const tab = contents
      const session: GuestSession = {
        link,
        tempDir,
        pending: [],
        ended: false,
        ticket: {
          peerId: welcome.peerId,
          kind: welcome.kind,
          title: welcome.title,
          hostName: welcome.hostName,
          hostColor: welcome.hostColor,
        },
      }
      const deliver = (channel: string, value: unknown) => {
        if (session.pending) session.pending.push(() => send(tab, channel, value))
        else send(tab, channel, value)
      }
      link.attach({
        message: (from, data) =>
          deliver(COLLAB_CHANNELS.message, { from, data } satisfies CollabIncoming),
        peer: (notice) =>
          deliver(COLLAB_CHANNELS.event, {
            type: notice.event === 'join' ? 'peer-join' : 'peer-leave',
            peerId: notice.peerId,
          } satisfies CollabEvent),
        ended: (reason) => {
          session.ended = true
          deliver(COLLAB_CHANNELS.event, { type: 'ended', reason } satisfies CollabEvent)
        },
      })
      guests.set(tab.id, session)
      watch(tab)
      return { ok: true }
    },
  )

  ipcMain.handle(COLLAB_CHANNELS.take, (event): CollabTicket | null => {
    const session = guests.get(event.sender.id)
    if (!session?.pending) return null
    const queued = session.pending
    session.pending = null
    // after the reply: the renderer has subscribed before asking
    setImmediate(() => queued.forEach((call) => call()))
    return session.ticket
  })

  ipcMain.handle(COLLAB_CHANNELS.leave, (event) => {
    endHost(event.sender.id, 'stopped')
    const guest = guests.get(event.sender.id)
    if (guest) {
      // the copy stays open as the person's own untitled document
      guest.ended = true
      guest.link.close()
    }
  })

  ipcMain.on(COLLAB_CHANNELS.send, (event: IpcMainEvent, raw: unknown) => {
    const r = (raw ?? {}) as { to?: unknown; data?: unknown }
    const data = bytesOf(r.data, COLLAB_MAX_MESSAGE_BYTES)
    if (!data) return
    const to = typeof r.to === 'string' && r.to.length <= 64 ? r.to : undefined
    const id = event.sender.id
    const host = hosts.get(id)
    if (host) {
      host.room.send(to, data)
      return
    }
    const guest = guests.get(id)
    if (guest && !guest.ended) guest.link.send(to, data)
  })

  ipcMain.handle(COLLAB_CHANNELS.discover, (event) => {
    const contents = event.sender
    discoverers.get(contents.id)?.()
    const own = new Set(lanAddresses())
    const stop = listenForSessions((found) => {
      const others = found.filter((f) => !(own.has(f.address) && f.port === server.port))
      send(contents, COLLAB_CHANNELS.discovered, others)
    })
    discoverers.set(contents.id, stop)
    watch(contents)
  })

  ipcMain.handle(COLLAB_CHANNELS.discoverStop, (event) => {
    discoverers.get(event.sender.id)?.()
    discoverers.delete(event.sender.id)
  })

  return {
    isLiveGuest: (id) => {
      const session = guests.get(id)
      return !!session && !session.ended
    },
    dropTab,
    dispose: () => {
      for (const id of [...hosts.keys(), ...guests.keys(), ...discoverers.keys()]) dropTab(id)
      server.close()
      stopAnnouncing?.()
      stopAnnouncing = null
    },
  }
}
