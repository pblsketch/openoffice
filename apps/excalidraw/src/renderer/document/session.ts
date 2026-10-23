/**
 * One open drawing: the engine document and what the canvas reports.
 *
 * The canvas calls back on every change, also for selection, scrolling and
 * zoom. A change counts only when the elements' versions or one of the saved
 * canvas settings differ from the last saved state. The first report after
 * loading is the baseline: the drawing library rebuilds every element it
 * loads, and that alone is not an edit.
 *
 * A drawing nobody changed is saved as the original bytes. Once changed, a
 * save writes the scene the canvas reports, with only the canvas settings
 * that changed merged over the stored ones.
 */
import type {
  DrawingDocument,
  DrawingElement,
  DrawingFormat,
  DrawingScene,
} from '@genoffice/excalidraw-engine'

/** The canvas settings a file keeps; everything else in the app state is the view. */
export const SAVED_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'gridSize',
  'gridStep',
  'gridModeEnabled',
] as const

export interface LiveScene {
  elements: readonly DrawingElement[]
  appState: Readonly<Record<string, unknown>>
  files: Readonly<Record<string, unknown>>
}

/** Hashes the elements' versions; order matters. The drawing library's `hashElementsVersion` in the app. */
export type ElementsFingerprint = (elements: readonly DrawingElement[]) => number

function savedSettings(appState: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of SAVED_APP_STATE_KEYS) {
    if (key in appState) out[key] = appState[key]
  }
  return out
}

function fingerprintOf(scene: LiveScene, hash: ElementsFingerprint): string {
  return `${hash(scene.elements)}|${JSON.stringify(savedSettings(scene.appState))}`
}

export class DrawingSession {
  readonly document: DrawingDocument
  readonly #hash: ElementsFingerprint
  /** the canvas settings as first reported: only the ones that differ from these are saved */
  #openedSettings: Record<string, unknown> | null = null
  #openedFingerprint: string | null = null
  #savedFingerprint: string | null = null
  #latest: LiveScene | null = null
  #listeners = new Set<() => void>()

  constructor(document: DrawingDocument, hash: ElementsFingerprint) {
    this.document = document
    this.#hash = hash
  }

  get format(): DrawingFormat {
    return this.document.format
  }

  /** The scene to load the canvas with. */
  initialScene(): DrawingScene {
    return this.document.scene()
  }

  /** Unsaved changes since the drawing opened or was last saved. */
  get dirty(): boolean {
    if (!this.#latest || this.#savedFingerprint === null) return false
    return fingerprintOf(this.#latest, this.#hash) !== this.#savedFingerprint
  }

  /** Changed at all since it opened: a save writes the scene instead of the original bytes. */
  get changedSinceOpen(): boolean {
    if (!this.#latest || this.#openedFingerprint === null) return false
    return fingerprintOf(this.#latest, this.#hash) !== this.#openedFingerprint
  }

  /** The canvas reported its state. The first report is the baseline. */
  update(scene: LiveScene): void {
    const wasDirty = this.dirty
    this.#latest = scene
    if (this.#openedFingerprint === null) {
      const fingerprint = fingerprintOf(scene, this.#hash)
      this.#openedFingerprint = fingerprint
      this.#savedFingerprint = fingerprint
      this.#openedSettings = savedSettings(scene.appState)
    }
    if (this.dirty !== wasDirty) this.#listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** The bytes a save writes now. */
  produceBytes(): Uint8Array {
    const latest = this.#latest
    if (!latest || !this.changedSinceOpen) return this.document.save(null)
    const opened = this.#openedSettings ?? {}
    const changed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(savedSettings(latest.appState))) {
      if (JSON.stringify(value) !== JSON.stringify(opened[key])) changed[key] = value
    }
    return this.document.save({
      elements: latest.elements,
      appState: Object.keys(changed).length > 0 ? changed : undefined,
      files: { ...latest.files },
    })
  }

  /** The bytes produced at `fingerprint` reached the disk. */
  markWritten(fingerprint: string): void {
    const wasDirty = this.dirty
    this.#savedFingerprint = fingerprint
    if (this.dirty !== wasDirty) this.#listeners.forEach((listener) => listener())
  }

  /** The state a save is about to write, to hand back to `markWritten` once it landed. */
  currentFingerprint(): string | null {
    return this.#latest ? fingerprintOf(this.#latest, this.#hash) : null
  }
}
