import { describe, expect, it } from 'vitest'
import {
  createDrawing,
  locateNoteParts,
  decompressDrawing,
  openDrawing,
} from '@genoffice/excalidraw-engine'
import type { DrawingElement } from '@genoffice/excalidraw-engine'
import { DrawingSession } from '../src/renderer/document/session'

/** The library's hash stands in for: each element's id and version, in order. */
const hash = (elements: readonly DrawingElement[]): number =>
  [...elements.map((e) => `${e.id}:${String(e.version)}`).join('|')].reduce(
    (h, c) => (h * 31 + c.charCodeAt(0)) | 0,
    7,
  )

const rect = (id: string, version = 1): DrawingElement => ({
  id,
  type: 'rectangle',
  version,
  x: 0,
  y: 0,
})
const appState = { viewBackgroundColor: '#ffffff', gridSize: 20, zoom: { value: 1 }, scrollX: 0 }

function savedScene(bytes: Uint8Array): {
  elements: DrawingElement[]
  appState: Record<string, unknown>
} {
  const text = new TextDecoder().decode(bytes)
  const layout = locateNoteParts(text)
  return JSON.parse(decompressDrawing(text.slice(layout.drawing!.start, layout.drawing!.end))!)
}

function newSession(): DrawingSession {
  return new DrawingSession(createDrawing('markdown'), hash)
}

describe('DrawingSession', () => {
  it('takes the first report as the baseline: loading is not an edit', () => {
    const session = newSession()
    session.update({ elements: [], appState, files: {} })
    expect(session.dirty).toBe(false)
    expect(session.changedSinceOpen).toBe(false)
    expect(session.produceBytes()).toEqual(session.document.save(null))
  })

  it('ignores scrolling and zoom, counts element edits and saved canvas settings', () => {
    const session = newSession()
    session.update({ elements: [], appState, files: {} })
    session.update({
      elements: [],
      appState: { ...appState, scrollX: 300, zoom: { value: 2 } },
      files: {},
    })
    expect(session.dirty).toBe(false)
    session.update({
      elements: [],
      appState: { ...appState, viewBackgroundColor: '#000000' },
      files: {},
    })
    expect(session.dirty).toBe(true)
  })

  it('writes the scene once changed, with only the canvas settings that changed', () => {
    const session = newSession()
    session.update({ elements: [], appState, files: {} })
    session.update({ elements: [rect('r1')], appState: { ...appState, gridSize: 40 }, files: {} })
    const scene = savedScene(session.produceBytes())
    expect(scene.elements.map((e) => e.id)).toEqual(['r1'])
    // the stored note had no grid size of 20; only the changed one is written over it
    expect(scene.appState.gridSize).toBe(40)
    expect(scene.appState).not.toHaveProperty('zoom')
    expect(scene.appState).not.toHaveProperty('scrollX')
  })

  it('is clean again once what was saved reaches the disk, dirty on the next edit', () => {
    const session = newSession()
    const seen: boolean[] = []
    session.subscribe(() => seen.push(session.dirty))
    session.update({ elements: [], appState, files: {} })
    session.update({ elements: [rect('r1')], appState, files: {} })
    const at = session.currentFingerprint()!
    session.markWritten(at)
    expect(session.dirty).toBe(false)
    session.update({ elements: [rect('r1', 2)], appState, files: {} })
    expect(session.dirty).toBe(true)
    expect(seen).toEqual([true, false, true])
  })

  it('a save that raced an edit leaves the drawing dirty', () => {
    const session = newSession()
    session.update({ elements: [], appState, files: {} })
    session.update({ elements: [rect('r1')], appState, files: {} })
    const at = session.currentFingerprint()!
    session.update({ elements: [rect('r1', 2)], appState, files: {} })
    session.markWritten(at)
    expect(session.dirty).toBe(true)
  })

  it('keeps the format of the file it opened', () => {
    const json = openDrawing(
      new TextEncoder().encode('{"type":"excalidraw","elements":[]}'),
      'json',
    )
    if (json.status !== 'ok') throw new Error('did not open')
    expect(new DrawingSession(json.document, hash).format).toBe('json')
  })
})
