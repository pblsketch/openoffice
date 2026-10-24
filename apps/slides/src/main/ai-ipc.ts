/**
 * AI IPC for the slides main process, extracted from slides-main.ts:
 * settings persistence, the streaming proxy (main process does the networking
 * to avoid renderer CORS), search tools, and the slides-only ai:* channels
 * (image generation, media analysis, style templates).
 */
import { app, ipcMain, nativeImage, net, webContents } from 'electron'
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  sanitizeAiSettings,
  setAiUserAgent,
  setRescueFetch,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  sealAiSecrets,
} from '@genoffice/ai-provider'
import { shutdownCodexAppServers } from '@genoffice/ai-provider/codex-app-server'
import {
  ensureSubscriptionIpc,
  sharedSubscriptionStatuses,
} from '@genoffice/ai-provider/subscription'
import {
  abortOnDestroyed,
  MAX_REMOTE_IMAGE_BYTES,
  fetchRemoteImage,
  readBodyCapped,
  writeJsonAtomic,
} from '@genoffice/electron-utils'
import {
  webSearchTool,
  imageSearchTool,
  readUrlTool,
  generateImageTool,
  analyzeMediaTool,
  aiToolCapabilities,
  abortMediaCalls,
  documentMediaRoots,
  withMediaCallSignal,
  type AiToolCallContext,
  type AiToolCapabilities,
} from '@genoffice/ai-search'
import { getUiLang, PRODUCT_NAME } from '@genoffice/i18n'
import { addPicture, editPictureSrcRect, replacePictureBytes } from '@genoffice/pptx-engine'
import { rasterImageExt } from './media-mime'
import { matchesElementRef } from '@genoffice/pptx-engine/identity'
import { coverCropFractions } from '@genoffice/pipelines/slides'
import { aiSubscriptionLoginWindowText } from '@genoffice/ui/ai-subscription-login-window'
import type { AiRunFailure } from '../shared/ipc'
import { EMU_PER_PX_96 } from '@genoffice/pptx-render'
import { runAiStream, storedAiSettings, withMeteredAccepted } from './ai-stream'
import { tm } from './i18n-main'
import { pushHistory, rebuildSlide, scheduleHistoryNotify, sessions } from './session-state'
import { registerTemplateSelectionIpc } from './template-selection-ipc'

// ---- AI settings + streaming proxy (the main process does the networking to avoid renderer CORS; implementation shared via @genoffice/ai-provider) ----

const AI_SETTINGS_PATH = () => join(app.getPath('userData'), 'ai-settings.json')

/**
 * Local media roots for a slides renderer: the open deck's directory plus the
 * directory slides stages pasted images in. generate_image (referenceImageUrls)
 * and analyze_media (mediaUrls) both take paths straight from the model, so
 * only these two directories are readable — a reference or a media file the
 * user put next to the deck they are editing, and nothing else.
 */
function slidesMediaRoots(wcId: number): string[] {
  return documentMediaRoots(sessions.get(wcId)?.path, join(app.getPath('temp'), 'genoffice-pasted'))
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    /* Corrupted state file: fall back to defaults */
  }
  return fallback
}

/** ai-settings.json as the app reads it (an old or damaged file falls to the defaults) */
function readAiSettings(): AiSettings {
  return storedAiSettings(readJson<unknown>(AI_SETTINGS_PATH(), {}))
}

/** Who is asking the image/media tools: a window of this process, with its subscription connections */
function screenToolContext(): AiToolCallContext {
  return { path: 'screen', statuses: sharedSubscriptionStatuses() }
}

function broadcastToWindows(channel: string, payload?: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue
    if (payload === undefined) wc.send(channel)
    else wc.send(channel, payload)
  }
}

const activeAiStreams = new Map<string, AbortController>()

// ---- Post-mortem log for runs that produced no usable reply ----

const AI_RUN_FAILURES_PATH = () => join(app.getPath('userData'), 'ai-run-failures.jsonl')
/** Enough of a repetition blowup to recognize the pattern, without storing megabytes */
const RUN_FAILURE_TEXT_MAX = 20_000
/** Rotated (one generation kept) rather than grown without bound */
const RUN_FAILURES_MAX_BYTES = 2_000_000

