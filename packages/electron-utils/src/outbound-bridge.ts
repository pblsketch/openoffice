/// The editors' preloads expose the same outbound calls (decision 0062). The
/// AI skill in the renderer (`guardOutbound` in @genoffice/agent-core) uses
/// them; answers cross contextBridge as plain booleans.
import { ipcRenderer } from 'electron'
import { OUTBOUND_CHANNELS } from './outbound-channels'

export interface OutboundBridge {
  internetToolsEnabled(): Promise<boolean>
  /** called with the switch's value whenever ai-settings.json is saved */
  onInternetToolsChanged(listener: (on: boolean) => void): () => void
  confirmAddresses(tool: string, addresses: string[]): Promise<boolean>
}

export function outboundBridge(): OutboundBridge {
  const enabled = async () =>
    (await ipcRenderer.invoke(OUTBOUND_CHANNELS.internetTools).catch(() => false)) === true
  return {
    internetToolsEnabled: enabled,
    onInternetToolsChanged(listener) {
      const handler = () => void enabled().then(listener)
      ipcRenderer.on(OUTBOUND_CHANNELS.settingsChanged, handler)
      return () => {
        ipcRenderer.removeListener(OUTBOUND_CHANNELS.settingsChanged, handler)
      }
    },
    confirmAddresses: async (tool, addresses) =>
      (await ipcRenderer
        .invoke(OUTBOUND_CHANNELS.confirmAddresses, {
          tool: String(tool),
          addresses: Array.isArray(addresses) ? addresses.map(String) : [],
        })
        .catch(() => false)) === true,
  }
}
