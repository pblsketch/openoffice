/**
 * Co-editing in the mind map editor (decision 0073): the shared `useCollab`
 * hook, told what this map is and how to bind it (`MapCollabBinding` for the
 * ops, `MapPresence` for where everyone is).
 *
 * The host shares what a save would write now (the recovery-copy bytes). A
 * guest's tab is a new untitled map opened on those bytes; it never saves and
 * never shows unsaved changes while the session lasts, and when the session
 * ends the copy becomes that person's own unsaved map.
 */
import { useEffect, useRef, type MutableRefObject } from 'react'
import { useCollab, type CollabController, type CollabStringKey } from '@genoffice/collab'
import type { DocumentSession } from '../document/session'
import type { MapController } from '../map/controller'
import { captureSheets, MapCollabBinding, type CapturedSheet } from './binding'
import { MapPresence } from './presence'

export interface MapCollabOptions {
  /** the map opened and is shown */
  ready: boolean
  session: DocumentSession | null
  controllers: MutableRefObject<Map<string, MapController>>
  activeKey: string | null
  setActiveKey(key: string): void
  /** brings the tree in line with every sheet on screen, a title being typed included */
  flushAll(): void
  /** the map's file; null for a map never saved */
  path: string | null
  /** the name an untitled map is shared under */
  untitledName(): string
  /** other people changed the map: the screen follows */
  changed(): void
  /** a guest's copy became this person's own map: it has unsaved changes */
  markChanged(): void
}

export interface MapCollab {
  collab: CollabController
  /** this tab is a guest in a live session: it does not save */
  isGuest(): boolean
  /** the selection or the sheet on screen moved: the others see it */
  selectionMoved(): void
  /** why a feature that cannot work in a session is refused now; null when it can run */
  blocked(): CollabStringKey | null
}

/** A file name the shell can write a guest's copy under. */
function fileNameOf(path: string | null, untitled: string): string {
  if (path) return path.replace(/^.*[/\\]/, '')
  // a central topic's title, so no path separators and no control characters
  const base = Array.from(untitled, (ch) => (ch < ' ' || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'Untitled'}.xmind`
}

export function useMapCollab(options: MapCollabOptions): MapCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const guestRef = useRef(false)
  const presenceRef = useRef<MapPresence | null>(null)
  /** the sheets as `describe` handed them out, for the host's bind right after */
  const described = useRef<{
    session: DocumentSession
    sheets: Map<string, CapturedSheet>
  } | null>(null)

  const collab = useCollab({
    kind: 'mindmap',
    ready: options.ready,
    shareBlock: () => (optionsRef.current.session ? null : 'unsupported'),
    describe: async () => {
      const o = optionsRef.current
      const session = o.session
      if (!o.ready || !session) return null
      o.flushAll()
      described.current = { session, sheets: captureSheets(session) }
      const fileName = fileNameOf(o.path, o.untitledName())
      return { title: fileName, fileName, base: await session.recoveryBytes() }
    },
    bind: (shared) => {
      const o = optionsRef.current
      const session = o.session
      if (!session) throw new Error('mindmap: no map to share')
      const captured =
        shared.role === 'host' && described.current?.session === session
          ? described.current.sheets
          : undefined
      described.current = null
      guestRef.current = shared.role === 'guest'
      const controllers = () => optionsRef.current.controllers.current
      const binding = new MapCollabBinding(
        shared,
        session,
        {
          controller: (key) => controllers().get(key) ?? null,
          activeKey: () => optionsRef.current.activeKey,
          showSheet: (key) => optionsRef.current.setActiveKey(key),
          changed: () => {
            optionsRef.current.changed()
            presenceRef.current?.render()
          },
        },
        captured,
      )
      const presence = new MapPresence(shared, session, {
        controllers,
        activeKey: () => optionsRef.current.activeKey,
      })
      presenceRef.current = presence
      return () => {
        binding.dispose()
        presence.dispose()
        presenceRef.current = null
        guestRef.current = false
      }
    },
    onEnded: (role) => {
      guestRef.current = false
      // the copy is now this person's own unsaved map
      if (role === 'guest') optionsRef.current.markChanged()
    },
  })

  // the sheet on screen is part of where this person is; a sheet just shown is measured once drawn
  useEffect(() => {
    const presence = presenceRef.current
    if (!presence) return
    presence.publish()
    const frame = requestAnimationFrame(() => presenceRef.current?.render())
    return () => cancelAnimationFrame(frame)
  }, [options.activeKey, collab.session])

  return {
    collab,
    isGuest: () => guestRef.current,
    selectionMoved: () => presenceRef.current?.publish(),
    blocked: () => {
      if (collab.role === 'guest') return 'guestBlocked'
      if (collab.role === 'host' && collab.peers.length > 1) return 'hostBlocked'
      return null
    },
  }
}
