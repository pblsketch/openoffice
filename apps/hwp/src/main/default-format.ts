import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HwpFormat } from '../shared/ipc'

/**
 * What a brand-new document is saved as the first time (Settings › General).
 * A document that already has a file keeps that file's format; this choice only
 * decides what the first Save As of a new document offers.
 */
export const HWP_DEFAULT_FORMAT_KEY = 'hwpDefaultFormat'

/** The subset of Electron's `app` this module needs (kept structural for tests). */
export interface SettingsPathProvider {
  getPath(name: 'userData'): string
}

/** Anything absent or unknown is HWP, the format new documents had before this setting. */
export function normalizeHwpDefaultFormat(value: unknown): HwpFormat {
  return value === 'hwpx' ? 'hwpx' : 'hwp'
}

/** The configured choice in userData/app-settings.json; HWP when the file cannot be read. */
export function readHwpDefaultFormat(app: SettingsPathProvider): HwpFormat {
  try {
    const path = join(app.getPath('userData'), 'app-settings.json')
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'hwp'
    return normalizeHwpDefaultFormat((raw as Record<string, unknown>)[HWP_DEFAULT_FORMAT_KEY])
  } catch {
    return 'hwp'
  }
}
