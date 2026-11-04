/**
 * Pictures of pages, as the export menu writes them and as a windowless job
 * hands them to the app: always in light colors, whatever the app's theme.
 * PNG, SVG (with the file head an `.svg` file starts with; light colors only,
 * without draw.io's adaptive `light-dark()` colors that turn dark in a dark
 * viewer) and light SVGs for PDF sheets. A saved `.drawio.svg` is not made
 * here: it is draw.io's own serialization (`DrawioFrame.serialize`).
 */
import type { PageInfo } from '../../shared/bridge-protocol'
import type { PrintPage } from '../../shared/ipc'
import type { DrawioFrame } from '../drawio/frame-client'

export const SVG_FILE_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'

/** One page as the bytes of a `.png` or `.svg` file. */
export async function pagePictureBytes(
  client: DrawioFrame,
  format: 'png' | 'svg',
  pageId: string,
): Promise<Uint8Array> {
  if (format === 'png') return (await client.request('pagePng', { pageId })).bytes
  const svg = await client.request('pageSvg', { pageId, theme: 'light' })
  return new TextEncoder().encode(SVG_FILE_HEAD + svg.svg)
}

/** One page as a PDF or print sheet: a light SVG at the page's own format. */
export async function printPageOf(client: DrawioFrame, page: PageInfo): Promise<PrintPage> {
  const svg = await client.request('pageSvg', { pageId: page.id, theme: 'light' })
  return {
    svg: svg.svg,
    width: svg.width,
    height: svg.height,
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight,
  }
}
