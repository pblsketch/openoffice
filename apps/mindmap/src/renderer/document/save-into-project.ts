/**
 * Project folders (spec 6), renderer side: once the run a create flow handed
 * to an untitled map ended well, the map is offered to the main process for
 * its panel's project. Main picks the folder and a free name; this sends the
 * map's bytes and the name it goes by, and reads the answer.
 */
import type { MindmapApi, SaveIntoProjectResult } from '../../shared/ipc'

export type ProjectSaveOutcome =
  /** written: the map is that file now */
  | { kind: 'saved'; path: string }
  /** no project, a map with a file already, or no shell: nothing written, nothing to say */
  | { kind: 'skipped' }
  /** the project folder refused the write: the map stays untitled, the reason is shown */
  | { kind: 'failed'; error: string }

function outcomeOf(raw: SaveIntoProjectResult | null | undefined): ProjectSaveOutcome {
  if (!raw || typeof raw !== 'object') return { kind: 'skipped' }
  if (raw.ok === true && typeof raw.path === 'string' && raw.path) {
    return { kind: 'saved', path: raw.path }
  }
  if (raw.ok === false && 'error' in raw && typeof raw.error === 'string') {
    return { kind: 'failed', error: raw.error }
  }
  return { kind: 'skipped' }
}

export async function saveMapIntoProject(
  api: Pick<MindmapApi, 'saveIntoProject'> | undefined,
  bytes: Uint8Array,
  defaultName: string | undefined,
): Promise<ProjectSaveOutcome> {
  const call = api?.saveIntoProject
  if (!call) return { kind: 'skipped' }
  try {
    return outcomeOf(await call.call(api, { bytes, ...(defaultName ? { defaultName } : {}) }))
  } catch (err) {
    return { kind: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}
