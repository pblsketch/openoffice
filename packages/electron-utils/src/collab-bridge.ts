/// Every editor's preload exposes the same LAN co-editing bridge. Answers cross
/// contextBridge as plain data; an editor running without the shell gets
/// `false` / `unavailable` instead of a thrown error.
import { ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  COLLAB_CHANNELS,
  collabProfileOf,
  type CollabDiscovered,
  type CollabEvent,
  type CollabHostRequest,
  type CollabHostResult,
  type CollabIncoming,
  type CollabJoinRequest,
  type CollabJoinResult,
  type CollabOutgoing,
  type CollabProfile,
  type CollabTicket,
} from './collab-channels'

export interface CollabBridge {
  /** is the shell answering this editor's requests? */
  available(): Promise<boolean>
  profile(): Promise<CollabProfile | null>
  setProfile(profile: CollabProfile): Promise<CollabProfile | null>
  /** share this tab's document; the shell starts listening on the LAN */
  host(request: CollabHostRequest): Promise<CollabHostResult>
  /** host only: replace the PIN (guests already in stay in) */
  newPin(): Promise<string | null>
  /** join a session; on success the shell opens the shared document in a new tab */
  join(request: CollabJoinRequest): Promise<CollabJoinResult>
  /** a guest tab takes its session once, after it has subscribed to messages */
  take(): Promise<CollabTicket | null>
  /** host: end the session for everyone; guest: leave it */
  leave(): Promise<void>
  send(message: CollabOutgoing): void
  onMessage(handler: (message: CollabIncoming) => void): () => void
  onEvent(handler: (event: CollabEvent) => void): () => void
  /** listen for sessions announced on the LAN until the returned stop is called */
  discover(handler: (found: CollabDiscovered[]) => void): () => void
}

function subscribe<T>(channel: string, handler: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => handler(value)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

export function collabBridge(): CollabBridge {
  return {
    available: async () =>
      (await ipcRenderer.invoke(COLLAB_CHANNELS.available).catch(() => false)) === true,
    profile: async () =>
      collabProfileOf(await ipcRenderer.invoke(COLLAB_CHANNELS.profile).catch(() => null)),
    setProfile: async (profile) =>
      collabProfileOf(
        await ipcRenderer.invoke(COLLAB_CHANNELS.setProfile, profile).catch(() => null),
      ),
    host: (request) =>
      ipcRenderer
        .invoke(COLLAB_CHANNELS.host, request)
        .catch((): CollabHostResult => ({ ok: false, reason: 'unavailable' })),
    newPin: async () => {
      const pin: unknown = await ipcRenderer.invoke(COLLAB_CHANNELS.newPin).catch(() => null)
      return typeof pin === 'string' ? pin : null
    },
    join: (request) =>
      ipcRenderer
        .invoke(COLLAB_CHANNELS.join, request)
        .catch((): CollabJoinResult => ({ ok: false, reason: 'unavailable' })),
    take: () => ipcRenderer.invoke(COLLAB_CHANNELS.take).catch(() => null),
    leave: async () => {
      await ipcRenderer.invoke(COLLAB_CHANNELS.leave).catch(() => {})
    },
    send: (message) => ipcRenderer.send(COLLAB_CHANNELS.send, message),
    onMessage: (handler) => subscribe(COLLAB_CHANNELS.message, handler),
    onEvent: (handler) => subscribe(COLLAB_CHANNELS.event, handler),
    discover: (handler) => {
      const off = subscribe(COLLAB_CHANNELS.discovered, handler)
      void ipcRenderer.invoke(COLLAB_CHANNELS.discover).catch(() => {})
      return () => {
        off()
        void ipcRenderer.invoke(COLLAB_CHANNELS.discoverStop).catch(() => {})
      }
    },
  }
}
