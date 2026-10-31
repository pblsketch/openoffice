// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * hwp:ai-generate-image, hwp:fetch-image and hwp:analyze-media — the channels that bring a
 * picture into the Hangul document or let the model look at one that is already in it. The
 * tools and the fetch gate are shared; this module wires them to the view's document folder
 * and the screen path, exactly like the other editors.
 */

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/fake/${name}` },
  ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) },
}))

const generateImageTool = vi.fn()
const analyzeMediaTool = vi.fn()
vi.mock('@genoffice/ai-search', () => ({
  generateImageTool: (...args: unknown[]) => generateImageTool(...args),
  analyzeMediaTool: (...args: unknown[]) => analyzeMediaTool(...args),
  documentMediaRoots: (path: string | null, pasted: string) =>
    [path ? `/roots${path}` : null, `/roots${pasted}`].filter(Boolean),
  withMediaCallSignal: (_sender: unknown, run: (signal: AbortSignal) => unknown) =>
    run(new AbortController().signal),
}))

vi.mock('@genoffice/ai-provider/subscription', () => ({
  sharedSubscriptionStatuses: () => ({ codex: 'ready' }),
}))

const fetchImageBytes = vi.fn()
vi.mock('@genoffice/electron-utils/fetch-image-bytes', () => ({
  fetchImageBytes: (...args: unknown[]) => fetchImageBytes(...args),
}))

import { registerHwpImageIpc } from '../src/main/ai-image'
import { HWP_CHANNELS } from '../src/shared/ipc'

const sender = { id: 9 }

beforeEach(() => {
  handlers.clear()
  generateImageTool.mockReset()
  analyzeMediaTool.mockReset()
  fetchImageBytes.mockReset()
})

const register = (filePath: string | null = 'C:/docs/a.hwp') =>
  registerHwpImageIpc({ filePathOf: () => filePath })

describe('hwp image channels', () => {
  it('registers exactly its own three channels', () => {
    register()
    expect([...handlers.keys()].sort()).toEqual(
      [HWP_CHANNELS.aiGenerateImage, HWP_CHANNELS.fetchImage, HWP_CHANNELS.analyzeMedia].sort(),
    )
  })

  it('generates with the screen path, the shared statuses and the document folder', async () => {
    register()
    generateImageTool.mockResolvedValue({ url: 'file:///store/a.png' })
    const result = await handlers.get(HWP_CHANNELS.aiGenerateImage)!(
      { sender },
      { prompt: 'a red kite', aspectRatio: '4:3' },
    )
    expect(result).toEqual({ url: 'file:///store/a.png' })
    const [settingsPath, op, options] = generateImageTool.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(settingsPath).toContain('ai-settings.json')
    expect(op).toEqual({ prompt: 'a red kite', aspectRatio: '4:3' })
    expect(options.context).toEqual({ path: 'screen', statuses: { codex: 'ready' } })
    const roots = options.mediaRoots as string[]
    expect(roots[0]).toBe('/rootsC:/docs/a.hwp')
    expect(roots[1]).toContain('genoffice-pasted')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('gives an untitled document only the pasted-picture folder', async () => {
    register(null)
    generateImageTool.mockResolvedValue({})
    await handlers.get(HWP_CHANNELS.aiGenerateImage)!({ sender }, { prompt: 'x' })
    const roots = (generateImageTool.mock.calls[0]![2] as { mediaRoots: string[] }).mediaRoots
    expect(roots).toHaveLength(1)
    expect(roots[0]).toContain('genoffice-pasted')
  })

  it('fetches through the shared gate, which decides which URLs may be read', async () => {
    register()
    fetchImageBytes.mockResolvedValue({ base64: 'AA==', mime: 'image/png' })
    const result = await handlers.get(HWP_CHANNELS.fetchImage)!({ sender }, 'file:///store/a.png')
    expect(result).toEqual({ base64: 'AA==', mime: 'image/png' })
    expect(fetchImageBytes).toHaveBeenCalledWith('file:///store/a.png')
  })

  it('shows a picture of the document to the reader, and takes no other address', async () => {
    register()
    analyzeMediaTool.mockResolvedValue({ text: 'a chart of sales' })
    const result = await handlers.get(HWP_CHANNELS.analyzeMedia)!(
      { sender },
      {
        mediaUrls: [
          'data:image/png;base64,AA==',
          'file:///etc/passwd',
          'https://example.com/a.png',
        ],
        requirements: 'What does the chart show?',
      },
    )
    expect(result).toEqual({ text: 'a chart of sales' })
    const [settingsPath, op, options] = analyzeMediaTool.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(settingsPath).toContain('ai-settings.json')
    // only the document's own picture bytes are taken: no path and no address
    expect(op).toEqual({
      mediaUrls: ['data:image/png;base64,AA=='],
      requirements: 'What does the chart show?',
    })
    expect(options.context).toEqual({ path: 'screen', statuses: { codex: 'ready' } })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('refuses a call without a picture data URL', async () => {
    register()
    const result = await handlers.get(HWP_CHANNELS.analyzeMedia)!(
      { sender },
      { mediaUrls: ['file:///etc/passwd'], requirements: 'What is it?' },
    )
    expect(result).toEqual({ error: 'no picture was given to look at' })
    expect(analyzeMediaTool).not.toHaveBeenCalled()
  })
})
