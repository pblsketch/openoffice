/**
 * Questions the in-app MCP server asks an open diagram: the read table (every
 * page, one page, or the page on screen) and a list of ops to apply. Nothing
 * here writes a file; saving goes through `diagramSaveToPath` in the main
 * module.
 *
 * The renderer answers on `readResult` / `applyResult` with the id of the
 * question. It stays silent while draw.io is still starting, and its listener
 * registers while mounting, so a read can go unanswered: it is sent again
 * until an answer comes or the time runs out. A view whose file did not open
 * answers with an error.
 *
 * An apply is never sent twice: the renderer would apply it twice. It waits
 * for a read to be answered first (proof that the editor listens and has a
 * diagram), then asks once. Applies to one view run one after another, so
 * each one is planned against the diagram the previous one left.
 */
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { DiagramReadResult } from '@genoffice/drawio-model'
import {
  DIAGRAM_CHANNELS,
  type DiagramApplyReply,
  type DiagramReadQuery,
  type DiagramReadReply,
} from '../shared/ipc'

/** How long a read waits for the renderer before giving up. */
const READ_TIMEOUT_MS = 30_000
/** How long an apply waits: a Mermaid conversion runs inside it. */
const APPLY_TIMEOUT_MS = 120_000
/** How often an unanswered read is sent again. */
const RESEND_MS = 250

type Waiter = { wcId: number; settle: (reply: unknown) => void }

const readWaiters = new Map<string, Waiter>()
const applyWaiters = new Map<string, Waiter>()
let listening = false

function listen(): void {
  if (listening) return
  listening = true
  const route =
    (waiters: Map<string, Waiter>) => (e: { sender: { id: number } }, reply: unknown) => {
      if (!reply || typeof reply !== 'object') return
      const id = (reply as { id?: unknown }).id
      if (typeof id !== 'string') return
      const waiter = waiters.get(id)
      // an answer counts only from the view that was asked
      if (!waiter || waiter.wcId !== e.sender.id) return
      waiter.settle(reply)
    }
  ipcMain.on(DIAGRAM_CHANNELS.readResult, route(readWaiters))
  ipcMain.on(DIAGRAM_CHANNELS.applyResult, route(applyWaiters))
}

const GONE = 'the diagram is no longer open'

/**
 * One page read: the table as text (`content` of the tools) and as values
 * (`pages`, `page`; the same rows, for the in-app MCP server's object).
 */
export interface DiagramPageRead {
  text: string
  pages?: DiagramReadResult['pages']
  page?: DiagramReadResult['page']
}

/** The renderer's one-page table, when it is shaped like one. */
function pageTableOf(read: unknown): DiagramReadResult | undefined {
  if (!read || typeof read !== 'object') return undefined
  const { pages, page } = read as { pages?: unknown; page?: unknown }
  if (!Array.isArray(pages) || !page || typeof page !== 'object') return undefined
  const { shapes, edges } = page as { shapes?: unknown; edges?: unknown }
  if (!Array.isArray(shapes) || !Array.isArray(edges)) return undefined
  return read as DiagramReadResult
}

/** Ask for the read table, sending again until the renderer answers. */
function askRead(
  contents: WebContents,
  scope: Omit<DiagramReadQuery, 'id'>,
): Promise<DiagramPageRead> {
  if (contents.isDestroyed()) return Promise.reject(new Error(GONE))
  listen()
  const wcId = contents.id
  const query: DiagramReadQuery = { id: randomUUID(), ...scope }
  return new Promise<DiagramPageRead>((resolve, reject) => {
    let settled = false
    const finish = (done: () => void): void => {
      if (settled) return
      settled = true
      clearInterval(resend)
      clearTimeout(timer)
      readWaiters.delete(query.id)
      done()
    }
    const resend = setInterval(() => {
      if (contents.isDestroyed()) {
        finish(() => reject(new Error(GONE)))
        return
      }
      contents.send(DIAGRAM_CHANNELS.readRequest, query)
    }, RESEND_MS)
    const timer = setTimeout(
      () => finish(() => reject(new Error('timed out reading the diagram'))),
      READ_TIMEOUT_MS,
    )
    readWaiters.set(query.id, {
      wcId,
      settle: (raw) => {
        const reply = raw as DiagramReadReply
        if ('text' in reply && typeof reply.text === 'string') {
          const text = reply.text
          const table = pageTableOf(reply.read)
          finish(() => resolve(table ? { text, pages: table.pages, page: table.page } : { text }))
        } else if ('error' in reply) {
          const error = String(reply.error)
          finish(() => reject(new Error(error)))
        }
      },
    })
    contents.send(DIAGRAM_CHANNELS.readRequest, query)
  })
}

/** Every page as the read table text, unsaved edits included (the `read` of an open document). */
export async function diagramReadText(contents: WebContents): Promise<string> {
  return (await askRead(contents, {})).text
}

/**
 * One page as the read table, text and values, with the page list: `page` by
 * id or name, or the page on screen (with the ids selected there) when it is
 * left out.
 */
export function diagramReadPage(contents: WebContents, page?: string): Promise<DiagramPageRead> {
  return askRead(contents, page ? { page } : { current: true })
}

/** applies queued per view: each waits for the one before it */
const applyChains = new Map<number, Promise<unknown>>()

function askApply(contents: WebContents, ops: unknown[]): Promise<unknown> {
  const wcId = contents.id
  return new Promise<unknown>((resolve, reject) => {
    if (contents.isDestroyed()) {
      reject(new Error(GONE))
      return
    }
    const id = randomUUID()
    let settled = false
    const finish = (done: () => void): void => {
      if (settled) return
      settled = true
      clearInterval(watch)
      clearTimeout(timer)
      applyWaiters.delete(id)
      done()
    }
    // no resend: only notice a view that went away
    const watch = setInterval(() => {
      if (contents.isDestroyed()) finish(() => reject(new Error(GONE)))
    }, RESEND_MS)
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              'timed out applying the ops: the diagram may or may not have changed; read it again before retrying',
            ),
          ),
        ),
      APPLY_TIMEOUT_MS,
    )
    applyWaiters.set(id, {
      wcId,
      settle: (raw) => {
        const reply = raw as DiagramApplyReply
        if (reply.ok === true) finish(() => resolve(reply.result))
        else if (reply.ok === false) {
          const error = String(reply.error)
          finish(() => reject(new Error(error)))
        }
      },
    })
    contents.send(DIAGRAM_CHANNELS.applyRequest, { id, ops })
  })
}

/**
 * Plan `ops` against the live diagram and apply them as one undo step, all or
 * nothing (the AI panel's executor). Resolves with the renderer's result: the
 * outcome of every op and the ids created; a refused plan resolves too, with
 * nothing applied. Rejects when the editor cannot be asked.
 */
export function diagramApplyOps(contents: WebContents, ops: unknown[]): Promise<unknown> {
  if (contents.isDestroyed()) return Promise.reject(new Error(GONE))
  listen()
  const wcId = contents.id
  const previous = applyChains.get(wcId) ?? Promise.resolve()
  const run = previous
    .catch(() => undefined)
    // the read answers only once draw.io is up with a diagram
    .then(() => askRead(contents, { current: true }))
    .then(() => askApply(contents, ops))
  const tail = run.catch(() => undefined)
  applyChains.set(wcId, tail)
  void tail.then(() => {
    if (applyChains.get(wcId) === tail) applyChains.delete(wcId)
  })
  return run
}
