/**
 * Side-by-side view, sentence linking (translation-reading spec 4.4, 6.1,
 * 11.1 "나란히 보기"): a translated paragraph that keeps valid sentence
 * boundaries reacts per sentence; the source sentence is found among the
 * page's PDF.js text items inside the block's box (or a cell paragraph's
 * box) and lit line by line; what cannot be found falls back to the block
 * outline and the paragraph highlight. Paragraphs without boundaries
 * (older, paragraph-stored, edited, mismatched) behave as before. Hover
 * only reads: nothing is sent and nothing is written.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { translationBlockKeys } from '../../../packages/pdf-structure/src/store/keys'
import type { TranslationBlockEntry } from '../../../packages/pdf-structure/src/store/store'
import { translationUnits } from '../../../packages/pdf-structure/src/translate'
import type {
  BlockRegion,
  DocumentTree,
  InlineRun,
  Rect,
  TreeBlock,
} from '../../../packages/pdf-structure/src/tree/types'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import type { PageGeom } from '../src/renderer/annotations'
import type { PdfStoredTranslation } from '../src/shared/ipc'
import { buildBilingualModel, splitRunsAtEnds } from '../src/renderer/bilingual/model'
import {
  hitTestSentenceBoxes,
  locatePageSentences,
  normalizeForMatch,
  pageChars,
  sentenceBoxesOn,
  sentenceLocated,
  sentenceTargets,
  userToTree,
  type PageTextItem,
} from '../src/renderer/bilingual/sentence-geometry'
import {
  useBilingual,
  type BilingualTextSource,
  type BilingualView,
} from '../src/renderer/bilingual/useBilingual'
import type { BilingualDataApi } from '../src/renderer/bilingual/useBilingualData'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)

const DOC = 'd'.repeat(64)
const UPRIGHT: PageGeom = { pw: 600, ph: 800, rot: 0 }

const runs = (text: string): InlineRun[] => [{ kind: 'text', text }]
const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 })
const region = (page: number, b: Rect): BlockRegion => ({ page, box: b })
const pageBreak = (page: number): TreeBlock => ({
  kind: 'pageBreak',
  id: `p${page}.break`,
  page,
  pageFingerprint: `fp${page}`,
  source: 'pdf',
})
const para = (id: string, page: number, text: string, regions: BlockRegion[]): TreeBlock => ({
  kind: 'paragraph',
  id,
  page,
  pageFingerprint: `fp${page}`,
  source: 'pdf',
  runs: runs(text),
  regions,
})

/** a PDF.js text item: upright, `size` pt font, every character half an em wide */
const item = (str: string, x: number, y: number, size = 10): PageTextItem => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: str.length * size * 0.5,
  height: size,
})

/** sentence ends of plain sentences joined with single spaces */
function endsOf(sentences: string[]): { text: string; ends: number[] } {
  const text = sentences.join(' ')
  const ends: number[] = []
  let at = 0
  sentences.forEach((s, i) => {
    at += (i > 0 ? 1 : 0) + s.length
    ends.push(at)
  })
  return { text, ends }
}

const SRC = endsOf(['First sentence here.', 'Second one follows.'])
const KO = endsOf(['첫 문장이다.', '둘째 문장이 따른다.'])
const MULTI = endsOf(['One two three.', 'Four five six.', 'Seven eight.'])
const MULTI_KO = endsOf(['하나 둘 셋.', '넷 다섯 여섯.', '일곱 여덟.'])

/** the box of p1.1 on page 1 and its two lines */
const P11_BOX = box(50, 600, 300, 640)
const P11_ITEMS = [item('First sentence here. Sec-', 55, 625), item('ond one follows.', 55, 610)]

