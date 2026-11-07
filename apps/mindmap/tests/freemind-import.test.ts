/**
 * FreeMind and Freeplane maps (`.mm`) read into a new, unsaved map: the
 * structure, notes, links, folding and sides come over; what the file holds
 * besides is left behind; a file that is not such a map opens nothing. The
 * map saves as an `.xmind` that opens like any other.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAX_TOPIC_DEPTH,
  openXmind,
  sheetToView,
  type ViewSheet,
  type ViewTopic,
} from '@genoffice/xmind-engine'
import { parseFreeMind } from '../src/renderer/document/freemind'
import { importedMap } from '../src/renderer/document/open'

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)))
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A topic as the editor shows it: title, note, link, folded, and the same of its children. */
interface Shown {
  title: string
  note?: string
  link?: string
  folded?: true
  children?: Shown[]
}

function shown(topic: ViewTopic): Shown {
  const out: Shown = { title: topic.title }
  if (topic.note !== null) out.note = topic.note
  if (topic.link !== null) out.link = topic.link
  if (topic.folded) out.folded = true
  if (topic.children.length > 0) out.children = topic.children.map(shown)
  return out
}

/** Imports the bytes, saves the map, and opens the saved `.xmind` with the engine. */
async function importAndReopen(file: Uint8Array, title: string): Promise<ViewSheet[]> {
  const opened = await importedMap(file, title)
  if (opened.status !== 'ok') throw new Error(`not imported: ${opened.status}`)
  expect(opened.notices.imported).toBe(true)
  expect(opened.session.dirty).toBe(true)
  const saved = await opened.session.produceBytes()
  const reopened = await openXmind(saved)
  if (reopened.status !== 'ok') throw new Error(`the saved map does not open: ${reopened.status}`)
  return reopened.document.sheets.map(sheetToView)
}

describe('a FreeMind 1.0 map', () => {
  it('comes over with its structure, notes, links, folding and sides, and saves as an .xmind that opens', async () => {
    const [sheet, ...more] = await importAndReopen(fixture('freemind-1.0.mm'), 'Project plan')
    expect(more).toEqual([])
    expect(sheet!.title).toBe('Project plan')
    expect(sheet!.layout).toBe('both')
    expect(shown(sheet!.root)).toEqual({
      title: '프로젝트 계획',
      children: [
        // the right-hand branches first, each side in the file's order
        {
          title: 'Goals',
          children: [
            { title: 'Read the plan', link: 'https://example.org/plan' },
            { title: 'Ship by June', note: 'First line of the note\nSecond & last line' },
          ],
        },
        { title: 'Rich title\non two lines' },
        {
          title: 'Risks',
          folded: true,
          // a link to another node of the map is left behind
          children: [{ title: 'Budget' }, { title: 'See the plan' }],
        },
        { title: 'Notes\nand ideas' },
      ],
    })
  })

  it('leaves icons, fonts, colours, edges, clouds, arrow links and attributes behind', async () => {
    const opened = await importedMap(fixture('freemind-1.0.mm'), 'Project plan')
    if (opened.status !== 'ok') throw new Error(opened.status)
    const content = JSON.stringify(opened.session.document.sheets)
    for (const dropped of [
      'flag',
      'SansSerif',
      '#ff0000',
      '#f0f0f0',
      'Arrow_ID_1',
      'owner',
      'ID_1002',
    ]) {
      expect(content).not.toContain(dropped)
    }
    expect(opened.session.document.sheets[0]!.relationships).toBeUndefined()
  })
})

describe('a Freeplane 1.x map', () => {
  it('comes over with Korean text, both note forms and a folded branch; its built-in root name gives way to the file name', async () => {
    const [sheet] = await importAndReopen(fixture('freeplane-1.x.mm'), '아이디어')
    // every main branch on the right (Freeplane's newer side names included): drawn to the right
    expect(sheet!.layout).toBe('right')
    expect(shown(sheet!.root)).toEqual({
      title: '아이디어',
      children: [
        {
          title: '한글 가지',
          children: [
            { title: '잎 하나', note: '메모 첫 줄' },
            // the details text is left behind; the plain note keeps its lines
            { title: 'Details here', note: 'Plain note\nsecond line' },
          ],
        },
        {
          title: 'Folded branch',
          link: 'mailto:someone@example.org',
          folded: true,
          children: [{ title: 'Hidden child' }],
        },
      ],
    })
  })
})

