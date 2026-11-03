/**
 * Pictures of pages, as the export menu writes them and as a windowless job
 * hands them to the app: PNG always light, SVG as draw.io draws it (with the
 * file head an `.svg` file starts with), and light SVGs for PDF sheets.
 */
import type { PageInfo } from '../../shared/bridge-protocol'
import type { PrintPage } from '../../shared/ipc'
import { base64Bytes, type DrawioFrame } from '../drawio/frame-client'

export const SVG_FILE_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'

/** One page as the bytes of a `.png` or `.svg` file. */
export async function pagePictureBytes(
  client: DrawioFrame,
  format: 'png' | 'svg',
  pageId: string,
): Promise<Uint8Array> {
  if (format === 'png') return base64Bytes((await client.request('pagePng', { pageId })).base64)
  const svg = await client.request('pageSvg', { pageId, theme: 'auto' })
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