function sentenceTree(pageCount = 3): DocumentTree {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: pageCount,
    pages: pages.map((page) => ({
      page,
      fingerprint: `fp${page}`,
      status: 'text' as const,
      widthPt: 600,
      heightPt: 800,
    })),
    blocks: [
      pageBreak(1),
      para('p1.1', 1, SRC.text, [region(1, P11_BOX)]),
      para('p1.2', 1, 'Alpha beta. Gamma delta.', [region(1, box(50, 500, 300, 540))]),
      para('p1.3', 1, MULTI.text, [
        region(1, box(50, 40, 550, 100)),
        region(2, box(50, 700, 550, 760)),
      ]),
      ...pages.slice(1).flatMap((page) => [pageBreak(page)]),
    ],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  }
}

const PAGE_ITEMS: Record<number, PageTextItem[]> = {
  1: [
    ...P11_ITEMS,
    // p1.2: the second sentence reads differently on the page (normalized away it is not)
    item('Alpha beta. Gamma dXlta.', 55, 520),
    // p1.3 starts at the bottom of page 1, its second sentence cut by the page end
    item('One two three. Four', 55, 70),
  ],
  2: [item('five six. Seven eight.', 55, 730)],
}

function storedOf(
  tree: DocumentTree,
  blocks: Record<string, Partial<TranslationBlockEntry>>,
): PdfStoredTranslation {
  const units = translationUnits(tree)
  const keys = translationBlockKeys(units)
  const byId = new Map(units.map((u, i) => [u.key, keys[i]!]))
  return {
    lang: 'ko',
    provider: 'codex',
    model: 'm',
    blocks: Object.entries(blocks).map(([id, b]) => ({
      key: byId.get(id)!,
      status: 'translated',
      savedAt: 1,
      ...b,
    })),
  }
}

const SENTENCED: Record<string, Partial<TranslationBlockEntry>> = {
  'p1.1': { text: KO.text, sourceSentenceEnds: SRC.ends, sentenceEnds: KO.ends },
  'p1.2': {
    text: KO.text,
    sourceSentenceEnds: [11, 'Alpha beta. Gamma delta.'.length],
    sentenceEnds: KO.ends,
  },
  'p1.3': { text: MULTI_KO.text, sourceSentenceEnds: MULTI.ends, sentenceEnds: MULTI_KO.ends },
}

const unitOf = (tree: DocumentTree, blocks: Record<string, Partial<TranslationBlockEntry>>) => {
  const model = buildBilingualModel(tree, storedOf(tree, blocks))
  return (id: string) => {
    const it = model.itemsById.get(id)!
    if (it.kind !== 'text') throw new Error('not text')
    return it.unit
  }
}

const inside = (b: Rect, outer: Rect) =>
  b.x0 >= outer.x0 - 1 && b.x1 <= outer.x1 + 1 && b.y0 >= outer.y0 - 1 && b.y1 <= outer.y1 + 1

function pageGeometry(tree: DocumentTree, page: number, items = PAGE_ITEMS[page] ?? []) {
  const model = buildBilingualModel(tree, storedOf(tree, SENTENCED))
  return locatePageSentences(page, pageChars(items, UPRIGHT), sentenceTargets(model))
}

// ── the model ──

