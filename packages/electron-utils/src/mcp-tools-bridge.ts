/// `window.aiOfficeMcpTools` as an AI window's preload exposes it (user MCP
/// spec 5.1, 7). The shell's main process holds every MCP connection and
/// checks every request again; answers cross contextBridge as plain data and
/// the AI skill in the renderer checks their shape before use. Only the calls
/// an AI window needs are here; nothing that changes a server's settings.
/// A window with no shell behind it gets an empty list and refusals.
import { ipcRenderer } from 'electron'
import { MCP_TOOLS_CHANNELS as C, type McpToolRefusal } from './mcp-tools-channels'

/** The shape `@genoffice/agent-core`'s `McpToolsBridgeLike` expects */
export interface McpToolsBridge {
  /** the registered servers with their approved tools; never a secret */
  list(): Promise<unknown>
  /**
   * The result the main process already shaped for the AI,
   * `{ ok: true, output, isError }`, or `{ ok: false, error }`
   */
  call(
    server: string,
    tool: string,
    input: Record<string, unknown>,
    callId: string,
  ): Promise<unknown>
  cancel(callId: string): Promise<void>
  onChanged(listener: () => void): () => void
  /** try a failed server again */
  retry(server: string): Promise<unknown>
  /** open Settings → Integrations at this server */
  openSettings(server: string): Promise<unknown>
}

const noAnswer: McpToolRefusal = { ok: false, error: 'The MCP connection did not answer.' }

export function mcpToolsBridge(): McpToolsBridge {
  return {
    list: () => ipcRenderer.invoke(C.list).catch(() => []),
    call: (server, tool, input, callId) =>
      ipcRenderer
        .invoke(C.call, {
          server: String(server),
          tool: String(tool),
          input,
          callId: String(callId),
        })
        .catch(() => noAnswer),
    cancel: async (callId) => {
      await ipcRenderer.invoke(C.cancel, String(callId)).catch(() => undefined)
    },
    onChanged(listener) {
      const handler = () => listener()
      ipcRenderer.on(C.changed, handler)
      return () => {
        ipcRenderer.removeListener(C.changed, handler)
      }
    },
    retry: (server) => ipcRenderer.invoke(C.retry, String(server)).catch(() => ({ ok: false })),
    openSettings: (server) =>
      ipcRenderer.invoke(C.openSettings, String(server)).catch(() => ({ ok: false })),
  }
}
