/// <reference types="vite/client" />

import type { ProjectFolderApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { PdfApi } from '../shared/ipc'

declare global {
  interface Window {
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    pdfApi: PdfApi
    /** present inside the shell; a standalone run has no split panes */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
