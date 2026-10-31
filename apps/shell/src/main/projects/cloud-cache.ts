import type { CloudOnlyResolver } from './project-files'

/**
 * How long a "not on this PC" verdict is reused for the context file list
 * (spec 5.4 item 4). Every send reads the list; without this, each send would
 * start the detector program again. A file downloaded or freed meanwhile shows
 * its new state after this long. Reads (`project_read`) never use the cache:
 * they ask the detector right before opening a file.
 */
export const CONTEXT_CLOUD_CACHE_MS = 60_000

/**
 * `resolve` with each path's verdict remembered for `ttlMs`. One call asks the
 * detector once, for the paths without a fresh verdict only. A failed run is
 * not remembered (the caller treats it as "not on this PC", the safe side).
 */
export function createCachedCloudResolver(
  resolve: CloudOnlyResolver,
  options: { ttlMs?: number; now?: () => number } = {},
): CloudOnlyResolver {
  const ttl = options.ttlMs ?? CONTEXT_CLOUD_CACHE_MS
  const now = options.now ?? Date.now
  const known = new Map<string, { at: number; cloudOnly: boolean }>()
  return async (paths) => {
    const at = now()
    for (const [path, entry] of known) {
      if (at - entry.at >= ttl) known.delete(path)
    }
    const out = new Map<string, boolean>()
    const missing = new Set<string>()
    for (const path of paths) {
      const entry = known.get(path)
      if (entry) out.set(path, entry.cloudOnly)
      else missing.add(path)
    }
    if (missing.size > 0) {
      const fresh = await resolve([...missing])
      const doneAt = now()
      for (const path of missing) {
        const cloudOnly = fresh.get(path)
        if (cloudOnly === undefined) continue
        known.set(path, { at: doneAt, cloudOnly })
        out.set(path, cloudOnly)
      }
    }
    return out
  }
}
