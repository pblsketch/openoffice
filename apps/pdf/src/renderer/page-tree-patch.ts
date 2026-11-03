import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFObject,
} from 'pdf-lib'

/**
 * A page-tree kid whose object is gone (zeroed or truncated bytes) makes PDF.js fail
 * every page it has to walk past that kid, not just the lost one; Acrobat and MuPDF
 * show the lost page blank and the rest as usual. This appends an update to a copy of
 * the bytes that stands a blank page in for each lost kid, so PDF.js finds the others.
 * Display only: the file on disk is untouched, and the caller keeps the view read-only
 * (the saving side still sees the damaged tree).
 * Returns null when nothing in the tree is missing or the file can't be patched safely.
 */
export async function patchMissingPageKids(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; blankPages: number } | null> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    })
  } catch {
    return null
  }
  const ctx = doc.context
  const { Root, Encrypt, Info, ID } = ctx.trailerInfo
  if (!(Root instanceof PDFRef)) return null
  if (Encrypt !== undefined && !(Encrypt instanceof PDFRef)) return null
  // pdf-lib can't open encrypted object streams; their objects would look missing too
  if (doc.isEncrypted && hasObjectStreams(doc)) return null
  const root = ctx.lookup(Root)
  if (!(root instanceof PDFDict)) return null
  const pagesRef = root.get(PDFName.of('Pages'))
  if (!(pagesRef instanceof PDFRef)) return null

  const missing: { ref: PDFRef; parent: PDFRef; mediaBox: string | null }[] = []
  const seen = new Set<string>([pagesRef.toString()])
  const walk = (nodeRef: PDFRef) => {
    const node = ctx.lookup(nodeRef)
    if (!(node instanceof PDFDict)) return
    const kids = node.lookup(PDFName.of('Kids'))
    if (!(kids instanceof PDFArray)) return
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.get(i)
      if (!(kid instanceof PDFRef) || seen.has(kid.toString())) continue
      seen.add(kid.toString())
      if (ctx.lookup(kid) instanceof PDFDict) walk(kid)
      else missing.push({ ref: kid, parent: nodeRef, mediaBox: siblingMediaBox(doc, kids) })
    }
  }
  walk(pagesRef)
  if (missing.length === 0) return null

  const prev = lastStartXref(bytes)
  if (prev === null) return null

  const parts: string[] = ['\n']
  let offset = bytes.length + 1
  const entries: string[] = []
  for (const m of missing) {
    const box = m.mediaBox ? `/MediaBox${m.mediaBox}` : ''
    const obj =
      `${m.ref.objectNumber} ${m.ref.generationNumber} obj\n` +
      `<</Type/Page/Parent ${m.parent.toString()}/Resources<<>>${box}>>\nendobj\n`
    entries.push(
      `${m.ref.objectNumber} 1\n${pad10(offset)} ${String(m.ref.generationNumber).padStart(5, '0')} n\r\n`,
    )
    parts.push(obj)
    offset += obj.length
  }
  const size = Math.max(ctx.largestObjectNumber, ...missing.map((m) => m.ref.objectNumber)) + 1
  const trailer =
    `<</Size ${size}/Prev ${prev}/Root ${Root.toString()}` +
    (Encrypt ? `/Encrypt ${Encrypt.toString()}` : '') +
    (Info instanceof PDFRef ? `/Info ${Info.toString()}` : '') +
    (ID instanceof PDFArray ? `/ID${ID.toString()}` : '') +
    '>>'
  parts.push(
    `xref\n0 1\n0000000000 65535 f\r\n${entries.join('')}trailer\n${trailer}\nstartxref\n${offset}\n%%EOF\n`,
  )
  const tail = latin1Bytes(parts.join(''))
  const out = new Uint8Array(bytes.length + tail.length)
  out.set(bytes)
  out.set(tail, bytes.length)
  return { bytes: out, blankPages: missing.length }
}

function hasObjectStreams(doc: PDFDocument): boolean {
  return doc.context
    .enumerateIndirectObjects()
    .some(
      ([, obj]) =>
        obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Type')) === PDFName.of('ObjStm'),
    )
}

/** A neighbouring page's size, so the stand-in doesn't fall back to Letter */
function siblingMediaBox(doc: PDFDocument, kids: PDFArray): string | null {
  for (let i = 0; i < kids.size(); i++) {
    let node: PDFObject | undefined = doc.context.lookup(kids.get(i))
    // the box may be inherited from any ancestor
    for (let depth = 0; node instanceof PDFDict && depth < 32; depth++) {
      const box = node.lookup(PDFName.of('MediaBox'))
      if (box instanceof PDFArray && box.size() === 4) {
        const nums = box.asArray().map((n) => doc.context.lookup(n))
        if (nums.every((n) => n instanceof PDFNumber)) {
          return `[${nums.map((n) => (n as PDFNumber).asNumber()).join(' ')}]`
        }
      }
      node = node.lookup(PDFName.of('Parent'))
    }
  }
  return null
}

function lastStartXref(bytes: Uint8Array): number | null {
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 2048)))
  const all = [...tail.matchAll(/startxref\s+(\d+)/g)]
  const last = all.at(-1)
  return last ? Number(last[1]) : null
}

const pad10 = (n: number) => String(n).padStart(10, '0')

function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}
