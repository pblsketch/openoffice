import { describe, expect, it } from 'vitest'
import {
  MAX_DRAWING_BYTES,
  createDrawing,
  decompressDrawing,
  drawingFormatOfPath,
  isDrawingPath,
  locateNoteParts,
  looksLikeDrawingNote,
  openDrawing,
} from '../src'
import type { DrawingDocument, DrawingElement } from '../src'
import { compressed, dec, enc, note, rect, scene, text } from './helpers'

function open(bytes: Uint8Array, format: 'markdown' | 'json' = 'markdown'): DrawingDocument {
  const opened = openDrawing(bytes, format)
  if (opened.status !== 'ok') throw new Error(`did not open: ${opened.status} ${opened.detail}`)
  return opened.document
}

/** The scene stored in a saved note's drawing block. */
function storedScene(saved: string): Record<string, unknown> & { elements: DrawingElement[] } {
  const layout = locateNoteParts(saved)
  const raw = saved.slice(layout.drawing!.start, layout.drawing!.end)
  const json = layout.drawing!.encoding === 'compressed-json' ? decompressDrawing(raw)! : raw
  return JSON.parse(json)
}

describe('opening a note', () => {
  it('reads the compressed scene', () => {
    const doc = open(enc(note(scene([rect('r1'), text('t1', 'hello')]))))
    expect(doc.format).toBe('markdown')
    expect(doc.blockEncoding).toBe('compressed-json')
    expect(doc.scene().elements.map((e) => e.id)).toEqual(['r1', 't1'])
  })

  it('reads a plain json block and the older layout', () => {
    const value = scene([rect('r1')])
    expect(open(enc(note(value, { encoding: 'json' }))).blockEncoding).toBe('json')
    expect(open(enc(note(value, { oldLayout: true }))).scene().elements).toHaveLength(1)
  })

  it('puts text edited in the note over the JSON, as the plugin does', () => {
    const doc = open(enc(note(scene([text('t1', 'old')]), { texts: [['t1', 'new\nline']] })))
    const [element] = doc.scene().elements
    expect(element).toMatchObject({
      text: 'new\nline',
      originalText: 'new\nline',
      rawText: 'new\nline',
    })
  })

  it('hands out a fresh copy each time', () => {
    const doc = open(enc(note(scene([rect('r1')]))))
    doc.scene().elements[0]!.x = 500
    expect(doc.scene().elements[0]!.x).toBe(0)
  })

  it('lists the pictures the note points at', () => {
    const doc = open(
      enc(
        note(scene([]), {
          embedded: [
            'abc123: [[pics/cat.png|small]]',
            'def456: [link](https://example.com/a.png)',
            'f789: $$x^2$$',
          ],
        }),
      ),
    )
    expect(doc.embeddedFiles()).toEqual([
      { fileId: 'abc123', target: 'pics/cat.png', kind: 'wiki' },
      { fileId: 'def456', target: 'https://example.com/a.png', kind: 'link' },
      { fileId: 'f789', target: '$$x^2$$', kind: 'formula' },
    ])
  })

  it('refuses what is not a drawing, or not readable', () => {
    expect(openDrawing(enc('# Just a note\n\nhello\n'), 'markdown').status).toBe('not-a-drawing')
    const marked = '---\nexcalidraw-plugin: parsed\n---\nno data\n'
    expect(openDrawing(enc(marked), 'markdown').status).toBe('unreadable')
    const broken = note(scene([])).replace(
      /```compressed-json\n[\s\S]*?\n```/,
      '```compressed-json\n!!!!\n```',
    )
    expect(openDrawing(enc(broken), 'markdown').status).toBe('unreadable')
    const badElements = note(scene([{ type: 'rectangle' }]))
    expect(openDrawing(enc(badElements), 'markdown').status).toBe('unreadable')
    expect(openDrawing(new Uint8Array([0xff, 0xfe, 0x00]), 'markdown').status).toBe('unreadable')
    expect(openDrawing(new Uint8Array(MAX_DRAWING_BYTES + 1), 'markdown').status).toBe('too-large')
  })

  it('tells drawing notes and paths apart', () => {
    expect(looksLikeDrawingNote(note(scene([])))).toBe(true)
    expect(looksLikeDrawingNote('---\nexcalidraw-plugin: raw\n---\n')).toBe(true)
    expect(looksLikeDrawingNote('# plain\n')).toBe(false)
    expect(isDrawingPath('a/Drawing 2026.excalidraw.md')).toBe(true)
    expect(isDrawingPath('a/b.EXCALIDRAW')).toBe(true)
    expect(isDrawingPath('a/notes.md')).toBe(false)
    expect(drawingFormatOfPath('x.excalidraw.md')).toBe('markdown')
    expect(drawingFormatOfPath('x.excalidraw')).toBe('json')
  })
})

