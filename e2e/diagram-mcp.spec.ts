import { rmSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import { test, expect } from '@playwright/test'
import { closeAndSaveVideo, freeMcpPort, launchShell } from './helpers'
import {
  answerMessageBoxes,
  copyAsset,
  fileText,
  liveText,
  openDiagramPage,
  scratchDir,
  statusText,
} from './diagram-lib'

/**
 * The in-app MCP server and a diagram tab (spec 13): `open_documents` lists
 * it as kind `diagram`, `read_diagram` and `open_documents read` give the live
 * read table (unsaved edits included), `apply_diagram_ops` changes it as one
 * step and refuses a call with a bad op whole, and `open_documents save`
 * writes it in its own format (and nothing when nothing changed).
 */

function parseBody(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  const out: unknown[] = []
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      out.push(JSON.parse(line.slice(6)))
    } catch {
      /* heartbeat line */
    }
  }
  return out.length === 1 ? out[0] : out
}

function postMcp(
  port: number,
  sessionId: string | null,
  payload: unknown,
): Promise<{ headers: http.IncomingHttpHeaders; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      Accept: 'application/json, text/event-stream',
    }
    if (sessionId) headers['Mcp-Session-Id'] = sessionId
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST', headers },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => resolve({ headers: res.headers, body: parseBody(text) }))
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/health' }, (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
    })
    if (ok) return
    if (Date.now() > deadline) throw new Error('MCP server never became healthy')
    await new Promise((r) => setTimeout(r, 250))
  }
}

type Call = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError: boolean; text: string }>

async function connect(port: number): Promise<Call> {
  await waitForHealth(port)
  const init = await postMcp(port, null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-diagram', version: '1.0' },
    },
  })
  const sessionId = String(init.headers['mcp-session-id'] ?? '')
  await postMcp(port, sessionId, { jsonrpc: '2.0', method: 'notifications/initialized' })
  let next = 2
  return async (name, args) => {
    const res = await postMcp(port, sessionId, {
      jsonrpc: '2.0',
      id: next++,
      method: 'tools/call',
      params: { name, arguments: args },
    })
    const body = res.body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }
    const text = body?.result?.content?.map((c) => c.text ?? '').join('') ?? ''
    return { isError: body?.result?.isError === true, text }
  }
}

interface ListedDocument {
  id: string
  kind: string
  title: string
  path: string | null
  dirty: boolean
}

const listDocuments = async (call: Call): Promise<ListedDocument[]> =>
  JSON.parse((await call('open_documents', { action: 'list' })).text).documents

test.describe('MCP and diagrams', () => {
  test('list, read, apply ops (one accepted, one refused, Mermaid), save', async () => {
    test.setTimeout(240_000)
    const port = await freeMcpPort()
    const dir = await scratchDir('mcp')
    const path = await copyAsset('sample.drawio', dir)
    const original = await readFile(path)
    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'diagram-mcp',
      settings: { mcpEnabled: true, mcpPort: port },
    })
    const { app } = launched
    try {
      await answerMessageBoxes(app, 1)
      const call = await connect(port)

      // ── the format table knows the family; the file opens in a tab
      const info = JSON.parse((await call('get_app_info', {})).text) as {
        families: Array<{ family: string }>
      }
      expect(info.families.map((f) => f.family)).toContain('drawio')
      const page = await openDiagramPage(app, async () => {
        const opened = await call('open_in_genoffice', { path })
        expect(opened.isError, opened.text).toBe(false)
      })

      // ── listed as a diagram, read as its read table
      const listed = (await listDocuments(call)).find((doc) => doc.path === path)!
      expect(listed).toMatchObject({ kind: 'diagram', title: 'sample.drawio', dirty: false })
      const read = await call('read_diagram', { document: path })
      expect(read.isError, read.text).toBe(false)
      const readJson = JSON.parse(read.text) as { id: string; content: string; dirty: boolean }
      expect(readJson.id).toBe(listed.id)
      expect(readJson.content).toContain('시작')
      expect(readJson.content).toContain('[current]')

      // ── one call, one change
      const applied = await call('apply_diagram_ops', {
        document: listed.id,
        ops: [
          { op: 'add_shape', id: 'mcp-1', label: 'Added over MCP', x: 40, y: 200 },
          { op: 'add_edge', id: 'mcp-link', source: 'a', target: 'mcp-1' },
        ],
      })
      expect(applied.isError, applied.text).toBe(false)
      const appliedJson = JSON.parse(applied.text) as { status: string; created: string[] }
      expect(appliedJson.status).toBe('ok')
      expect(appliedJson.created).toEqual(expect.arrayContaining(['mcp-1', 'mcp-link']))
      const afterApply = await liveText(page)
      expect(afterApply).toContain('Added over MCP')
      await expect
        .poll(async () => (await listDocuments(call)).find((doc) => doc.path === path)?.dirty)
        .toBe(true)

      // ── a call with a refused op: nothing of it goes in
      const refused = await call('apply_diagram_ops', {
        ops: [
          { op: 'add_shape', id: 'mcp-2', label: 'Never added', x: 40, y: 400 },
          { op: 'add_edge', source: 'nowhere', target: 'mcp-2' },
        ],
      })
      expect(refused.isError).toBe(true)
      expect(refused.text).toContain('Nothing was changed')
      expect(await liveText(page)).toBe(afterApply)

      // ── Mermaid through the same executor
      const mermaid = await call('apply_diagram_ops', {
        ops: [{ op: 'insert_mermaid', text: 'graph LR\n  P[Plan] --> Q[Build]' }],
      })
      expect(mermaid.isError, mermaid.text).toBe(false)
      const live = await liveText(page)
      expect(live).toContain('Build')

      // the edits exist only in the editor so far; open_documents read sees them
      expect((await readFile(path)).equals(original)).toBe(true)
      const docRead = JSON.parse(
        (await call('open_documents', { action: 'read', target: path })).text,
      ) as { kind: string; content: string; dirty: boolean }
      expect(docRead).toMatchObject({ kind: 'diagram', dirty: true })
      expect(docRead.content).toContain('Added over MCP')
      expect(docRead.content).toContain('Build')

      // ── save: written in its own format, as the editor shows it
      const saved = await call('open_documents', { action: 'save', target: path })
      expect(saved.isError, saved.text).toBe(false)
      expect(JSON.parse(saved.text)).toMatchObject({ saved: true, savedTo: path })
      expect(await fileText(path)).toBe(live)
      await expect.poll(() => statusText(page)).toBe('Saved')
      await expect
        .poll(async () => (await listDocuments(call)).find((doc) => doc.path === path)?.dirty)
        .toBe(false)

      // a second save with nothing changed writes nothing
      const savedTime = (await stat(path)).mtimeMs
      const savedBytes = await readFile(path)
      const again = await call('open_documents', { action: 'save', target: path })
      expect(again.isError, again.text).toBe(false)
      await page.waitForTimeout(1_500)
      expect((await stat(path)).mtimeMs).toBe(savedTime)
      expect((await readFile(path)).equals(savedBytes)).toBe(true)
    } finally {
      await closeAndSaveVideo(launched, 'diagram-mcp')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
