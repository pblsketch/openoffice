/**
 * A copied range also goes on the clipboard as a picture, next to the TSV
 * text and the HTML table, the way Excel copies. Chat apps (KakaoTalk on
 * Mac sends an Excel copy as a photo) and image editors take the bitmap;
 * editors that read HTML or text still get the cells, and this editor's own
 * paste keeps treating "image + <table>" as cell data (picture-paste.ts).
 *
 * The picture is Univer's copy HTML drawn through an SVG <foreignObject>
 * onto a canvas: the HTML already carries column widths, row heights and
 * the composed cell styles. The PNG rides into Univer's single clipboard
 * write as custom data, so text, HTML and picture land together; if the
 * write with the picture fails, Univer retries with text and HTML only.
 *
 * Pasting such a clipboard back into a sheet must give cells. Univer's
 * keyboard paste (`legacyPaste`) takes any file first unless the HTML is
 * Excel's, so it would float the picture as an unsaved drawing; the files
 * are dropped there when the picture only renders the text.
 */
import { clipboardPictureIsRendering } from '@genoffice/ui/clipboard-picture'
import { ISheetClipboardService } from '@univerjs/sheets-ui'

import type { UniverRuntime } from './univer-state'

/// Univer's range-copy HTML (USMToHtmlService); in-cell editor copies and
/// other writers produce different markup and get no picture.
const RANGE_COPY_HTML = /^<google-sheets-html-origin><table\b[^>]*\bdata-copy-id="/

/// Device pixels one copy picture may cover. Rendering and PNG-encoding
/// happen before the clipboard write, so a picture this size (about 0.4 s)
/// is where the copy would start to lag; past it the range is several
/// screens of cells that a chat paste could not show legibly anyway, and
/// only the picture is left out.
export const COPY_PICTURE_MAX_PIXELS = 4096 * 4096

/// Light lines where the sheet shows gridlines; explicit cell borders in the
/// copy HTML are wider or darker and win the collapsed-border conflict.
const GRIDLINE = '1px solid #d9d9d9'

export function isRangeCopyHtml(html: string): boolean {
  return RANGE_COPY_HTML.test(html)
}

/// Picture size in CSS pixels read off the copy HTML (every <col> carries a
/// width and every <tr> a height), so oversized ranges are skipped before
/// any layout work.
export function estimateCopyPictureSize(html: string): { width: number; height: number } {
  let width = 0
  for (const match of html.matchAll(/<col\b[^>]*\bwidth="(\d+(?:\.\d+)?)"/g)) {
    width += Number(match[1])
  }
  let height = 0
  for (const match of html.matchAll(/<tr\b[^>]*\bheight:\s*(\d+(?:\.\d+)?)px/g)) {
    height += Number(match[1])
  }
  return { width, height }
}

/// Canvas scale for a picture of the given CSS size: the screen's pixel
/// ratio when it fits the budget (crisp on HiDPI), else 1, else no picture.
export function copyPictureScale(
  width: number,
  height: number,
  devicePixelRatio: number,
): number | null {
  if (!(width > 0) || !(height > 0)) return null
  const fits = (scale: number): boolean =>
    Math.ceil(width * scale) * Math.ceil(height * scale) <= COPY_PICTURE_MAX_PIXELS
  const preferred = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1)
  if (fits(preferred)) return preferred
  return fits(1) ? 1 : null
}

const NUMBER_LIKE = /^[-+(]?[\d\s.,%$€£¥₩]*\d[\d\s.,%$€£¥₩]*\)?$/

/// Numbers sit at the right edge on the grid unless the cell sets its own
/// alignment; the copy HTML only carries explicit alignment.
export function isNumberLikeCellText(text: string): boolean {
  return NUMBER_LIKE.test(text.trim())
}

function pictureStyles(gridlines: boolean): string {
  const border = gridlines ? `border:${GRIDLINE};` : ''
  return (
    `.copy-picture{display:inline-block;padding:1px;background:#fff;color:#000}` +
    `.copy-picture td{${border}padding:0 3px;white-space:nowrap;overflow:hidden;vertical-align:bottom}`
  )
}

function preparedTable(html: string): HTMLTableElement | null {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  )
  const table = parsed.querySelector('table')
  if (!table) return null
  for (const cell of Array.from(table.querySelectorAll('td'))) {
    if (!cell.style.textAlign && isNumberLikeCellText(cell.textContent ?? '')) {
      cell.style.textAlign = 'right'
    }
  }
  return table
}

