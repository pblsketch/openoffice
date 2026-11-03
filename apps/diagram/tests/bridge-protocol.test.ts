// Messages across the draw.io frame: who may send them and what is read.
import { describe, expect, it, vi } from 'vitest'
import {
  DRAWIO_ORIGIN,
  isFromDrawioFrame,
  isFromHost,
  parseBridgeMessage,
  parseEmbedEvent,
} from '../src/shared/bridge-protocol'
import { DrawioFrame, dataUrlBytes } from '../src/renderer/drawio/frame-client'
import { isAppShortcut } from '../src/bridge/shortcuts'

const frameWindow = { postMessage: vi.fn() }
const other = { postMessage: vi.fn() }

describe('origin and source checks', () => {
  it('host reads only the draw.io frame from the draw.io origin', () => {
    expect(
      isFromDrawioFrame({ source: frameWindow, origin: DRAWIO_ORIGIN, data: '' }, frameWindow),
    ).toBe(true)
    expect(isFromDrawioFrame({ source: other, origin: DRAWIO_ORIGIN, data: '' }, frameWindow)).toBe(
      false,
    )
    expect(
      isFromDrawioFrame(
        { source: frameWindow, origin: 'https://evil.example', data: '' },
        frameWindow,
      ),
    ).toBe(false)
    expect(isFromDrawioFrame({ source: null, origin: DRAWIO_ORIGIN, data: '' }, null)).toBe(false)
  })

  it('bridge reads only its parent from the parent’s origin', () => {
    const parent = {}
    const host = 'genoffice-app://diagram'
    expect(isFromHost({ source: parent, origin: host, data: {} }, parent, host)).toBe(true)
    expect(isFromHost({ source: {}, origin: host, data: {} }, parent, host)).toBe(false)
    expect(
      isFromHost({ source: parent, origin: 'drawio-app://editor', data: {} }, parent, host),
    ).toBe(false)
    // no known parent origin: nothing is read
    expect(isFromHost({ source: parent, origin: '', data: {} }, parent, '')).toBe(false)
    expect(isFromHost({ source: parent, origin: 'null', data: {} }, parent, 'null')).toBe(false)
  })
})

describe('parsing', () => {
  it('reads our tagged objects and nothing else', () => {
    expect(
      parseBridgeMessage({ ieum: 1, kind: 'event', name: 'dirty', dirty: true }),
    ).toMatchObject({
      name: 'dirty',
    })
    expect(
      parseBridgeMessage({ ieum: 1, kind: 'request', id: 'a', op: 'readPages', args: {} }),
    ).not.toBeNull()
    expect(
      parseBridgeMessage({ ieum: 1, kind: 'request', id: 'a', op: 'eval', args: {} }),
    ).toBeNull()
    expect(parseBridgeMessage({ ieum: 1, kind: 'event', name: 'unknown' })).toBeNull()
    expect(parseBridgeMessage({ ieum: 2, kind: 'event', name: 'dirty' })).toBeNull()
    expect(parseBridgeMessage('{"event":"init"}')).toBeNull()
    expect(parseBridgeMessage(null)).toBeNull()
  })

  it('reads draw.io’s JSON strings', () => {
    expect(parseEmbedEvent('{"event":"init"}')).toEqual({ event: 'init' })
    expect(parseEmbedEvent('{"action":"load"}')).toBeNull()
    expect(parseEmbedEvent('not json')).toBeNull()
    expect(parseEmbedEvent({ event: 'init' })).toBeNull()
  })
})

