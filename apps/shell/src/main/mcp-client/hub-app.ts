import { join } from 'node:path'
import { app, ipcMain, net, safeStorage, shell, webContents, type BrowserWindow } from 'electron'
import { PRODUCT_NAME, type Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import { MCP_SERVERS_CHANNELS } from '../../shared/mcp-servers-api'
import { createMcpHub, redirectSafeFetch, type McpHub } from './hub'
import { registerMcpHubIpc } from './hub-ipc'
import { createLocalMcpConnection } from './local'
import { plannedLaunch } from './local-launch'
import { createRemoteMcpConnection } from './remote'
import { createMcpRuntimeKit, mcpRuntimesRoot } from './runtimes'
import { safeStorageMcpCodec } from './secrets'
import { createMcpServersStore, mcpServersFilePath } from './store'

/**
 * The person's MCP servers in the running app: the hub with Electron behind
 * it (the OS cipher for secrets, `net.fetch` so the system proxy applies,
 * the system browser for sign-in) and its channels. Called once the app is
 * ready; `stopAll` on the returned hub belongs to quitting.
 */

/** Under the app's temp folder: the empty working folders of "my PC" servers (5.3) */
const LOCAL_WORK_DIR_NAME = 'ieumoffice-mcp'

export interface McpHubAppDeps {
  lang: () => Lang
  /** the shell window, which holds Settings */
  shellWindow: () => BrowserWindow | null
  /** bring the shell window up on Settings → Integrations */
  openIntegrations: () => void
}

export function startMcpHub(deps: McpHubAppDeps): McpHub {
  const userData = app.getPath('userData')
  const store = createMcpServersStore(
    mcpServersFilePath(userData),
    safeStorageMcpCodec(safeStorage),
  )
  const fetch = redirectSafeFetch((url, init) => net.fetch(url, init))
  const kit = createMcpRuntimeKit({
    runtimesRoot: mcpRuntimesRoot(userData),
    isRuntimeAllowed: (id) =>
      Object.entries(store.get().runtimes).some(([key, r]) => key === id && r.allowed),
    recordRuntimeAllowed: async (id) => {
      await store.update((file) => {
        file.runtimes = { ...file.runtimes, [id]: { allowed: true } }
      })
    },
    // never from an AI window: the question is asked in Settings (spec 5.4), whose
    // answer records the permission before the download starts
    askDownload: async () => false,
    fetch: (url, init) => net.fetch(url, init),
  })
  const clientInfo = { name: PRODUCT_NAME, version: app.getVersion() }
  const shellContents = () => {
    const win = deps.shellWindow()
    return win && !win.isDestroyed() ? win.webContents : null
  }

  const hub = createMcpHub({
    store,
    remote: (server, oauth) =>
      createRemoteMcpConnection({
        server: {
          name: server.name,
          url: server.url,
          transport: server.transport,
          headers: server.headers,
        },
        oauth,
        clientInfo,
        fetch,
      }),
    local: (server, appSignal) =>
      createLocalMcpConnection(server, {
        kit,
        clientInfo,
        appSignal,
        // results are shaped and cut here, in the main process, as the hub does a remote
        // server's (spec 5.5): one answer form reaches the windows and the relays
        workRoot: join(app.getPath('temp'), LOCAL_WORK_DIR_NAME),
      }),
    kit,
    plannedLaunch: (server) => plannedLaunch(server, kit),
    lang: deps.lang,
    openExternal: async (url) => {
      const target = safeExternalUrl(url)
      if (!target) return false
      try {
        await shell.openExternal(target)
        return true
      } catch {
        return false
      }
    },
    openSettings: (serverId) => {
      deps.openIntegrations()
      shellContents()?.send(MCP_SERVERS_CHANNELS.openServer, serverId)
    },
  })

  registerMcpHubIpc({
    hub,
    ipcMain,
    isSettingsSender: (sender) => {
      const contents = shellContents()
      return !!contents && sender === contents
    },
    allWindows: () => webContents.getAllWebContents(),
    settingsWindow: shellContents,
  })
  void hub.load().catch(() => {})
  return hub
}
