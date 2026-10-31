/**
 * A new slides tab that starts with a given deck (spec 8.6, "convert without
 * AI"): the tab takes it once through its ordinary pending open, as a NEW,
 * UNSAVED deck; a reload restores that session and takes nothing again.
 */
import { tmpdir } from 'node:os'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'slides-test',
    getVersion: () => '0',
    whenReady: () => Promise.resolve(),
  },
  dialog: {},
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: { handle: () => {} }, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: {},
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))
// the shaping chain loads a harfbuzz wasm that cannot resolve in the unit-test env
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => false,
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx, openPptx, savePptx } from '@genoffice/pptx-engine'
import { runTxn } from '@genoffice/pptx-ops'
import { registerSlidesIpc, slidesIsDirty } from '../src/main/slides-main'
import { sessions } from '../src/main/session-state'
import { queueSlidesSeedFor, takeSlidesSeed } from '../src/main/seed-queue'

const FIT = 1280

class FakeContents {
  sent: Array<[string, unknown]> = []
  destroyed = false
  private onDestroyed: (() => void) | null = null
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  once(_event: 'destroyed', listener: () => void): void {
    this.onDestroyed = listener
  }
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload])
  }
  destroy(): void {
    this.destroyed = true
    this.onDestroyed?.()
  }
}

async function twoSlideDeck(): Promise<Uint8Array> {
  const opened = await openPptx(await createBlankPptx())
  for (const op of [
    { op: 'addBlankSlide', target: { slide: 0 } },
    {
      op: 'addElement',
      target: { slide: 1 },
      kind: 'textbox',
      offset: { x: 914400, y: 685800, cx: 5000000, cy: 1000000 },
      paragraphs: [{ runs: [{ text: 'Branch title' }] }],
    },
  ] as const) {
    expect(runTxn(opened, { ops: [op as never] }).applied).toBe(true)
  }
  return savePptx(opened)
}

function consume(contents: FakeContents): Promise<unknown> {
  const fn = handlers.get('slides:consume-pending-open') as unknown as (
    e: { sender: FakeContents },
    fit: number,
  ) => Promise<unknown>
  return fn({ sender: contents }, FIT)
}

beforeAll(() => {
  registerSlidesIpc()
})

beforeEach(() => {
  sessions.clear()
})

describe('a new slides tab with a given deck', () => {
  it('opens it once, untitled and unsaved, and tells the renderer to ask whether it is dirty', async () => {
    const tab = new FakeContents(501)
    queueSlidesSeedFor(tab, await twoSlideDeck())
    const result = (await consume(tab)) as { path: string; slides: unknown[] }
    expect(result.path).toBe('')
    expect(result.slides).toHaveLength(2)
    expect(sessions.get(tab.id)?.path).toBe('')
    expect(slidesIsDirty(tab.id)).toBe(true)
    await new Promise((resolve) => setImmediate(resolve))
    expect(tab.sent.map(([channel]) => channel)).toContain('slides:deck-changed')

    // a reload restores the session; nothing is taken again
    expect(takeSlidesSeed(tab.id)).toBeNull()
    const again = (await consume(tab)) as { path: string; slides: unknown[] }
    expect(again.slides).toHaveLength(2)
    expect(slidesIsDirty(tab.id)).toBe(true)
  })

  it('gives nothing to another tab, and drops the deck of a tab that closed first', async () => {
    const tab = new FakeContents(502)
    const other = new FakeContents(503)
    queueSlidesSeedFor(tab, await twoSlideDeck())
    expect(await consume(other)).toBeNull()
    tab.destroy()
    expect(takeSlidesSeed(tab.id)).toBeNull()
  })
})
