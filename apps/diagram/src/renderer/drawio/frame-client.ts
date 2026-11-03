/**
 * The host side of the draw.io frame: draw.io's embed protocol and our
 * bridge's requests and events, over `postMessage` (spec 6).
 *
 * Only messages from the frame's own window and the draw.io origin are read;
 * everything goes to the draw.io origin, never to `*`. Requests to the bridge
 * and draw.io's exports are answered by id, one export at a time.
 */
import {
  DRAWIO_ORIGIN,
  isFromDrawioFrame,
  parseBridgeMessage,
  parseEmbedEvent,
  type BridgeEvent,
  type BridgeOp,
  type BridgeOps,
  type EmbedEvent,
} from '../../shared/bridge-protocol'
import type { DrawioFileExport } from '../../shared/formats'

export interface FrameHandlers {
  /** draw.io is ready for a diagram (`init`) */
  onInit(): void
  /** draw.io finished loading the diagram it was given */
  onLoad(event: EmbedEvent): void
  /** draw.io's own Save (button or menu) */
  onSave(): void
  onBridgeEvent(event: BridgeEvent): void
}

/** The window the frame talks to; a test passes a fake. */
export interface FrameWindowLike {
  postMessage(message: unknown, targetOrigin: string): void
}

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 60_000

export class DrawioFrame {
  #window: FrameWindowLike | null = null
  #handlers: FrameHandlers
  #pending = new Map<string, Pending>()
  #exports = new Map<string, Pending>()
  #next = 0
  #exportQueue: Promise<unknown> = Promise.resolve()
  #listener = (event: MessageEvent): void => this.receive(event)

  constructor(
    handlers: FrameHandlers,
    private readonly host: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  ) {
    this.#handlers = handlers
    host.addEventListener('message', this.#listener)
  }

  /** The frame's window, once the frame exists (and again after it reloads). */
  attach(frameWindow: FrameWindowLike | null): void {
    this.#window = frameWindow
  }

  dispose(): void {
    this.host.removeEventListener('message', this.#listener)
    this.failAll(new Error('the editor closed'))
  }

  /** The frame is going away (a reload for a new language): every waiting call fails. */
  failAll(error: Error): void {
    for (const map of [this.#pending, this.#exports]) {
      for (const pending of map.values()) {
        clearTimeout(pending.timer)
        pending.reject(error)
      }
      map.clear()
    }
  }

  /** Handles one window message; exposed for tests. */
  receive(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>): void {
    if (!isFromDrawioFrame(event, this.#window)) return
    const ours = parseBridgeMessage(event.data)
    if (ours) {
      if (ours.kind === 'reply') {
        const pending = this.#pending.get(ours.id)
        if (!pending) return
        this.#pending.delete(ours.id)
        clearTimeout(pending.timer)
        if (ours.ok) pending.resolve(ours.value)
        else pending.reject(new Error(ours.error))
      } else if (ours.kind === 'event') {
        const { ieum: _tag, kind: _kind, ...rest } = ours
        this.#handlers.onBridgeEvent(rest as BridgeEvent)
      }
      return
    }
    const embed = parseEmbedEvent(event.data)
    if (!embed) return
    switch (embed.event) {
      case 'init':
        this.#handlers.onInit()
        return
      case 'load':
        this.#handlers.onLoad(embed)
        return
      case 'save':
        this.#handlers.onSave()
        return
      case 'export': {
        const message = embed.message as { ieumId?: unknown } | undefined
        const id = typeof message?.ieumId === 'string' ? message.ieumId : null
        const pending = id ? this.#exports.get(id) : undefined
        if (!pending || !id) return
        this.#exports.delete(id)
        clearTimeout(pending.timer)
        pending.resolve(embed)
        return
      }
    }
  }

  #post(message: unknown): void {
    if (!this.#window) throw new Error('the editor is not there')
    this.#window.postMessage(message, DRAWIO_ORIGIN)
  }

  /** draw.io's embed actions (`load`, `export`, …), as the JSON string it reads. */
  sendEmbed(action: Record<string, unknown>): void {
    this.#post(JSON.stringify(action))
  }

  request<K extends BridgeOp>(
    op: K,
    args: BridgeOps[K]['request'],
  ): Promise<BridgeOps[K]['reply']> {
    const id = `r${++this.#next}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`the editor did not answer ${op}`))
      }, REQUEST_TIMEOUT_MS)
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      try {
        this.#post({ ieum: 1, kind: 'request', id, op, args })
      } catch (err) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /** One of draw.io's embed exports, answered by its `export` event. Runs one at a time. */
  exportEmbed(action: Record<string, unknown>): Promise<EmbedEvent> {
    const run = (): Promise<EmbedEvent> => {
      const id = `x${++this.#next}`
      return new Promise<EmbedEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#exports.delete(id)
          reject(new Error('the editor did not export'))
        }, REQUEST_TIMEOUT_MS)
        this.#exports.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
        try {
          this.sendEmbed({ action: 'export', ieumId: id, ...action })
        } catch (err) {
          clearTimeout(timer)
          this.#exports.delete(id)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    }
    const result = this.#exportQueue.then(run, run)
    this.#exportQueue = result.catch(() => undefined)
    return result
  }

  /**
   * The bytes a save writes in a format: draw.io's own serialization
   * (`xml`, `xmlsvg`, `xmlpng`), pages compressed when `compressed`.
   * `.drawio.svg` uses draw.io's automatic theme so the bytes are the same
   * whatever the app's theme.
   */
  async serialize(kind: DrawioFileExport, compressed: boolean): Promise<Uint8Array> {
    await this.request('setCompressed', { compressed })
    if (kind === 'xml') {
      const event = await this.exportEmbed({ format: 'xml' })
      const xml = typeof event.xml === 'string' ? event.xml : ''
      if (!xml) throw new Error('the editor gave no diagram')
      return new TextEncoder().encode(xml)
    }
    if (kind === 'xmlsvg') {
      const event = await this.exportEmbed({ format: 'xmlsvg', asText: true, theme: 'auto' })
      const svg = typeof event.data === 'string' ? event.data : ''
      if (!svg.trimStart().startsWith('<')) throw new Error('the editor gave no SVG')
      return new TextEncoder().encode(svg)
    }
    const event = await this.exportEmbed({ format: 'xmlpng' })
    return dataUrlBytes(typeof event.data === 'string' ? event.data : '')
  }
}

/** The bytes of a base64 `data:` URL. */
export function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0 || !url.slice(0, comma).endsWith(';base64')) {
    throw new Error('not a base64 data URL')
  }
  return base64Bytes(url.slice(comma + 1))
}

export function base64Bytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