describe('bilingual sentences: the model', () => {
  it('a translated unit with a valid pair keeps both lists', () => {
    const unit = unitOf(sentenceTree(), SENTENCED)('p1.1')
    expect(unit.sentenceEnds).toEqual({ source: SRC.ends, translated: KO.ends })
  })

  it('no lists, a source length unlike the current tree, invalid ends, or an edit: a paragraph', () => {
    const tree = sentenceTree()
    const none = unitOf(tree, { 'p1.1': { text: KO.text } })('p1.1')
    expect(none.sentenceEnds).toBeUndefined()
    // the tree's text is longer than the boundaries say (spec 6.1)
    const shorter = unitOf(tree, {
      'p1.1': { text: KO.text, sourceSentenceEnds: [20, 39], sentenceEnds: KO.ends },
    })('p1.1')
    expect(shorter.sentenceEnds).toBeUndefined()
    const notIncreasing = unitOf(tree, {
      'p1.1': { text: KO.text, sourceSentenceEnds: [20, 40], sentenceEnds: [12, 7] },
    })('p1.1')
    expect(notIncreasing.sentenceEnds).toBeUndefined()
    const counts = unitOf(tree, {
      'p1.1': { text: KO.text, sourceSentenceEnds: [5, 20, 40], sentenceEnds: KO.ends },
    })('p1.1')
    expect(counts.sentenceEnds).toBeUndefined()
    const edited = unitOf(tree, {
      'p1.1': {
        text: KO.text,
        edited: true,
        sourceSentenceEnds: SRC.ends,
        sentenceEnds: KO.ends,
      },
    })('p1.1')
    expect(edited.sentenceEnds).toBeUndefined()
  })

  it('splits runs at the ends and keeps marks, footnote markers stay before the boundary', () => {
    const marked: InlineRun[] = [
      { kind: 'text', text: '첫 ', bold: true },
      { kind: 'text', text: '문장.' },
      { kind: 'footnoteRef', id: 'f1', marker: '1' },
      { kind: 'text', text: ' 둘째', italic: true },
      { kind: 'text', text: '.' },
    ]
    // "첫 문장." = 5, " 둘째." = 4
    const parts = splitRunsAtEnds(marked, [5, 9])
    expect(parts).toEqual([
      [
        { kind: 'text', text: '첫 ', bold: true },
        { kind: 'text', text: '문장.' },
        { kind: 'footnoteRef', id: 'f1', marker: '1' },
      ],
      [
        { kind: 'text', text: ' 둘째', italic: true },
        { kind: 'text', text: '.' },
      ],
    ])
    // a run crossing the boundary is cut in two with its marks on both halves
    expect(splitRunsAtEnds([{ kind: 'text', text: 'ab cd', bold: true }], [2, 5])).toEqual([
      [{ kind: 'text', text: 'ab', bold: true }],
      [{ kind: 'text', text: ' cd', bold: true }],
    ])
  })
})

// ── the geometry ──

