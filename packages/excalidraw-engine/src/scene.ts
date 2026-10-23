/**
 * The scene JSON: checking what a file holds, reading it for the editor and
 * building what a changed save writes.
 *
 * The stored object is kept whole. A save replaces its `elements`, merges the
 * editor's app state over the stored one and adds pictures the scene now
 * uses; every other key, and every key inside the kept parts, stays.
 */
import { elementSourceText } from './note-sections'
import type { DrawingElement, DrawingScene, SceneEdit } from './types'

export type SceneObject = Record<string, unknown> & { elements: DrawingElement[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isElement(value: unknown): value is DrawingElement {
  return isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string'
}

/**
 * A parsed value as a scene, or why it is not one. `type` is checked only
 * when present: the plugin's oldest notes and some exports leave it out.
 */
export function asScene(value: unknown): SceneObject | 'not-a-drawing' | 'unreadable' {
  if (!isRecord(value)) return 'not-a-drawing'
  if (value.type !== undefined && value.type !== 'excalidraw') return 'not-a-drawing'
  if (!Array.isArray(value.elements)) return 'not-a-drawing'
  if (!value.elements.every(isElement)) return 'unreadable'
  if (value.appState !== undefined && !isRecord(value.appState)) return 'unreadable'
  if (value.files !== undefined && !isRecord(value.files)) return 'unreadable'
  return value as SceneObject
}

/** A deep copy through JSON: the scene only ever holds JSON values. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * The scene for the editor: a fresh copy, with the texts listed in the note
 * put over the JSON's (the plugin does the same when it opens a note).
 */
export function sceneForEditor(
  stored: SceneObject,
  noteTexts: ReadonlyMap<string, string> | undefined,
): DrawingScene {
  const elements = copy(stored.elements)
  if (noteTexts && noteTexts.size > 0) {
    for (const element of elements) {
      if (element.type !== 'text') continue
      const text = noteTexts.get(element.id)
      if (text === undefined || text === elementSourceText(element)) continue
      element.text = text
      element.originalText = text
      if (typeof element.rawText === 'string') element.rawText = text
    }
  }
  return {
    elements,
    appState: isRecord(stored.appState) ? copy(stored.appState) : {},
    files: isRecord(stored.files) ? copy(stored.files) : {},
  }
}

/** File ids the live picture elements use. */
function usedFileIds(elements: readonly DrawingElement[]): Set<string> {
  const ids = new Set<string>()
  for (const element of elements) {
    if (element.isDeleted === true) continue
    if (typeof element.fileId === 'string') ids.add(element.fileId)
  }
  return ids
}

/**
 * An edited element over the stored one with the same id. The drawing
 * library rebuilds every element it loads from the keys it knows, so keys
 * another program wrote (the plugin's `rawText`, link flags) are missing from
 * what it hands back; they come back from the stored element. A text whose
 * shown text was edited gets its `rawText` from it, so the stale source text
 * does not win when the plugin reads the note again.
 */
function overStored(before: DrawingElement | undefined, live: DrawingElement): DrawingElement {
  if (!before) return live
  const merged: DrawingElement = { ...before, ...live }
  if (live.type === 'text' && typeof before.rawText === 'string' && !('rawText' in live)) {
    const now = live.originalText ?? live.text
    const was = before.originalText ?? before.text
    if (typeof now === 'string' && now !== was) merged.rawText = now
  }
  return merged
}

/**
 * The object a changed save writes. Deleted elements are dropped, as the
 * editor's own export does. Stored files all stay (a note's pictures live
 * outside the file and are not in here); a picture the editor added is
 * written only when a live element uses it.
 */
export function sceneForSave(stored: SceneObject, edit: SceneEdit): SceneObject {
  const storedById = new Map(stored.elements.map((element) => [element.id, element]))
  const elements = copy(
    edit.elements
      .filter((element) => element.isDeleted !== true)
      .map((element) => overStored(storedById.get(element.id), element)),
  )
  const out: SceneObject = { ...stored, elements }
  if (edit.appState) {
    out.appState = { ...(isRecord(stored.appState) ? stored.appState : {}), ...copy(edit.appState) }
  }
  const storedFiles = isRecord(stored.files) ? stored.files : undefined
  if (edit.files) {
    const files: Record<string, unknown> = { ...(storedFiles ?? {}) }
    for (const id of usedFileIds(elements)) {
      if (!(id in files) && isRecord(edit.files[id])) files[id] = copy(edit.files[id])
    }
    if (storedFiles || Object.keys(files).length > 0) out.files = files
  }
  return out
}