/// Lays the table out in an isolated shadow root (the app's own table and
/// cell rules must not leak in) with the same stylesheet the SVG uses.
function measure(table: HTMLTableElement, styles: string): { width: number; height: number } {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>:host{all:initial}${styles}</style><div class="copy-picture"></div>`
  root.querySelector('.copy-picture')!.appendChild(document.importNode(table, true))
  document.body.appendChild(host)
  try {
    const rect = root.querySelector('.copy-picture')!.getBoundingClientRect()
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
  } finally {
    host.remove()
  }
}

/// PNG of the copied range, or null when it is too large or cannot be drawn.
export async function renderCopyPicture(
  html: string,
  options: { gridlines: boolean; devicePixelRatio: number },
): Promise<Blob | null> {
  const estimate = estimateCopyPictureSize(html)
  if (copyPictureScale(estimate.width, estimate.height, 1) === null) return null
  const table = preparedTable(html)
  if (!table) return null
  const styles = pictureStyles(options.gridlines)
  const { width, height } = measure(table, styles)
  const scale = copyPictureScale(width, height, options.devicePixelRatio)
  if (scale === null) return null
  const markup = new XMLSerializer().serializeToString(table)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#fff">` +
    `<style>${styles}</style><div class="copy-picture">${markup}</div></div>` +
    `</foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.scale(scale, scale)
  context.drawImage(image, 0, 0)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

type ClipboardWrite = (
  text: string,
  html: string,
  customData?: Record<string, string>,
) => Promise<void>

/// Wraps a clipboard write so range copies carry their picture. The PNG goes
/// in as custom data (Univer wraps each value in a Blob, and a Blob part may
/// itself be a Blob); a failed render just writes what Univer wrote before.
export function withCopyPicture(
  write: ClipboardWrite,
  render: (html: string) => Promise<Blob | null>,
): ClipboardWrite {
  return async (text, html, customData) => {
    if (!isRangeCopyHtml(html) || customData?.['image/png']) {
      return write(text, html, customData)
    }
    const picture = await render(html).catch(() => null)
    if (!picture) return write(text, html, customData)
    return write(text, html, {
      ...customData,
      'image/png': picture as unknown as string,
    })
  }
}

interface ClipboardInterface {
  write: ClipboardWrite
}

type LegacyPaste = (html?: string, text?: string, files?: File[]) => Promise<boolean>

/// Keyboard paste without the files when they only picture the HTML/text.
export function withoutRenderingFiles(paste: LegacyPaste): LegacyPaste {
  return (html, text, files) =>
    files?.length && clipboardPictureIsRendering(html ?? '', text ?? '')
      ? paste(html, text, undefined)
      : paste(html, text, files)
}

export function installCopyPicture(runtime: UniverRuntime): { dispose(): void } {
  // The clipboard interface is registered lazily: what the injector hands
  // out is a proxy that caches each method on first use, so a `write`
  // assigned through it is not what later calls get. The sheet clipboard service
  // (private field) gets its own wrapper instead, which also keeps the
  // picture to sheet range copies.
  const clipboardService = runtime.univer
    .__getInjector()
    .get(ISheetClipboardService) as unknown as {
    _clipboardInterfaceService: ClipboardInterface
    legacyPaste: LegacyPaste
  }
  const originalLegacyPaste = clipboardService.legacyPaste
  clipboardService.legacyPaste = withoutRenderingFiles(originalLegacyPaste.bind(clipboardService))
  const original = clipboardService._clipboardInterfaceService
  // Defined, not assigned: an assignment would fall through to the proxy's
  // set trap and replace the method on the shared instance itself.
  const wrapped = Object.create(original, {
    write: {
      value: withCopyPicture(
        (text, html, customData) => original.write(text, html, customData),
        (html) => {
          const worksheet = runtime.univerAPI.getActiveWorkbook()?.getActiveSheet()
          return renderCopyPicture(html, {
            gridlines: worksheet ? !worksheet.hasHiddenGridLines() : true,
            devicePixelRatio: window.devicePixelRatio,
          })
        },
      ),
    },
  }) as ClipboardInterface
  clipboardService._clipboardInterfaceService = wrapped
  return {
    dispose() {
      clipboardService.legacyPaste = originalLegacyPaste
      if (clipboardService._clipboardInterfaceService === wrapped) {
        clipboardService._clipboardInterfaceService = original
      }
    },
  }
}
