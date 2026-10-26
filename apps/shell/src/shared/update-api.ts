// Contract between the update window renderer (update.html) and the shell
// main process. Update-dialog IPC surface:
// get-state / download / install / later + a state-changed push event.

export const UPDATE_CHANNELS = {
  getState: 'update:get-state',
  download: 'update:download',
  install: 'update:install',
  later: 'update:later',
  openDownload: 'update:open-download',
  changed: 'update:changed',
  /** pushed to the shell window so Settings → About can offer the update */
  stateChanged: 'update:state-changed',
  /** Settings → About "update to vX": re-open the (minimized) dialog and act */
  openForUpdate: 'update:open-for-update',
} as const

/** 'manual' = automatic updating is not working for this version (repeated
 * failures, e.g. a signing-identity change the installed app refuses) — the
 * dialog guides the user to download the installer from the releases page.
 * 'install-failed' = the previous restart started the installer but the app
 * came back at the old version; the next try opens the installer in its own
 * window */
export type UpdatePhase =
  'available' | 'downloading' | 'downloaded' | 'error' | 'manual' | 'install-failed'

/** window copy is localized in the main process (owner of UI language) */
export interface UpdateUiStrings {
  title: string
  headline: string
  desc: string
  download: string
  later: string
  install: string
  downloading: string
  failed: string
  retry: string
  manualDesc: string
  /** 'install-failed': the last installer start did not update the app */
  installFailedDesc: string
  /** 'downloaded' with visibleInstall: the installer will open in its own window */
  visibleInstallDesc: string
  openDownload: string
  /** label above the release-notes box */
  notesLabel: string
  /** footer link opening the release page for the full, formatted notes */
  notesOnGitHub: string
  /** shown inside the notes box when notes were cut to fit the caps */
  notesTruncated: string
}

/** one inline piece of a release-notes block; plain text only, never HTML */
export interface UpdateNoteRun {
  text: string
  strong?: boolean
  code?: boolean
}

/** a release-notes block converted main-side from the remote HTML */
export type UpdateNoteBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: UpdateNoteRun[] }
  | { kind: 'paragraph'; runs: UpdateNoteRun[] }
  | { kind: 'list'; ordered: boolean; items: UpdateNoteRun[][] }

export interface UpdateNoteSection {
  /** release version of this section; null for a single unversioned note */
  version: string | null
  blocks: UpdateNoteBlock[]
}

/** release notes of the offered update, safe to draw as text; null when the release carries none */
export interface UpdateReleaseNotes {
  /** newest version first, as the update feed reports them */
  sections: UpdateNoteSection[]
  /** true when notes were cut to fit the size caps */
  truncated: boolean
}

export interface UpdateUiState {
  phase: UpdatePhase
  version: string
  currentVersion: string
  /** 0-100, meaningful while downloading */
  percent: number
  /** BCP-47 tag for documentElement.lang (drives CJK font selection) */
  lang: string
  strings: UpdateUiStrings
  releaseNotes: UpdateReleaseNotes | null
  /** the installer will open in its own window instead of running silently */
  visibleInstall: boolean
}

/** Settings → About reads the update state and re-opens the dialog on demand */
export interface UpdateSettingsApi {
  getUpdateState(): Promise<UpdateUiState | null>
  onUpdateStateChanged(handler: (state: UpdateUiState) => void): () => void
  /** re-open the update dialog; a download that has not started also starts */
  openUpdateDialog(): Promise<boolean>
}

export interface UpdateWindowApi {
  getState(): Promise<UpdateUiState | null>
  download(): void
  install(): void
  later(): void
  openDownload(): void
  onState(handler: (state: UpdateUiState) => void): () => void
}

/** user-selectable update channel: 'stable' follows the repository's latest
 * full release, 'beta' also its pre-releases */
export type UpdateChannel = 'stable' | 'beta'

export function isUpdateChannel(v: unknown): v is UpdateChannel {
  return v === 'stable' || v === 'beta'
}
