/// <reference types="vite/client" />

import type { DesktopApi } from '../shared/ipc'
import type { SubscriptionApi } from '../shared/subscription-api'
import type { ProjectApi, ProjectFolderApi } from '@genoffice/project-store'
import type { SplitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'

declare global {
  interface Window {
    /** project folders (decision 0088); absent outside the shell or with an older preload */
    projectFolderApi?: ProjectFolderApi
    desktop: DesktopApi
    projectApi: ProjectApi
    /** absent when the preload predates the subscription channels */
    aiOfficeSubscription?: SubscriptionApi
    /** absent when the preload predates the split-pane bridge (or outside the shell) */
    aiOfficeSplit?: SplitPaneBridge
  }
}

export {}