describe('bilingual sentences: finding source sentences on the page', () => {
  it('normalizing drops whitespace and hyphens and folds compatibility forms', () => {
    expect(normalizeForMatch('Sec-\nond  one ﬁne')).toBe('Secondonefine')
  })

  it('maps PDF user space to tree space, the saved rotation and crop origin included', () => {
    expect(userToTree(UPRIGHT, 100, 200)).toEqual([100, 200])
    expect(userToTree({ pw: 600, ph: 800, rot: 0, x0: 10, y0: 20 }, 110, 220)).toEqual([100, 200])
    // a page saved turned 90°: display width is 800, user y runs along display x
    const [x, y] = userToTree({ pw: 600, ph: 800, rot: 90 }, 100, 200)
    expect([x, y]).toEqual([200, 500])
  })

  it('a located sentence gets line boxes inside the block region', () => {
    const geo = pageGeometry(sentenceTree(), 1)
    const first = sentenceBoxesOn(geo, 'p1.1', 0)
    const second = sentenceBoxesOn(geo, 'p1.1', 1)
    expect(first).toHaveLength(1)
    // the second sentence starts at the end of line one and goes on in line two
    expect(second).toHaveLength(2)
    for (const b of [...first, ...second]) expect(inside(b, P11_BOX)).toBe(true)
    expect(first[0]!.x1).toBeLessThanOrEqual(second[0]!.x0 + 0.01)
    expect(second[1]!.y1).toBeLessThan(second[0]!.y0 + 5)
  })

  it('still matches with a line-end hyphen and different whitespace on the page', () => {
    const tree = sentenceTree()
    // words as separate items without spaces, a hyphen at the line end
    const items = [
      item('First', 55, 625),
      item('sentence', 90, 625),
      item('here.', 140, 625),
      item('Sec‐', 170, 625),
      item('ond', 55, 610),
      item('one', 80, 610),
      item('follows.', 100, 610),
    ]
    const geo = pageGeometry(tree, 1, items)
    expect(sentenceBoxesOn(geo, 'p1.1', 0)).toHaveLength(1)
    expect(sentenceBoxesOn(geo, 'p1.1', 1).length).toBeGreaterThan(0)
  })

  it('an unlocatable sentence is flagged for the block fallback; the found one still links', () => {
    const geo = pageGeometry(sentenceTree(), 1)
    expect(sentenceLocated([geo], 'p1.2', 0)).toBe(true)
    expect(sentenceLocated([geo], 'p1.2', 1)).toBe(false)
    expect(sentenceBoxesOn(geo, 'p1.2', 1)).toEqual([])
  })

  it('text outside the block box is never used', () => {
    const tree = sentenceTree()
    // the paragraph's words sit outside its box
    const geo = pageGeometry(tree, 1, [item('First sentence here. Second one follows.', 55, 400)])
    expect(sentenceLocated([geo], 'p1.1', 0)).toBe(false)
    expect(sentenceLocated([geo], 'p1.1', 1)).toBe(false)
  })

  it('a table cell paragraph is found inside its own paragraph box', () => {
    const cellBox = box(320, 300, 560, 340)
    const tree: DocumentTree = {
      ...sentenceTree(1),
      blocks: [
        pageBreak(1),
        {
          kind: 'table',
          id: 'p1.t',
          page: 1,
          pageFingerprint: 'fp1',
          source: 'pdf',
          regions: [region(1, box(40, 300, 560, 360))],
          table: {
            rowCount: 1,
            colCount: 2,
            cells: [
              {
                row: 0,
                col: 0,
                rowSpan: 1,
                colSpan: 1,
                paragraphs: [runs('First sentence here. Second one follows.')],
                region: region(1, box(40, 300, 300, 360)),
                paragraphBoxes: [box(40, 300, 300, 340)],
              },
              {
                row: 0,
                col: 1,
                rowSpan: 1,
                colSpan: 1,
                paragraphs: [runs(SRC.text)],
                region: region(1, box(310, 300, 560, 360)),
                paragraphBoxes: [cellBox],
              },
            ],
          },
        },
      ],
    }
    const stored = storedOf(tree, {
      'p1.t#0.1.0': { text: KO.text, sourceSentenceEnds: SRC.ends, sentenceEnds: KO.ends },
    })
    const model = buildBilingualModel(tree, stored)
    const items = [
      // the same words in the left cell: not this paragraph
      item('First sentence here. Second one follows.', 45, 320),
      item('First sentence here.', 325, 325),
      item('Second one follows.', 325, 310),
    ]
    const geo = locatePageSentences(1, pageChars(items, UPRIGHT), sentenceTargets(model))
    const first = sentenceBoxesOn(geo, 'p1.t#0.1.0', 0)
    const second = sentenceBoxesOn(geo, 'p1.t#0.1.0', 1)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    for (const b of [...first, ...second]) expect(inside(b, cellBox)).toBe(true)
    expect(geo.boxes.every((b) => b.itemId === 'p1.t')).toBe(true)
  })

  it('a paragraph across pages: each sentence is lit on the page it sits on', () => {
    const tree = sentenceTree()
    const page1 = pageGeometry(tree, 1)
    const page2 = pageGeometry(tree, 2)
    expect(sentenceBoxesOn(page1, 'p1.3', 0)).toHaveLength(1)
    expect(sentenceBoxesOn(page2, 'p1.3', 0)).toEqual([])
    // the sentence cut by the page end: its start on page 1, its end on page 2
    expect(sentenceBoxesOn(page1, 'p1.3', 1)).toHaveLength(1)
    expect(sentenceBoxesOn(page2, 'p1.3', 1)).toHaveLength(1)
    // the last sentence sits on the next page only
    expect(sentenceBoxesOn(page1, 'p1.3', 2)).toEqual([])
    const last = sentenceBoxesOn(page2, 'p1.3', 2)
    expect(last).toHaveLength(1)
    expect(inside(last[0]!, box(50, 700, 550, 760))).toBe(true)
  })

  it('the hit test picks the sentence under the point', () => {
    const geo = pageGeometry(sentenceTree(), 1)
    const [line2] = sentenceBoxesOn(geo, 'p1.1', 1).slice(1)
    const x = (line2!.x0 + line2!.x1) / 2
    const y = (line2!.y0 + line2!.y1) / 2
    expect(hitTestSentenceBoxes(geo.boxes, x, y)).toMatchObject({
      unitKey: 'p1.1',
      itemId: 'p1.1',
      sentence: 1,
    })
    const [first] = sentenceBoxesOn(geo, 'p1.1', 0)
    expect(
      hitTestSentenceBoxes(geo.boxes, first!.x0 + 2, (first!.y0 + first!.y1) / 2),
    ).toMatchObject({ sentence: 0 })
    // inside the block box but on no sentence's letters
    expect(hitTestSentenceBoxes(geo.boxes, 290, 602)).toBeNull()
  })

  it('a paragraph without boundaries is no target', () => {
    const tree = sentenceTree()
    const model = buildBilingualModel(tree, storedOf(tree, { 'p1.1': { text: KO.text } }))
    expect(sentenceTargets(model)).toEqual([])
  })
})

