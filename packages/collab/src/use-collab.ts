/**
 * The one hook every editor uses for co-editing. The editor says what its
 * document is and how to bind it; the hook runs sharing, joining, the guest
 * tab's hand-over and the end of a session, and hands the UI its state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CollabEndReason,
  CollabHostFail,
  CollabHostInfo,
  CollabJoinFail,
  CollabJoinRequest,
  CollabKind,
  CollabProfile,
} from '@genoffice/electron-utils/collab-channels'
import { collabBridge, startHosting, takeGuestSession } from './connect'
import type { CollabPeer, CollabRole, CollabSession } from './session'
import type { CollabStringKey } from './strings'

const FLASH_MS = 4_000

export interface CollabDocument {
  /** shown to guests and on the LAN */
  title: string
  /** the guest's copy is written under this name; its extension picks the editor */
  fileName: string
  /** what a save would write right now */
  base: Uint8Array
}

/** why this document cannot be shared right now */
export type CollabShareBlock = 'save-first' | 'encrypted' | 'unsupported'

export interface UseCollabOptions {
  kind: CollabKind
  /** the document is on screen: a guest tab takes its session from then on */
  ready: boolean
  shareBlock?: () => CollabShareBlock | null
  describe: () => Promise<CollabDocument | null>
  /** wire the editor to a session; the returned function unwires it */
  bind: (session: CollabSession) => (() => void) | void
  /** after a session ends, for editor clean-up (a guest's copy becomes unsaved) */
  onEnded?: (role: CollabRole, reason: CollabEndReason) => void
}

export interface CollabEnded {
  role: CollabRole
  reason: CollabEndReason
}

export type CollabShareResult = CollabHostFail | CollabShareBlock | null

export interface CollabController {
  /** the shell answers: inside the app, not a lone editor */
  available: boolean
  session: CollabSession | null
  role: CollabRole | null
  hostInfo: CollabHostInfo | null
  peers: CollabPeer[]
  ended: CollabEnded | null
  dismissEnded(): void
  /** host: the PIN was replaced after wrong guesses */
  pinReplaced: boolean
  profile: CollabProfile | null
  saveProfile(profile: CollabProfile): Promise<void>
  dialogOpen: boolean
  openDialog(): void
  closeDialog(): void
  /** a short message about the session (a refused save, a blocked feature) */
  flashed: CollabStringKey | null
  flash(key: CollabStringKey): void
  shareBlock(): CollabShareBlock | null
  share(): Promise<CollabShareResult>
  stop(): Promise<void>
  join(request: CollabJoinRequest): Promise<CollabJoinFail | null>
  newPin(): Promise<void>
}

