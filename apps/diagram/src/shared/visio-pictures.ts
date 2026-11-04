/**
 * Pictures a Visio import could not convert (spec 3.5). draw.io's importer
 * turns every picture of a `.vsdx` into a `data:` image in the shape's style:
 * PNG, JPEG, GIF and BMP as they are, EMF converted to SVG on this PC. What
 * it cannot read stays in the diagram but is not drawn:
 *
 * - a Windows metafile (WMF), kept as its raw bytes under an SVG type;
 * - an EMF its converter refused, replaced by draw.io's "error" picture;
 * - anything else whose bytes the declared type does not describe (an OLE
 *   object's metafile preview under a PNG type, a TIFF).
 *
 * The count tells the person how many pictures they will not see. Nothing
 * here loads anything; it reads the page XML the import produced.
 */
import { styleValue } from './notices'

const IMAGE_DATA = /^data:image\/([^,;]+)((?:;[^,]*)?),(.*)$/is

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/** Every `style` attribute value in an XML text (decoded). */
function styles(xml: string): string[] {
  const out: string[] = []
  const re = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) out.push(decodeXmlAttr(match[2] ?? match[3] ?? ''))
  return out
}

/** The first bytes of a base64 text, or null when it is not base64. */
function headBytes(base64: string): number[] | null {
  const head = base64.replace(/\s+/g, '').slice(0, 32)
  if (head === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(head)) return null
  try {
    const binary = atob(head.slice(0, head.length - (head.length % 4)))
    return Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

type Sniffed = 'svg' | 'raster' | 'other'

function sniffBytes(bytes: number[]): Sniffed {
  const at = (i: number): number => bytes[i] ?? -1
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'raster'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'raster'
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'raster'
  if (at(0) === 0x42 && at(1) === 0x4d) return 'raster'
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46) {
    // RIFF....WEBP
    if (at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'raster'
  }
  let i = 0
  if (at(0) === 0xef && at(1) === 0xbb && at(2) === 0xbf) i = 3
  while (i < bytes.length && (at(i) === 0x20 || at(i) === 0x09 || at(i) === 0x0a || at(i) === 0x0d))
    i++
  return at(i) === 0x3c ? 'svg' : 'other'
}

/** Whether an image value from a style would be drawn. */
export function isDrawableImageData(value: string, errorImage = ''): boolean {
  const match = IMAGE_DATA.exec(value.trim())
  if (!match) return true // not a picture the import embedded (a link, a stencil): not ours to judge
  const type = (match[1] ?? '').toLowerCase()
  const data = match[3] ?? ''
  if (errorImage !== '' && data === errorImage) return false
  const bytes = headBytes(data)
  let sniffed: Sniffed
  if (bytes) sniffed = sniffBytes(bytes)
  else {
    let text = data
    try {
      text = decodeURIComponent(data)
    } catch {
      // keep the raw text
    }
    sniffed = /^\s*</.test(text) ? 'svg' : 'other'
  }
  if (type === 'svg+xml') return sniffed === 'svg'
  return sniffed === 'raster'
}

/**
 * How many shapes in the pages carry an imported picture that is not drawn.
 * `errorImage` is draw.io's own placeholder for an EMF it could not convert.
 */
export function countUnconvertedPictures(pageXmls: readonly string[], errorImage = ''): number {
  let count = 0
  for (const xml of pageXmls) {
    for (const style of styles(xml)) {
      const image = styleValue(style, 'image')
      if (image !== null && !isDrawableImageData(image, errorImage)) count++
    }
  }
  return count
}
