import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What the updater remembers across the restart it asks for, and the one
 * check it makes before choosing how to start the installer. No Electron here,
 * so the logic is testable on its own (updater.ts wires it).
 *
 * The NSIS installer runs detached after the app has quit. When it gives up
 * silently (an "all users" install whose administrator prompt was declined, a
 * process in the install folder it cannot end), nothing reports back: the app
 * simply comes back, or does not, at the old version. The attempt record is how
 * the next launch finds out.
 */

/** data-folder file holding the last installer start */
export const INSTALL_ATTEMPT_FILE = 'update-install-attempt.json'

export interface InstallAttempt {
  /** the version the installer was started for */
  version: string
  /** the version that was running when it was started */
  fromVersion: string
  /** true when the installer was started in its own window, false when silent */
  visible: boolean
}

function isInstallAttempt(value: unknown): value is InstallAttempt {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.version === 'string' &&
    v.version.length > 0 &&
    typeof v.fromVersion === 'string' &&
    v.fromVersion.length > 0 &&
    typeof v.visible === 'boolean'
  )
}

/** Written right before the installer starts; a failed write only costs the next launch's notice. */
export function recordInstallAttempt(dataDir: string, attempt: InstallAttempt): void {
  try {
    writeFileSync(join(dataDir, INSTALL_ATTEMPT_FILE), JSON.stringify(attempt))
  } catch {
    /* the install itself does not depend on the record */
  }
}

/** The record of the last installer start; null when there is none or it is unreadable. */
export function readInstallAttempt(dataDir: string): InstallAttempt | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dataDir, INSTALL_ATTEMPT_FILE), 'utf8'))
    return isInstallAttempt(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Drops the record once it has nothing left to say (the update applied, or the
 * app runs some other version). A failed attempt keeps its record until the
 * next installer start replaces it, so "later" does not reset the fallback.
 */
export function clearInstallAttempt(dataDir: string): void {
  try {
    unlinkSync(join(dataDir, INSTALL_ATTEMPT_FILE))
  } catch {
    /* already gone */
  }
}

/**
 * The attempt did not take: the app still runs the version that started the
 * installer. Any other version (the update itself, or one the user installed by
 * hand since) means there is nothing to report.
 */
export function installDidNotApply(
  attempt: InstallAttempt | null,
  currentVersion: string,
): attempt is InstallAttempt {
  return (
    attempt !== null && attempt.version !== currentVersion && attempt.fromVersion === currentVersion
  )
}

/**
 * How far automatic installing has been pushed back for this install:
 * 0 = nothing failed, 1 = a silent install did not apply (next time the
 * installer gets its own window), 2 = the installer window did not get it done
 * either (the update window points at the download page).
 */
export type InstallFailureLevel = 0 | 1 | 2

export function installFailureLevel(failed: InstallAttempt | null): InstallFailureLevel {
  if (failed === null) return 0
  return failed.visible ? 2 : 1
}

/**
 * Whether this user can write into the install folder. An "all users" install
 * under Program Files cannot be written without administrator rights, so its
 * installer has to ask for them. Node's access(W_OK) only reads the read-only
 * attribute on Windows, so the check creates (and removes) a file instead.
 */
export function installDirWritable(installDir: string, probeName: string): boolean {
  const probe = join(installDir, probeName)
  try {
    closeSync(openSync(probe, 'wx'))
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code
    // EEXIST: a probe left behind by a crash; the folder was writable then
    return code === 'EEXIST'
  }
  try {
    unlinkSync(probe)
  } catch {
    /* removed with the install folder at the next install */
  }
  return true
}
