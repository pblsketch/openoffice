/**
 * Shared pieces of the "first-time user" project folder walkthroughs
 * (project-folder-user*.spec.ts): a scratch root, a stubbed AI that plays
 * scripted turns and records every request, and stubbed native dialogs that
 * record what the app tried to show.
 *
 * Nothing here reaches Claude or Codex: the subscription status handlers
 * answer "Claude ready" from a stub, the real status pushes are kept from the
 * windows, and `ai:stream` is replaced before any send.
 */
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Scratch root: PF_E2E_ROOT, else a folder under the OS temp folder (on the
 * maintainer's PC TEMP already points off the system drive). Each run's folder
 * is removed when its test ends (`removeRun`); screenshots stay under `shots`.
 */
export const PF_ROOT = process.env.PF_E2E_ROOT ?? join(tmpdir(), 'ieum-pf-e2e')

export async function scratch(...parts: string[]): Promise<string> {
  const dir = join(PF_ROOT, ...parts)
  await mkdir(dir, { recursive: true })
  return dir
}

/** deletes one run's folders (user data, documents, projects) after the app closed */
export async function removeRun(run: string): Promise<void> {
  await rm(join(PF_ROOT, run), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

export function shotPath(name: string): string {
  return join(PF_ROOT, 'shots', `${name}.png`)
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: shotPath(name) })
}

/** One scripted model turn: text, tool calls, or both */
export interface FakeTurn {
  text?: string
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
}

export interface Recorded {
  /** every ai:stream request, JSON */
  streams: string[]
  /** every showMessageBox call's options */
  boxes: Array<Record<string, unknown>>
  /** every showOpenDialog call's options */
  pickers: Array<Record<string, unknown>>
  /** shell.openPath / showItemInFolder calls (kept from the real OS) */
  shellOpens: string[]
}

/**
 * Replace the AI and native dialogs in the main process. The fake model plays
 * `globalThis.__pfTurns` in order (one per ai:stream call); when the queue is
 * empty it answers a plain line. Message boxes answer from `__pfBoxAnswers`
 * (else their cancelId), folder pickers from `__pfPicks` (else canceled).
 */
export async function stubEverything(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain, webContents, dialog, shell }) => {
    const g = globalThis as Record<string, unknown>
    const recorded = { streams: [], boxes: [], pickers: [], shellOpens: [] } as {
      streams: string[]
      boxes: Array<Record<string, unknown>>
      pickers: Array<Record<string, unknown>>
      shellOpens: string[]
    }
    g.__pf = recorded
    g.__pfTurns = []
    g.__pfBoxAnswers = []
    g.__pfPicks = []
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
    ipcMain.removeHandler('ai:stream')
    ipcMain.handle('ai:stream', (event, request: { requestId: string }) => {
      recorded.streams.push(JSON.stringify(request))
      const turns = g.__pfTurns as Array<{
        text?: string
        toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
      }>
      const turn = turns.shift() ?? { text: '네, 알겠습니다.' }
      const send = (chunk: Record<string, unknown>) =>
        realSend.call(event.sender, 'ai:stream-chunk', { requestId: request.requestId, ...chunk })
      setTimeout(() => {
        if (turn.text) send({ type: 'delta', text: turn.text })
        for (const call of turn.toolCalls ?? []) send({ type: 'tool-call', toolCall: call })
        send({ type: 'done' })
      }, 60)
    })
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) realSend.call(wc, 'ai:subscription-changed', statuses)
    }
    const optsOf = (a: unknown, b: unknown) =>
      (b && typeof b === 'object' ? b : a) as Record<string, unknown>
    dialog.showMessageBox = (async (a: unknown, b?: unknown) => {
      const opts = optsOf(a, b)
      recorded.boxes.push(JSON.parse(JSON.stringify(opts)))
      const answers = g.__pfBoxAnswers as number[]
      const response =
        answers.length > 0
          ? answers.shift()!
          : typeof opts.cancelId === 'number'
            ? opts.cancelId
            : 0
      return { response, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
    dialog.showOpenDialog = (async (a: unknown, b?: unknown) => {
      const opts = optsOf(a, b)
      recorded.pickers.push(JSON.parse(JSON.stringify(opts)))
      const picks = g.__pfPicks as string[]
      if (picks.length === 0) return { canceled: true, filePaths: [] }
      return { canceled: false, filePaths: [picks.shift()!] }
    }) as typeof dialog.showOpenDialog
    shell.openPath = (async (p: string) => {
      recorded.shellOpens.push(p)
      return ''
    }) as typeof shell.openPath
    shell.showItemInFolder = ((p: string) => {
      recorded.shellOpens.push(p)
    }) as typeof shell.showItemInFolder
  })
}

export async function recorded(app: ElectronApplication): Promise<Recorded> {
  return app.evaluate(() => (globalThis as Record<string, unknown>).__pf as Recorded)
}

export async function queueTurns(app: ElectronApplication, turns: FakeTurn[]): Promise<void> {
  await app.evaluate((_e, t) => {
    ;((globalThis as Record<string, unknown>).__pfTurns as unknown[]).push(...t)
  }, turns)
}

export async function queueBoxAnswers(app: ElectronApplication, answers: number[]): Promise<void> {
  await app.evaluate((_e, a) => {
    ;((globalThis as Record<string, unknown>).__pfBoxAnswers as number[]).push(...a)
  }, answers)
}

export async function queuePicks(app: ElectronApplication, picks: string[]): Promise<void> {
  await app.evaluate((_e, p) => {
    ;((globalThis as Record<string, unknown>).__pfPicks as string[]).push(...p)
  }, picks)
}
