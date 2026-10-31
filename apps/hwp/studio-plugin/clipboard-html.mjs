/**
 * Clipboard HTML for pictures, tables and text boxes in the HWP editor.
 *
 * Copying: the engine writes a body block's HTML from the paragraphs' text alone: a picture, a
 * table or a text box inside the block is left out (`paragraph_to_html` skips the controls).
 * Pasting into the same document still brings them, because the editor then pastes from the
 * engine's own clipboard, but that clipboard belongs to one document: pasting into another HWP
 * tab, Hancom Hangul or Word reads the HTML and gets the text alone (2026-10-28 feedback).
 * `ieumSelectionHtml` asks the engine for each picture and table in the block on its own, as the
 * editor does when one of them is selected and copied, and puts them between the text where
 * they stand. A text box goes in as its text in a one-cell framed table: the engine cannot
 * write a shape as HTML, and its text is what a reader of the HTML can keep. A shape without
 * text is still left out. A block without any of these gets the engine's HTML unchanged.
 *
 * Pasting into a table cell: the engine's HTML paste into a cell drops every `<img>`, so Hancom
 * Hangul's text with a picture, or a picture copied in another HWP tab, lost the picture there.
 * `ieumPasteHtmlInCell` pastes the HTML in turns around its pictures and puts each picture into
 * the cell's text where it stood.
 *
 * Pasting a picture file (a screen capture, a picture copied in a browser or alone in Hancom
 * Hangul): `ieumPictureHtml` makes HTML of it, so it goes in at the caret like the above.
 *
 * The studio-clipboard-objects patch calls both in place of the engine's calls.
 */

/** Module specifier the studio-clipboard-objects patch imports; build-studio.mjs aliases it. */
export const CLIPBOARD_HTML_MODULE = '@ieum/clipboard-html'

const FRAGMENT = /<!--StartFragment-->\s*([\s\S]*?)\s*<!--EndFragment-->/
const PARAGRAPH = /^<p([^>]*)>\s*([\s\S]*?)<\/p>$/
const OBJECT = /<(img|table)\b/i
const DATA_SRC = /\bsrc\s*=\s*["']data:image\/(png|jpe?g|gif|bmp);base64,([^"']+)["']/i
/** A text box's frame: the thin black line the engine gives a new table. */
const BOX_CELL = 'border:1.0px solid #000000;padding:1px 5px;vertical-align:top;'
/** A page pixel is 75 HWPUNIT. */
const PX_TO_HWPUNIT = 75

/** What the engine put between its fragment markers. */
function fragment(html) {
  return FRAGMENT.exec(html)?.[1] ?? ''
}

/** The text of a text box, as the engine writes a cell's, framed; '' when the control is none. */
function textBoxHtml(wasm, sec, para, ci) {
  const at = (cellParaIndex) => JSON.stringify([{ controlIndex: ci, cellIndex: 0, cellParaIndex }])
  let html
  try {
    const count = wasm.getCellParagraphCountByPath(sec, para, at(0))
    if (!(count > 0)) return ''
    const end = wasm.getCellParagraphLengthByPath(sec, para, at(count - 1))
    html = fragment(wasm.exportSelectionInCellHtmlByPath(sec, para, at(0), 0, 0, count - 1, end))
  } catch {
    // not a text box: the engine answers so for any other control
    return ''
  }
  if (!html.replace(/<[^>]*>/g, '').trim()) return ''
  return (
    '<table style="border-collapse:collapse;" cellpadding="0" cellspacing="0">\n' +
    `<tr><td style="${BOX_CELL}">\n${html}\n</td></tr>\n</table>\n`
  )
}

/**
 * The pictures, tables and text boxes of one paragraph between two text offsets, in order. The
 * bounds are the engine's own for its internal copy: an object standing at the start is in, one
 * standing at the end is in only when the block ends at the paragraph's end.
 */
function objectsIn(wasm, sec, para, from, to, length) {
  const found = []
  wasm.getControlTextPositions(sec, para).forEach((pos, ci) => {
    if (pos < from || pos > to || (pos === to && to < length)) return
    let html = fragment(wasm.exportControlHtml(sec, para, ci, ''))
    if (!OBJECT.test(html)) html = textBoxHtml(wasm, sec, para, ci)
    if (!html) return
    found.push({ pos, html, block: /^<table\b/i.test(html.trimStart()) })
  })
  return found.sort((a, b) => a.pos - b.pos)
}

/**
 * One paragraph's part of the block: the text runs the engine writes, with each picture inline
 * where it stands and each table between paragraphs.
 */