// ── on screen ──

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => {})
}

function channels(tree: DocumentTree, stored: PdfStoredTranslation) {
  const forbidden = {
    write: vi.fn(),
    aiStream: vi.fn(),
    send: vi.fn(),
    convert: vi.fn(),
    writeBack: vi.fn(),
  }
  vi.stubGlobal('pdfApi', {
    aiStream: forbidden.aiStream,
    store: { write: forbidden.write },
    structure: { convert: forbidden.convert, writeBack: forbidden.writeBack },
    ai: { send: forbidden.send },
  })
  const api = {
    tree: vi.fn(async () => ({
      ok: true as const,
      docHash: DOC,
      tree,
      fingerprints: [],
      cached: false,
    })),
    cancel: vi.fn(async () => true),
    onProgress: () => () => {},
    store: {
      aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
      translationRecency: vi.fn(async () => ({
        ok: true as const,
        langs: [{ lang: 'ko', savedAt: 1 }],
      })),
      translation: vi.fn(async () => ({ ok: true as const, translation: stored })),
      write: forbidden.write,
    },
  } as unknown as BilingualDataApi
  const getTextContent = vi.fn()
  const getPage = vi.fn(async (pageNo: number) => ({
    getTextContent: async () => {
      getTextContent(pageNo)
      return { items: PAGE_ITEMS[pageNo] ?? [] }
    },
  }))
  const textSource: BilingualTextSource = { getPage }
  return { api, forbidden, textSource, getPage, getTextContent }
}

interface HarnessProps {
  api: BilingualDataApi
  textSource: BilingualTextSource
  pages: number[]
  visibleRows: Set<number>
  onView: (v: BilingualView) => void
  scrollRef: { current: HTMLElement | null }
}

function Harness(p: HarnessProps): ReactElement {
  const view = useBilingual({
    enabled: true,
    onClose: () => {},
    filePath: 'C:\\docs\\s.pdf',
    password: undefined,
    uiLang: 'en',
    t,
    revision: 0,
    api: p.api,
    textSource: p.textSource,
    scrollRef: p.scrollRef,
    scale: 1,
    pageGeom: () => UPRIGHT,
    savedRot: () => 0,
    savedPageCount: p.pages.length,
    rowCount: p.pages.length,
    visibleRows: p.visibleRows,
    unsavedPageEdits: false,
    reservedWidth: 0,
  })
  p.onView(view)
  return createElement(
    'div',
    null,
    p.pages.map((origIdx, r) =>
      createElement(
        'div',
        { key: r, className: 'pdf-row' },
        createElement(
          'div',
          { className: 'pdf-page', 'data-page': origIdx, style: { width: 600, height: 800 } },
          view.overlay(origIdx),
        ),
        view.column([origIdx], r),
      ),
    ),
  )
}