function appendRunFailure(entry: AiRunFailure): void {
  const path = AI_RUN_FAILURES_PATH()
  try {
    if (existsSync(path) && statSync(path).size > RUN_FAILURES_MAX_BYTES) {
      renameSync(path, `${path}.1`)
    }
    const record = {
      ts: new Date().toISOString(),
      ...entry,
      instruction: entry.instruction.slice(0, RUN_FAILURE_TEXT_MAX),
      streamed: entry.streamed.slice(0, RUN_FAILURE_TEXT_MAX),
      streamedChars: entry.streamed.length,
    }
    appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8')
  } catch {
    /* Diagnostics must never break a run */
  }
}

export function registerAiIpc(): void {
  app.once('before-quit', shutdownCodexAppServers)
  // Node fetch (undici) direct connections get reset under VPN/tun setups; retry over Chromium's stack
  setRescueFetch((url, init) => net.fetch(url, init))
  setAiUserAgent(`${PRODUCT_NAME}/${app.getVersion()}`)

  ipcMain.handle('ai:get-settings', (): AiSettings => readAiSettings())

  // Subscription connections (Claude, Codex): status, sign-in, install. Registered once per
  // process, whichever editor's main asks first.
  ensureSubscriptionIpc(ipcMain, {
    getSettings: readAiSettings,
    setMeteredAccepted: (provider, accepted) => {
      writeJsonAtomic(
        AI_SETTINGS_PATH(),
        sealAiSecrets(withMeteredAccepted(readAiSettings(), provider, accepted)),
      )
      broadcastToWindows('ai:settings-changed')
    },
    dataDir: app.getPath('userData'),
    broadcast: broadcastToWindows,
    loginWindowText: (provider) => aiSubscriptionLoginWindowText(getUiLang(), provider),
  })

  ipcMain.handle('ai:set-settings', (_event, settings: AiSettings) => {
    // SECURITY.md: payloads are schema-checked in the main process. The settings
    // file feeds cliPath into spawn() and baseUrl receives the provider's API key,
    // so the renderer's copy is sanitized before it touches disk.
    const sanitized = sanitizeAiSettings(settings)
    if (!sanitized) {
      console.warn('[ai] rejected invalid ai:set-settings payload')
      return
    }
    writeJsonAtomic(AI_SETTINGS_PATH(), sealAiSecrets(sanitized))
    broadcastToWindows('ai:settings-changed')
  })

  ipcMain.handle('ai:log-run-failure', (_event, entry: AiRunFailure) => {
    appendRunFailure(entry)
  })

  ipcMain.handle('ai:stream', async (event, request: AiStreamRequest) => {
    // per-request settings get the same schema check as the persisted ones: a
    // compromised renderer could otherwise hand cliPath/baseUrl straight to
    // the provider layer without ever touching the settings file
    const settings = sanitizeAiSettings(request.settings)
    if (!settings) {
      event.sender.send('ai:stream-chunk', {
        requestId: request.requestId,
        type: 'error',
        error: 'invalid AI settings payload',
      } satisfies AiStreamChunk)
      return
    }
    const { requestId } = request
    const send = (chunk: AiStreamChunk) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:stream-chunk', chunk)
    }
    const controller = new AbortController()
    activeAiStreams.set(requestId, controller)
    const unwatchSender = abortOnDestroyed(event.sender, controller)
    try {
      await runAiStream({
        request,
        settings,
        statuses: sharedSubscriptionStatuses(),
        signal: controller.signal,
        send,
      })
    } finally {
      unwatchSender()
      activeAiStreams.delete(requestId)
    }
  })

  ipcMain.handle('ai:stream-cancel', (event, requestId: string) => {
    activeAiStreams.get(requestId)?.abort()
    // Stop while a tool runs names a turn that already ended: end the window's media calls too
    abortMediaCalls(event.sender.id)
  })

  // Search tools (content + images), Serper with DuckDuckGo fallback
  ipcMain.handle('ai:web-search', async (_event, query: string, maxResults?: number) => {
    try {
      return await webSearchTool(
        AI_SETTINGS_PATH(),
        String(query),
        typeof maxResults === 'number' ? maxResults : 6,
      )
    } catch (err) {
      return { results: [], method: 'error', error: String(err) }
    }
  })

  // Read one web page as text (the read_url tool), paged by character offset.
  // A long download ends with the window or when the window's AI run is stopped.
  ipcMain.handle('ai:read-url', async (event, url: string, offset?: number) => {
    try {
      return await withMediaCallSignal(event.sender, (signal) =>
        readUrlTool(AI_SETTINGS_PATH(), String(url), typeof offset === 'number' ? offset : 0, {
          signal,
        }),
      )
    } catch {
      return { ok: false, error: 'The read failed.', errorCode: 'network' }
    }
  })

  ipcMain.handle('ai:image-search', async (_event, query: string, maxResults?: number) => {
    try {
      return await imageSearchTool(
        AI_SETTINGS_PATH(),
        String(query),
        typeof maxResults === 'number' ? maxResults : 8,
      )
    } catch (err) {
      return { images: [], method: 'error', error: String(err) }
    }
  })
}

