import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  PdfPickResult,
  PdfToolRunRequest,
  PdfToolRunResult,
  PdfToolsInit,
  PdfToolsTheme,
  PdfToolsWindowApi,
} from '../shared/pdf-tools-api'
import { PDF_TOOLS_CHANNELS } from '../shared/pdf-tools-api'

function themeOf(value: unknown): PdfToolsTheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// The PDF tools window's narrow API: pick inputs through main's dialog, run a
// tool, open or reveal what it wrote, and the theme broadcast every window
// receives. Paths never cross into the page; it only sees ids and names.
const api: PdfToolsWindowApi = {
  async getInit() {
    const init = (await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.getInit)) as PdfToolsInit | null
    return { lang: init?.lang ?? 'en', theme: themeOf(init?.theme) }
  },
  onThemeChanged(handler) {
    const listener = (_event: IpcRendererEvent, theme: unknown) => handler(themeOf(theme))
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  async pickInputs(multi: boolean) {
    const result = (await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.pickInputs, multi)) as
      PdfPickResult | undefined
    return result ?? { inputs: [], rejected: [] }
  },
  async run(request: PdfToolRunRequest) {
    const result = (await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.run, request)) as
      PdfToolRunResult | undefined
    return result ?? { ok: false, error: 'failed' }
  },
  async openResult(id: string) {
    await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.openResult, id)
  },
  async revealResult(id: string) {
    await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.revealResult, id)
  },
  async openInEditor() {
    await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.openInEditor)
  },
  async close() {
    await ipcRenderer.invoke(PDF_TOOLS_CHANNELS.close)
  },
}

contextBridge.exposeInMainWorld('aiOfficePdfTools', api)
