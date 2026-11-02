import type { McpToolsBridgeLike } from '@genoffice/agent-core'
import type { McpToolsBridge } from '@genoffice/electron-utils/mcp-tools-bridge'
import {
  MCP_TOOLS_CHANNELS,
  mcpCallIdOf,
  mcpServerNameOf,
  mcpToolCallRequestOf,
} from '@genoffice/electron-utils/mcp-tools-channels'
import { MCP_SERVERS_CHANNELS, type McpSettingsResult } from '../../shared/mcp-servers-api'
import type { McpHub } from './hub'
import {
  booleanOf,
  mcpServerInputOf,
  mcpServerPatchOf,
  pasteTextOf,
  permissionOfInput,
  planFingerprintOf,
  serverIdOf,
  toolNameOf,
} from './hub-input'

/**
 * The hub's two channels (user MCP spec 5.1):
 *
 * - `mcp-tools:*` for every AI window (the editors and the home window): the
 *   list, calls, cancel, retry, "open in Settings". A call id belongs to the
 *   window that sent it, and the window's calls stop when it is destroyed.
 * - `mcp-servers:*` for Settings: answered only for the shell window, so an
 *   editor or the agent window cannot change a server or read its settings
 *   even by sending to the channel by name.
 *
 * Electron-free (the parts of Electron it uses are passed in), so tests drive
 * it with plain objects.
 */

export interface McpIpcSender {
  readonly id: number
  /** Electron's webContents event; `destroyed` ends the window's calls */
  once?(event: 'destroyed', listener: () => void): unknown
}

export interface McpIpcEvent {
  sender: McpIpcSender
}

export interface McpIpcMain {
  handle(channel: string, listener: (event: McpIpcEvent, ...args: unknown[]) => unknown): void
}