// ── ai:* handlers unique to slides ──────────────────────────────────────
// Must be registered inside registerSlidesIpc (not registerAiIpc): in shell aggregate mode the
// generic ai:* channels are registered by docs-main.registerAiIpc, and slides' registerAiIpc is
// never called; docs does not have these channels, so putting them in the wrong place raises
// "No handler registered".
export function registerSlidesOnlyAiIpc(): void {
  // The design template remembered per document (slides:ai-template-selection-get / -set)
  registerTemplateSelectionIpc()

  // What the search/image/media tools can do right now (settings + subscription connections):
  // the renderer offers the model only the tools that have a route.
  ipcMain.handle('slides:ai-tool-capabilities', (): AiToolCapabilities =>
    aiToolCapabilities(readAiSettings(), screenToolContext()),
  )

  // AI image generation / media analysis. Answers with an error text when no route is available.
  // Either call ends with its window, or when the window's AI run is stopped.
  ipcMain.handle(
    'ai:generate-image',
    async (
      event,
      op: {
        prompt: string
        model?: string
        referenceImageUrls?: string[]
        aspectRatio?: string
        imageSize?: string
        transparentBackground?: boolean
      },
    ) => {
      return withMediaCallSignal(event.sender, (signal) =>
        generateImageTool(
          AI_SETTINGS_PATH(),
          {
            prompt: String(op.prompt),
            model: op.model ? String(op.model) : undefined,
            referenceImageUrls: Array.isArray(op.referenceImageUrls)
              ? op.referenceImageUrls.map(String)
              : undefined,
            aspectRatio: op.aspectRatio ? String(op.aspectRatio) : undefined,
            imageSize: op.imageSize ? String(op.imageSize) : undefined,
            transparentBackground: op.transparentBackground === true,
          },
          { mediaRoots: slidesMediaRoots(event.sender.id), context: screenToolContext(), signal },
        ),
      )
    },
  )

  ipcMain.handle(
    'ai:analyze-media',
    async (event, op: { mediaUrls: string[]; requirements: string }) => {
      return withMediaCallSignal(event.sender, (signal) =>
        analyzeMediaTool(
          AI_SETTINGS_PATH(),
          {
            mediaUrls: (op.mediaUrls ?? []).map(String),
            requirements: String(op.requirements ?? ''),
          },
          { mediaRoots: slidesMediaRoots(event.sender.id), context: screenToolContext(), signal },
        ),
      )
    },
  )

  /** Bytes of a user attachment the renderer resolved (attachment://): keep
   *  pptx-native formats as-is, convert anything else (webp/bmp/…) to PNG. */
  const attachmentImageBytes = (
    base64: string,
    ext: string,
  ): { buf: Buffer; ext: string } | null => {
    const buf = Buffer.from(String(base64), 'base64')
    if (!buf.length) return null
    const norm = String(ext)
      .toLowerCase()
      .replace(/^jpeg$/, 'jpg')
    if (norm === 'png' || norm === 'gif' || norm === 'jpg') return { buf, ext: norm }
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return null
    return { buf: img.toPNG(), ext: 'png' }
  }

  // Download an image from a URL and insert it into the given page (image search -> insert in one step; download in the main process avoids CORS)
  ipcMain.handle(
    'ai:insert-image-url',
    async (
      e,
      op: {
        slideIndex: number
        url?: string
        /** raw base64 of a user attachment (attachment:// reference) — no network fetch */
        base64?: string
        ext?: string
        xPx: number
        yPx: number
        wPx: number
        hPx: number
        fitWidthPx: number
      },
    ) => {
      const session = sessions.get(e.sender.id)
      if (!session) return null
      const slide = session.opened.deck.slides[op.slideIndex]
      if (!slide) return null
      try {
        let buf: Buffer
        let ext: string
        if (op.base64 != null) {
          const decoded = attachmentImageBytes(op.base64, op.ext ?? '')
          if (!decoded) return null
          ;({ buf, ext } = decoded)
        } else {
          // the URL originates from AI tool calls (prompt-injectable via image
          // search results), so refuse non-http schemes and private/link-local
          // targets; redirects are followed manually so every hop is validated.
          // fetchRemoteImage adds CDN-friendly headers and transient-error retries.
          const resp = await fetchRemoteImage(String(op.url))
          if (!resp || !resp.ok) return null
          buf = Buffer.from(await readBodyCapped(resp, MAX_REMOTE_IMAGE_BYTES))
          // magic bytes decide: a header-informed extension would happily store
          // an HTML error page (or an attacker "image") as a .jpg in the deck
          const kind = rasterImageExt(buf)
          if (!kind) return null
          ext = kind
        }
        const baseWidthPx = session.opened.deck.size.cx / EMU_PER_PX_96
        const scale = op.fitWidthPx / baseWidthPx
        const toEmu = (px: number) => Math.round((px / scale) * EMU_PER_PX_96)
        pushHistory(session)
        const el = addPicture(session.opened, slide, {
          bytes: new Uint8Array(buf),
          ext,
          offset: {
            x: toEmu(op.xPx),
            y: toEmu(op.yPx),
            cx: Math.max(1, toEmu(op.wPx)),
            cy: Math.max(1, toEmu(op.hPx)),
          },
        })
        if (!el) {
          session.undoStack.pop()
          scheduleHistoryNotify(session)
          return null
        }
        // The requested frame rarely matches the image's aspect ratio; never
        // stretch — fill the frame and center-crop the overflow (object-fit:
        // cover) so the layout box stays exactly where the model placed it.
        const natural = nativeImage.createFromBuffer(buf).getSize()
        const crop = coverCropFractions(natural.width, natural.height, op.wPx, op.hPx)
        if (crop) editPictureSrcRect(slide, el.id, crop)
        session.fitWidthPx = op.fitWidthPx
        const rebuilt = rebuildSlide(session, op.slideIndex)
        return rebuilt ? { slide: rebuilt, sourceId: el.id } : null
      } catch {
        return null
      }
    },
  )

  // Download an image from a URL and swap it into an existing picture in place
  // (frame/z-order/effects survive). Same URL hardening as ai:insert-image-url.
  ipcMain.handle(
    'ai:replace-picture-url',
    async (
      e,
      op: {
        slideIndex: number
        sourceId: string
        url?: string
        /** raw base64 of a user attachment (attachment:// reference) — no network fetch */
        base64?: string
        ext?: string
        keepSrcRect?: boolean
      },
    ) => {
      const session = sessions.get(e.sender.id)
      if (!session) return null
      const slide = session.opened.deck.slides[op.slideIndex]
      if (!slide) return null
      // The AI layer may address the picture by its durable id — translate to the
      // parse-time id the engine matches
      const targetId =
        slide.elements.find((el) => matchesElementRef(el, String(op.sourceId)))?.id ??
        String(op.sourceId)
      try {
        let buf: Buffer
        let ext: string
        if (op.base64 != null) {
          const decoded = attachmentImageBytes(op.base64, op.ext ?? '')
          if (!decoded) return null
          ;({ buf, ext } = decoded)
        } else {
          const resp = await fetchRemoteImage(String(op.url))
          if (!resp || !resp.ok) return null
          buf = Buffer.from(await readBodyCapped(resp, MAX_REMOTE_IMAGE_BYTES))
          const kind = rasterImageExt(buf)
          if (!kind) return null
          ext = kind
        }
        pushHistory(session)
        const ok = replacePictureBytes(
          session.opened,
          slide,
          targetId,
          new Uint8Array(buf),
          ext,
          op.keepSrcRect ? { keepSrcRect: true } : undefined,
        )
        if (!ok) {
          session.undoStack.pop()
          scheduleHistoryNotify(session)
          return null
        }
        // A replacement with a different aspect ratio would be stretched into
        // the surviving frame — center-crop it to cover the frame instead.
        if (!op.keepSrcRect) {
          const pic = slide.elements.find((el) => el.id === targetId && el.type === 'picture')
          const frame = pic?.transform?.offset
          if (frame) {
            const natural = nativeImage.createFromBuffer(buf).getSize()
            const crop = coverCropFractions(natural.width, natural.height, frame.cx, frame.cy)
            if (crop) editPictureSrcRect(slide, targetId, crop)
          }
        }
        return rebuildSlide(session, op.slideIndex)
      } catch {
        return null
      }
    },
  )

  // ── Style Skill sidecar persistence: write a same-named .styleskill.json next to the draft (fail-open)
  ipcMain.handle(
    'ai:save-sidecar',
    async (
      event,
      data: { topic: string; styleSkill: string; createdAt: string },
    ): Promise<{ ok: boolean }> => {
      try {
        const session = sessions.get(event.sender.id)
        const draftPath = session?.path
        if (!draftPath || !draftPath.endsWith('.pptx')) return { ok: false }
        const sidecarPath = draftPath.replace(/\.pptx$/i, '.styleskill.json')
        writeFileSync(sidecarPath, JSON.stringify(data, null, 2))
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  )

  // ── Style template save: stored in userData/style-templates/<name>.json
  const STYLE_TEMPLATES_DIR = () => join(app.getPath('userData'), 'style-templates')
  /** A saved style's `basedOn` as it is stored and answered: a non-empty id, or nothing */
  const savedStyleBasedOn = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined

  ipcMain.handle(
    'ai:save-style-template',
    async (
      _event,
      name: string,
      data: {
        topic: string
        styleSkill: string
        createdAt: string
        layout?: unknown
        basedOn?: unknown
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const dir = STYLE_TEMPLATES_DIR()
        // Filename: replace illegal characters in the name with _ then truncate to 64 chars
        const safeName = name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 64)
        if (!safeName) return { ok: false, error: tm('errTplNameInvalid') }
        // `layout` (the deck's chrome skeleton) rides along verbatim when present.
        // `basedOn` (the id of the built-in design template the style was saved
        // from) is optional: it is written only when it is one, so every other
        // style's file stays as it always was.
        const { basedOn: rawBasedOn, ...rest } = data
        const basedOn = savedStyleBasedOn(rawBasedOn)
        writeJsonAtomic(join(dir, `${safeName}.json`), {
          ...rest,
          ...(basedOn ? { basedOn } : {}),
          name: safeName,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // ── Style template list
  ipcMain.handle(
    'ai:list-style-templates',
    (): Array<{ name: string; topic: string; createdAt: string }> => {
      try {
        const dir = STYLE_TEMPLATES_DIR()
        if (!existsSync(dir)) return []
        const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
        return files
          .map((f) => {
            try {
              const raw = readJson<{
                name?: string
                topic?: string
                createdAt?: string
                styleSkill?: string
              }>(join(dir, f), {})
              return {
                name: raw.name ?? f.replace(/\.json$/, ''),
                topic: raw.topic ?? '',
                createdAt: raw.createdAt ?? '',
              }
            } catch {
              return null
            }
          })
          .filter(Boolean) as Array<{ name: string; topic: string; createdAt: string }>
      } catch {
        return []
      }
    },
  )

  // ── Style template load
  ipcMain.handle(
    'ai:load-style-template',
    (
      _event,
      name: string,
    ): {
      ok: boolean
      styleSkill?: string
      topic?: string
      layout?: unknown
      basedOn?: string
      error?: string
    } => {
      try {
        const dir = STYLE_TEMPLATES_DIR()
        const safeName = name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 64)
        const filePath = join(dir, `${safeName}.json`)
        if (!existsSync(filePath)) return { ok: false, error: tm('errTplMissing', { name }) }
        const raw = readJson<{
          styleSkill?: string
          topic?: string
          layout?: unknown
          basedOn?: unknown
        }>(filePath, {})
        if (!raw.styleSkill) return { ok: false, error: tm('errTplNoSkill', { name }) }
        // absent in files saved before the field existed, and in styles not saved from a template
        const basedOn = savedStyleBasedOn(raw.basedOn)
        return {
          ok: true,
          styleSkill: raw.styleSkill,
          topic: raw.topic ?? '',
          ...(raw.layout !== undefined && raw.layout !== null ? { layout: raw.layout } : {}),
          ...(basedOn ? { basedOn } : {}),
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )
}
