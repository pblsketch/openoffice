import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createXmindDocumentFromOutline,
  openXmind,
  outlineToSheets,
  sheetsToOutline,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import { openPptx } from '@genoffice/pptx-engine'
import { parseFileToText } from '@genoffice/file-parse'
import {
  buildDeck,
  convertSource,
  mapOutlineToSlides,
  mapOutlineToSlidesMarkdown,
  markdownRedactionNotice,
} from '../src/main/generate/convert'
import { outlineToOps } from '../src/main/mcp/pptx-outline'

/**
 * 8.6: conversions without AI. The source is read only through the
 * redaction-aware reader, the results are what the spec names, and a failed
 * read converts nothing.
 */

const UNTITLED = 'Untitled'
let dir: string

/** a withheld span as the markdown editor saves it */
const span = (label: string, words: string) =>
  `<span class="redact-span" data-redaction="" data-label="${label}">${words}</span>`

async function mapFile(name: string, outline: string): Promise<string> {
  const doc = await createXmindDocumentFromOutline(outline, { untitled: UNTITLED })
  const path = join(dir, name)
  await writeFile(path, await doc.save())
  return path
}

const MAP_OUTLINE = [
  '# Plan',
  '',
  '- Trip',
  '  - Day one [easy, short] <https://example.com/a>',
  '    > bring water',
  '    - Museum',
  '      - Lunch',
  '    - Park',
  '  - Day two',
  '    - Beach',
  '',
  '# Second sheet',
  '',
  '- Other centre',
  '  - Not on the slides',
  '',
].join('\n')

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gen-convert-'))
})

describe('map → markdown (4.8)', () => {
  it('is exactly the engine outline of every sheet, as the reader hands it over', async () => {
    const path = await mapFile('plan.xmind', MAP_OUTLINE)
    const result = await convertSource('mindmap-to-markdown', path, { untitled: UNTITLED })
    expect(result.ok).toBe(true)
    if (!result.ok || result.content.target !== 'markdown') throw new Error('no markdown')
    const opened = await openXmind(new Uint8Array(await readFile(path)))
    if (opened.status !== 'ok') throw new Error('map did not open')
    expect(result.content.markdown).toBe(sheetsToOutline(opened.document.sheets))
    expect(result.content.markdown).toContain('# Second sheet')
    expect(result.content.markdown).toContain('> bring water')
    expect(result.content.markdown).toContain('[easy, short]')
  })
})

describe('map → PPT skeleton', () => {
  it('makes a title slide and one slide per main branch of the FIRST sheet, bullets indented', async () => {
    const path = await mapFile('trip.xmind', MAP_OUTLINE)
    const text = (await parseFileToText(path)).text!
    expect(mapOutlineToSlidesMarkdown(text, UNTITLED)).toBe(
      [
        '# Trip',
        '',
        '# Day one',
        '- Museum',
        '  - Lunch',
        '- Park',
        '',
        '# Day two',
        '- Beach',
        '',
      ].join('\n'),
    )
    const slides = mapOutlineToSlides(text, UNTITLED)
    expect(slides).toEqual([
      { title: 'Trip', paragraphs: [] },
      {
        title: 'Day one',
        paragraphs: [
          { text: 'Museum', bullet: 'char' },
          { text: 'Lunch', bullet: 'char', level: 1 },
          { text: 'Park', bullet: 'char' },
        ],
      },
      { title: 'Day two', paragraphs: [{ text: 'Beach', bullet: 'char' }] },
    ])

    const result = await convertSource('mindmap-to-slides', path, { untitled: UNTITLED })
    if (!result.ok || result.content.target !== 'slides') throw new Error('no deck')
    expect(result.content.slideCount).toBe(3)
    const deck = await openPptx(result.content.deck)
    expect(deck.deck.slides).toHaveLength(3)
    const texts = deck.deck.slides.map((s) =>
      s.elements.flatMap((el) => {
        const body = (el as { text?: { paragraphs?: Array<{ runs: Array<{ text?: string }> }> } })
          .text
        return (body?.paragraphs ?? []).map((p) => p.runs.map((r) => r.text ?? '').join(''))
      }),
    )
    expect(texts).toEqual([['Trip'], ['Day one', 'Museum', 'Lunch', 'Park'], ['Day two', 'Beach']])
    expect(JSON.stringify(texts)).not.toContain('Not on the slides')
  })

  it('leaves boundary titles and relationship texts out (they are not topics)', () => {
    const outline = [
      '# S',
      '',
      '- Centre',
      '  - Branch',
      '    - Leaf',
      '    - (boundary) A frame',
      '    - (relationship) see also -> Leaf',
      '  - (summary) Wrap-up',
      '',
    ].join('\n')
    expect(mapOutlineToSlidesMarkdown(outline, UNTITLED)).toBe(
      ['# Centre', '', '# Branch', '- Leaf', '', '# Wrap-up', ''].join('\n'),
    )
  })

  it('uses the existing outline → ops code', async () => {
    const slides = mapOutlineToSlides('# S\n\n- A\n  - B\n    - c\n', UNTITLED)
    const ops = outlineToOps(slides)
    expect(ops[0]).toEqual({ op: 'addBlankSlide', target: { slide: 0 } })
    const deck = await openPptx(await buildDeck(ops))
    expect(deck.deck.slides).toHaveLength(2)
  })

  it('refuses a map with more main branches than one deck takes', async () => {
    const branches = Array.from({ length: 100 }, (_, i) => `  - Branch ${i}`).join('\n')
    const path = await mapFile('wide.xmind', `# Wide\n\n- Centre\n${branches}\n`)
    const result = await convertSource('mindmap-to-slides', path, { untitled: UNTITLED })
    expect(result).toEqual({ ok: false, problem: 'too-many-slides' })
  })
})

