/// <reference types="vite/client" />
import type { SlidesApi } from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { SlidesCollabApi } from '../shared/collab'

declare global {
  interface Window {
    slidesApi: SlidesApi
    projectApi: ProjectApi
    /** absent when the preload predates the split-pane bridge (or outside the shell) */
    aiOfficeSplit?: SplitPaneBridge
    /** the deck's side of LAN co-editing (absent outside Electron) */
    slidesCollab?: SlidesCollabApi
  }
}

export {}
