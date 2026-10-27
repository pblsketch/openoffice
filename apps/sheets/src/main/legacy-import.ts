import { open, readFile, stat, writeFile } from 'node:fs/promises'

import {
  decodeHtmlBuffer,
  htmlTablesToXlsxBuffer,
  looksLikeHtmlWorkbook,
  parseHtmlTables,
} from '@genoffice/xlsx-gateway/gateway/html-import'

/// HTML travels through the main process as a string, so it gets the same cap
/// as a CSV import rather than the sidecar's archive limits.
export const MAX_HTML_IMPORT_BYTES = 32 * 1024 * 1024

const PROBE_BYTES = 8_192

export interface LegacyWorkbookConverter {
  convertWorkbook(input: { path: string; targetPath: string }): Promise<unknown>
}

export type LegacyWorkbookConversion =
  /// A real .xls (or another container calamine reads): the sidecar converted it.
  | 'workbook'
  /// An HTML table export: converted here, because the sidecar only reads containers.
  | 'html'
  /// A web page with no table in it.
  | 'html-no-table'
  /// An HTML page past the size this import path reads into memory.
  | 'html-too-large'

/**
 * Converts a legacy spreadsheet into a minimal .xlsx. Web systems regularly
 * name an HTML table `.xls`; Excel sniffs the content and opens it, so the
 * sidecar's container refusal would look like a broken file. Those pages are
 * read here instead.
 */
export async function convertLegacyWorkbook(
  client: LegacyWorkbookConverter,
  source: string,
  target: string,
  preferredCharset?: string,
): Promise<LegacyWorkbookConversion> {
  const head = await readHead(source)
  if (!looksLikeHtmlWorkbook(head)) {
    await client.convertWorkbook({ path: source, targetPath: target })
    return 'workbook'
  }
  if ((await stat(source)).size > MAX_HTML_IMPORT_BYTES) return 'html-too-large'
  const html = decodeHtmlBuffer(await readFile(source), preferredCharset)
  const tables = parseHtmlTables(html)
  if (tables.length === 0) return 'html-no-table'
  await writeFile(target, await htmlTablesToXlsxBuffer(tables))
  return 'html'
}

async function readHead(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r')
  try {
    const head = new Uint8Array(PROBE_BYTES)
    const { bytesRead } = await handle.read(head, 0, head.length, 0)
    return head.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