export interface McpIpcWindow {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

export interface McpHubIpcDeps {
  hub: McpHub
  ipcMain: McpIpcMain
  /** the shell window, whose Settings may change servers */
  isSettingsSender(sender: McpIpcSender): boolean
  /** every window the list-changed notice goes to */
  allWindows(): McpIpcWindow[]
  /** the shell window, when it is open */
  settingsWindow(): McpIpcWindow | null
}

/** The preload bridge these channels serve is the one agent-core's MCP skill takes */
type Assert<T extends true> = T
export type McpToolsBridgeFitsSkill = Assert<
  McpToolsBridge extends McpToolsBridgeLike ? true : false
>

const malformed: McpSettingsResult = { ok: false, problem: 'invalid' }
const notSettings = { ok: false as const, problem: 'invalid' as const, detail: 'sender' }

/** The settings channels by name, so tests can check none is an AI window's */
export const MCP_SETTINGS_CHANNEL_NAMES: readonly string[] = Object.values(MCP_SERVERS_CHANNELS)

export function registerMcpHubIpc(deps: McpHubIpcDeps): () => void {
  const { hub, ipcMain } = deps
  const caller = (event: McpIpcEvent) => String(event.sender.id)
  /** windows whose going away is watched, so their calls end with them */
  const watched = new Set<number>()
  const watch = (sender: McpIpcSender) => {
    if (watched.has(sender.id) || typeof sender.once !== 'function') return
    watched.add(sender.id)
    sender.once('destroyed', () => {
      watched.delete(sender.id)
      hub.cancelCaller(String(sender.id))
    })
  }

  // ---- every AI window ----

  ipcMain.handle(MCP_TOOLS_CHANNELS.list, () => hub.editorList())
  ipcMain.handle(MCP_TOOLS_CHANNELS.call, (event, raw) => {
    const request = mcpToolCallRequestOf(raw)
    if (!request) return { ok: false, error: 'The MCP call was malformed.' }
    watch(event.sender)
    return hub.call(caller(event), request.server, request.tool, request.input, request.callId)
  })
  ipcMain.handle(MCP_TOOLS_CHANNELS.cancel, (event, raw) => {
    const callId = mcpCallIdOf(raw)
    if (callId) hub.cancel(caller(event), callId)
  })
  ipcMain.handle(MCP_TOOLS_CHANNELS.retry, (_event, raw) => {
    const name = mcpServerNameOf(raw)
    return name ? hub.retryByName(name) : { ok: false }
  })
  ipcMain.handle(MCP_TOOLS_CHANNELS.openSettings, (_event, raw) => {
    const name = mcpServerNameOf(raw)
    return name ? hub.openSettingsByName(name) : { ok: false }
  })

  // ---- Settings (the shell window only) ----

  const settings = (
    channel: string,
    answer: (...args: unknown[]) => unknown,
    refused: unknown = notSettings,
  ) => {
    ipcMain.handle(channel, (event, ...args) =>
      deps.isSettingsSender(event.sender) ? answer(...args) : refused,
    )
  }
  const C = MCP_SERVERS_CHANNELS
  const withId = (run: (id: string) => unknown) => (raw: unknown) => {
    const id = serverIdOf(raw)
    return id ? run(id) : malformed
  }

  settings(C.list, () => hub.settingsView(), null)
  settings(C.parsePaste, (raw) => {
    const text = pasteTextOf(raw)
    return text === undefined ? { ok: false, error: 'unreadable' } : hub.parsePaste(text)
  })
  settings(C.add, (raw) => {
    const input = mcpServerInputOf(raw)
    return input ? hub.add(input) : malformed
  })
  settings(C.edit, (rawId, rawPatch) => {
    const id = serverIdOf(rawId)
    const patch = mcpServerPatchOf(rawPatch)
    return id && patch ? hub.edit(id, patch) : malformed
  })
  settings(
    C.remove,
    withId((id) => hub.remove(id)),
  )
  settings(
    C.test,
    withId((id) => hub.test(id)),
  )
  settings(
    C.signIn,
    withId((id) => hub.signIn(id)),
    { ok: false, reason: 'not-found' },
  )
  settings(
    C.cancelSignIn,
    withId((id) => hub.cancelSignIn(id)),
    undefined,
  )
  settings(C.approveTool, (rawId, rawTool) => {
    const id = serverIdOf(rawId)
    const tool = toolNameOf(rawTool)
    return id && tool ? hub.approveTool(id, tool) : malformed
  })
  settings(
    C.approveInstructions,
    withId((id) => hub.approveInstructions(id)),
  )
  settings(C.approveLaunch, (rawId, rawFingerprint) => {
    const id = serverIdOf(rawId)
    const fingerprint = planFingerprintOf(rawFingerprint)
    return id && fingerprint ? hub.approveLaunch(id, fingerprint) : malformed
  })
  settings(C.setToolPermission, (rawId, rawTool, rawPermission) => {
    const id = serverIdOf(rawId)
    const tool = toolNameOf(rawTool)
    const permission = permissionOfInput(rawPermission)
    return id && tool && permission ? hub.setToolPermission(id, tool, permission) : malformed
  })
  settings(C.setKeepResultsInside, (rawId, rawOn) => {
    const id = serverIdOf(rawId)
    const on = booleanOf(rawOn)
    return id && on !== undefined ? hub.setKeepResultsInside(id, on) : malformed
  })
  settings(C.setEnabled, (rawId, rawOn) => {
    const id = serverIdOf(rawId)
    const on = booleanOf(rawOn)
    return id && on !== undefined ? hub.setEnabled(id, on) : malformed
  })
  settings(
    C.markToolsSeen,
    withId((id) => hub.markToolsSeen(id)),
  )
  settings(
    C.plannedLaunch,
    withId((id) => hub.plannedLaunch(id)),
    {
      ok: false,
      problem: 'not-found',
    },
  )
  settings(
    C.answerRuntimeDownload,
    (rawId, rawDownload) => {
      const id = serverIdOf(rawId)
      const download = booleanOf(rawDownload)
      return id && download !== undefined
        ? hub.answerRuntimeDownload(id, download)
        : { ok: false, problem: 'not-found' }
    },
    { ok: false, problem: 'not-found' },
  )
  settings(
    C.retry,
    withId((id) => hub.retry(id)),
  )

  // ---- telling the windows ----

  return hub.onChanged(() => {
    for (const win of deps.allWindows()) {
      if (!win.isDestroyed()) win.send(MCP_TOOLS_CHANNELS.changed)
    }
    const shell = deps.settingsWindow()
    if (shell && !shell.isDestroyed()) shell.send(C.changed, hub.settingsView())
  })
}
