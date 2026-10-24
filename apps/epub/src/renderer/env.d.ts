/// <reference types="vite/client" />

import type { ProjectApi } from '@genoffice/project-store'
import type { EpubApi } from '../shared/ipc'

declare global {
  interface Window {
    epubApi: EpubApi
    projectApi?: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'>
  }
}

export {}
