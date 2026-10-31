/**
 * A deck as a skill template (spec 5.6, 5.7): a template's copy opens as a
 * new untitled deck whose first save asks where (the AutoSave pass never
 * writes it), and the open deck gives its bytes and its redaction answer
 * without saving anything.
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
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => false,
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: (t: string) => ({ width: t.length * 8 }),
  shapedFamily: () => null,
  shapedMeasure: () => ({ width: 0 }),
}))

import { createBlankPptx, openPptx } from '@genoffice/pptx-engine'
import { registerSlidesIpc } from '../src/main/slides-main'
import { sessions } from '../src/main/session-state'
import { queueSlidesSeedFor } from '../src/main/seed-queue'
import { deckHasRedaction } from '../src/main/template-bytes'

class FakeContents {
  sent: Array<[string, unknown]> = []
  destroyed = false
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  once(): void {}
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload])
  }
}

const handler = <T>(channel: string) =>
  handlers.get(channel) as unknown as (e: { sender: FakeContents }, ...args: unknown[]) => T

beforeAll(() => {
  registerSlidesIpc()
})

beforeEach(() => {
  sessions.clear()
})

describe('a template copy as a new deck', () => {
  it('opens untitled, remembers that its first save asks where, and AutoSave leaves it', async () => {
    const tab = new FakeContents(701)
    queueSlidesSeedFor(tab, await createBlankPptx(), {
      askPathOnFirstSave: true,
      suggestedName: 'Field trip.pptx',
    })
    await handler<Promise<unknown>>('slides:consume-pending-open')({ sender: tab }, 1280)
    const session = sessions.get(tab.id)
    expect(session?.path).toBe('')
    expect(session?.askPathOnFirstSave).toBe(true)
    expect(session?.firstSaveName).toBe('Field trip.pptx')
    const auto = await handler<Promise<{ ok: boolean; reason?: string }>>('slides:save')(
      { sender: tab },
      true,
    )
    expect(auto).toEqual({ ok: false, reason: 'external-modified' })
    // nothing was written: no drafts path was given to the deck
    expect(sessions.get(tab.id)?.path).toBe('')
  })

  it('keeps a plain new deck as it was (no question on its first save)', async () => {
    const tab = new FakeContents(702)
    queueSlidesSeedFor(tab, await createBlankPptx())
    await handler<Promise<unknown>>('slides:consume-pending-open')({ sender: tab }, 1280)
    expect(sessions.get(tab.id)?.askPathOnFirstSave).toBeUndefined()
  })
})

describe('the open deck as a template', () => {
  it('gives its bytes and no redaction for a plain deck, and nothing without a deck', async () => {
    const tab = new FakeContents(703)
    queueSlidesSeedFor(tab, await createBlankPptx())
    await handler<Promise<unknown>>('slides:consume-pending-open')({ sender: tab }, 1280)
    const answer = await handler<Promise<{ bytes: Uint8Array; redacted: boolean } | null>>(
      'slides:template-bytes',
    )({ sender: tab })
    expect(answer?.redacted).toBe(false)
    expect(answer?.bytes.byteLength).toBeGreaterThan(0)
    // still a valid deck
    await expect(openPptx(answer!.bytes)).resolves.toBeTruthy()
    expect(
      await handler<Promise<unknown>>('slides:template-bytes')({ sender: new FakeContents(799) }),
    ).toBeNull()
  })

  it('finds a mark anywhere in the slides, tables and groups included', () => {
    const deck = (slides: unknown) => ({ deck: { slides } }) as never
    expect(deckHasRedaction(deck([{ elements: [{ text: { runs: [{ text: 'a' }] } }] }]))).toBe(
      false,
    )
    expect(
      deckHasRedaction(
        deck([
          {
            elements: [
              {
                kind: 'table',
                cells: [[{ paragraphs: [{ runs: [{ text: 'Kim', redact: 'Name' }] }] }]],
              },
            ],
          },
        ]),
      ),
    ).toBe(true)
    expect(deckHasRedaction(deck([{ elements: [{ kind: 'picture', redact: 'Photo' }] }]))).toBe(
      true,
    )
    expect(deckHasRedaction(deck([{ elements: [{ redact: '' }] }]))).toBe(false)
    // a cycle in the model does not loop
    const looped: Record<string, unknown> = { elements: [] }
    looped.self = looped
    expect(deckHasRedaction(deck([looped]))).toBe(false)
  })
})