describe('markdown → map (4.9)', () => {
  it('reads headings and lists as topics and body paragraphs as the note of the topic above', async () => {
    const path = join(dir, 'notes.md')
    const md = [
      '# Lesson',
      '',
      '## Warm-up',
      '',
      'A paragraph under the warm-up.',
      '',
      '- Question one',
      '- Question two',
      '',
      '## Main',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
    ].join('\n')
    await writeFile(path, md)
    const result = await convertSource('markdown-to-mindmap', path, { untitled: UNTITLED })
    if (!result.ok || result.content.target !== 'mindmap') throw new Error('no map')
    expect(result.content.outline).toBe(md)
    const [sheet] = outlineToSheets(result.content.outline, { untitled: UNTITLED })
    const root = sheet!.rootTopic
    const kids = (t: XmindTopic) => t.children?.attached ?? []
    expect(sheet!.title).toBe('Lesson')
    expect(kids(root).map((t) => t.title)).toEqual(['Warm-up', 'Main'])
    const [warmUp, main] = kids(root)
    expect(JSON.stringify(warmUp!.notes)).toContain('A paragraph under the warm-up.')
    expect(kids(warmUp!).map((t) => t.title)).toEqual(['Question one', 'Question two'])
    expect(JSON.stringify(main!.notes)).toContain('| 1 | 2 |')
  })

  it('carries a withheld span over as its label, never the hidden words; the notice is due', async () => {
    const path = join(dir, 'private.md')
    await writeFile(path, `# Class\n\n- Student ${span('Name', 'Kim Minji')}\n- Seat 4\n`)
    const result = await convertSource('markdown-to-mindmap', path, { untitled: UNTITLED })
    if (!result.ok || result.content.target !== 'mindmap') throw new Error('no map')
    expect(result.content.outline).toContain('{{Name}}')
    expect(result.content.outline).not.toContain('Kim Minji')
    expect(result.content.outline).not.toContain('data-redaction')
    expect(await markdownRedactionNotice(path)).toBe(true)
  })

  it('gives no notice for a file without withheld spans', async () => {
    const path = join(dir, 'plain.md')
    await writeFile(path, '# Plain\n\n- one {{not a mark}}\n')
    expect(await markdownRedactionNotice(path)).toBe(false)
  })

  it('does not treat BOM-declared UTF-32 as the file own text for the notice', async () => {
    const parsed = async () => ({ ok: true as const, kind: 'text' as const, text: 'A' })
    const le = new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00])
    const be = new Uint8Array([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x41])
    expect(
      await markdownRedactionNotice('le.md', { parse: parsed, readBytes: async () => le }),
    ).toBe(false)
    expect(
      await markdownRedactionNotice('be.md', { parse: parsed, readBytes: async () => be }),
    ).toBe(false)
  })

  it('converts nothing when the withheld spans cannot be processed, and says why', async () => {
    const path = join(dir, 'broken.md')
    await writeFile(path, `# Broken\n\n<span data-redaction="" data-label="x">never closed\n`)
    const result = await convertSource('markdown-to-mindmap', path, { untitled: UNTITLED })
    expect(result).toEqual({ ok: false, problem: 'redaction' })
  })

  it('converts nothing when the source cannot be read', async () => {
    const result = await convertSource('markdown-to-mindmap', join(dir, 'gone.md'), {
      untitled: UNTITLED,
    })
    expect(result).toEqual({ ok: false, problem: 'unreadable' })
    const fake = await convertSource('mindmap-to-markdown', join(dir, 'x.xmind'), {
      untitled: UNTITLED,
      parse: async () => ({ ok: false, kind: 'text', error: 'Content mismatch' }),
    })
    expect(fake).toEqual({ ok: false, problem: 'unreadable' })
  })
})
