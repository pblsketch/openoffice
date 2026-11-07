import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@genoffice/ai-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider')>()),
  generateImageWithProvider: vi.fn(),
}))

import {
  AiRunError,
  generateImageWithProvider,
  setCodexImageGenerationAvailable,
} from '@genoffice/ai-provider'
import { readGeneratedImage } from '@genoffice/electron-utils/generated-images'
import { registerCodexImageGenerator, type CodexImageGenerator } from '../src/codex-image-generator'
import { generateImageTool } from '../src/media-tools'
import type { AiToolCallContext } from '../src/tool-routing'
import { dataUrl, keyMedia, status, writeSettings } from './routing-helpers'

const keyGen = vi.mocked(generateImageWithProvider)
const codexGen = vi.fn<CodexImageGenerator>()

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
const screen = (codex?: ReturnType<typeof status>): AiToolCallContext => ({
  path: 'screen',
  statuses: codex ? { codex } : {},
})

beforeEach(() => {
  keyGen.mockReset()
  codexGen.mockReset()
  keyGen.mockResolvedValue({ bytes: PNG, mime: 'image/png' })
  codexGen.mockResolvedValue({ bytes: PNG, mime: 'image/png' })
  setCodexImageGenerationAvailable(true)
  registerCodexImageGenerator(codexGen)
})

afterEach(() => {
  setCodexImageGenerationAvailable(false)
  registerCodexImageGenerator(null)
})

