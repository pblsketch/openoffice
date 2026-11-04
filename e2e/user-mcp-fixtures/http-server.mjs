// "Address" test server: Streamable HTTP on 127.0.0.1. Args: <port> <stateFile> <logFile>
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { makeServer, watchState } from './tools.mjs'

const [portText, stateFile, logFile] = process.argv.slice(2)
const port = Number(portText)
const sessions = new Map()

watchState(stateFile, () => {
  for (const { server } of sessions.values()) void server.sendToolListChanged().catch(() => {})
})

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : undefined)
      } catch {
        resolve(undefined)
      }
    })
  })

const http = createServer(async (req, res) => {
  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404).end()
    return
  }
  const auth = req.headers.authorization ?? ''
  if (logFile) {
    appendFileSync(logFile, `${new Date().toISOString()} [http] ${req.method} ${req.url}\n`)
  }
  const body = req.method === 'POST' ? await readBody(req) : undefined
  const sid = req.headers['mcp-session-id']
  let entry = typeof sid === 'string' ? sessions.get(sid) : undefined
  if (!entry && req.method === 'POST' && isInitializeRequest(body)) {
    const made = makeServer({ label: 'http', stateFile, logFile })
    made.log(`initialize auth=${auth ? JSON.stringify(auth) : 'none'}`)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, { server: made.server, transport }),
    })
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }
    await made.server.connect(transport)
    entry = { server: made.server, transport }
  }
  if (!entry) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No session' }, id: null }),
    )
    return
  }
  await entry.transport.handleRequest(req, res, body)
})

http.listen(port, '127.0.0.1', () => {
  process.stdout.write(`listening ${port}\n`)
})
process.on('SIGTERM', () => process.exit(0))
