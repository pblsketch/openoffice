/**
 * Whether a file opens as a diagram, asked before the shell gives it a tab: a
 * broken file opens no tab, the person sees why instead (spec 3.1, 3.5).
 *
 * - `.drawio`, `.dio`, `.drawio.svg`, `.drawio.png`: the file must open with
 *   the model (`openDiagram`), the same check the editor makes. A picture
 *   without a diagram inside (`no_original`) is not a diagram.
 * - `.vsdx`: only draw.io inside the tab can read a Visio drawing, so this is
 *   the cheap part: the archive passes the zip gate and is a Visio drawing
 *   (`visio/document.xml`, the Visio content type). When draw.io's import
 *   still fails, the editor asks the shell to close the tab and say why
 *   (`diagram:open-failed`).
 *
 * Answers are in the app's language, from the editor's one dictionary. No
 * Electron here: the shell's routing and the tests call it as it is.
 */
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import JSZip from 'jszip'
import { detectDiagramFormat, openDiagram } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { assertZipInflatesWithinLimits } from '@genoffice/zip-gate'
import { OPEN_FAILURE_KEYS } from '../shared/open-failure'
import { tm } from './i18n-main'

export interface DiagramOpenCheckOptions {
  /**
   * A recovery copy of this file is kept: the tab opens anyway, so the editor
   * can offer the copy (and closes itself when the file is chosen and fails).
   */
  hasRecoveryCopy?: (filePath: string) => boolean
}

/**
 * Why `filePath` does not open as a diagram (the words to show), or null when
 * it does. Not for `.vsdx` (null; see `visioOpenRefusal`) or other names
 * (`failUnsupported`).
 */
export function diagramOpenRefusal(
  filePath: string,
  options: DiagramOpenCheckOptions = {},
): string | null {
  const kind = detectDiagramFormat(filePath)
  if (kind === 'vsdx') return null
  if (kind === null) return tm(OPEN_FAILURE_KEYS.unsupported)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(readFileSync(filePath))
  } catch {
    return tm(OPEN_FAILURE_KEYS.unreadable)
  }
  const opened = openDiagram(basename(filePath), bytes, nodePageCodec)
  if (opened.ok) return null
  if (options.hasRecoveryCopy?.(filePath)) return null
  return tm(OPEN_FAILURE_KEYS[opened.reason])
}

/** The Visio content type of a drawing's main part (`application/vnd.ms-visio.drawing.main+xml`). */
const VISIO_DRAWING_TYPE = /application\/vnd\.ms-visio\.drawing\.main\+xml/i
const VISIO_DOCUMENT_PART = /^visio\/document\.xml$/i

/** Why a `.vsdx` cannot be imported (the words to show), or null when draw.io may try it. */
export async function visioOpenRefusal(filePath: string): Promise<string | null> {
  if (detectDiagramFormat(filePath) !== 'vsdx') return tm(OPEN_FAILURE_KEYS.unsupported)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(filePath))
  } catch {
    return tm(OPEN_FAILURE_KEYS.unreadable)
  }
  return (await isVisioDrawing(bytes))
    ? null
    : tm('failImport', { reason: tm('importVisioUnreadable') })
}

/** The bytes are a zip the gate lets through, holding a Visio drawing. */
export async function isVisioDrawing(bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength === 0) return false
  try {
    await assertZipInflatesWithinLimits(bytes)
    const zip = await JSZip.loadAsync(bytes)
    if (zip.file(VISIO_DOCUMENT_PART).length === 0) return false
    const types = zip.file('[Content_Types].xml')
    return types !== null && VISIO_DRAWING_TYPE.test(await types.async('string'))
  } catch {
    return false
  }
}