describe('generate_image backend at request start', () => {
  it('never starts Codex turned off in this app, even on a status that still says ready', async () => {
    const settings = writeSettings({
      media: keyMedia({ imageProvider: 'codex' }, 'openai'),
      subscriptionOff: { codex: true },
    })
    const r = await generateImageTool(
      settings,
      { prompt: 'poster', aspectRatio: '16:9', imageSize: '2k' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r.error).toBeUndefined()
    expect(codexGen).not.toHaveBeenCalled()
    expect(keyGen).toHaveBeenCalledTimes(1)
  })

  it('uses the selected Codex subscription when it is ready, even with a key provider filled in', async () => {
    const settings = writeSettings({ media: keyMedia({ imageProvider: 'codex' }, 'openai') })
    const r = await generateImageTool(
      settings,
      { prompt: '한글 포스터', aspectRatio: '16:9', imageSize: '2k' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r.error).toBeUndefined()
    expect(readGeneratedImage(r.url!)?.mime).toBe('image/png')
    expect(codexGen).toHaveBeenCalledTimes(1)
    expect(codexGen.mock.calls[0]![0]).toMatchObject({
      prompt: '한글 포스터',
      aspectRatio: '16:9',
      imageSize: '2k',
    })
    expect(keyGen).not.toHaveBeenCalled()
  })

  it('passes a URL the Codex generator answers with straight through', async () => {
    codexGen.mockResolvedValueOnce({ url: 'https://images.example.com/a.png' })
    const r = await generateImageTool(
      writeSettings(),
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r).toEqual({ url: 'https://images.example.com/a.png' })
  })

  it('hands the caller abort signal to the Codex generator', async () => {
    const controller = new AbortController()
    await generateImageTool(
      writeSettings(),
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')), signal: controller.signal },
    )
    expect(codexGen.mock.calls[0]![0].signal).toBe(controller.signal)
  })

  it.each(['signed-out', 'not-installed', 'checking', 'error'] as const)(
    'falls to a filled-in key provider when the selected Codex is %s',
    async (state) => {
      const settings = writeSettings({ media: keyMedia({ imageProvider: 'codex' }, 'gemini') })
      const r = await generateImageTool(
        settings,
        { prompt: 'a logo', aspectRatio: '1:1' },
        { context: screen(status('codex', state)) },
      )
      expect(r.url).toMatch(/^file:/)
      expect(keyGen).toHaveBeenCalledTimes(1)
      expect(keyGen.mock.calls[0]![0]).toBe('gemini')
      expect(keyGen.mock.calls[0]![2]).toMatchObject({ prompt: 'a logo', aspectRatio: '1:1' })
      expect(codexGen).not.toHaveBeenCalled()
    },
  )

  it('answers "unavailable" when the selected Codex cannot run and no key provider is filled in', async () => {
    const r = await generateImageTool(
      writeSettings({ media: { imageProvider: 'codex', providers: {} } }),
      { prompt: 'a logo' },
      { context: screen(status('codex', 'signed-out')) },
    )
    expect(r.url).toBeUndefined()
    expect(r.errorCode).toBe('unavailable')
    expect(r.error).toMatch(/Settings/)
    expect(codexGen).not.toHaveBeenCalled()
    expect(keyGen).not.toHaveBeenCalled()
  })

  it('uses a ready Codex when the selected key provider is not filled in', async () => {
    const settings = writeSettings({ media: { imageProvider: 'openai', providers: {} } })
    const r = await generateImageTool(
      settings,
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r.url).toMatch(/^file:/)
    expect(codexGen).toHaveBeenCalledTimes(1)
    expect(keyGen).not.toHaveBeenCalled()
  })

  it('keeps a selected key provider that can run, whatever Codex is doing', async () => {
    const settings = writeSettings({ media: keyMedia({ imageProvider: 'gemini' }, 'gemini') })
    await generateImageTool(
      settings,
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(keyGen.mock.calls[0]![0]).toBe('gemini')
    expect(codexGen).not.toHaveBeenCalled()
  })

  it('takes the first filled-in key provider in catalog order', async () => {
    // written in reverse: the catalog lists gemini before doubao before qwen
    const settings = writeSettings({
      media: keyMedia({ imageProvider: 'codex' }, 'qwen', 'doubao', 'gemini'),
    })
    await generateImageTool(settings, { prompt: 'a logo' }, { context: screen() })
    expect(keyGen).toHaveBeenCalledTimes(1)
    expect(keyGen.mock.calls[0]![0]).toBe('gemini')
  })

  it('never generates on a metered Codex login, accepted or not', async () => {
    const metered = status('codex', 'metered', { loginMethod: 'metered', meteredAccepted: true })
    const accepted = { meteredAccepted: { codex: true } }
    const none = await generateImageTool(
      writeSettings(accepted),
      { prompt: 'a logo' },
      { context: screen(metered) },
    )
    expect(none.errorCode).toBe('unavailable')
    const key = await generateImageTool(
      writeSettings({ ...accepted, media: keyMedia({ imageProvider: 'codex' }, 'openai') }),
      { prompt: 'a logo' },
      { context: screen(metered) },
    )
    expect(key.url).toMatch(/^file:/)
    expect(keyGen.mock.calls[0]![0]).toBe('openai')
    expect(codexGen).not.toHaveBeenCalled()
  })

  it('treats Codex as absent while no generator is registered', async () => {
    registerCodexImageGenerator(null)
    const ready = screen(status('codex', 'ready'))
    const none = await generateImageTool(writeSettings(), { prompt: 'a logo' }, { context: ready })
    expect(none.errorCode).toBe('unavailable')
    // the message must not send the user to a connection this build cannot use
    expect(none.error).not.toMatch(/codex/i)
    const key = await generateImageTool(
      writeSettings({ media: keyMedia({ imageProvider: 'codex' }, 'openai') }),
      { prompt: 'a logo' },
      { context: ready },
    )
    expect(key.url).toMatch(/^file:/)
    expect(keyGen).toHaveBeenCalledTimes(1)
  })

  it('treats Codex as absent in a build that does not announce Codex image generation', async () => {
    setCodexImageGenerationAvailable(false)
    const r = await generateImageTool(
      writeSettings(),
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r.errorCode).toBe('unavailable')
    expect(codexGen).not.toHaveBeenCalled()
  })

  it('gives a caller that passes no context the key route only', async () => {
    const none = await generateImageTool(writeSettings(), { prompt: 'a logo' })
    expect(none.errorCode).toBe('unavailable')
    const key = await generateImageTool(
      writeSettings({ media: keyMedia({ imageProvider: 'codex' }, 'openai') }),
      { prompt: 'a logo' },
      { mediaRoots: [] },
    )
    expect(key.url).toMatch(/^file:/)
    expect(codexGen).not.toHaveBeenCalled()
  })

  it('reads an unknown provider id in the settings file as the default selection', async () => {
    const settings = writeSettings({
      media: keyMedia({ imageProvider: 'retired-provider' }, 'openai'),
    })
    await generateImageTool(
      settings,
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(codexGen).toHaveBeenCalledTimes(1)
    expect(keyGen).not.toHaveBeenCalled()
  })
})

describe('generate_image failing midway', () => {
  it('ends in the Codex error without trying a key provider', async () => {
    const resetsAt = Date.now() + 60_000
    codexGen.mockRejectedValueOnce(
      new AiRunError('rate-limit', 'Codex usage limit reached', { provider: 'codex', resetsAt }),
    )
    const settings = writeSettings({ media: keyMedia({ imageProvider: 'codex' }, 'openai') })
    const r = await generateImageTool(
      settings,
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r).toEqual({
      error: 'Codex usage limit reached',
      errorCode: 'rate-limit',
      resetsAt,
    })
    expect(codexGen).toHaveBeenCalledTimes(1)
    expect(keyGen).not.toHaveBeenCalled()
  })

  it('ends in the key provider error without trying Codex', async () => {
    keyGen.mockRejectedValueOnce(new Error('the image model refused the prompt'))
    const settings = writeSettings({ media: keyMedia({ imageProvider: 'openai' }, 'openai') })
    const r = await generateImageTool(
      settings,
      { prompt: 'a logo' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r).toEqual({ error: 'the image model refused the prompt' })
    expect(keyGen).toHaveBeenCalledTimes(1)
    expect(codexGen).not.toHaveBeenCalled()
  })
})

describe('generate_image options left over from the removed special models', () => {
  it('ignores `model` and says so, on both backends', async () => {
    const codex = await generateImageTool(
      writeSettings(),
      { prompt: 'a logo', model: 'fal-bria-rmbg' },
      { context: screen(status('codex', 'ready')) },
    )
    expect(codex.url).toMatch(/^file:/)
    expect(codex.note).toMatch(/model/)
    expect(codexGen.mock.calls[0]![0]).not.toHaveProperty('model')
    const key = await generateImageTool(
      writeSettings({ media: keyMedia({ imageProvider: 'openai' }, 'openai') }),
      { prompt: 'a logo', model: 'fal-bria-rmbg', transparentBackground: true },
    )
    expect(key.url).toMatch(/^file:/)
    expect(key.note).toMatch(/model/)
    // no second background-removal pass: one request, with the provider's own alpha control
    expect(keyGen).toHaveBeenCalledTimes(1)
    expect(keyGen.mock.calls[0]![2]).toMatchObject({ transparent: true })
    expect(keyGen.mock.calls[0]![2]).not.toHaveProperty('model')
  })

  it('leaves the note out when no ignored option was passed', async () => {
    const r = await generateImageTool(
      writeSettings({ media: keyMedia({ imageProvider: 'openai' }, 'openai') }),
      { prompt: 'a logo' },
    )
    expect(r).not.toHaveProperty('note')
  })

  it('refuses reference images on the Codex backend instead of dropping them', async () => {
    const r = await generateImageTool(
      writeSettings(),
      { prompt: 'make it blue', referenceImageUrls: [dataUrl(8)] },
      { context: screen(status('codex', 'ready')) },
    )
    expect(r.url).toBeUndefined()
    expect(r.error).toMatch(/reference/i)
    expect(codexGen).not.toHaveBeenCalled()
  })
})

describe('generate_image input checks', () => {
  it('rejects an empty prompt before choosing a backend', async () => {
    const r = await generateImageTool(writeSettings(), { prompt: '   ' })
    expect(r).toEqual({ error: 'prompt must not be empty' })
  })

  it('still bounds the reference count on the key route', async () => {
    const r = await generateImageTool(
      writeSettings({ media: keyMedia({ imageProvider: 'openai' }, 'openai') }),
      { prompt: 'a logo', referenceImageUrls: Array.from({ length: 13 }, () => dataUrl(8)) },
    )
    expect(r.error).toBe(
      'Too many media items in one request (13, limit 12); analyze them in smaller batches',
    )
    expect(keyGen).not.toHaveBeenCalled()
  })
})
