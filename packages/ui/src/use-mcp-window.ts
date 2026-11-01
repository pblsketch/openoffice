import { useCallback, useSyncExternalStore } from 'react'
import {
  windowMcpState,
  type McpPermissionRequest,
  type McpServerView,
  type McpWindowState,
} from '@genoffice/agent-core'

const NO_SERVERS: readonly McpServerView[] = []
const NO_SERVERS_OFF: ReadonlySet<string> = new Set()
const NO_REQUESTS: readonly McpPermissionRequest[] = []
const noUnsubscribe = () => {}

/**
 * The MCP state a part works on: the one it was given (`null` means none),
 * or this window's own when nothing was given. `windowMcpState()` makes it
 * once per window and is null when the preload has no MCP bridge.
 */
export function resolveMcpWindowState(
  state: McpWindowState | null | undefined,
): McpWindowState | null {
  return state === undefined ? windowMcpState() : state
}

export interface McpWindowView {
  /** null when this window has no MCP bridge */
  state: McpWindowState | null
  /** the registered servers as last listed */
  servers: readonly McpServerView[]
  /** the servers turned off in this conversation */
  offInChat: ReadonlySet<string>
}

/**
 * Follow the window's MCP servers (spec 7.5): re-renders when the list, a
 * status or what this conversation turned off changes.
 */
export function useMcpWindow(state?: McpWindowState | null): McpWindowView {
  const resolved = resolveMcpWindowState(state)
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!resolved) return noUnsubscribe
      const off = resolved.subscribe(listener)
      return () => void off()
    },
    [resolved],
  )
  const servers = useSyncExternalStore(subscribe, () => resolved?.servers() ?? NO_SERVERS)
  const offInChat = useSyncExternalStore(
    subscribe,
    () => resolved?.serversOffInChat() ?? NO_SERVERS_OFF,
  )
  return { state: resolved, servers, offInChat }
}

/** The permission requests waiting in this window, in order (spec 7.4); show the first */
export function useMcpPermissionRequests(
  state?: McpWindowState | null,
): readonly McpPermissionRequest[] {
  const store = resolveMcpWindowState(state)?.permissions ?? null
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!store) return noUnsubscribe
      const off = store.subscribe(listener)
      return () => void off()
    },
    [store],
  )
  return useSyncExternalStore(subscribe, () => store?.requests() ?? NO_REQUESTS)
}
