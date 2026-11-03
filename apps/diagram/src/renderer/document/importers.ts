/**
 * The place another program's file becomes a new diagram (spec 3.5). The
 * main process hands such a file over as `import` (its bytes and the tab
 * title); the open flow looks up the importer for its kind here and loads
 * what it returns into draw.io. The tab stays untitled; its first save
 * proposes `.drawio` next to the source file.
 *
 * `visio-import.ts` registers `vsdx` when the editor screen starts. A kind
 * with nothing registered is refused with the unsupported-file message.
 */
import type { DiagramImportKind } from '../../shared/ipc'
import type { DiagramNotices } from '../../shared/notices'
import type { DrawioFrame } from '../drawio/frame-client'

export interface DiagramImportInput {
  bytes: Uint8Array
  /** the tab's name (the source file's name without its ending) */
  title: string
  /** the running draw.io editor, for importers that use draw.io's own converters */
  frame: DrawioFrame
}

export type DiagramImportResult =
  /** draw.io XML to open; `notices` adds to the one notice the file gets (e.g. pictures not converted) */
  | { ok: true; xml: string; notices?: Partial<DiagramNotices> }
  /** shown to the person as the reason the file did not open */
  | { ok: false; reason: string }

export type DiagramImporter = (input: DiagramImportInput) => Promise<DiagramImportResult>

const importers = new Map<DiagramImportKind, DiagramImporter>()

/** Registers (or with null removes) the importer for a kind of file. */
export function registerDiagramImporter(
  kind: DiagramImportKind,
  importer: DiagramImporter | null,
): void {
  if (importer) importers.set(kind, importer)
  else importers.delete(kind)
}

export function diagramImporter(kind: DiagramImportKind): DiagramImporter | null {
  return importers.get(kind) ?? null
}
