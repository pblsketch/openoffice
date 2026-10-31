/**
 * Drive files for an AI panel's attachments (decisions 0033, 0085): the files
 * the person chose in Google's picker, at most MAX_ATTACH_FILES, each
 * downloaded (a Google document exported to Office) into its own folder under
 * a temporary directory. The editor then attaches the paths as it does files
 * from this PC, so its attachment reader (and the hiding it applies) is the
 * same. Copies older than a week are removed the first time the folder is
 * used in a run.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_READ_BYTES,
  localFileName,
  openPlan,
  type DriveApi,
  type DriveFile,
} from '@genoffice/google-drive'

export const MAX_ATTACH_FILES = 20
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

export interface AttachDownload {
  paths: string[]
  skipped: number
  failed: number
}

let pruned = false

async function pruneOld(dir: string, now: number): Promise<void> {
  if (pruned) return
  pruned = true
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info && now - info.mtimeMs > KEEP_MS) await rm(path, { recursive: true, force: true })
  }
}

/**
 * Download the picked files into `dir`; never throws. Past MAX_ATTACH_FILES
 * the rest are counted as skipped.
 */
export async function downloadPicks(
  api: DriveApi,
  picked: readonly string[],
  dir: string,
  now: number = Date.now(),
): Promise<AttachDownload> {
  await mkdir(dir, { recursive: true })
  await pruneOld(dir, now).catch(() => {})
  const ids = [...new Set(picked)]
  const out: AttachDownload = {
    paths: [],
    skipped: Math.max(0, ids.length - MAX_ATTACH_FILES),
    failed: 0,
  }
  for (const id of ids.slice(0, MAX_ATTACH_FILES)) {
    const meta = await api.file(id)
    if (!meta.ok) {
      out.failed += 1
      continue
    }
    let file: DriveFile = meta.file
    if (file.shortcutTarget) {
      const target = await api.file(file.shortcutTarget.id)
      if (!target.ok) {
        out.failed += 1
        continue
      }
      file = target.file
    }
    const plan = openPlan(file)
    if (plan.kind === 'none') {
      out.skipped += 1
      continue
    }
    const got =
      plan.kind === 'export'
        ? await api.export(file.id, plan.mime, MAX_READ_BYTES)
        : await api.download(file.id, MAX_READ_BYTES)
    if (!got.ok) {
      out.failed += 1
      continue
    }
    try {
      const folder = join(dir, randomBytes(6).toString('hex'))
      await mkdir(folder)
      const path = join(folder, localFileName(file.name, plan.extension))
      await writeFile(path, got.bytes)
      out.paths.push(path)
    } catch {
      out.failed += 1
    }
  }
  return out
}