function paragraphHtml(wasm, sec, para, from, to, objects) {
  let out = ''
  let open = false
  const text = (a, b) => {
    if (a >= b) return
    const match = PARAGRAPH.exec(fragment(wasm.exportSelectionHtml(sec, para, a, para, b)))
    if (!match || !match[2]) return
    if (!open) out += `<p${match[1]}>`
    open = true
    out += match[2]
  }
  let at = from
  for (const object of objects) {
    text(at, object.pos)
    at = Math.max(at, object.pos)
    if (object.block && open) {
      out += '</p>\n'
      open = false
    }
    out += object.block || open ? object.html : `<p>${object.html}</p>\n`
  }
  text(at, to)
  if (open) out += '</p>\n'
  return out
}

/**
 * The clipboard HTML of a body block, `exportSelectionHtml`'s arguments in the same order. The
 * engine's HTML when no picture, table or text box stands in the block.
 *
 * @param {{
 *   exportSelectionHtml(sec: number, sp: number, so: number, ep: number, eo: number): string
 *   exportControlHtml(sec: number, para: number, ci: number, cellPathJson?: string): string
 *   exportSelectionInCellHtmlByPath(sec: number, para: number, path: string, sp: number, so: number, ep: number, eo: number): string
 *   getCellParagraphCountByPath(sec: number, para: number, path: string): number
 *   getCellParagraphLengthByPath(sec: number, para: number, path: string): number
 *   getControlTextPositions(sec: number, para: number): number[]
 *   getParagraphLength(sec: number, para: number): number
 * }} wasm the editor's engine bridge
 */
export function ieumSelectionHtml(wasm, sec, startPara, startOffset, endPara, endOffset) {
  const html = wasm.exportSelectionHtml(sec, startPara, startOffset, endPara, endOffset)
  const paragraphs = []
  let any = false
  for (let para = startPara; para <= endPara; para += 1) {
    const length = wasm.getParagraphLength(sec, para)
    const from = para === startPara ? Math.min(startOffset, length) : 0
    const to = para === endPara ? Math.min(endOffset, length) : length
    const objects = objectsIn(wasm, sec, para, from, to, length)
    if (objects.length > 0) any = true
    paragraphs.push({ para, from, to, objects })
  }
  if (!any) return html
  const body = paragraphs
    .map(({ para, from, to, objects }) => paragraphHtml(wasm, sec, para, from, to, objects))
    .join('')
  return `<html><body>\n<!--StartFragment-->\n${body}<!--EndFragment-->\n</body></html>`
}

const PICTURE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
}

/**
 * A picture file from the clipboard as clipboard HTML of its own, at a size in HWPUNIT; null for
 * a kind the engine's HTML paste does not take. The editor pasted such a file with the engine's
 * `insertPicture`, which in the body makes a picture floating at the paper's top left corner
 * (not where the caret is) and in a cell one floating over the cell's text. Pasted as HTML it
 * goes in at the caret as part of the text, in the body by the engine and in a cell by
 * `ieumPasteHtmlInCell`, as a picture copied in another document does.
 */
export function ieumPictureHtml(bytes, extension, width, height) {
  const mime = PICTURE_MIME[String(extension).toLowerCase()]
  if (!mime || !(width > 0 && height > 0)) return null
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  const px = (hu) => Math.round((hu / PX_TO_HWPUNIT) * 100) / 100
  return (
    '<html><body>\n<!--StartFragment-->\n' +
    `<img src="data:${mime};base64,${btoa(binary)}" width="${px(width)}" height="${px(height)}" />\n` +
    '<!--EndFragment-->\n</body></html>'
  )
}

/** The pixel size a picture file says it has; null for a kind not read here. */
export function pictureSize(bytes) {
  const u16 = (i, little) =>
    little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]
  const u32 = (i) =>
    ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return { w: u32(16), h: u32(20) }
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { w: u16(6, true), h: u16(8, true) }
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { w: Math.abs(view.getInt32(18, true)), h: Math.abs(view.getInt32(22, true)) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null
      const marker = bytes[i + 1]
      const size = u16(i + 2, false)
      // start of frame, any kind but the DHT/JPG/DAC markers that share the range
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: u16(i + 7, false), h: u16(i + 5, false) }
      }
      i += 2 + size
    }
  }
  return null
}

/** A length an `<img>` gives in pixels: a bare number or px, or pt; null when it gives none. */
function pixels(value) {
  const match = /^\s*([\d.]+)\s*(px|pt)?\s*$/i.exec(value ?? '')
  if (!match) return null
  const n = Number(match[1])
  if (!(n > 0)) return null
  return match[2]?.toLowerCase() === 'pt' ? (n * 96) / 72 : n
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i').exec(tag)
  return match?.[1] ?? null
}

function styleLength(tag, name) {
  const style = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ''
  return new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1] ?? null
}

