import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { signInPageHtml, type SignInPage } from '@genoffice/google-drive'

/**
 * The one-shot server the browser comes back to after an MCP sign-in (user
 * MCP spec 4.8), built the same way as the Google sign-in: bound to
 * 127.0.0.1 on a free port so nothing off this PC can reach it, answering
 * only a `GET /callback` whose `state` matches, with a static page that has
 * no script and loads nothing. It closes when the code arrives, when the
 * attempt is cancelled, or when the time limit passes.
 */

export type LoopbackFailure = 'cancelled' | 'timeout' | 'denied'

export type LoopbackOutcome = { ok: true; code: string } | { ok: false; reason: LoopbackFailure }

export interface LoopbackPages {
  done: SignInPage
  failed: SignInPage
}

export interface LoopbackReceiver {
  /** `http://127.0.0.1:<port>/callback` */
  redirectUri: string
  /** settles once: the code, a refusal, a cancel or the time limit */
  outcome: Promise<LoopbackOutcome>
  /** stop waiting and free the port; safe to call more than once */
  close(): void
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function startLoopbackReceiver(options: {
  state: string
  pages: LoopbackPages
  timeoutMs: number
  signal?: AbortSignal | undefined
}): Promise<LoopbackReceiver> {
  let settle: (outcome: LoopbackOutcome) => void = () => {}
  let settled = false
  const outcome = new Promise<LoopbackOutcome>((resolve) => {
    settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
  })

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    // a stray request (favicon, another program guessing) neither answers nor ends the wait
    if (
      req.method !== 'GET' ||
      url.pathname !== '/callback' ||
      settled ||
      !sameText(url.searchParams.get('state') ?? '', options.state)
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end()
      return
    }
    const code = url.searchParams.get('code')
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'no-store',
      Connection: 'close',
    })
    res.end(signInPageHtml(code ? options.pages.done : options.pages.failed))
    settle(code ? { ok: true, code } : { ok: false, reason: 'denied' })
  }

  const server: Server = createServer(handle)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const port = (server.address() as AddressInfo).port

  const timer = setTimeout(() => settle({ ok: false, reason: 'timeout' }), options.timeoutMs)
  const onAbort = () => settle({ ok: false, reason: 'cancelled' })
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) onAbort()

  let stopped = false
  const stopListening = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
    server.close()
    // the page's own connection closes once its answer is written
    server.closeIdleConnections()
  }
  void outcome.then(stopListening)
  const close = () => {
    settle({ ok: false, reason: 'cancelled' })
    stopListening()
    server.closeAllConnections()
  }

  return { redirectUri: `http://127.0.0.1:${port}/callback`, outcome, close }
}
