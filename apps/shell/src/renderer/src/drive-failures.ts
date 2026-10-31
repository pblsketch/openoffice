import type { DriveConnectFailure } from '../../shared/drive-api'
import type { DriveStringKey } from './i18n/strings-drive'

/** The line shown when connecting or Google's picker did not go through ('cancelled' shows nothing) */
export const FAILURE_KEYS: Record<Exclude<DriveConnectFailure, 'cancelled'>, DriveStringKey> = {
  denied: 'driveFailDenied',
  scope: 'driveFailScope',
  timeout: 'driveFailTimeout',
  network: 'driveFailNetwork',
  training: 'driveFailTraining',
}
