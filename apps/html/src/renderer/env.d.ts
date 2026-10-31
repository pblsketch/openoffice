/// <reference types="vite/client" />

import type { ProjectApi, ProjectFolderApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { HtmlApi } from '../shared/ipc'

declare global {
  interface Window {
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    htmlApi: HtmlApi
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
    /** present inside the shell; a standalone run has no split panes */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
