import type { ProjectFolderApi } from '@genoffice/project-store'

/**
 * The project folder bridge the shell preload exposes (decision 0088), for the
 * home ask panel and the home project screen. Absent with an older preload;
 * `@genoffice/ui` reads it through `windowProjectFolderBridge()`.
 */
declare global {
  interface Window {
    projectFolderApi?: ProjectFolderApi
  }
}

export {}