describe('saving a note', () => {
  it('writes the original bytes when nothing changed', () => {
    const bytes = enc(note(scene([rect('r1')]), { body: 'my notes\r\nstay\n' }))
    expect(open(bytes).save(null)).toEqual(bytes)
  })

  it('rewrites only the text list and the drawing block', () => {
    const body = '# My heading\n\nSome **notes** the user wrote.\n\n'
    const source = note(scene([text('t1', 'one'), rect('r1')]), {
      body,
      texts: [['t1', 'one']],
      embedded: ['abc: [[pic.png]]'],
    })
    const doc = open(enc(source))
    const edited = doc.scene().elements
    edited.push(text('t2', 'two'))
    const saved = dec(doc.save({ elements: edited }))

    const before = locateNoteParts(source)
    const after = locateNoteParts(saved)
    // everything up to the text list, and the embedded files list, is untouched
    expect(saved.slice(0, after.textElements!.start)).toBe(
      source.slice(0, before.textElements!.start),
    )
    expect(saved).toContain('## Embedded Files\nabc: [[pic.png]]\n')
    expect(saved.slice(after.textElements!.start, after.textElements!.end)).toBe(
      'one ^t1\n\ntwo ^t2\n\n',
    )
    expect(saved.endsWith('\n```\n%%')).toBe(true)
    expect(storedScene(saved).elements.map((e) => e.id)).toEqual(['t1', 'r1', 't2'])
  })

  it('keeps keys it does not know and merges the app state', () => {
    const value = scene([rect('r1', { customData: { a: 1 } })], {
      appState: { gridSize: null, viewBackgroundColor: '#ffffff', theme: 'dark' },
      pluginKey: 'kept',
    })
    const doc = open(enc(note(value)))
    const saved = storedScene(
      dec(
        doc.save({ elements: doc.scene().elements, appState: { viewBackgroundColor: '#000000' } }),
      ),
    )
    expect(saved.pluginKey).toBe('kept')
    expect(saved.elements[0]!.customData).toEqual({ a: 1 })
    expect(saved.appState).toEqual({
      gridSize: null,
      viewBackgroundColor: '#000000',
      theme: 'dark',
    })
  })

  it('brings back element keys the editor does not report, and refreshes an edited rawText', () => {
    const doc = open(
      enc(note(scene([text('t1', 'old', { hasTextLink: true }), rect('r1', { plugin: 1 })]))),
    )
    // what the drawing library hands back: only the keys it knows
    const live = doc.scene().elements.map((element) => {
      const { rawText: _raw, hasTextLink: _link, plugin: _plugin, ...known } = element
      return element.id === 't1' ? { ...known, text: 'new', originalText: 'new' } : known
    })
    const saved = dec(doc.save({ elements: live }))
    const [t1, r1] = storedScene(saved).elements
    expect(t1).toMatchObject({
      text: 'new',
      originalText: 'new',
      rawText: 'new',
      hasTextLink: true,
    })
    expect(r1).toMatchObject({ plugin: 1 })
    expect(saved).toContain('new ^t1')
  })

  it('keeps the stored rawText of a text the editor did not change', () => {
    const doc = open(enc(note(scene([text('t1', 'shown', { rawText: '[[link]] shown' })]))))
    const live = doc.scene().elements.map(({ rawText: _raw, ...known }) => known)
    const [t1] = storedScene(dec(doc.save({ elements: [...live, rect('r2')] }))).elements
    expect(t1!.rawText).toBe('[[link]] shown')
  })

  it('drops deleted elements and their text entries', () => {
    const doc = open(
      enc(note(scene([text('t1', 'gone'), rect('r1')]), { texts: [['t1', 'gone']] })),
    )
    const elements = doc
      .scene()
      .elements.map((e) => (e.id === 't1' ? { ...e, isDeleted: true } : e))
    const saved = dec(doc.save({ elements }))
    expect(saved).not.toContain('^t1')
    expect(storedScene(saved).elements.map((e) => e.id)).toEqual(['r1'])
  })

  it('never copies a picture the note only points at into the file', () => {
    const doc = open(
      enc(
        note(scene([rect('i1', { type: 'image', fileId: 'abc' })]), {
          embedded: ['abc: [[pic.png]]'],
        }),
      ),
    )
    const saved = storedScene(
      dec(
        doc.save({
          elements: doc.scene().elements,
          files: {
            abc: { id: 'abc', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA' },
          },
        }),
      ),
    )
    expect(saved.files).toEqual({})
  })

  it('keeps CRLF line breaks, the BOM and the block encoding', () => {
    const source = `\uFEFF${note(scene([text('t1', 'a')]), { texts: [['t1', 'a']], encoding: 'json' }).replace(/\n/g, '\r\n')}`
    const doc = open(enc(source))
    const saved = dec(doc.save({ elements: [...doc.scene().elements, rect('r2')] }))
    expect(saved.startsWith('\uFEFF---\r\n')).toBe(true)
    expect(saved.replace(/\r\n/g, '')).not.toContain('\n')
    expect(locateNoteParts(saved).drawing!.encoding).toBe('json')
    expect(storedScene(saved).elements.map((e) => e.id)).toEqual(['t1', 'r2'])
  })

  it('keeps the compressed block broken into lines when it was', () => {
    const doc = open(enc(note(scene(Array.from({ length: 40 }, (_, i) => rect(`r${i}`))))))
    const saved = dec(doc.save({ elements: doc.scene().elements.slice(1) }))
    const layout = locateNoteParts(saved)
    const block = saved.slice(layout.drawing!.start, layout.drawing!.end)
    expect(block).toContain('\n\n')
    expect(block.split('\n\n').every((line) => line.length <= 256)).toBe(true)
  })

  it('reopens what it saved', () => {
    const doc = open(enc(note(scene([rect('r1')]))))
    const again = open(doc.save({ elements: [...doc.scene().elements, text('t9', 'x')] }))
    expect(again.scene().elements.map((e) => e.id)).toEqual(['r1', 't9'])
  })

  it('reads the compressed block the test helper writes the same as the plugin form', () => {
    expect(decompressDrawing(compressed({ a: 1 }))).toBe(JSON.stringify({ a: 1 }, null, '\t'))
  })
})

describe('plain .excalidraw files', () => {
  it('opens, keeps the bytes when unchanged and the indent when changed', () => {
    const source = `${JSON.stringify(scene([rect('r1')]), null, 4)}\n`
    const doc = open(enc(source), 'json')
    expect(doc.format).toBe('json')
    expect(doc.save(null)).toEqual(enc(source))
    const saved = dec(doc.save({ elements: [...doc.scene().elements, rect('r2')] }))
    expect(saved).toContain('\n    "type": "excalidraw"')
    expect(JSON.parse(saved).elements).toHaveLength(2)
  })

  it('writes a new picture only when an element uses it', () => {
    const doc = open(enc(JSON.stringify(scene([]))), 'json')
    const file = { id: 'f1', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA' }
    const unused = JSON.parse(dec(doc.save({ elements: [], files: { f1: file } })))
    expect(unused.files).toEqual({})
    const used = JSON.parse(
      dec(
        doc.save({ elements: [rect('i1', { type: 'image', fileId: 'f1' })], files: { f1: file } }),
      ),
    )
    expect(used.files).toEqual({ f1: file })
  })

  it('refuses JSON that is not a scene', () => {
    expect(openDrawing(enc('{"type":"other","elements":[]}'), 'json').status).toBe('not-a-drawing')
    expect(openDrawing(enc('not json'), 'json').status).toBe('unreadable')
  })
})

describe('new files', () => {
  it('makes an empty note that opens as a drawing', () => {
    const doc = createDrawing('markdown')
    expect(doc.scene().elements).toEqual([])
    const textOut = dec(doc.save(null))
    expect(textOut).toMatch(/^---\n\nexcalidraw-plugin: parsed\n/)
    expect(looksLikeDrawingNote(textOut)).toBe(true)
  })

  it('makes an empty plain scene', () => {
    const doc = createDrawing('json')
    expect(JSON.parse(dec(doc.save(null))).type).toBe('excalidraw')
  })
})
