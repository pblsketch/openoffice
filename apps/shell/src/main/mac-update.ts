import { execFile, spawn } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { installDirWritable } from './update-attempt'

/**
 * The Mac app installs its own updates, without Squirrel.Mac (decision 0097).
 *
 * Squirrel.Mac only installs into an app signed with an Apple Developer ID;
 * this product's Mac builds are signed ad hoc (decision 0031). electron-updater
 * still finds and downloads the release's zip, checking it against the
 * sha512 in latest-mac.yml. Where it would hand the zip to Squirrel.Mac,
 * installMacStaging has it unpack the zip next to the installed app instead
 * and check what came out (stageMacUpdate). At "Restart & Install" the app
 * starts a small detached script and quits; the script waits for the app's
 * process to end, swaps the new bundle in by renaming, and opens it
 * (startMacSwap). A failed swap puts the old bundle back and opens that.
 *
 * Nothing here adds or strips the quarantine flag: the app downloads the zip
 * itself, so the files never carry one and the new version opens without the
 * Gatekeeper prompt the first install needed.
 *
 * No Electron here, so the logic is testable on its own (updater.ts wires it).
 */

/** the .app bundle that holds `execPath` (<bundle>/Contents/MacOS/<exe>), or null */
export function macAppBundle(execPath: string): string | null {
  const macos = dirname(execPath)
  const contents = dirname(macos)
  const bundle = dirname(contents)
  if (basename(macos) !== 'MacOS' || basename(contents) !== 'Contents') return null
  if (!bundle.endsWith('.app') || basename(bundle) === '.app') return null
  return bundle
}

/** where an update is unpacked: a hidden folder beside the installed bundle */
export function macStagingDir(bundle: string): string {
  return join(dirname(bundle), `.${basename(bundle)}.update`)
}

/** where the running bundle is moved while the new one takes its name */
export function macPreviousDir(bundle: string): string {
  return join(dirname(bundle), `.${basename(bundle)}.previous`)
}

/** why this install cannot replace itself */
export type MacSelfUpdateBlock = 'not-an-app-bundle' | 'translocated' | 'read-only'

/**
 * Null when the installed app can be replaced in place. An app opened straight
 * from the disk image, or one macOS runs from a randomized read-only copy
 * (App Translocation, for a quarantined app that was never moved), cannot;
 * neither can one in a folder this user may not write (an administrator's
 * install in /Applications for a standard account). The swap renames the
 * bundle within its folder, so that folder is what has to be writable.
 */
export function macSelfUpdateBlock(
  execPath: string,
  writable: (dir: string, probeName: string) => boolean = installDirWritable,
): MacSelfUpdateBlock | null {
  const bundle = macAppBundle(execPath)
  if (bundle === null) return 'not-an-app-bundle'
  if (bundle.includes('/AppTranslocation/')) return 'translocated'
  if (!writable(dirname(bundle), `.ieumoffice-update-check-${process.pid}`)) return 'read-only'
  return null
}

/** Removes what an interrupted update left beside the bundle; never throws. */
export function removeMacLeftovers(bundle: string): void {
  for (const dir of [macStagingDir(bundle), macPreviousDir(bundle)]) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* the next update clears the staging folder before using it */
    }
  }
}

/** runs a program without a shell and resolves with its standard output */
export type RunProgram = (file: string, args: string[]) => Promise<string>

export const runProgram: RunProgram = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr).trim()
        reject(new Error(detail ? `${err.message}: ${detail}` : err.message))
      } else {
        resolve(String(stdout))
      }
    })
  })

async function plistValue(run: RunProgram, bundle: string, key: string): Promise<string> {
  const plist = join(bundle, 'Contents', 'Info.plist')
  return (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).trim()
}

/**
 * Unpacks the downloaded zip beside `bundle` and returns the new bundle's
 * path. It must be exactly one app, of `version`, with the installed app's
 * bundle identifier, whose signature still covers every file (ditto keeps the
 * framework symlinks a plain unzip would break). Anything else throws and
 * leaves nothing behind, and the download counts as failed.
 */
