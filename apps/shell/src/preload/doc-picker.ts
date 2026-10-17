import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  DOC_PICKER_CHANNELS,
  DOC_PICKER_PAGE_KEY,
  type DocListResult,
  type DocPickerApi,
  type DocPickerChooseResult,
  type DocPickerInit,
  type DocPickerTheme,
} from '../shared/doc-picker-api'

function themeOf(value: unknown): DocPickerTheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// The "Attach a document" window's narrow API: list the open and recent
// documents, send the ticked ids, cancel. The page deals only in ids; the
// shell resolves them to paths.
const api: DocPickerApi = {
  async getInit() {
    const init = (await ipcRenderer.invoke(DOC_PICKER_CHANNELS.getInit)) as DocPickerInit | null
    return { lang: init?.lang ?? 'en', theme: themeOf(init?.theme) }
  },
  onThemeChanged(handler) {
    const listener = (_event: IpcRendererEvent, theme: unknown) => handler(themeOf(theme))
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  list: () => ipcRenderer.invoke(DOC_PICKER_CHANNELS.list) as Promise<DocListResult>,
  choose: (ids) =>
    ipcRenderer.invoke(DOC_PICKER_CHANNELS.choose, ids) as Promise<DocPickerChooseResult>,
  async cancel() {
    await ipcRenderer.invoke(DOC_PICKER_CHANNELS.cancel)
  },
}
contextBridge.exposeInMainWorld(DOC_PICKER_PAGE_KEY, api)
