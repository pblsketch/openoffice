import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function slideXml(text: string): Promise<string> {
  const dir = tempDir()
  const spec = join(dir, 'deck.json')
  const out = join(dir, 'deck.pptx')
  writeFileSync(
    spec,
    JSON.stringify({
      pages: [
        {
          elements: [
            {
              type: 'text',
              x: 80,
              y: 80,
              w: 800,
              h: 120,
              paragraphs: [{ runs: [{ text, sizePt: 24 }] }],
            },
          ],
        },
      ],
    }),
  )
  const result = await run(['create', '--type', 'pptx', '--spec', spec, '--out', out, '--json'])
  expect(result.code, result.stdout).toBe(0)
  const zip = await JSZip.loadAsync(readFileSync(out))
  return zip.file('ppt/slides/slide1.xml')!.async('string')
}

describe('PowerPoint text with Windows and old Mac line endings', () => {
  it.each([
    ['LF', 'First\nSecond'],
    ['CRLF', 'First\r\nSecond'],
    ['CR', 'First\rSecond'],
  ])('writes one line break for %s', async (_name, text) => {
    const xml = await slideXml(text)
    expect(xml.match(/<a:br\b/g) ?? []).toHaveLength(1)
    expect([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])).toEqual(['First', 'Second'])
  })

  it('writes two line breaks for a blank line', async () => {
    const xml = await slideXml('A\r\n\r\nB')
    expect(xml.match(/<a:br\b/g) ?? []).toHaveLength(2)
    expect([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])).toEqual(['A', 'B'])
  })

  it('writes speaker notes paragraphs without carriage returns', async () => {
    const dir = tempDir()
    const ops = join(dir, 'ops.json')
    const out = join(dir, 'deck.pptx')
    writeFileSync(
      ops,
      JSON.stringify([
        { op: 'addBlankSlide', target: { slide: 0 } },
        { op: 'setNotes', target: { slide: 0 }, text: 'one\r\ntwo\rthree' },
      ]),
    )
    const created = await run(['create', '--type', 'pptx', '--ops', ops, '--out', out, '--json'])
    expect(created.code, created.stdout).toBe(0)
    const zip = await JSZip.loadAsync(readFileSync(out))
    const notesPart = Object.keys(zip.files).find((n) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
    )!
    const xml = await zip.file(notesPart)!.async('string')
    expect([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])).toEqual([
      'one',
      'two',
      'three',
    ])
    const read = await run(['slides', 'read', out, '--full', '--json'])
    expect(read.json().detail.pages[0].notes ?? read.json().detail.notes).toBe('one\ntwo\nthree')
  })
})