describe('DrawioFrame', () => {
  const makeFrame = () => {
    const listeners: ((event: MessageEvent) => void)[] = []
    const host = {
      addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    } as unknown as Window
    const handlers = { onInit: vi.fn(), onLoad: vi.fn(), onSave: vi.fn(), onBridgeEvent: vi.fn() }
    const frame = new DrawioFrame(handlers, host)
    const win = { postMessage: vi.fn() }
    frame.attach(win)
    return { frame, win, handlers }
  }

  it('posts only to the draw.io origin', async () => {
    const { frame, win } = makeFrame()
    frame.sendEmbed({ action: 'load', xml: '<mxfile/>' })
    const pending = frame.request('selection', {})
    for (const [, origin] of win.postMessage.mock.calls) expect(origin).toBe(DRAWIO_ORIGIN)
    const id = (win.postMessage.mock.calls[1]![0] as { id: string }).id
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: { ieum: 1, kind: 'reply', id, ok: true, value: { ids: ['a'] } },
    })
    await expect(pending).resolves.toEqual({ ids: ['a'] })
  })

  it('ignores replies and events from another window or origin', async () => {
    const { frame, win, handlers } = makeFrame()
    const pending = frame.request('selection', {})
    const id = (win.postMessage.mock.calls[0]![0] as { id: string }).id
    const reply = { ieum: 1, kind: 'reply', id, ok: true, value: { ids: ['forged'] } }
    frame.receive({ source: other, origin: DRAWIO_ORIGIN, data: reply })
    frame.receive({ source: win, origin: 'https://evil.example', data: reply })
    frame.receive({ source: other, origin: DRAWIO_ORIGIN, data: '{"event":"init"}' })
    expect(handlers.onInit).not.toHaveBeenCalled()
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: { ...reply, value: { ids: ['real'] } },
    })
    await expect(pending).resolves.toEqual({ ids: ['real'] })
  })

  it('hands draw.io’s events and the bridge’s events on', () => {
    const { frame, win, handlers } = makeFrame()
    frame.receive({ source: win, origin: DRAWIO_ORIGIN, data: '{"event":"init"}' })
    frame.receive({ source: win, origin: DRAWIO_ORIGIN, data: '{"event":"save","xml":"x"}' })
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: { ieum: 1, kind: 'event', name: 'dirty', dirty: true },
    })
    expect(handlers.onInit).toHaveBeenCalledTimes(1)
    expect(handlers.onSave).toHaveBeenCalledTimes(1)
    expect(handlers.onBridgeEvent).toHaveBeenCalledWith({ name: 'dirty', dirty: true })
  })

  it('matches each export to its request and serializes compressed when asked', async () => {
    const { frame, win } = makeFrame()
    const bytes = frame.serialize('xml', true)
    // setCompressed goes first and is answered
    await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(1))
    const set = win.postMessage.mock.calls[0]![0] as { id: string; op: string; args: unknown }
    expect(set).toMatchObject({ op: 'setCompressed', args: { compressed: true } })
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: { ieum: 1, kind: 'reply', id: set.id, ok: true, value: {} },
    })
    await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(2))
    const action = JSON.parse(win.postMessage.mock.calls[1]![0] as string) as {
      ieumId: string
      format: string
    }
    expect(action.format).toBe('xml')
    // an export answer for another request does not count
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: JSON.stringify({ event: 'export', message: { ieumId: 'other' }, xml: '<bad/>' }),
    })
    frame.receive({
      source: win,
      origin: DRAWIO_ORIGIN,
      data: JSON.stringify({ event: 'export', message: action, xml: '<mxfile/>' }),
    })
    expect(new TextDecoder().decode(await bytes)).toBe('<mxfile/>')
  })

  it('fails waiting calls when the frame goes away', async () => {
    const { frame } = makeFrame()
    const pending = frame.request('readPages', {})
    frame.failAll(new Error('gone'))
    await expect(pending).rejects.toThrow('gone')
  })
})

describe('helpers', () => {
  it('reads base64 data URLs only', () => {
    expect([...dataUrlBytes('data:image/png;base64,AQID')]).toEqual([1, 2, 3])
    expect(() => dataUrlBytes('data:image/svg+xml,<svg/>')).toThrow()
  })

  it('keeps Ctrl+S, Ctrl+Shift+S and Ctrl+P for the app', () => {
    const key = (
      k: string,
      extra: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
    ) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...extra,
    })
    expect(isAppShortcut(key('s', { ctrlKey: true }))).toBe('save')
    expect(isAppShortcut(key('S', { ctrlKey: true, shiftKey: true }))).toBe('saveAs')
    expect(isAppShortcut(key('p', { metaKey: true }))).toBe('print')
    expect(isAppShortcut(key('z', { ctrlKey: true }))).toBeNull()
    expect(isAppShortcut(key('s'))).toBeNull()
    expect(isAppShortcut(key('s', { ctrlKey: true, altKey: true }))).toBeNull()
  })
})
