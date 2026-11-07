import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import http, { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { createXmindDocumentFromOutline, openXmind, sheetsToOutline } from '@genoffice/xmind-engine'
import { closeAndSaveVideo, launchShell, screenshotPath, waitForPageWithUrl } from './helpers'

/**
 * The in-app MCP server and the mind map tabs, against the real built app: the
 * open-documents list shows a map as kind `mindmap`, a read returns the live
 * outline (an edit not saved yet included), a close saves through the editor
 * (a titled map to its file, an untitled one into the default folder as
 * `.xmind`), a discard writes nothing, and a map whose file did not open is
 * never written. The app-info tool lists the `xmind` family.
 *
 * Every map here is built in this file with the engine.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function parseBody(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }
  const out: unknown[] = []
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      out.push(JSON.parse(line.slice(6)))
    } catch {
      /* endpoint/heartbeat line */
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
        res.on('data', (c) => (text += c))
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
      clientInfo: { name: 'e2e-mindmap', version: '1.0' },
    },
  })
  const sessionId = String(init.headers['mcp-session-id'] ?? '')
  await postMcp(port, sessionId, { jsonrpc: '2.0', method: 'notifications/initialized' })
  return async (name, args) => {
    const res = await postMcp(port, sessionId, {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1e6),
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
  type: string
  kind: string
  title: string
  path: string | null
  saved: boolean
  dirty: boolean
}

const listDocuments = async (call: Call): Promise<ListedDocument[]> =>
  JSON.parse((await call('open_documents', { action: 'list' })).text).documents

async function writeMap(path: string, outline: string): Promise<Uint8Array> {
  const document = await createXmindDocumentFromOutline(outline, { untitled: 'Untitled' })
  const bytes = await document.save()
  await writeFile(path, bytes)
  return bytes
}

async function outlineOfFile(path: string): Promise<string> {
  const opened = await openXmind(new Uint8Array(await readFile(path)))
  if (opened.status !== 'ok') throw new Error(`the saved file did not open: ${opened.status}`)
  return sheetsToOutline(opened.document.sheets)
}

const topicTitles = (map: Page): Promise<string[]> =>
  map
    .locator('.mm-sheet-host:not([hidden]) me-tpc > .text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

/** Tab on the central topic adds a branch; the title is typed into the edit box. */
async function addBranch(map: Page, title: string): Promise<void> {
  await map.locator('.mm-sheet-host:not([hidden]) me-root me-tpc').click()
  await map.keyboard.press('Tab')
  await map.waitForSelector('#input-box')
  await map.keyboard.type(title)
  await map.keyboard.press('Enter')
  await map.waitForSelector('#input-box', { state: 'detached' })
  await expect.poll(() => topicTitles(map)).toContain(title)
  await expect(map.locator('.mm-save-status')).toHaveAttribute('data-dirty', 'true')
}

/** the map page of the most recently opened mind map tab */
async function newestMapPage(
  app: Parameters<typeof waitForPageWithUrl>[0],
  before: number,
): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((p) => p.url().includes('://mindmap/')).length)
    .toBeGreaterThan(before)
  const maps = app.windows().filter((p) => p.url().includes('://mindmap/'))
  return maps[maps.length - 1]!
}

const mapPageCount = (app: Parameters<typeof waitForPageWithUrl>[0]): number =>
  app.windows().filter((p) => p.url().includes('://mindmap/')).length

