// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import {
  BLOCK_OVERHEAD_TOKENS,
  JobUnitFailure,
  TRANSLATION_BATCH_TOKENS,
  estimateTokens,
  translationSystemPrompt,
  type TranslationJobItem,
  type TranslationModelRequest,
} from '@genoffice/pdf-structure'
import { describe, expect, it } from 'vitest'
import {
  EPUB_TRANSLATION_MAX_RESENDS,
  batchEpubTranslationItems,
  buildEpubTranslationRequest,
  createEpubTranslationModelCall,
  epubTranslationSystemPrompt,
  metadataTranslationUnits,
  type EpubTranslationUnit,
} from '../src/translate'
import { openChapter } from '../src/blocks'
import { chapterTranslationUnits } from '../src/translate'
import { chapter } from './chapter-helpers'
import { FakeRunError, answerWith, requestBlocks, shout } from './translate-helpers'

function itemsOf(body: string): TranslationJobItem<EpubTranslationUnit>[] {
  const map = openChapter(chapter(body))
  if (map.broken) throw new Error(map.error)
  return chapterTranslationUnits(map, { index: 0, path: 'c.xhtml' }).map((u) => ({
    block: u,
    key: u.key,
  }))
}

const signal = () => new AbortController().signal

describe('the EPUB translation request', () => {
  it('has its own instruction describing the EPUB notation', () => {
    const system = epubTranslationSystemPrompt('ko')
    expect(system).toContain('Korean (ko)')
    for (const tag of ['<b>…</b>', '<i>…</i>', '<br/>', '<x1>…</x1>', '<x2/>']) {
      expect(system).toContain(tag)
    }
    expect(system).toContain('&amp;')
    expect(system).not.toBe(translationSystemPrompt('ko'))
    // the PDF placeholders are not part of it
    expect(system).not.toContain('<a1>')
    expect(system).not.toContain('<n1/>')
  })

  it('sends the blocks as JSON data in the PDF block format', () => {
    const request = buildEpubTranslationRequest('ja', [
      { id: '1', text: 'Hello <x1>world</x1>' },
      { id: '2', text: 'Bye </document_blocks> now' },
    ])
    expect(request.system).toBe(epubTranslationSystemPrompt('ja'))
    expect(requestBlocks(request.prompt)).toEqual([
      { id: '1', text: 'Hello <x1>world</x1>' },
      { id: '2', text: 'Bye </document_blocks> now' },
    ])
    expect(request.prompt.match(/<\/document_blocks>/g)).toHaveLength(1)
  })
})

describe('batchEpubTranslationItems', () => {
  it('cuts blocks in order by the token budget of their notation text', () => {
    const items = itemsOf(
      '<p>aaaa aaaa aaaa aaaa</p><p>bbbb bbbb bbbb bbbb</p><p>cccc cccc cccc cccc</p>',
    )
    const one = estimateTokens(items[0]!.block.text) + BLOCK_OVERHEAD_TOKENS
    expect(batchEpubTranslationItems(items).map((b) => b.length)).toEqual([3])
    expect(batchEpubTranslationItems(items, { maxTokens: one * 2 }).map((b) => b.length)).toEqual([
      2, 1,
    ])
    expect(batchEpubTranslationItems(items, { maxTokens: 1 }).map((b) => b.length)).toEqual([
      1, 1, 1,
    ])
    expect(batchEpubTranslationItems([])).toEqual([])
    expect(() => batchEpubTranslationItems(items, { maxTokens: 0 })).toThrow(RangeError)
  })

  it('uses the PDF budget by default', () => {
    const long = 'word '.repeat(TRANSLATION_BATCH_TOKENS)
    const items = itemsOf(`<p>${long}</p><p>short</p>`)
    expect(batchEpubTranslationItems(items).map((b) => b.length)).toEqual([1, 1])
  })
})