function mount(o: {
  tree?: DocumentTree
  stored?: Record<string, Partial<TranslationBlockEntry>>
  pages?: number[]
  visibleRows?: Set<number>
}) {
  const tree = o.tree ?? sentenceTree()
  const ch = channels(tree, storedOf(tree, o.stored ?? SENTENCED))
  const scroller = document.createElement('div')
  container.appendChild(scroller)
  const scrollRoot = createRoot(scroller)
  root = scrollRoot
  let current: BilingualView | null = null
  const props: HarnessProps = {
    api: ch.api,
    textSource: ch.textSource,
    pages: o.pages ?? [0, 1, 2],
    visibleRows: o.visibleRows ?? new Set([0]),
    onView: (v) => (current = v),
    scrollRef: { current: scroller },
  }
  act(() => scrollRoot.render(createElement(Harness, props)))
  return { ch, view: () => current! }
}

const pageEl = (i: number) => {
  const el = container.querySelectorAll<HTMLElement>('.pdf-page')[i]!
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, x: 0, y: 0 }) as DOMRect
  return el
}
/** move the pointer to tree point (x, y) on the upright page `i` */
const moveTo = (i: number, x: number, y: number) =>
  act(() => {
    pageEl(i).dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: 800 - y }),
    )
  })
/** the pages whose text content was read, in order (each drawn page with sentences once) */
const readPages = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map((c) => c[0] as number).sort((a, b) => a - b)
const sentencesOf = (id: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-bl-id="${id}"] .bl-sent`),
]

describe('bilingual sentences on screen', () => {
  it('a paragraph with boundaries shows sentence spans, marks and all', async () => {
    mount({})
    await flush()
    const spans = sentencesOf('p1.1')
    expect(spans.map((s) => s.textContent)).toEqual(['첫 문장이다.', '둘째 문장이 따른다.'])
    expect(container.querySelector('[data-bl-id="p1.1"]')!.textContent).toBe(KO.text)
  })

  it('hovering a translated sentence lights it and its source lines, not the paragraph', async () => {
    const { ch } = mount({})
    await flush()
    const spans = sentencesOf('p1.1')
    act(() => {
      spans[1]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(spans[1]!.className).toContain('bl-sent-hover')
    expect(spans[0]!.className).not.toContain('bl-sent-hover')
    expect(container.querySelector('[data-bl-id="p1.1"]')!.className).not.toContain('bl-hover')
    const lit = pageEl(0).querySelectorAll<HTMLElement>('.bl-overlay-sent')
    expect(lit).toHaveLength(2)
    // screen boxes inside the block's box: (50,600)-(300,640) is top 160..200
    for (const b of lit) {
      const top = parseFloat(b.style.top)
      expect(top).toBeGreaterThanOrEqual(159)
      expect(top + parseFloat(b.style.height)).toBeLessThanOrEqual(201)
    }
    // no block outline for a located sentence
    expect(container.querySelector('.bl-overlay-box')).toBeNull()
    act(() => {
      spans[1]!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    await flush()
    expect(container.querySelector('.bl-overlay-sent')).toBeNull()
    expect(spans[1]!.className).not.toContain('bl-sent-hover')
    // the text was read once per drawn page with sentences, never to hover
    expect(readPages(ch.getTextContent)).toEqual([1, 2])
    for (const spy of Object.values(ch.forbidden)) expect(spy).not.toHaveBeenCalled()
  })

  it('an unlocated sentence falls back to the block outline and the paragraph highlight', async () => {
    mount({})
    await flush()
    const spans = sentencesOf('p1.2')
    expect(spans).toHaveLength(2)
    act(() => {
      spans[1]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(container.querySelector('[data-bl-id="p1.2"]')!.className).toContain('bl-hover')
    expect(pageEl(0).querySelectorAll('.bl-overlay-box')).toHaveLength(1)
    expect(container.querySelector('.bl-overlay-sent')).toBeNull()
    // the located one links as a sentence
    act(() => {
      spans[1]!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
      spans[0]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(spans[0]!.className).toContain('bl-sent-hover')
    expect(container.querySelector('.bl-overlay-box')).toBeNull()
    expect(pageEl(0).querySelectorAll('.bl-overlay-sent').length).toBeGreaterThan(0)
  })

  it('the pointer over a source sentence lights its translated sentence; elsewhere in the box the paragraph', async () => {
    const { ch, view } = mount({})
    await flush()
    // in line one, early: "First sentence here."
    moveTo(0, 70, 628)
    await flush()
    const spans = sentencesOf('p1.1')
    expect(spans[0]!.className).toContain('bl-sent-hover')
    expect(spans[1]!.className).not.toContain('bl-sent-hover')
    // the page hover draws nothing on the page
    expect(container.querySelector('.bl-overlay-sent')).toBeNull()
    // the second line: the second sentence
    moveTo(0, 70, 613)
    await flush()
    expect(spans[1]!.className).toContain('bl-sent-hover')
    expect(spans[0]!.className).not.toContain('bl-sent-hover')
    // inside the block's box, on no letters: the paragraph as before
    moveTo(0, 290, 602)
    await flush()
    expect(container.querySelector('[data-bl-id="p1.1"]')!.className).toContain('bl-hover')
    expect(sentencesOf('p1.1').some((s) => s.className.includes('bl-sent-hover'))).toBe(false)
    // many moves: still one read per page, nothing sent
    for (let i = 0; i < 20; i++) moveTo(0, 60 + i, 628)
    await flush()
    expect(readPages(ch.getTextContent)).toEqual([1, 2])
    for (const spy of Object.values(ch.forbidden)) expect(spy).not.toHaveBeenCalled()
    expect(view().data.load.kind).toBe('ready')
  })

  it('a paragraph without boundaries keeps the paragraph link', async () => {
    const { ch } = mount({
      stored: {
        'p1.1': { text: KO.text },
        'p1.2': {
          text: KO.text,
          edited: true,
          sourceSentenceEnds: [11, 24],
          sentenceEnds: KO.ends,
        },
      },
    })
    await flush()
    expect(container.querySelector('.bl-sent')).toBeNull()
    const item = container.querySelector('[data-bl-id="p1.1"]')!
    act(() => {
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(item.className).toContain('bl-hover')
    expect(pageEl(0).querySelectorAll('.bl-overlay-box')).toHaveLength(1)
    // nothing needs the page text
    expect(ch.getPage).not.toHaveBeenCalled()
  })

  it('a paragraph across pages lights the sentence on the page it sits on', async () => {
    mount({ visibleRows: new Set([0, 1]) })
    await flush()
    const spans = sentencesOf('p1.3')
    expect(spans).toHaveLength(3)
    act(() => {
      spans[2]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await flush()
    expect(pageEl(0).querySelectorAll('.bl-overlay-sent')).toHaveLength(0)
    expect(pageEl(1).querySelectorAll('.bl-overlay-sent')).toHaveLength(1)
  })

  it('pages outside the drawn window are never read and get nothing', async () => {
    const pages = Array.from({ length: 8 }, (_, i) => i)
    const tree = sentenceTree(8)
    // every page has a sentence-linked paragraph
    tree.blocks = pages.flatMap((i) => [
      pageBreak(i + 1),
      para(`p${i + 1}.0`, i + 1, SRC.text, [region(i + 1, P11_BOX)]),
    ])
    const stored = Object.fromEntries(
      pages.map((i) => [
        `p${i + 1}.0`,
        { text: KO.text, sourceSentenceEnds: SRC.ends, sentenceEnds: KO.ends },
      ]),
    )
    const { ch, view } = mount({ tree, stored, pages, visibleRows: new Set([0]) })
    await flush()
    const read = ch.getPage.mock.calls.map((c) => c[0]).sort((a, b) => a - b)
    expect(read).toEqual([1, 2, 3])
    expect(view().overlay(7)).toBeNull()
  })
})