test.describe('MCP open documents: mind maps', () => {
  test('list, read with unsaved edits, save-and-close, untitled save, discard, and a map that did not open', async () => {
    test.setTimeout(240_000)
    const port = await freePort()
    const dir = await mkdtemp(join(tmpdir(), 'genoffice-mcp-mindmap-e2e-'))
    const saveDir = await mkdtemp(join(tmpdir(), 'genoffice-mcp-mindmap-e2e-default-'))
    const planPath = join(dir, 'plan.xmind')
    const planOriginal = await writeMap(planPath, '# Plan\n\n- Trip plan\n  - Places\n')
    const keepPath = join(dir, 'keep.xmind')
    const keepOriginal = await writeMap(keepPath, '# Keep\n\n- Keep me\n')
    const brokenPath = join(dir, 'broken.xmind')
    const brokenOriginal = Buffer.from('this is not a zip archive')
    await writeFile(brokenPath, brokenOriginal)

    const launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'mcp-open-mindmap',
      settings: { mcpEnabled: true, mcpPort: port, defaultSaveDir: saveDir },
    })
    const { app, page } = launched
    try {
      const call = await connect(port)
      const editorTabs = page.locator('.tab-bar .tab-item:not(.tab-home)')

      // ── app info: the format table lists the mind map family, which opens a
      // FreeMind / Freeplane map too but saves only .xmind
      const info = JSON.parse((await call('get_app_info', {})).text) as {
        families: Array<{ family: string }>
      }
      expect(info.families.find((f) => f.family === 'xmind')).toEqual({
        family: 'xmind',
        label: 'mind map',
        editor: { open: ['xmind', 'mm'], save: ['xmind'], export: ['png', 'pdf', 'md'] },
      })

      // ── 1. a titled map: open, edit, list, read, close with save
      let before = mapPageCount(app)
      expect((await call('open_in_genoffice', { path: planPath })).isError).toBe(false)
      await expect(editorTabs).toHaveCount(1)
      const plan = await newestMapPage(app, before)
      await expect.poll(() => topicTitles(plan)).toContain('Places')
      await addBranch(plan, 'Unsaved branch')

      await expect
        .poll(async () => (await listDocuments(call)).find((d) => d.path === planPath)?.dirty)
        .toBe(true)
      const listed = (await listDocuments(call)).find((d) => d.path === planPath)!
      expect(listed).toMatchObject({ kind: 'mindmap', type: 'mind map', title: 'plan.xmind' })

      const read = await call('open_documents', { action: 'read', target: planPath })
      expect(read.isError, read.text).toBe(false)
      const readJson = JSON.parse(read.text) as { kind: string; content: string }
      expect(readJson.kind).toBe('mindmap')
      expect(readJson.content).toContain('Trip plan')
      expect(readJson.content).toContain('Unsaved branch')
      // the edit exists only in the editor so far
      expect(Buffer.from(await readFile(planPath)).equals(Buffer.from(planOriginal))).toBe(true)
      await plan.screenshot({ path: screenshotPath('mcp-mindmap-edited') })

      const closed = await call('open_documents', { action: 'close', target: planPath })
      expect(closed.isError, closed.text).toBe(false)
      expect(JSON.parse(closed.text)).toMatchObject({ closed: true, savedTo: planPath })
      await expect(editorTabs).toHaveCount(0)
      expect(await outlineOfFile(planPath)).toContain('Unsaved branch')

      // ── 2. an untitled map: saved into the default folder as .xmind
      before = mapPageCount(app)
      await page.evaluate(() =>
        (window as unknown as { aiOffice: { newMindmap(): Promise<void> } }).aiOffice.newMindmap(),
      )
      await expect(editorTabs).toHaveCount(1)
      const untitled = await newestMapPage(app, before)
      await expect(untitled.locator('.mm-sheet-host:not([hidden]) me-root me-tpc')).toBeVisible()
      await addBranch(untitled, 'Fresh idea')
      await expect
        .poll(async () => (await listDocuments(call)).find((d) => d.kind === 'mindmap')?.dirty)
        .toBe(true)
      const fresh = (await listDocuments(call)).find((d) => d.kind === 'mindmap')!
      expect(fresh).toMatchObject({ path: null, saved: false })
      const freshClosed = await call('open_documents', { action: 'close', target: fresh.id })
      expect(freshClosed.isError, freshClosed.text).toBe(false)
      const savedTo = String(JSON.parse(freshClosed.text).savedTo)
      expect(savedTo.startsWith(saveDir)).toBe(true)
      expect(savedTo.endsWith('.xmind')).toBe(true)
      await expect(editorTabs).toHaveCount(0)
      expect(await outlineOfFile(savedTo)).toContain('Fresh idea')

      // ── 3. discard: the tab closes and the file stays as it was
      before = mapPageCount(app)
      await call('open_in_genoffice', { path: keepPath })
      const keep = await newestMapPage(app, before)
      await expect.poll(() => topicTitles(keep)).toContain('Keep me')
      await addBranch(keep, 'Dropped branch')
      await expect
        .poll(async () => (await listDocuments(call)).find((d) => d.path === keepPath)?.dirty)
        .toBe(true)
      const discarded = await call('open_documents', {
        action: 'close',
        target: keepPath,
        unsaved: 'discard',
      })
      expect(JSON.parse(discarded.text)).toMatchObject({
        closed: true,
        discardedUnsavedChanges: true,
      })
      await expect(editorTabs).toHaveCount(0)
      expect(Buffer.from(await readFile(keepPath)).equals(Buffer.from(keepOriginal))).toBe(true)

      // ── 4. a map whose file did not open: listed, never dirty, never written
      before = mapPageCount(app)
      await call('open_in_genoffice', { path: brokenPath })
      await expect(editorTabs).toHaveCount(1)
      const broken = await newestMapPage(app, before)
      await broken.waitForLoadState()
      const brokenListed = (await listDocuments(call)).find((d) => d.path === brokenPath)!
      expect(brokenListed).toMatchObject({ kind: 'mindmap', dirty: false })
      const brokenRead = await call('open_documents', { action: 'read', target: brokenPath })
      expect(brokenRead.isError).toBe(true)
      const brokenClosed = await call('open_documents', { action: 'close', target: brokenPath })
      expect(brokenClosed.isError, brokenClosed.text).toBe(false)
      expect(JSON.parse(brokenClosed.text)).not.toHaveProperty('savedTo')
      expect((await readFile(brokenPath)).equals(brokenOriginal)).toBe(true)

      // nothing but the one untitled save landed in the default folder
      expect(readdirSync(saveDir)).toHaveLength(1)
      expect(existsSync(savedTo)).toBe(true)
    } finally {
      await closeAndSaveVideo(launched, 'mcp-open-mindmap')
    }
  })
})
