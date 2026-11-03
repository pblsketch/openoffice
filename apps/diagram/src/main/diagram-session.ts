/**
 * The diagram tab's own session (spec 6): a persistent partition where
 * draw.io keeps what it stores (scratchpad, its shape libraries, recent
 * colors), where only the app's schemes, `data:` and `blob:` load, and where
 * draw.io's files come from `drawio-app://`.
 *
 * The app's renderer scheme is served here too: the shell installs it on the
 * default session only, and this tab's page lives in this session.
 */
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { session } from 'electron'
import type { Session } from 'electron'
import { RENDERER_SCHEME, resolveRendererFile } from '@genoffice/electron-utils/renderer-scheme'
import { DRAWIO_SCHEME } from '../shared/bridge-protocol'
import {
  PRINT_PAGE_CSP,
  contentTypeOf,
  drawioCsp,
  injectBridge,
  resolveDrawioRequest,
  responseHeaders,
} from './drawio-protocol'
import { DIAGRAM_PARTITION, newRequestLog, screenRequest, type RequestLog } from './network-guard'
import { takePrintDocument } from './print-document'

export interface DiagramSessionPaths {
  /** the built renderer folder (`<module out>/renderer`) */
  rendererDir: string
  /** the trimmed draw.io bundle (`<module out>/drawio`) */
  drawioDir: string
  /** our bridge script (`<module out>/bridge/bridge.js`) */
  bridgeFile: string
  /** dev server origins a development run lets through; empty in a packaged app */
  devOrigins: string[]
}

let installed: { session: Session; paths: DiagramSessionPaths } | null = null
const requestLog: RequestLog = newRequestLog()

/**
 * What the diagram session let through and refused since the app started:
 * counts of both, and the last refused addresses (`REFUSED_ADDRESSES_KEPT`).
 */
export function diagramRequestLog(): {
  allowed: number
  refused: number
  blocked: string[]
  schemes: string[]
} {
  return {
    allowed: requestLog.allowed,
    refused: requestLog.refused,
    blocked: [...requestLog.blocked],
    schemes: [...requestLog.schemes].sort(),
  }
}

const notFound = (status = 404): Response => new Response(null, { status })

async function fileResponse(path: string, csp: string | null, method: string): Promise<Response> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return notFound()
  } catch {
    return notFound()
  }
  // the renderer's page carries its own policy (index.html)
  const headers =
    csp === null
      ? { 'Content-Type': contentTypeOf(path), 'X-Content-Type-Options': 'nosniff' }
      : responseHeaders(contentTypeOf(path), csp)
  if (method === 'HEAD') return new Response(null, { status: 200, headers })
  const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
  return new Response(stream, { status: 200, headers })
}

async function serveDrawio(request: Request, paths: DiagramSessionPaths): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return notFound(405)
  const csp = drawioCsp([`${RENDERER_SCHEME}:`, ...paths.devOrigins])
  const target = resolveDrawioRequest(paths.drawioDir, request.url)
  switch (target.kind) {
    case 'refused':
      return notFound(target.status)
    case 'bridge':
      return fileResponse(paths.bridgeFile, csp, request.method)
    case 'print': {
      const html = takePrintDocument(target.token)
      if (html === null) return notFound()
      return new Response(html, {
        status: 200,
        headers: responseHeaders('text/html; charset=utf-8', PRINT_PAGE_CSP),
      })
    }
    case 'file': {
      if (target.relative !== 'index.html') return fileResponse(target.path, csp, request.method)
      let html: string
      try {
        html = injectBridge(await readFile(target.path, 'utf8'))
      } catch {
        return notFound()
      }
      return new Response(request.method === 'HEAD' ? null : html, {
        status: 200,
        headers: responseHeaders('text/html; charset=utf-8', csp),
      })
    }
  }
}

async function serveRenderer(request: Request, rendererDir: string): Promise<Response> {
  const file = resolveRendererFile(new Map([['diagram', rendererDir]]), request.url)
  if (!file) return notFound()
  return fileResponse(file, null, request.method)
}

/**
 * The session of every diagram view, set up once: its protocol handlers and
 * its request refusal. Call after app ready.
 */
export function diagramSession(paths: DiagramSessionPaths): Session {
  if (installed) return installed.session
  const ses = session.fromPartition(DIAGRAM_PARTITION)
  ses.protocol.handle(DRAWIO_SCHEME, (request) => serveDrawio(request, paths))
  ses.protocol.handle(RENDERER_SCHEME, (request) => serveRenderer(request, paths.rendererDir))
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !screenRequest(requestLog, details.url, paths.devOrigins) })
  })
  // no spelling dictionaries fetched for this session
  ses.setSpellCheckerEnabled(false)
  // draw.io's copy (as picture) needs the clipboard; nothing else is granted
  ses.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  )
  ses.setPermissionCheckHandler(
    (_contents, permission) => permission === 'clipboard-sanitized-write',
  )
  installed = { session: ses, paths }
  return ses
}
