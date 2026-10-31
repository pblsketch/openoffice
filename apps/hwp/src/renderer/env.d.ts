/// <reference types="vite/client" />

import type { ProjectApi, ProjectFolderApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/ui'
import type { HwpApi } from '../shared/ipc'

declare global {
  interface Window {
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    hwpApi: HwpApi
    /** the shell's chat history of documents; absent where no shell registered it */
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
    /** the shell's split panes; read through @genoffice/ui's split-pane-role helpers */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
