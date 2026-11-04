/**
 * Visio drawings with draw.io's own importer, inside the draw.io page
 * (spec 3.5). draw.io reads the `.vsdx` package itself (JSZip), converts its
 * EMF pictures on this PC (`emfToSvg`) and never asks a server for a `.vsdx`;
 * only the old binary formats (`.vsd`, `.vdx`, `.vss`…) take another path,
 * and the importer is always given a `.vsdx` name so it never does.
 *
 * The result is draw.io's file XML. Its pages come compressed; they are
 * handed back uncompressed so the app can read them (and a new diagram is not
 * compressed). Converting changes nothing on screen: the app loads the XML
 * as a new diagram afterwards.
 */
import type { BridgeOps } from '../shared/bridge-protocol'
import { countUnconvertedPictures } from '../shared/visio-pictures'
import type { DrawioUi } from './drawio-adapter'

declare const Graph: any

/** The name the importer is given: a `.vsdx`, so draw.io takes its own reader. */
export const VISIO_IMPORT_NAME = 'drawing.vsdx'

/** The importer's own words for a failure. */
function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error !== null && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return typeof error === 'string' && error ? error : 'the Visio importer gave no reason'
}

/** draw.io's placeholder for an EMF picture its converter refused (base64), or ''. */
function errorImage(): string {
  try {
    const value: unknown = (window as any).com?.mxgraph?.io?.vsdx?.Shape?.ERROR_IMAGE
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/**
 * draw.io's file XML with every page as plain `mxGraphModel` XML, the page
 * count and the pages' XML. Throws when the text is not a draw.io file.
 */
export function uncompressedPages(
  fileXml: string,
  decompress: (text: string) => string,
): { xml: string; pages: string[] } {
  const doc = new DOMParser().parseFromString(fileXml, 'text/xml')
  const root = doc.documentElement
  if (!root || root.nodeName !== 'mxfile' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('the importer gave no diagram')
  }
  const pages: string[] = []
  const serializer = new XMLSerializer()
  for (const diagram of Array.from(root.getElementsByTagName('diagram'))) {
    let model = Array.from(diagram.children).find((child) => child.nodeName === 'mxGraphModel')
    if (!model) {
      const text = (diagram.textContent ?? '').trim()
      const plain = text === '' ? '' : decompress(text)
      const parsed = new DOMParser().parseFromString(plain, 'text/xml')
      const element = parsed.documentElement
      if (!element || element.nodeName !== 'mxGraphModel') {
        throw new Error('a page of the import could not be read')
      }
      while (diagram.firstChild) diagram.removeChild(diagram.firstChild)
      model = doc.importNode(element, true) as Element
      diagram.appendChild(model)
    }
    pages.push(serializer.serializeToString(model))
  }
  return { xml: serializer.serializeToString(doc), pages }
}

/** Converts `.vsdx` bytes into draw.io XML; rejects with the importer's reason. */
export function importVisio(
  ui: DrawioUi,
  bytes: unknown,
): Promise<BridgeOps['importVisio']['reply']> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(new Error(reasonOf(error)))
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      fail('the file is empty')
      return
    }
    if (typeof ui?.importVisio !== 'function') {
      fail('this draw.io has no Visio importer')
      return
    }
    const done = (xml: unknown): void => {
      if (settled) return
      try {
        if (typeof xml !== 'string' || xml.trim() === '')
          throw new Error('the importer gave no diagram')
        const read = uncompressedPages(xml, (text) => String(Graph.decompress(text)))
        settled = true
        resolve({
          xml: read.xml,
          pages: read.pages.length,
          unconvertedPictures: countUnconvertedPictures(read.pages, errorImage()),
        })
      } catch (err) {
        fail(err)
      }
    }
    try {
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: 'application/octet-stream',
      })
      ui.importVisio(blob, done, fail, VISIO_IMPORT_NAME)
    } catch (err) {
      fail(err)
    }
  })
}
