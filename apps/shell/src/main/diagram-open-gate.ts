/**
 * Opening a diagram file from any open path (the open dialog, a drop, Recent,
 * the folder tree, the command line and a second instance, Drive, the in-app
 * MCP): the file is checked before it gets a tab. A broken file, or a
 * `.drawio.svg`/`.drawio.png` without a diagram inside, opens no tab; the
 * person sees why (spec 3.1). A `.vsdx` that is not a Visio drawing is turned
 * down the same way (spec 3.5); the check reads the archive, so it answers
 * later, and a second open of the same file meanwhile does nothing.
 *
 * `routeDocumentPath` (index.ts) is the one caller. No Electron here, so the
 * tests drive it with the editor's real checks.
 */
import { resolve } from 'node:path'

export interface DiagramOpenGateDeps {
  /** why a diagram file does not open (the words to show), or null when it does */
  refusal: (filePath: string) => string | null
  /** the same for a `.vsdx` */
  visioRefusal: (filePath: string) => Promise<string | null>
  /** give the file its tab (and a place in Recent) */
  open: (filePath: string) => void
  /** show why the file did not open */
  warn: (message: string, filePath: string) => void
}

const VSDX_RE = /\.vsdx$/i

/** the `.vsdx` files being checked now, by path */
const checking = new Set<string>()

const pathKey = (filePath: string): string =>
  process.platform === 'linux' ? resolve(filePath) : resolve(filePath).toLowerCase()

/**
 * Opens a diagram file that has no tab yet, or says why it cannot. True when
 * a tab opens (or a `.vsdx` is being checked), false when the file was turned
 * down here and now.
 */
export function openDiagramChecked(filePath: string, deps: DiagramOpenGateDeps): boolean {
  if (VSDX_RE.test(filePath)) {
    const key = pathKey(filePath)
    if (checking.has(key)) return true
    checking.add(key)
    void deps
      .visioRefusal(filePath)
      .catch((err: unknown) => (err instanceof Error ? err.message : String(err)))
      .then((reason) => {
        if (reason === null) deps.open(filePath)
        else deps.warn(reason, filePath)
      })
      .catch((err: unknown) => console.warn('[shell] opening a Visio drawing failed:', err))
      .finally(() => checking.delete(key))
    return true
  }
  const reason = deps.refusal(filePath)
  if (reason !== null) {
    deps.warn(reason, filePath)
    return false
  }
  deps.open(filePath)
  return true
}

/** For the tests: whether a `.vsdx` check is running for the path. */
export function diagramOpenChecking(filePath: string): boolean {
  return checking.has(pathKey(filePath))
}
