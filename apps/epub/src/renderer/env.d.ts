/// <reference types="vite/client" />

import type { ProjectApi, ProjectFolderApi } from '@genoffice/project-store'
import type { EpubApi } from '../shared/ipc'

declare global {
  interface Window {
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    epubApi: EpubApi
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
  }
}

export {}
