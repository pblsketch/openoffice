/// <reference types="vite/client" />

import type { SplitPaneBridge } from '@genoffice/ui'
import type { ExcalidrawApi } from '../shared/ipc'

declare global {
  interface Window {
    excalidrawApi: ExcalidrawApi
    /** the shell's split panes; read through @genoffice/ui's split-pane-role helpers */
    aiOfficeSplit?: SplitPaneBridge
    /** where the drawing library loads its fonts from (this app's own folder) */
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

export {}