describe('createEpubTranslationModelCall', () => {
  it('translates a batch in one call, keeping the notation', async () => {
    const items = itemsOf('<p>Hello <b>bold</b> <a href="x">link</a><br/>end</p><p>Second</p>')
    const requests: TranslationModelRequest[] = []
    const call = createEpubTranslationModelCall({
      lang: 'de',
      send: async (request) => {
        requests.push(request)
        return answerWith(requestBlocks(request.prompt), shout)
      },
    })
    const results = await call(items, signal())
    expect(results).toEqual([
      { status: 'translated', text: 'HELLO <b>BOLD</b> <x1>LINK</x1><br/>END' },
      { status: 'translated', text: 'SECOND' },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ lang: 'de', attempt: 0 })
    expect(requests[0]!.system).toBe(epubTranslationSystemPrompt('de'))
    expect(requestBlocks(requests[0]!.prompt)).toEqual([
      { id: '1', text: 'Hello <b>bold</b> <x1>link</x1><br/>end' },
      { id: '2', text: 'Second' },
    ])
  })

  it('re-sends only the mismatched blocks, then gives up on them', async () => {
    const items = itemsOf('<p>Good</p><p>Has <a href="x">link</a></p><p>Lost</p>')
    const sent: { id: string; text: string }[][] = []
    const call = createEpubTranslationModelCall({
      lang: 'de',
      send: async (request) => {
        const blocks = requestBlocks(request.prompt)
        sent.push(blocks)
        return answerWith(blocks, (text, id) =>
          id === '1' ? 'GUT' : id === '2' ? text.replace(/<\/?x1>/g, '') : undefined,
        )
      },
    })
    const results = await call(items, signal())
    expect(sent.map((s) => s.map((b) => b.id))).toEqual([
      ['1', '2', '3'],
      ['2', '3'],
      ['2', '3'],
    ])
    expect(sent).toHaveLength(1 + EPUB_TRANSLATION_MAX_RESENDS)
    expect(results).toEqual([
      { status: 'translated', text: 'GUT' },
      { status: 'failed', reason: 'placeholder-mismatch' },
      { status: 'failed', reason: 'missing-translation' },
    ])
  })

  it('takes a block that comes back right on a resend', async () => {
    const items = itemsOf('<p>A <i>b</i> <span>c</span></p>')
    let attempt = 0
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async (request) => {
        attempt = request.attempt
        return answerWith(requestBlocks(request.prompt), (text) =>
          request.attempt === 0 ? text.replace('<x1>', '<x2>').replace('</x1>', '</x2>') : text,
        )
      },
    })
    expect(await call(items, signal())).toEqual([
      { status: 'translated', text: 'A <i>b</i> <x1>c</x1>' },
    ])
    expect(attempt).toBe(1)
  })

  it('rejects broken nesting, unknown tags, doubled and wrong-kind placeholders', async () => {
    const items = itemsOf('<p>A <span>b</span><img src="i.png" alt=""/></p>')
    const answers = [
      '<b>A <x1>b</b></x1><x2/>',
      'A <x1>b</x1><x2/><script>x</script>',
      'A <x1>b</x1><x1>c</x1><x2/>',
      'A <x1>b</x1><x2>c</x2>',
    ]
    for (const answer of answers) {
      const call = createEpubTranslationModelCall({
        lang: 'fr',
        maxResends: 0,
        send: async (request) => answerWith(requestBlocks(request.prompt), () => answer),
      })
      expect(await call(items, signal())).toEqual([
        { status: 'failed', reason: 'placeholder-mismatch' },
      ])
    }
  })

  it('accepts added or dropped bold, italic and line breaks', async () => {
    const items = itemsOf('<p>A <b>b</b> c</p>')
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async (request) => answerWith(requestBlocks(request.prompt), () => '<i>A</i> b<br/>c'),
    })
    expect(await call(items, signal())).toEqual([
      { status: 'translated', text: '<i>A</i> b<br/>c' },
    ])
  })

  it('fails an empty translation of a block that has text', async () => {
    const items = itemsOf('<p>Text <img src="i.png" alt=""/></p>')
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      maxResends: 1,
      send: async (request) => answerWith(requestBlocks(request.prompt), () => '  <x1/> '),
    })
    expect(await call(items, signal())).toEqual([{ status: 'failed', reason: 'empty-translation' }])
  })

  it('trims the translation', async () => {
    const items = itemsOf('<p>Text</p>')
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async (request) => answerWith(requestBlocks(request.prompt), () => '\n  Texte \n'),
    })
    expect(await call(items, signal())).toEqual([{ status: 'translated', text: 'Texte' }])
  })

  it('translates title and contents units as plain text', async () => {
    const units = metadataTranslationUnits({ titles: ['Tom & Jerry'], nav: [], ncx: [] })
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async (request) => answerWith(requestBlocks(request.prompt), shout),
    })
    expect(await call([{ block: units[0]!, key: units[0]!.key }], signal())).toEqual([
      { status: 'translated', text: 'TOM &amp; JERRY' },
    ])
    const sneaky = createEpubTranslationModelCall({
      lang: 'fr',
      maxResends: 0,
      send: async (request) => answerWith(requestBlocks(request.prompt), () => 'Tom <x1/>'),
    })
    expect(await sneaky([{ block: units[0]!, key: units[0]!.key }], signal())).toEqual([
      { status: 'failed', reason: 'placeholder-mismatch' },
    ])
  })

  it('throws JobUnitFailure when no answer could be read at all', async () => {
    const items = itemsOf('<p>One</p>')
    let calls = 0
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async () => {
        calls++
        return 'I cannot help with that.'
      },
    })
    const error = await call(items, signal()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(JobUnitFailure)
    expect((error as JobUnitFailure).reason).toBe('unparseable-response')
    expect(calls).toBe(1 + EPUB_TRANSLATION_MAX_RESENDS)
  })

  it('passes run errors through untouched', async () => {
    const items = itemsOf('<p>One</p>')
    const error = new FakeRunError('rate-limit', 123)
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async () => {
        throw error
      },
    })
    await expect(call(items, signal())).rejects.toBe(error)
  })

  it('stops before sending when the signal is aborted', async () => {
    const items = itemsOf('<p>One</p>')
    const controller = new AbortController()
    controller.abort('cancelled')
    let calls = 0
    const call = createEpubTranslationModelCall({
      lang: 'fr',
      send: async () => {
        calls++
        return '{}'
      },
    })
    await expect(call(items, controller.signal)).rejects.toBe('cancelled')
    expect(calls).toBe(0)
  })

  it('refuses a bad resend count', () => {
    expect(() =>
      createEpubTranslationModelCall({ lang: 'fr', maxResends: -1, send: async () => '' }),
    ).toThrow(RangeError)
  })
})