/** A picture an `<img>` carries in its own data, at the size it gives; null otherwise. */
function dataPicture(tag) {
  const src = DATA_SRC.exec(tag)
  if (!src) return null
  let bytes
  try {
    bytes = Uint8Array.from(atob(src[2].replace(/\s+/g, '')), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  const natural = pictureSize(bytes)
  let w = pixels(styleLength(tag, 'width')) ?? pixels(attribute(tag, 'width'))
  let h = pixels(styleLength(tag, 'height')) ?? pixels(attribute(tag, 'height'))
  if (natural && w === null && h === null) {
    w = natural.w
    h = natural.h
  } else if (natural && w === null && h !== null) {
    w = (h * natural.w) / natural.h
  } else if (natural && h === null && w !== null) {
    h = (w * natural.h) / natural.w
  }
  if (!(w > 0 && h > 0)) return null
  return {
    bytes,
    extension: src[1].toLowerCase().replace('jpeg', 'jpg'),
    width: Math.round(w * PX_TO_HWPUNIT),
    height: Math.round(h * PX_TO_HWPUNIT),
    naturalWidth: natural?.w ?? Math.round(w),
    naturalHeight: natural?.h ?? Math.round(h),
  }
}

/** Whether HTML left after taking its pictures out still has something to paste. */
function hasContent(html) {
  const body = FRAGMENT.exec(html)?.[1] ?? html
  if (/<table\b/i.test(body)) return true
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
  return text.trim() !== ''
}

/**
 * The HTML cut where its own-data pictures stand outside a table: the HTML runs and the pictures
 * in order, each run wrapped as a whole clipboard document again. A picture inside a table stays
 * in its run (the engine flattens a table pasted into a cell to text anyway).
 */
function piecesOf(html) {
  const start = html.indexOf('<!--StartFragment-->')
  const end = html.indexOf('<!--EndFragment-->')
  const fenced = start >= 0 && end > start
  const head = fenced ? html.slice(0, start + '<!--StartFragment-->'.length) : ''
  const tail = fenced ? html.slice(end) : ''
  const body = fenced ? html.slice(head.length, end) : html
  const pieces = []
  let depth = 0
  let from = 0
  for (const match of body.matchAll(/<table\b|<\/table\s*>|<img\b[^>]*>/gi)) {
    const token = match[0].toLowerCase()
    if (token.startsWith('<table')) depth += 1
    else if (token.startsWith('</table')) depth = Math.max(0, depth - 1)
    else if (depth === 0) {
      const picture = dataPicture(match[0])
      if (!picture) continue
      pieces.push({ html: head + body.slice(from, match.index) + tail })
      pieces.push({ picture })
      from = match.index + match[0].length
    }
  }
  pieces.push({ html: head + body.slice(from) + tail })
  return pieces
}

/** The text and the positions of the controls of one body paragraph. */
function paragraphState(wasm, sec, para) {
  return JSON.stringify([
    wasm.getParagraphLength(sec, para),
    wasm.getControlTextPositions(sec, para),
  ])
}

/**
 * Put a picture inside a cell paragraph, as part of its text. The engine places a picture there
 * only from its own clipboard (a new picture in a cell floats over the cell's top left and covers
 * its text), so the picture goes into a scratch paragraph at the body's end, is copied and
 * removed with that paragraph, and is pasted at `at`. The body is checked to be as it was; when
 * it is not, this throws and the editor takes the whole paste back. The engine's clipboard is
 * left holding the picture: the system clipboard has another document's copy by then anyway.
 * With `lineAfter` the picture ends its line, so the next part of the paste starts below it.
 */
function pictureInCell(wasm, sec, parentPara, pathAt, at, picture, lineAfter) {
  const last = wasm.getParagraphCount(sec) - 1
  const before = paragraphState(wasm, sec, last)
  const end = wasm.textToLogicalOffset(sec, last, wasm.getParagraphLength(sec, last))
  if (!JSON.parse(wasm.splitParagraph(sec, last, end)).ok) {
    throw new Error('could not open a scratch paragraph')
  }
  const scratch = last + 1
  let lines = 1
  let copied
  try {
    if (lineAfter) {
      if (!JSON.parse(wasm.splitParagraph(sec, scratch, 0)).ok) throw new Error('no second line')
      lines = 2
    }
    copied = copyScratchPicture(wasm, sec, scratch, picture, lineAfter)
  } finally {
    if (lines === 2) wasm.mergeParagraph(sec, scratch + 1)
    wasm.mergeParagraph(sec, scratch)
  }
  if (wasm.getParagraphCount(sec) !== last + 1 || paragraphState(wasm, sec, last) !== before) {
    throw new Error('the scratch paragraph changed the body')
  }
  if (!copied) throw new Error('could not copy the picture')
  return JSON.parse(
    wasm.pasteInternalInCellByPath(sec, parentPara, pathAt(at.cellParaIdx), at.charOffset),
  )
}

/** The picture placed in the scratch paragraph, copied to the engine's clipboard and removed. */
function copyScratchPicture(wasm, sec, scratch, picture, lineAfter) {
  const placed = wasm.insertPicture(
    sec,
    scratch,
    0,
    '',
    picture.bytes,
    picture.width,
    picture.height,
    picture.naturalWidth,
    picture.naturalHeight,
    picture.extension,
    '',
  )
  if (!placed?.ok || placed.paraIdx !== scratch) throw new Error('could not place the picture')
  try {
    // a new picture floats at the paper's corner; as part of the text it follows the cell's lines
    wasm.setPictureProperties(sec, scratch, placed.controlIdx, { treatAsChar: true })
    // with the empty line after it, what follows starts on the next line: pasted at the
    // picture's own text offset, it would split the line before the picture and take it along
    const copy = lineAfter
      ? wasm.copySelection(sec, scratch, 0, scratch + 1, 0)
      : wasm.copyControl(sec, scratch, placed.controlIdx, '')
    return JSON.parse(copy).ok === true
  } finally {
    wasm.deletePictureControl(sec, scratch, placed.controlIdx)
  }
}

/**
 * Paste HTML at a caret in a table cell: `paste(html)` is the engine's cell paste for that caret,
 * the result is its JSON (`{ok, cellParaIdx, charOffset}`). HTML without a picture of its own
 * goes to `paste` as it is. Otherwise the HTML runs and the pictures go in turn, each after the
 * last, the runs by the engine's paste at that place and the pictures inside the cell's text;
 * the result is where the last one ended. A step that fails throws: the editor then takes the
 * whole paste back and pastes the plain text, as it does when the engine refuses the HTML.
 *
 * @param {{
 *   pasteHtmlInCellByPath(sec: number, para: number, path: string, offset: number, html: string): string
 *   pasteInternalInCellByPath(sec: number, para: number, path: string, offset: number): string
 *   insertPicture(sec: number, para: number, offset: number, cellPathJson: string, data: Uint8Array, w: number, h: number, nw: number, nh: number, ext: string, description?: string): { ok: boolean, paraIdx: number, controlIdx: number }
 *   copyControl(sec: number, para: number, ci: number, cellPathJson?: string): string
 *   deletePictureControl(sec: number, para: number, ci: number): unknown
 *   copySelection(sec: number, sp: number, so: number, ep: number, eo: number): string
 *   setPictureProperties(sec: number, para: number, ci: number, props: Record<string, unknown>): unknown
 *   splitParagraph(sec: number, para: number, offset: number): string
 *   mergeParagraph(sec: number, para: number): string
 *   textToLogicalOffset(sec: number, para: number, offset: number): number
 *   getParagraphCount(sec: number): number
 *   getParagraphLength(sec: number, para: number): number
 *   getControlTextPositions(sec: number, para: number): number[]
 * }} wasm the editor's engine bridge
 * @param {{ sectionIndex: number, parentParaIndex: number, controlIndex?: number, cellIndex?: number, cellParaIndex?: number, charOffset: number, cellPath?: Array<{ controlIndex: number, cellIndex: number, cellParaIndex: number }> }} caret
 * @param {string} html
 * @param {(html: string) => string} paste
 */
export function ieumPasteHtmlInCell(wasm, caret, html, paste) {
  const pieces = piecesOf(html)
  if (!pieces.some((piece) => piece.picture)) return paste(html)
  const steps = caret.cellPath?.length
    ? caret.cellPath
    : [
        {
          controlIndex: caret.controlIndex,
          cellIndex: caret.cellIndex,
          cellParaIndex: caret.cellParaIndex,
        },
      ]
  const pathAt = (cellParaIndex) =>
    JSON.stringify(
      steps.map((step, i) => (i === steps.length - 1 ? { ...step, cellParaIndex } : { ...step })),
    )
  const sec = caret.sectionIndex
  const parentPara = caret.parentParaIndex
  let at = {
    ok: true,
    cellParaIdx: steps[steps.length - 1].cellParaIndex,
    charOffset: caret.charOffset,
  }
  pieces.forEach((piece, i) => {
    if (piece.picture) {
      const more = pieces.slice(i + 1).some((next) => next.picture || hasContent(next.html))
      at = pictureInCell(wasm, sec, parentPara, pathAt, at, piece.picture, more)
    } else if (hasContent(piece.html)) {
      at = JSON.parse(
        wasm.pasteHtmlInCellByPath(
          sec,
          parentPara,
          pathAt(at.cellParaIdx),
          at.charOffset,
          piece.html,
        ),
      )
    }
    if (!at.ok) throw new Error(`cell paste stopped: ${JSON.stringify(at).slice(0, 200)}`)
  })
  return JSON.stringify(at)
}
