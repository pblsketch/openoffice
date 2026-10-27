// @vitest-environment node
/**
 * Co-editing on the main side (decision 0073): what main captures and when it
 * sends it, the order guard for other people's ops, and what a guest may not
 * do. The deck lives here; the renderer's session is played by the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: { sender: FakeContents }, ...args: unknown[]) => unknown
interface FakeContents {
  id: number
  sent: Array<[string, unknown]>
  send(channel: string, value: unknown): void
  isDestroyed(): boolean
  once(event: string, fn: () => void): void
}
const handlers = new Map<string, Handler>()
const tabs = new Map<number, FakeContents>()

function tab(id: number): FakeContents {
  const wc: FakeContents = {
    id,
    sent: [],
    send(channel, value) {
      wc.sent.push([channel, value])
    },
    isDestroyed: () => false,
    once: () => {},
  }
  tabs.set(id, wc)
  return wc
}

vi.mock('electron', () => ({
  app: { getPath: () => '', getName: () => 'slides-test', getVersion: () => '0', once: () => {} },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: () => {},
  },
  webContents: { getAllWebContents: () => [], fromId: (id: number) => tabs.get(id) ?? null },
}))

vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx, openPptx } from '@genoffice/pptx-engine'
import { runTxn, type Op } from '@genoffice/pptx-ops'
import {
  asRemote,
  collabCapture,
  collabRefuse,
  collabRefusesOps,
  collabSaveRefused,
  isCollabGuest,
  registerSlidesCollabIpc,
} from '../src/main/collab'
import { sessions, type Session } from '../src/main/session-state'
import {
  SLIDES_COLLAB_CHANNELS as CH,
  type SlidesCollabCaptured,
  type SlidesWireOp,
} from '../src/shared/collab'

const rect: Op = {
  op: 'addElement',
  target: { slide: 0 },
  kind: 'rect',
  offset: { x: 0, y: 0, cx: 914400, cy: 457200 },
}

/** an edit through the journal funnel, as slides-main's journaledTxn runs it */
function edit(session: Session, ops: Op[]): void {
  const capture = collabCapture(session)
  const r = runTxn(session.opened, { ops })
  if (r.applied) capture?.(r.records ?? [], 'edit')
}

const call = (channel: string, wc: FakeContents, ...args: unknown[]) =>
  handlers.get(channel)!({ sender: wc }, ...args)

const captured = (wc: FakeContents) =>
  wc.sent.filter(([ch]) => ch === CH.captured).map(([, v]) => v as SlidesCollabCaptured)

const notices = (wc: FakeContents) => wc.sent.filter(([ch]) => ch === CH.blocked).map(([, v]) => v)

const applied: SlidesWireOp[] = []
registerSlidesCollabIpc({
  isDirty: (s) => !!s.metaDirty,
  untitledName: () => 'Plan',
  applyRemote: (session, op) =>
    asRemote(session, () => {
      applied.push(op)
      edit(session, op.ops as Op[])
      return { ok: true, check: op.check }
    }),
  reload: async () => [],
})

let wcId = 100
async function deck(): Promise<{ session: Session; wc: FakeContents }> {
  const wc = tab(++wcId)
  const session: Session = {
    path: '',
    opened: await openPptx(await createBlankPptx()),
    fitWidthPx: 960,
    undoStack: [],
    redoStack: [],
  }
  sessions.set(wc.id, session)
  return { session, wc }
}

beforeEach(() => {
  applied.length = 0
})

describe('hosting', () => {
  it('edits made while sharing starts are held, then sent in order once the session is bound', async () => {
    const { session, wc } = await deck()
    const described = (await call(CH.describe, wc)) as { fileName: string; base: Uint8Array }
    expect(described.fileName).toBe('Plan.pptx')
    expect(described.base.length).toBeGreaterThan(0)
    edit(session, [rect])
    expect(captured(wc)).toEqual([])
    await call(CH.begin, wc, 'host')
    edit(session, [rect])
    expect(captured(wc).map((c) => c.seq)).toEqual([1, 2])
    expect(captured(wc).every((c) => c.op?.keys.includes('s|s_1'))).toBe(true)
  })

  it("another person's op waits for this deck's own edits to reach the stream, and is not captured again", async () => {
    const { session, wc } = await deck()
    await call(CH.describe, wc)
    await call(CH.begin, wc, 'host')
    edit(session, [rect])
    const op: SlidesWireOp = { source: 'edit', ops: [rect], check: '', keys: ['s|s_1'] }
    expect(await call(CH.apply, wc, op, 0)).toEqual({ ok: false, wait: 1 })
    expect(applied).toEqual([])
    expect(await call(CH.apply, wc, op, 1)).toMatchObject({ ok: true })
    expect(captured(wc).length).toBe(1)
  })

  it('a host alone may jump in history; with people in it is refused', async () => {
    const { session, wc } = await deck()
    await call(CH.describe, wc)
    await call(CH.begin, wc, 'host')
    expect(collabRefuse(session, wc as never, 'others')).toBe(false)
    call(CH.peers, wc, 2)
    expect(collabRefuse(session, wc as never, 'others')).toBe(true)
    expect(collabRefuse(session, wc as never, 'guest')).toBe(false)
    expect(notices(wc)).toEqual(['hostBlocked'])
  })

  it('the snapshot says which captures its bytes hold, and the deck stays unsaved', async () => {
    const { session, wc } = await deck()
    await call(CH.describe, wc)
    await call(CH.begin, wc, 'host')
    edit(session, [rect])
    session.metaDirty = true
    const snap = (await call(CH.snapshot, wc)) as { bytes: Uint8Array; seq: number }
    expect(snap.seq).toBe(1)
    expect((await openPptx(snap.bytes)).deck.slides[0]!.elements.length).toBe(
      session.opened.deck.slides[0]!.elements.length,
    )
    expect(session.metaDirty).toBe(true)
  })
})

describe('joining', () => {
  it('a guest never saves, cannot change sections, and its copy becomes its own when the session ends', async () => {
    const { session, wc } = await deck()
    session.undoStack.push({} as never)
    await call(CH.begin, wc, 'guest')
    expect(isCollabGuest(session)).toBe(true)
    expect(session.undoStack).toEqual([])
    expect(collabSaveRefused(session, wc as never)).toBe(true)
    expect(collabRefuse(session, wc as never, 'guest')).toBe(true)
    expect(collabRefusesOps(session, [{ op: 'addSection' }])).toMatch(/Sections/)
    expect(collabRefusesOps(session, [rect])).toBeNull()
    expect(notices(wc)).toEqual(['guestSaveBlocked', 'guestBlocked'])
    edit(session, [rect])
    expect(captured(wc)).toHaveLength(1)
    session.metaDirty = false
    await call(CH.end, wc)
    expect(isCollabGuest(session)).toBe(false)
    expect(session.metaDirty).toBe(true)
  })

  it('another tab on the same deck cannot end the session of the tab that carries it', async () => {
    const { session, wc } = await deck()
    await call(CH.begin, wc, 'guest')
    const other = tab(++wcId)
    sessions.set(other.id, session)
    await call(CH.end, other)
    expect(isCollabGuest(session)).toBe(true)
  })
})
