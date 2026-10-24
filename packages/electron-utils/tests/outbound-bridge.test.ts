import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outboundBridge } from '../src/outbound-bridge'
import {
  MAX_CONFIRM_ADDRESSES,
  OUTBOUND_CHANNELS,
  confirmRequestOf,
} from '../src/outbound-channels'

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('confirmRequestOf', () => {
  it('accepts a tool name and a short list of web addresses', () => {
    expect(confirmRequestOf({ tool: 'read_url', addresses: [' https://a.example/x '] })).toEqual({
      tool: 'read_url',
      addresses: ['https://a.example/x'],
    })
  })

  it('refuses anything else whole', () => {
    const many = Array.from({ length: MAX_CONFIRM_ADDRESSES + 1 }, (_, i) => `https://a/${i}`)
    for (const raw of [
      null,
      { tool: 'read_url', addresses: [] },
      { tool: 'read_url', addresses: many },
      { tool: 'Read URL!', addresses: ['https://a'] },
      { tool: 'read_url', addresses: ['file:///C:/secret.txt'] },
      { tool: 'read_url', addresses: ['https://a', 42] },
      { tool: 'read_url', addresses: [`https://a/${'x'.repeat(5000)}`] },
    ]) {
      expect(confirmRequestOf(raw), JSON.stringify(raw)?.slice(0, 60)).toBeNull()
    }
  })
})

describe('outboundBridge', () => {
  it('answers true only when the main process says exactly true', async () => {
    const bridge = outboundBridge()
    electronMocks.invoke.mockResolvedValueOnce(true)
    expect(await bridge.confirmAddresses('read_url', ['https://a'])).toBe(true)
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(OUTBOUND_CHANNELS.confirmAddresses, {
      tool: 'read_url',
      addresses: ['https://a'],
    })
    electronMocks.invoke.mockResolvedValueOnce('yes')
    expect(await bridge.confirmAddresses('read_url', ['https://a'])).toBe(false)
    electronMocks.invoke.mockRejectedValueOnce(new Error('no handler'))
    expect(await bridge.confirmAddresses('read_url', ['https://a'])).toBe(false)
    electronMocks.invoke.mockRejectedValueOnce(new Error('no handler'))
    expect(await bridge.internetToolsEnabled()).toBe(false)
  })

  it('reads the switch again whenever the settings are saved', async () => {
    const bridge = outboundBridge()
    const listener = vi.fn()
    const off = bridge.onInternetToolsChanged(listener)
    const [channel, handler] = electronMocks.on.mock.calls[0]!
    expect(channel).toBe(OUTBOUND_CHANNELS.settingsChanged)
    electronMocks.invoke.mockResolvedValueOnce(false)
    handler()
    await new Promise((r) => setTimeout(r, 0))
    expect(listener).toHaveBeenCalledWith(false)
    off()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(channel, handler)
  })
})
