/**
 * Google Drive between the shell's main process and its screens (decision
 * 0033). The home screen and Settings use the connection and browsing
 * channels; every editor's AI panel uses the three `drive:ai-*` channels.
 * Tokens never cross this boundary.
 */

import { DRIVE_AI_CHANNELS } from '@genoffice/electron-utils/drive-ai-channels'

export const DRIVE_CHANNELS = {
  state: 'drive:state',
  stateChanged: DRIVE_AI_CHANNELS.changed,
  connect: 'drive:connect',
  cancelConnect: 'drive:cancel-connect',
  disconnect: 'drive:disconnect',
  setAiAccess: 'drive:set-ai-access',
  list: 'drive:list',
  open: 'drive:open',
  aiEnabled: DRIVE_AI_CHANNELS.enabled,
  aiSearch: DRIVE_AI_CHANNELS.search,
  aiRead: DRIVE_AI_CHANNELS.read,
  connected: DRIVE_AI_CHANNELS.connected,
  pickAttachments: DRIVE_AI_CHANNELS.pickAttachments,
} as const

/** app-settings.json key: the person lets the AI search and read Drive */
export const DRIVE_AI_ACCESS_KEY = 'driveAiAccess'

/**
 * unavailable: this build carries no Google client, so nothing about Drive is
 * shown; disconnected (expired: Google ended the connection); connecting: the
 * browser sign-in is open; connected (persisted false: this PC cannot keep
 * the sign-in encrypted, so it lasts until the app closes).
 */
export type DriveUiState =
  | { state: 'unavailable' }
  | { state: 'disconnected'; expired: boolean; aiAccess: boolean }
  | { state: 'connecting'; aiAccess: boolean }
  | {
      state: 'connected'
      name: string
      email: string
      persisted: boolean
      aiAccess: boolean
    }

export type DriveConnectFailure = 'cancelled' | 'timeout' | 'denied' | 'scope' | 'network'

export type DriveConnectResult = { ok: true } | { ok: false; reason: DriveConnectFailure }

export type DriveListingRequest =
  | { kind: 'folder'; folderId: string }
  | { kind: 'shared' }
  | { kind: 'recent' }
  | { kind: 'search'; text: string }

export type DriveErrorKind =
  'not-connected' | 'not-found' | 'forbidden' | 'too-large' | 'rate-limit' | 'network'

export interface DriveEntry {
  id: string
  name: string
  /** folder, document, spreadsheet, presentation, pdf, markdown, html, mindmap, hwp, epub, other */
  type: DriveEntryType
  /** ISO time */
  modifiedTime: string
  size?: number
  /** an editor here opens it */
  openable: boolean
  /** the account may change it; false files open read-only on Drive (saves stay on this PC) */
  canEdit: boolean
  /** Google's own document: opens as an Office copy, saves to a new Office file beside it */
  google: boolean
}

export type DriveEntryType =
  | 'folder'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'markdown'
  | 'html'
  | 'mindmap'
  | 'hwp'
  | 'epub'
  | 'other'

export type DriveListResult =
  { ok: true; files: DriveEntry[]; nextPageToken?: string } | { ok: false; kind: DriveErrorKind }

export type DriveOpenResult =
  { ok: true } | { ok: false; kind: DriveErrorKind | 'unsupported' | 'disk' }

/** The home screen's and Settings' window.aiOfficeDrive */
export interface DriveApi {
  state(): Promise<DriveUiState>
  onStateChanged(listener: (state: DriveUiState) => void): () => void
  connect(): Promise<DriveConnectResult>
  cancelConnect(): Promise<void>
  disconnect(): Promise<void>
  setAiAccess(on: boolean): Promise<DriveUiState>
  list(listing: DriveListingRequest, pageToken?: string): Promise<DriveListResult>
  open(fileId: string): Promise<DriveOpenResult>
}
