/** Starting a session from an editor: as the host of its document, or as the guest tab the shell opened. */
import type { CollabBridge } from '@genoffice/electron-utils/collab-bridge'
import {
  COLLAB_BRIDGE_KEY,
  COLLAB_HOST_PEER,
  type CollabHostFail,
  type CollabHostRequest,
  type CollabProfile,
} from '@genoffice/electron-utils/collab-channels'
import { CollabSession } from './session'

/** the preload's bridge, or null in an editor running without the shell */
export function collabBridge(): CollabBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as Record<string, unknown>)[COLLAB_BRIDGE_KEY]
  return bridge ? (bridge as CollabBridge) : null
}

export type HostStart = { ok: true; session: CollabSession } | { ok: false; reason: CollabHostFail }

/**
 * Share this tab's document. `prepare` runs before the LAN listener opens:
 * the editor puts its content into the shared state there, so no guest can
 * sync an empty document.
 */
export async function startHosting(
  bridge: CollabBridge,
  request: CollabHostRequest,
  profile: CollabProfile,
  prepare: (session: CollabSession) => void,
): Promise<HostStart> {
  const session = new CollabSession(
    bridge,
    'host',
    request.kind,
    COLLAB_HOST_PEER,
    profile,
    null,
    null,
  )
  try {
    prepare(session)
  } catch (err) {
    console.error('[collab] could not prepare the shared document:', err)
    session.discard()
    return { ok: false, reason: 'invalid' }
  }
  const result = await bridge.host(request)
  if (!result.ok) {
    session.discard()
    return result
  }
  session.hostInfo = result.info
  session.start()
  return { ok: true, session }
}

/**
 * A guest tab takes the session the shell joined for it, once. Null for
 * every other tab. Syncing starts at once; bind the editor after `synced`.
 */
export async function takeGuestSession(
  bridge: CollabBridge,
  profile: CollabProfile,
): Promise<CollabSession | null> {
  const ticket = await bridge.take()
  if (!ticket) return null
  // the shell flushes queued traffic after this reply; the session subscribes first
  const session = new CollabSession(
    bridge,
    'guest',
    ticket.kind,
    ticket.peerId,
    profile,
    null,
    ticket,
  )
  session.start()
  return session
}