export function useCollab(options: UseCollabOptions): CollabController {
  const bridge = collabBridge()
  const optionsRef = useRef(options)
  optionsRef.current = options
  const [available, setAvailable] = useState(false)
  const [profile, setProfile] = useState<CollabProfile | null>(null)
  const [session, setSession] = useState<CollabSession | null>(null)
  const [hostInfo, setHostInfo] = useState<CollabHostInfo | null>(null)
  const [peers, setPeers] = useState<CollabPeer[]>([])
  const [ended, setEnded] = useState<CollabEnded | null>(null)
  const [pinReplaced, setPinReplaced] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [flashed, setFlashed] = useState<CollabStringKey | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionRef = useRef<CollabSession | null>(null)
  const tookGuest = useRef(false)

  const flash = useCallback((key: CollabStringKey) => {
    setFlashed(key)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashed(null), FLASH_MS)
  }, [])
  useEffect(() => () => clearTimeout(flashTimer.current ?? undefined), [])

  useEffect(() => {
    if (!bridge) return
    let live = true
    void bridge.available().then((yes) => {
      if (live) setAvailable(yes)
    })
    void bridge.profile().then((stored) => {
      if (live) setProfile(stored)
    })
    return () => {
      live = false
    }
  }, [bridge])

  /** binds the editor and follows the session until it ends */
  const adopt = useCallback((next: CollabSession, unbind: (() => void) | void) => {
    sessionRef.current = next
    setSession(next)
    setEnded(null)
    setPinReplaced(false)
    setHostInfo(next.hostInfo)
    setPeers(next.peers())
    const offPeers = next.onPeersChanged(() => setPeers(next.peers()))
    const offPin = next.onPinChanged(() => {
      setHostInfo(next.hostInfo)
      setPinReplaced(true)
    })
    next.onEnd((reason) => {
      offPeers()
      offPin()
      try {
        unbind?.()
      } catch (err) {
        console.error('[collab] unbind failed:', err)
      }
      if (sessionRef.current === next) sessionRef.current = null
      setSession(null)
      setHostInfo(null)
      setPeers([])
      setEnded({ role: next.role, reason })
      optionsRef.current.onEnded?.(next.role, reason)
    })
  }, [])

  // a guest tab: take the session the shell joined for it, once the copy is on screen
  useEffect(() => {
    if (!bridge || !profile || !options.ready || tookGuest.current) return
    tookGuest.current = true
    void (async () => {
      const guest = await takeGuestSession(bridge, profile)
      if (!guest) return
      await guest.synced
      if (guest.ended) return
      let unbind: (() => void) | void
      try {
        unbind = optionsRef.current.bind(guest)
      } catch (err) {
        console.error('[collab] could not bind the shared document:', err)
        await guest.leave()
        return
      }
      adopt(guest, unbind)
    })()
  }, [bridge, profile, options.ready, adopt])

  // leaving the page (reload, close) ends what this tab hosted or joined
  useEffect(() => () => void sessionRef.current?.leave(), [])

  const share = useCallback(async (): Promise<CollabShareResult> => {
    if (!bridge || !profile) return 'unavailable'
    if (sessionRef.current) return 'busy'
    const block = optionsRef.current.shareBlock?.() ?? null
    if (block) return block
    const doc = await optionsRef.current.describe()
    if (!doc) return 'unsupported'
    const bound: { unbind?: (() => void) | void } = {}
    const started = await startHosting(
      bridge,
      { kind: optionsRef.current.kind, ...doc },
      profile,
      (prepared) => {
        bound.unbind = optionsRef.current.bind(prepared)
      },
    )
    if (!started.ok) {
      bound.unbind?.()
      return started.reason
    }
    adopt(started.session, bound.unbind)
    return null
  }, [bridge, profile, adopt])

  const stop = useCallback(async () => {
    await sessionRef.current?.leave()
  }, [])

  const join = useCallback(
    async (request: CollabJoinRequest): Promise<CollabJoinFail | null> => {
      if (!bridge) return 'unavailable'
      const result = await bridge.join(request)
      return result.ok ? null : result.reason
    },
    [bridge],
  )

  const newPin = useCallback(async () => {
    if (!bridge || sessionRef.current?.role !== 'host') return
    const pin = await bridge.newPin()
    const current = sessionRef.current
    if (pin && current?.hostInfo) {
      current.hostInfo = { ...current.hostInfo, pin }
      setHostInfo(current.hostInfo)
      setPinReplaced(false)
    }
  }, [bridge])

  const saveProfile = useCallback(
    async (next: CollabProfile) => {
      if (!bridge) return
      const saved = await bridge.setProfile(next)
      if (!saved) return
      setProfile(saved)
      sessionRef.current?.setUser(saved)
    },
    [bridge],
  )

  return {
    available: available && !!bridge,
    session,
    role: session?.role ?? null,
    hostInfo,
    peers,
    ended,
    dismissEnded: () => setEnded(null),
    pinReplaced,
    profile,
    saveProfile,
    dialogOpen,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
    flashed,
    flash,
    shareBlock: () => optionsRef.current.shareBlock?.() ?? null,
    share,
    stop,
    join,
    newPin,
  }
}
