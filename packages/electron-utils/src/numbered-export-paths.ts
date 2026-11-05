// Pure path helper (no Electron, no fs) so main processes, the shell and the
// command line can all import it from the `/numbered-export-paths` subpath.

/**
 * Save As › page images: the one file name the person typed (`report.png`)
 * becomes one name per page beside it. A single page keeps the name as typed;
 * more pages get `report-01.png`, `report-02.png`, … with the number padded to
 * at least two digits (three for 100+ pages) so the files sort in page order.
 */
export function numberedExportPaths(target: string, count: number): string[] {
  const pages = Math.max(0, Math.floor(count))
  if (pages <= 1) return pages === 1 ? [target] : []
  const slash = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))
  const dot = target.lastIndexOf('.')
  const hasExt = dot > slash + 1
  const stem = hasExt ? target.slice(0, dot) : target
  const ext = hasExt ? target.slice(dot) : ''
  const width = Math.max(2, String(pages).length)
  return Array.from(
    { length: pages },
    (_, i) => `${stem}-${String(i + 1).padStart(width, '0')}${ext}`,
  )
}