describe('sides', () => {
  const map = (positions: string[]): Uint8Array =>
    bytes(
      `<map version="1.0.1"><node TEXT="Root">${positions
        .map((position, at) => `<node TEXT="N${at}" POSITION="${position}"/>`)
        .join('')}</node></map>`,
    )

  it('all on the left draws to the left', async () => {
    const [sheet] = await importAndReopen(map(['left', 'top_or_left']), 'Left')
    expect(sheet!.layout).toBe('left')
    expect(sheet!.root.children.map((child) => child.title)).toEqual(['N0', 'N1'])
  })

  it('a side name it does not know counts as no side', () => {
    const read = parseFreeMind(map(['constructor', 'right']))
    expect(read.ok && read.root.children.map((child) => child.side)).toEqual([undefined, 'right'])
  })
})

describe('a file that is not a readable map', () => {
  it.each([
    ['broken XML', bytes('<map version="1.0.1"><node TEXT="Root">')],
    ['another XML document', bytes('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>')],
    ['a map without a node', bytes('<map version="1.0.1"></map>')],
    [
      'a document type with entities',
      bytes('<!DOCTYPE map [<!ENTITY a "aaaaaaaaaa">]><map><node TEXT="&a;"/></map>'),
    ],
    ['bytes that are not text', new Uint8Array([0xff, 0xfe, 0x00, 0xd8, 0x00, 0xdc, 0x41])],
  ])('%s opens as unreadable', async (_name, file) => {
    expect(await importedMap(file, 'x')).toEqual({ status: 'unreadable' })
  })

  it('nested deeper than the engine accepts opens as unreadable; at the limit it opens', async () => {
    const nested = (levels: number): Uint8Array =>
      bytes(
        `<map><node TEXT="Root">${'<node TEXT="n">'.repeat(levels)}${'</node>'.repeat(levels)}</node></map>`,
      )
    expect(parseFreeMind(nested(MAX_TOPIC_DEPTH + 1))).toEqual({ ok: false, problem: 'too-deep' })
    expect(await importedMap(nested(MAX_TOPIC_DEPTH + 1), 'deep')).toEqual({ status: 'unreadable' })
    const [sheet] = await importAndReopen(nested(MAX_TOPIC_DEPTH), 'deep')
    let depth = 0
    for (let topic = sheet!.root; topic.children[0]; topic = topic.children[0]) depth++
    expect(depth).toBe(MAX_TOPIC_DEPTH)
  })
})

describe('the encoding', () => {
  it('reads a file in the encoding its XML declaration names', () => {
    // "Café" in Latin-1: not UTF-8
    const latin1 = new Uint8Array([
      ...bytes('<?xml version="1.0" encoding="ISO-8859-1"?><map><node TEXT="Caf'),
      0xe9,
      ...bytes('"/></map>'),
    ])
    const read = parseFreeMind(latin1)
    expect(read.ok && read.root.text).toBe('Café')
  })
})

describe('a FreeMind 0.8 map', () => {
  it('shows HTML kept in a node text as that text, and brings notes kept in the old note hook', async () => {
    const [sheet] = await importAndReopen(fixture('freemind-0.8.mm'), 'Field notes')
    expect(shown(sheet!.root)).toEqual({
      title: 'Field notes\n- a FreeMind 0.8 map -',
      children: [
        {
          title: 'To write, use mailto:someone@example.org.',
          note: 'A note kept the old way\non two lines',
        },
        {
          // only text that starts with <html is HTML, as both programs read it
          title: 'Plain text that mentions <html> in passing',
          note: 'An HTML note\nin two paragraphs',
        },
      ],
    })
  })
})
