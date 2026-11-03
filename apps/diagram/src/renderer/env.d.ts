/// <reference types="vite/client" />

import type { ProjectApi, ProjectFolderApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/ui'
import type { DiagramApi } from '../shared/ipc'

declare global {
  interface Window {
    diagramApi: DiagramApi
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
    /** the shell's split panes; read through @genoffice/ui's split-pane-role helpers */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
