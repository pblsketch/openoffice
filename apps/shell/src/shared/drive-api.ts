/**
 * Google Drive between the shell's main process and its screens (decisions
 * 0033, 0085). The home screen and Settings use the connection, picking and
 * listing channels; every editor's AI panel uses the `drive:ai-*` channels.
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
  setTrainingAck: 'drive:set-training-ack',
  list: 'drive:list',
  open: 'drive:open',
  pickOpen: 'drive:pick-open',
  aiEnabled: DRIVE_AI_CHANNELS.enabled,
  aiSearch: DRIVE_AI_CHANNELS.search,
  aiRead: DRIVE_AI_CHANNELS.read,
  connected: DRIVE_AI_CHANNELS.connected,
  pickAttachments: DRIVE_AI_CHANNELS.pickAttachments,
} as const

/** app-settings.json key: the person lets the AI search and read Drive */
export const DRIVE_AI_ACCESS_KEY = 'driveAiAccess'

/**
 * app-settings.json key: the person confirmed that the AI subscriptions they
 * use with Drive files do not train on what they receive (decision 0085).
 * Connecting, picking and the AI's Drive tools wait for it.
 */
export const DRIVE_TRAINING_ACK_KEY = 'driveTrainingAck'

/**
 * unavailable: this build carries no Google client, so nothing about Drive is
 * shown; disconnected (expired: Google ended the connection); connecting: the
 * browser sign-in is open; connected (persisted false: this PC cannot keep
 * the sign-in encrypted, so it lasts until the app closes; picking: Google's
 * picker is open in the browser). trainingAck: see DRIVE_TRAINING_ACK_KEY.
 */
export type DriveUiState =
  | { state: 'unavailable' }
  | { state: 'disconnected'; expired: boolean; aiAccess: boolean; trainingAck: boolean }
  | { state: 'connecting'; aiAccess: boolean; trainingAck: boolean }
  | {
      state: 'connected'
      name: string
      email: string
      persisted: boolean
      aiAccess: boolean
      trainingAck: boolean
      picking: boolean
    }

/** training: the person has not confirmed DRIVE_TRAINING_ACK_KEY yet */
export type DriveConnectFailure =
  'cancelled' | 'timeout' | 'denied' | 'scope' | 'network' | 'training'

export type DriveConnectResult = { ok: true } | { ok: false; reason: DriveConnectFailure }

/** The files the app may open (picked before, or made by the app), or a search among them */
export type DriveListingRequest = { kind: 'recent' } | { kind: 'search'; text: string }

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

/**
 * Opening from Google's picker: how many picked files opened, and the first
 * problem among those that did not; or why the picker did not run (busy:
 * another pick or sign-in is open).
 */
export type DrivePickOpenResult =
  | { ok: true; opened: number; problem?: DriveErrorKind | 'unsupported' | 'disk' }
  | { ok: false; reason: DriveConnectFailure | 'busy' | 'not-connected' }

/**
 * What an editor's "Attach from Google Drive" gets back. skipped: files left
 * out (a format no editor reads); failed: files Drive did not hand over.
 * training: DRIVE_TRAINING_ACK_KEY is not confirmed; free-ai: the AI in use
 * is a free connection that may train on what it receives, so Drive files
 * are not handed to it (decision 0085).
 */
export type DriveAttachResult =
  | { ok: true; paths: string[]; skipped: number; failed: number }
  | {
      ok: false
      reason: 'cancelled' | 'busy' | 'not-connected' | 'training' | 'free-ai' | 'failed'
    }

/** The home screen's and Settings' window.aiOfficeDrive */
export interface DriveApi {
  state(): Promise<DriveUiState>
  onStateChanged(listener: (state: DriveUiState) => void): () => void
  connect(): Promise<DriveConnectResult>
  cancelConnect(): Promise<void>
  disconnect(): Promise<void>
  setAiAccess(on: boolean): Promise<DriveUiState>
  setTrainingAck(on: boolean): Promise<DriveUiState>
  list(listing: DriveListingRequest, pageToken?: string): Promise<DriveListResult>
  open(fileId: string): Promise<DriveOpenResult>
  /** Google's picker in the browser, then the picked files open in tabs */
  pickOpen(): Promise<DrivePickOpenResult>
}
