/// The default folder where new/untitled files land on their first (silent)
/// save and where AI-generated drafts go. Historically hardcoded to
/// <Documents>/GenOffice; now user-configurable via the `defaultSaveDir` key
/// in userData/app-settings.json (set from the home screen's account menu).
/// Every editor main module resolves through here so they all honor the same
/// setting.
import { accessSync, constants, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { PRODUCT_NAME } from '@genoffice/i18n'

/** the subset of Electron's `app` needed here (kept structural: this package has no Electron dependency) */
export interface PathProvider {
  getPath(name: 'userData' | 'documents' | 'home'): string
}

export const DEFAULT_SAVE_DIR_KEY = 'defaultSaveDir'

/**
 * How long a folder that could not be created or written stays skipped. The
 * resolver runs on every root check (home tree, search index, each save), and
 * Windows' Controlled Folder Access blocks a create in Documents on every
 * attempt, each with its own notification; re-trying after a while still
 * picks the folder up once the user allows the app.
 */
const UNUSABLE_RETRY_MS = 30_000

interface SaveDirState {
  unusableUntil: Map<string, number>
  /** the folder the resolver fell back from, and the one it uses instead */
  fallback: { blocked: string; using: string } | null
}

// every editor bundles its own copy of this package into the one shell process
const STATE_KEY = Symbol.for('genoffice.defaultSaveDir.state')

function saveDirState(): SaveDirState {
  const holder = globalThis as unknown as Record<symbol, SaveDirState | undefined>
  let state = holder[STATE_KEY]
  if (!state) {
    state = { unusableUntil: new Map(), fallback: null }
    holder[STATE_KEY] = state
  }
  return state
}

/** the configured folder from app-settings.json, or null when unset/unreadable */
export function readDefaultSaveDirSetting(settingsPath: string): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const value = (raw as Record<string, unknown>)[DEFAULT_SAVE_DIR_KEY]
    return typeof value === 'string' && isAbsolute(value) ? value : null
  } catch {
    return null
  }
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * mkdir -p without `recursive: true`. When Controlled Folder Access blocks a
 * create in Documents, Windows reports ENOENT although the parent exists, and
 * Node's recursive mkdirSync retries that forever, freezing the main process
 * at startup. Creating one level at a time from the nearest existing ancestor
 * fails fast instead.
 */
function createDirLevels(dir: string): void {
  const missing: string[] = []
  let current = resolve(dir)
  while (!isDirectory(current)) {
    missing.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  for (const level of missing.reverse()) mkdirSync(level)
}

/** true when the directory exists (or could be created) and is writable */
export function isUsableSaveDir(dir: string): boolean {
  try {
    // only create a missing folder: an existing one needs no write into its parent
    if (!isDirectory(dir)) createDirLevels(dir)
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** isUsableSaveDir, but a folder that just failed is skipped until UNUSABLE_RETRY_MS passes */
function usableNow(dir: string): boolean {
  const { unusableUntil } = saveDirState()
  const key = resolve(dir)
  const until = unusableUntil.get(key)
  if (until !== undefined && Date.now() < until) return false
  if (isUsableSaveDir(dir)) {
    unusableUntil.delete(key)
    return true
  }
  unusableUntil.set(key, Date.now() + UNUSABLE_RETRY_MS)
  return false
}

/**
 * Pick the effective default save folder: the configured one when it is
 * usable, otherwise the first usable fallback (created on demand). A
 * configured folder on an unplugged drive or with revoked permissions
 * degrades to the fallback instead of breaking silent saves; a blocked
 * Documents folder (Windows' Controlled Folder Access) degrades to the next
 * fallback instead of failing every caller.
 */
export function resolveDefaultSaveDir(
  configured: string | null,
  fallbackDir: string | readonly string[],
): string {
  const state = saveDirState()
  if (configured && usableNow(configured)) {
    state.fallback = null
    return configured
  }
  const fallbacks = typeof fallbackDir === 'string' ? [fallbackDir] : fallbackDir
  const first = fallbacks[0]
  for (const dir of fallbacks) {
    if (!usableNow(dir)) continue
    state.fallback = first === undefined || dir === first ? null : { blocked: first, using: dir }
    return dir
  }
  throw new Error(`default save dir not usable: ${fallbacks.join(', ')}`)
}

/**
 * When the last resolution had to skip <Documents>/<product> for another
 * folder: which folder was blocked and which one is used. Null otherwise.
 */
export function defaultSaveDirFallback(): { blocked: string; using: string } | null {
  return saveDirState().fallback
}

/**
 * `app.getPath(name)`, or null when the OS cannot report that folder. On
 * Windows Electron throws "Failed to get 'documents' path" when the Documents
 * known folder points nowhere (a broken registry entry, a OneDrive move that
 * was undone, a redirected folder on a missing drive).
 */
function pathOrNull(app: PathProvider, name: 'documents' | 'home'): string | null {
  try {
    return app.getPath(name) || null
  } catch {
    return null
  }
}

/**
 * The Documents folder, for dialogs that open there. When the OS cannot
 * report it, the home folder and then userData, the same order the default
 * save folder falls back in.
 */
export function documentsDirOrFallback(app: PathProvider): string {
  return pathOrNull(app, 'documents') ?? pathOrNull(app, 'home') ?? app.getPath('userData')
}

/** convenience for the Electron mains: settings lookup + fallback in one call */
export function configuredDefaultSaveDir(app: PathProvider): string {
  const settingsPath = join(app.getPath('userData'), 'app-settings.json')
  const documents = pathOrNull(app, 'documents')
  const home = pathOrNull(app, 'home')
  const fallbacks = [
    // an unreportable Documents folder is left out instead of failing every caller
    ...(documents ? [join(documents, PRODUCT_NAME)] : []),
    // outside the folders Controlled Folder Access protects by default
    ...(home ? [join(home, PRODUCT_NAME)] : []),
    // always writable for the app itself
    join(app.getPath('userData'), PRODUCT_NAME),
  ]
  return resolveDefaultSaveDir(readDefaultSaveDirSetting(settingsPath), fallbacks)
}
