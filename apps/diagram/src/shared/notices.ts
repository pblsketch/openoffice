/**
 * What a diagram uses that this editor does not show as drawn (spec 6): the
 * one notice a file gets when it opens. Read from the pages' model XML as
 * draw.io holds it, so compressed pages and imported diagrams count the same.
 *
 * - remote pictures: `image=http(s)…` in a style, `<img src="http(s)…">` in an
 *   HTML label, a page background image from the internet;
 * - remote fonts: `fontSource=http(s)…` in a style (draw.io's web fonts);
 * - PlantUML shapes: cells carrying `plantUmlData` (shown as the stored picture);
 * - libavoid edges: `libavoidRouting=1` (drawn with the ordinary routing);
 * - ELK layouts: a `childLayout` naming one of draw.io's ELK algorithms.
 *
 * Nothing here loads anything; the counts only explain what the screen shows.
 */

export interface DiagramNotices {
  remotePictures: number
  remoteFonts: number
  plantUml: number
  libavoid: number
  elk: number
  /** set by the Visio import: pictures it could not convert without a server */
  visioPictures?: number
}

export const NO_NOTICES: DiagramNotices = {
  remotePictures: 0,
  remoteFonts: 0,
  plantUml: 0,
  libavoid: 0,
  elk: 0,
}

const REMOTE = /^(?:https?:)?\/\//i

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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The value of `key` in a draw.io style string, or null. */
export function styleValue(style: string, key: string): string | null {
  for (const part of style.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === key) return part.slice(eq + 1)
  }
  return null
}

/** Every attribute value named `name` in an XML text (decoded). */
function attributeValues(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) out.push(decodeXmlAttr(match[2] ?? match[3] ?? ''))
  return out
}

const ELK_LAYOUT = /\belk[A-Za-z]*\b|"elk"/

/** Counts what the pages use that is not drawn as saved. */
export function scanDiagramNotices(pageXmls: readonly string[]): DiagramNotices {
  const found: DiagramNotices = { ...NO_NOTICES }
  for (const xml of pageXmls) {
    for (const style of attributeValues(xml, 'style')) {
      const image = styleValue(style, 'image')
      if (image !== null && REMOTE.test(safeDecode(image).trim())) found.remotePictures++
      const fontSource = styleValue(style, 'fontSource')
      if (fontSource !== null && REMOTE.test(safeDecode(fontSource).trim())) found.remoteFonts++
      if (styleValue(style, 'libavoidRouting') === '1') found.libavoid++
      const childLayout = styleValue(style, 'childLayout')
      if (childLayout !== null && ELK_LAYOUT.test(safeDecode(childLayout))) found.elk++
    }
    for (const label of [...attributeValues(xml, 'value'), ...attributeValues(xml, 'label')]) {
      const imgs = label.match(/<img\b[^>]*\ssrc\s*=\s*["']?\s*(?:https?:)?\/\//gi)
      if (imgs) found.remotePictures += imgs.length
    }
    for (const background of attributeValues(xml, 'backgroundImage')) {
      if (/"src"\s*:\s*"(?:https?:)?\/\//i.test(background)) found.remotePictures++
    }
    found.plantUml += attributeValues(xml, 'plantUmlData').length
  }
  return found
}

/** Whether there is anything to tell. */
export function hasNotices(notices: DiagramNotices): boolean {
  return (
    notices.remotePictures > 0 ||
    notices.remoteFonts > 0 ||
    notices.plantUml > 0 ||
    notices.libavoid > 0 ||
    notices.elk > 0 ||
    (notices.visioPictures ?? 0) > 0
  )
}
