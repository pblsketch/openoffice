/**
 * Where the other people in a shared map are: each publishes the sheet on
 * screen and the topics selected on it, and everyone else draws a frame in
 * that person's colour around those topics, with the name over the first.
 *
 * The frames live in a layer of their own inside the map's canvas, beside the
 * drawing rather than in it: they pan and zoom with the map, and the copy of
 * the drawing that export, print and the preview picture take never holds
 * them. Colours are the session's tokens (`styles.css`).
 */
import { collabColorVar, type CollabSession, type CollabUser } from '@genoffice/collab'
import { collabColorOf } from '@genoffice/electron-utils/collab-channels'
import type { DocumentSession } from '../document/session'
import type { MapController } from '../map/controller'
import { sheetIdOf } from './binding'

/** The awareness field this editor publishes. */
export const PRESENCE_FIELD = 'mindmap'
/** A selection longer than this is shown by its first topics only. */
const MAX_TOPICS = 200

export interface MapPresenceValue {
  sheet: string | null
  index: number
  topics: string[]
}

export interface MapPresenceHost {
  controllers(): ReadonlyMap<string, MapController>
  activeKey(): string | null
}

const LAYER_CLASS = 'mm-collab-layer'

function readPresence(value: unknown): MapPresenceValue | null {
  if (typeof value !== 'object' || value === null) return null
  const { sheet, index, topics } = value as Record<string, unknown>
  if (sheet !== null && typeof sheet !== 'string') return null
  if (typeof index !== 'number' || !Number.isSafeInteger(index)) return null
  if (!Array.isArray(topics)) return null
  const ids = topics.filter((id): id is string => typeof id === 'string').slice(0, MAX_TOPICS)
  return { sheet, index, topics: ids }
}

export class MapPresence {
  readonly #collab: CollabSession
  readonly #session: DocumentSession
  readonly #host: MapPresenceHost
  /** the drawings this follows, and how to stop */
  readonly #followed = new Map<MapController, () => void>()
  readonly #offPeers: () => void
  #published = ''

  constructor(collab: CollabSession, session: DocumentSession, host: MapPresenceHost) {
    this.#collab = collab
    this.#session = session
    this.#host = host
    this.#offPeers = collab.onPeersChanged(() => this.render())
    this.publish()
    this.render()
  }

  /** Tells the others where this person is now: the sheet on screen and what is selected on it. */
  publish(): void {
    const key = this.#host.activeKey()
    const index = key ? this.#session.indexOf(key) : -1
    const value: MapPresenceValue | null =
      key && index >= 0
        ? {
            sheet: sheetIdOf(this.#session, key),
            index,
            topics: (this.#host.controllers().get(key)?.selectedTopicIds() ?? []).slice(
              0,
              MAX_TOPICS,
            ),
          }
        : null
    const text = JSON.stringify(value)
    if (text === this.#published) return
    this.#published = text
    this.#collab.setPresence(PRESENCE_FIELD, value)
  }

  /** Draws everyone else's frames on every sheet that has a drawing. */
  render(): void {
    const controllers = this.#host.controllers()
    for (const [controller, stop] of this.#followed) {
      if ([...controllers.values()].includes(controller)) continue
      stop()
      this.#followed.delete(controller)
    }
    for (const [key, controller] of controllers) {
      this.#follow(key, controller)
      this.#draw(key, controller)
    }
  }

  dispose(): void {
    this.#offPeers()
    for (const [controller, stop] of this.#followed) {
      stop()
      controller.mind.map?.querySelector(`.${LAYER_CLASS}`)?.remove()
    }
    this.#followed.clear()
  }

  /** The topics move whenever the library draws the lines again: the frames move with them. */
  #follow(key: string, controller: MapController): void {
    if (this.#followed.has(controller)) return
    const bus = controller.mind.bus
    const redraw = (): void => this.#draw(key, controller)
    bus.addListener('linkDiv', redraw)
    this.#followed.set(controller, () => {
      try {
        bus.removeListener('linkDiv', redraw)
      } catch {
        // the drawing is gone already
      }
    })
  }

  #draw(key: string, controller: MapController): void {
    const { mind } = controller
    const canvas = mind.map
    if (!canvas || this.#session.indexOf(key) < 0) return
    let layer = canvas.querySelector<HTMLElement>(`:scope > .${LAYER_CLASS}`)
    if (!layer) {
      layer = document.createElement('div')
      layer.className = LAYER_CLASS
      layer.setAttribute('aria-hidden', 'true')
      canvas.append(layer)
    }
    layer.replaceChildren()
    const area = canvas.getBoundingClientRect()
    // a hidden sheet measures as nothing; it is drawn again when it is shown
    if (area.width === 0 && area.height === 0) return
    const scale = mind.scaleVal || 1
    const sheet = sheetIdOf(this.#session, key)
    const index = this.#session.indexOf(key)
    for (const { user, value: raw } of this.#collab.presences<unknown>(PRESENCE_FIELD)) {
      const value = readPresence(raw)
      if (!value) continue
      if (sheet !== null || value.sheet !== null ? value.sheet !== sheet : value.index !== index)
        continue
      let named = false
      for (const id of value.topics) {
        const topic = findTopic(controller, id)
        if (!topic) continue
        const box = topic.getBoundingClientRect()
        const frame = document.createElement('div')
        frame.className = 'mm-collab-frame'
        frame.style.setProperty('--collab-c', colorOf(user))
        frame.style.left = `${(box.left - area.left) / scale}px`
        frame.style.top = `${(box.top - area.top) / scale}px`
        frame.style.width = `${box.width / scale}px`
        frame.style.height = `${box.height / scale}px`
        if (!named) {
          const name = document.createElement('span')
          name.className = 'mm-collab-name'
          name.textContent = typeof user.name === 'string' ? user.name : ''
          frame.append(name)
          named = true
        }
        layer.append(frame)
      }
    }
  }
}

function colorOf(user: CollabUser): string {
  return collabColorVar(collabColorOf(user.palette))
}

function findTopic(controller: MapController, id: string): HTMLElement | null {
  try {
    const topic = controller.mind.findEle(id)
    return topic?.isConnected ? topic : null
  } catch {
    // folded away, or not on this sheet
    return null
  }
}