export async function stageMacUpdate(options: {
  zip: string
  bundle: string
  version: string
  run?: RunProgram
}): Promise<string> {
  const { zip, bundle, version, run = runProgram } = options
  const staging = macStagingDir(bundle)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging)
  try {
    await run('/usr/bin/ditto', ['-x', '-k', zip, staging])
    const apps = readdirSync(staging).filter((name) => name.endsWith('.app'))
    if (apps.length !== 1) throw new Error(`the update holds ${apps.length} apps, not one`)
    const staged = join(staging, apps[0])
    const stagedVersion = await plistValue(run, staged, 'CFBundleShortVersionString')
    if (stagedVersion !== version) {
      throw new Error(`the update holds version ${stagedVersion}, not ${version}`)
    }
    const [installedId, stagedId] = await Promise.all([
      plistValue(run, bundle, 'CFBundleIdentifier'),
      plistValue(run, staged, 'CFBundleIdentifier'),
    ])
    if (stagedId !== installedId) {
      throw new Error(`the update is ${stagedId}, not ${installedId}`)
    }
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged])
    return staged
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    throw err
  }
}

/** the part of electron-updater's MacUpdater that installMacStaging replaces */
interface MacUpdaterInternals {
  updateDownloaded?: unknown
  dispatchUpdateDownloaded?: unknown
}

/**
 * Points electron-updater's Mac download at `stage` instead of Squirrel.Mac.
 * MacUpdater calls its own updateDownloaded(fileInfo, event) once the zip is
 * downloaded and verified (tests/mac-update.test.ts pins that call); here it
 * stages the zip and announces 'update-downloaded' itself. A rejection fails
 * the download. Returns false, changing nothing, when electron-updater no
 * longer has these methods; the Mac install then keeps the download page.
 */
export function installMacStaging(
  updater: object,
  stage: (zip: string, version: string) => Promise<void>,
): boolean {
  const internals = updater as MacUpdaterInternals
  const dispatch = internals.dispatchUpdateDownloaded
  if (typeof internals.updateDownloaded !== 'function' || typeof dispatch !== 'function') {
    return false
  }
  internals.updateDownloaded = async (
    _fileInfo: unknown,
    event: { downloadedFile: string; version: string },
  ): Promise<string[]> => {
    await stage(event.downloadedFile, event.version)
    dispatch.call(updater, event)
    return []
  }
  return true
}

/**
 * The swap, run by /bin/sh after the app has quit. Every value comes in as a
 * positional argument, never spliced into the script text:
 * $1 the app's process id, $2 the installed bundle, $3 the staged bundle,
 * $4 the staging folder, $5 where the running bundle is moved aside,
 * $6 the update record (update-log.txt), $7 the program that opens the app.
 * Both renames stay on one volume, so each is a single step. Whatever happens,
 * the bundle at $2 is opened again with --updated, which brings back the
 * documents that were open.
 */
export const MAC_SWAP_SCRIPT = `pid=$1 app=$2 staged=$3 staging=$4 previous=$5 log=$6 opener=$7
note() { printf '%s info [swap] %s\\n' "$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log" 2>/dev/null; }
n=0
while kill -0 "$pid" 2>/dev/null; do
  n=$((n + 1))
  if [ "$n" -gt 600 ]; then
    note 'the app did not quit within a minute; the update was not installed'
    exit 1
  fi
  /bin/sleep 0.1
done
/bin/rm -rf "$previous"
if /bin/mv "$app" "$previous"; then
  if /bin/mv "$staged" "$app"; then
    note 'installed the new version'
    /bin/rm -rf "$previous" "$staging"
  else
    note 'could not move the new version in; putting the previous one back'
    /bin/mv "$previous" "$app" || note "could not put the previous version back from $previous"
  fi
else
  note 'could not move the running version aside; the update was not installed'
fi
"$opener" "$app" --args --updated
`

/**
 * Starts the swap detached, so it outlives the app it is waiting for.
 * Returns false when the script could not be started.
 */
export function startMacSwap(options: {
  pid: number
  bundle: string
  staged: string
  logFile: string
  opener?: string
  spawnProgram?: typeof spawn
}): boolean {
  const { pid, bundle, staged, logFile, opener = '/usr/bin/open', spawnProgram = spawn } = options
  try {
    const child = spawnProgram(
      '/bin/sh',
      [
        '-c',
        MAC_SWAP_SCRIPT,
        'ieumoffice-update',
        String(pid),
        bundle,
        staged,
        macStagingDir(bundle),
        macPreviousDir(bundle),
        logFile,
        opener,
      ],
      { detached: true, stdio: 'ignore' },
    )
    // a failed start is reported here, never as an uncaught error event
    child.on('error', () => {})
    child.unref()
    return child.pid !== undefined
  } catch {
    return false
  }
}
