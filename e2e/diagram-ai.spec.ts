import { rmSync } from 'node:fs'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'
import {
  answerMessageBoxes,
  clickMenu,
  copyAsset,
  liveText,
  openDiagramPage,
  openPath,
  scratchDir,
} from './diagram-lib'

/**
 * The diagram editor's AI panel against a scripted model (spec 13): one tool
 * call is one undo step, and a call with a refused op leaves the diagram as it
 * was. No `claude` or `codex` program is started: the shared AI channels are
 * replaced from the main process before anything is sent.
 */

const GOOD_CALL = {
  type: 'tool-call',
  toolCall: {
    id: 'call-good',
    name: 'apply_diagram_ops',
    input: {
      ops: [
        { op: 'add_shape', id: 'ai-1', label: 'From the AI', x: 40, y: 200 },
        { op: 'add_shape', id: 'ai-2', label: '두 번째', shape: 'ellipse', x: 260, y: 200 },
        { op: 'add_edge', id: 'ai-link', source: 'ai-1', target: 'ai-2' },
        { op: 'update', id: 'a', label: 'Renamed by the AI' },
      ],
    },
  },
}

const BAD_CALL = {
  type: 'tool-call',
  toolCall: {
    id: 'call-bad',
    name: 'apply_diagram_ops',
    input: {
      ops: [
        { op: 'add_shape', id: 'ai-3', label: 'Never added', x: 40, y: 400 },
        { op: 'update', id: 'b', label: 'Never renamed' },
        { op: 'add_edge', source: 'no-such-shape', target: 'ai-3' },
      ],
    },
  },
}

/**
 * A scripted model: a request whose last message carries GOOD-TURN or
 * BAD-TURN answers with that tool call, every other request (the tool result
 * coming back) with a short text. Claude reads `ready`, Codex `not-installed`.
 * The requests are kept for the test to read.
 */
async function scriptAi(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    ({ ipcMain, webContents }, { good, bad }) => {
      const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as {
        send: (channel: string, ...args: unknown[]) => void
      }
      const realSend = proto.send
      proto.send = function (this: unknown, channel: string, ...args: unknown[]) {
        if (channel === 'ai:subscription-changed') return
        return realSend.call(this, channel, ...args)
      }
      const statuses = {
        'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
        codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
      }
      for (const channel of ['ai:subscription-statuses', 'ai:subscription-recheck']) {
        ipcMain.removeHandler(channel)
        ipcMain.handle(channel, () => statuses)
      }
      const seen: Array<{ messages: unknown[]; tools?: Array<{ name: string }> }> = []
      ;(globalThis as unknown as { __aiRequests: unknown[] }).__aiRequests = seen
      ipcMain.removeHandler('ai:stream')
      ipcMain.handle(
        'ai:stream',
        (
          event,
          request: { requestId: string; messages: unknown[]; tools?: Array<{ name: string }> },
        ) => {
          seen.push(request)
          const last = JSON.stringify(request.messages[request.messages.length - 1] ?? '')
          const reply = last.includes('GOOD-TURN')
            ? [good, { type: 'done' }]
            : last.includes('BAD-TURN')
              ? [bad, { type: 'done' }]
              : [{ type: 'delta', text: 'Done.' }, { type: 'done' }]
          setTimeout(() => {
            for (const chunk of reply as Array<Record<string, unknown>>) {
              realSend.call(event.sender, 'ai:stream-chunk', {
                requestId: request.requestId,
                ...chunk,
              })
            }
          }, 200)
        },
      )
      for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) realSend.call(wc, 'ai:subscription-changed', statuses)
      }
    },
    { good: GOOD_CALL, bad: BAD_CALL },
  )
}

const aiRequests = (
  app: ElectronApplication,
): Promise<Array<{ messages: unknown[]; tools?: Array<{ name: string }> }>> =>
  app.evaluate(
    () =>
      (
        globalThis as unknown as {
          __aiRequests: Array<{ messages: unknown[]; tools?: Array<{ name: string }> }>
        }
      ).__aiRequests,
  )

async function ask(page: Page, text: string): Promise<void> {
  if ((await page.locator('.ai-dock.collapsed').count()) > 0) {
    await page.locator('.ai-rail').click()
  }
  await page.locator('.ai-input-box textarea').fill(text)
  await page.locator('.ai-send-btn').click()
  await expect(page.locator('.ai-msg-streaming')).toHaveCount(0, { timeout: 60_000 })
}

test.describe('diagram AI panel (scripted model)', () => {
  test('one tool call is one undo step; a refused call changes nothing', async () => {
    test.setTimeout(240_000)
    const dir = await scratchDir('ai')
    const path = await copyAsset('sample.drawio', dir)
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'diagram-ai' })
    const { app, page: shell } = launched
    try {
      await answerMessageBoxes(app, 1)
      const page = await openDiagramPage(app, () => openPath(shell, path))
      await scriptAi(app)
      const original = await liveText(page)

      // ── one call with four ops
      await ask(page, 'GOOD-TURN: add two connected shapes and rename the first one')
      await expect.poll(() => liveText(page), { timeout: 30_000 }).toContain('From the AI')
      const changed = await liveText(page)
      expect(changed).toContain('ai-link')
      expect(changed).toContain('Renamed by the AI')
      expect(changed).not.toContain('시작')
      const requests = await aiRequests(app)
      expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['read_diagram', 'apply_diagram_ops']),
      )
      expect(JSON.stringify(requests[1]!.messages)).toContain('as one undo step')
      await page.screenshot({ path: screenshotPath('diagram-ai-applied') })

      // ── a single Undo takes the whole call back, a single Redo brings it again
      await clickMenu(app, 'Edit', '^Undo')
      await expect.poll(() => liveText(page)).toBe(original)
      await clickMenu(app, 'Edit', '^Redo')
      await expect.poll(() => liveText(page)).toBe(changed)

      // ── a call with a refused op: nothing of it goes in
      const before = (await aiRequests(app)).length
      await ask(page, 'BAD-TURN: add one more shape')
      await expect.poll(async () => (await aiRequests(app)).length).toBe(before + 2)
      expect(await liveText(page)).toBe(changed)
      const answer = JSON.stringify((await aiRequests(app))[before + 1]!.messages)
      expect(answer).toContain('Nothing was changed')
      expect(answer).toContain('FAILED')
      // the refused call left no step behind: one Undo still takes the first call back
      await clickMenu(app, 'Edit', '^Undo')
      await expect.poll(() => liveText(page)).toBe(original)
      await page.screenshot({ path: screenshotPath('diagram-ai-refused') })
    } finally {
      await closeAndSaveVideo(launched, 'diagram-ai')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
