import { useEffect, useMemo, useState } from 'react'
import type { McpServersSettingsView } from '../../../shared/mcp-servers-api'
import { mcpServersApi, usableMcpServerNames } from './mcp-model'

/**
 * "Open in Settings" from an AI window (user MCP spec 7.5). The main process
 * asks the home window to open Settings → Integrations and then names the
 * server; the card may mount only after that second message arrived. The
 * window listens from start-up (`watchMcpOpenServer`, called by the entry)
 * and holds the last requested server until a card takes it.
 */

type Listener = (serverId: string) => void

let pending: string | null = null
let stopWatching: (() => void) | null = null
const listeners = new Set<Listener>()

/** Start listening for "show this server" (idempotent; a no-op without the bridge) */
export function watchMcpOpenServer(): void {
  if (stopWatching) return
  const api = mcpServersApi()
  if (!api) return
  stopWatching = api.onOpenServer((serverId) => {
    if (listeners.size === 0) {
      pending = serverId
      return
    }
    for (const listener of listeners) listener(serverId)
  })
}

/** A card takes the held request, if any, and the ones that follow while it is mounted */
export function subscribeMcpOpenServer(listener: Listener): () => void {
  watchMcpOpenServer()
  listeners.add(listener)
  const held = pending
  pending = null
  if (held) listener(held)
  return () => {
    listeners.delete(listener)
  }
}

/** Tests: forget the listener and anything held */
export function resetMcpOpenServerWatch(): void {
  stopWatching?.()
  stopWatching = null
  pending = null
  listeners.clear()
}

/**
 * The names of the servers registered and on, kept current (Settings → Skills
 * hides "MCP server needed" for them). Empty without the bridge.
 */
export function useUsableMcpServers(): ReadonlySet<string> {
  const [view, setView] = useState<McpServersSettingsView | null>(null)
  useEffect(() => {
    const api = mcpServersApi()
    if (!api) return
    let alive = true
    void api.list().then(
      (next) => {
        if (alive) setView(next)
      },
      () => {},
    )
    const off = api.onChanged((next) => {
      if (alive) setView(next)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  return useMemo(() => usableMcpServerNames(view), [view])
}
