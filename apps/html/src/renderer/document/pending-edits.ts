import { compileOps, type HtmlOp } from './ops'
import { buildParseMap, type ParseMap } from './parse-map'
import { applyPatches } from './patch'

/**
 * The source as a save would write it now, with the live style pokes and the
 * panel's open drafts applied, without committing any of them: a
 * crash-recovery copy needs that text while the user is still typing in the
 * panel. Batches apply in order, each against the source the previous one
 * produced (as the flush before a save does); a batch that no longer applies
 * is left out.
 */
export function withPendingEdits(
  text: string,
  map: ParseMap,
  batches: readonly (readonly HtmlOp[])[],
): string {
  let current = text
  let currentMap = map
  for (const ops of batches) {
    if (ops.length === 0) continue
    const compiled = compileOps(current, currentMap, ops)
    if (compiled.errors.length > 0) continue
    current = applyPatches(current, compiled.patches)
    currentMap = buildParseMap(current, currentMap.version, currentMap)
  }
  return current
}
