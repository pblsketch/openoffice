/// The project folder bridge every AI window's preload exposes (one name,
/// `window.projectFolderApi`, see `PROJECT_FOLDER_BRIDGE_KEY`). Requests go to
/// the shell main process, which identifies the calling window itself; the
/// bridge only forwards ids and options. It takes the preload's `ipcRenderer`
/// instead of importing Electron, so this module stays free of Node and
/// Electron at runtime (sandboxed preloads load it bundled).
import type { IpcRenderer, IpcRendererEvent } from 'electron'
import {
  PROJECT_FOLDER_CHANNELS,
  PROJECT_FOLDER_EVENTS,
  PROJECT_FOLDER_LISTEN_CHANNEL,
  type ProjectFolderApi,
  type ProjectFolderEventMethod,
  type ProjectFolderListenMessage,
} from '@genoffice/project-store/folder-api'

export { PROJECT_FOLDER_BRIDGE_KEY } from '@genoffice/project-store/folder-api'

/** The part of `ipcRenderer` the bridge uses */
export type ProjectFolderBridgeIpc = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener' | 'send'>

type RequestMethod = keyof typeof PROJECT_FOLDER_CHANNELS

export function projectFolderBridge(ipc: ProjectFolderBridgeIpc): ProjectFolderApi {
  // how many listeners each event has in this page; main hears about the first and the last
  const listeners = new Map<ProjectFolderEventMethod, number>()

  const tell = (method: ProjectFolderEventMethod, listening: boolean): void => {
    const message: ProjectFolderListenMessage = { method, listening }
    ipc.send(PROJECT_FOLDER_LISTEN_CHANNEL, message)
  }

  const subscribe = <E>(method: ProjectFolderEventMethod, listener: (event: E) => void) => {
    const channel = PROJECT_FOLDER_EVENTS[method]
    const wrapped = (_event: IpcRendererEvent, payload: E) => listener(payload)
    ipc.on(channel, wrapped)
    const count = (listeners.get(method) ?? 0) + 1
    listeners.set(method, count)
    if (count === 1) tell(method, true)
    let active = true
    return () => {
      if (!active) return
      active = false
      ipc.removeListener(channel, wrapped)
      const left = Math.max(0, (listeners.get(method) ?? 1) - 1)
      listeners.set(method, left)
      if (left === 0) tell(method, false)
    }
  }

  const requests = {} as Record<RequestMethod, (args?: unknown) => Promise<unknown>>
  for (const name of Object.keys(PROJECT_FOLDER_CHANNELS) as RequestMethod[]) {
    const channel = PROJECT_FOLDER_CHANNELS[name]
    requests[name] = (args?: unknown) =>
      args === undefined ? ipc.invoke(channel) : ipc.invoke(channel, args)
  }

  return {
    ...(requests as unknown as Omit<ProjectFolderApi, ProjectFolderEventMethod>),
    onChatMessageAppended: (listener) => subscribe('onChatMessageAppended', listener),
    onOpenChat: (listener) => subscribe('onOpenChat', listener),
    onOpenProjectScreen: (listener) => subscribe('onOpenProjectScreen', listener),
    onProjectChanged: (listener) => subscribe('onProjectChanged', listener),
  }
}
