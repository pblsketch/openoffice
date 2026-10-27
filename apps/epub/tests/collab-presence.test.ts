/**
 * Where the others are: their published places are checked, split into this
 * chapter's and the rest, and drawn into the chapter frame in a layer beside
 * the body, never inside a block and never in the reading text.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  PRESENCE_FIELD,
  clearPresence,
  drawPresence,
  peerPlaces,
  presenceOf,
} from '../src/renderer/collab/presence'
import { buildTextIndex } from '../src/renderer/reader/book-search'

const frames: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

function frameDoc(body: string): Document {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  frames.push(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html><head><title>c</title></head><body>${body}</body></html>`)
  doc.close()
  return doc
}

const ONE = 'OEBPS/text/one.xhtml'
const user = (name: string, palette: number) => ({ name, palette })

describe('published places', () => {
  it('takes a place only in shape', () => {
    expect(PRESENCE_FIELD).toBe('epub')
    const place = { spineIndex: 1, path: ONE, top: 'b3', caret: { id: 'b4', start: 2, end: 5 } }
    expect(presenceOf(place)).toEqual(place)
    expect(presenceOf({ ...place, caret: { id: 'b4', start: -1, end: 0 } })).toMatchObject({
      caret: null,
    })
    expect(presenceOf({ ...place, top: 7 })).toMatchObject({ top: null })
    expect(presenceOf({ ...place, spineIndex: 'x' })).toBeNull()
    expect(presenceOf(null)).toBeNull()
  })

  it("splits the others into this chapter's and the rest, with a palette in range", () => {
    const places = peerPlaces(
      [
        {
          clientId: 1,
          user: user('Mina', 2),
          value: { spineIndex: 0, path: ONE, top: 'b1', caret: null },
        },
        {
          clientId: 2,
          user: user('Jun', 99),
          value: { spineIndex: 3, path: 'x.xhtml', top: null, caret: null },
        },
        { clientId: 3, user: user('Bad', 1), value: 'nonsense' },
      ],
      ONE,
    )
    expect(places.here.map((m) => m.name)).toEqual(['Mina'])
    expect(places.elsewhere).toEqual([
      { clientId: 2, name: 'Jun', palette: 0, spineIndex: 3, top: null },
    ])
  })
})

describe('drawing the others', () => {
  it('draws a caret and name tag beside the body, outside every block and the reading text', () => {
    const doc = frameDoc(
      '<p data-epub-block="b1">Alpha one.</p><p data-epub-block="b2">Beta two.</p>',
    )
    const before = buildTextIndex(doc.body).text
    const text = doc.querySelector('[data-epub-block="b2"]')!.firstChild!
    drawPresence(
      doc,
      [
        {
          name: 'Jun',
          palette: 3,
          presence: { spineIndex: 0, path: ONE, top: null, caret: { id: 'b2', start: 1, end: 4 } },
        },
        {
          name: 'Mina',
          palette: 1,
          presence: { spineIndex: 0, path: ONE, top: 'b1', caret: null },
        },
      ],
      (id, start, end) => {
        if (id !== 'b2') return null
        const range = doc.createRange()
        range.setStart(text, start)
        range.setEnd(text, end)
        return range
      },
    )
    const layer = doc.getElementById('genoffice-collab-layer')!
    expect(layer.parentElement).toBe(doc.documentElement)
    expect(doc.body.contains(layer)).toBe(false)
    const labels = Array.from(layer.querySelectorAll('.collab-caret-label'))
    expect(labels.map((l) => l.textContent)).toEqual(['Jun', 'Mina'])
    expect(labels[1]!.classList.contains('collab-reader')).toBe(true)
    expect(layer.querySelectorAll('.collab-caret')).toHaveLength(1)
    expect(
      (layer.querySelector('.collab-caret') as HTMLElement).style.getPropertyValue('--c'),
    ).toBe('var(--collab-3)')
    expect(doc.querySelectorAll('[data-epub-block] .collab-caret-label')).toHaveLength(0)
    expect(buildTextIndex(doc.body).text).toBe(before)
    expect(doc.getElementById('genoffice-collab-style')?.textContent).toContain('var(--collab-ink)')
  })

  it('leaves nothing behind once nobody else is in the chapter', () => {
    const doc = frameDoc('<p data-epub-block="b1">Alpha one.</p>')
    drawPresence(
      doc,
      [
        {
          name: 'Mina',
          palette: 1,
          presence: { spineIndex: 0, path: ONE, top: 'b1', caret: null },
        },
      ],
      () => null,
    )
    expect(doc.getElementById('genoffice-collab-layer')).not.toBeNull()
    drawPresence(doc, [], () => null)
    expect(doc.getElementById('genoffice-collab-layer')).toBeNull()
    expect(doc.getElementById('genoffice-collab-style')).toBeNull()
    drawPresence(
      doc,
      [
        {
          name: 'Mina',
          palette: 1,
          presence: { spineIndex: 0, path: ONE, top: 'b1', caret: null },
        },
      ],
      () => null,
    )
    clearPresence(doc)
    expect(doc.getElementById('genoffice-collab-layer')).toBeNull()
  })
})
