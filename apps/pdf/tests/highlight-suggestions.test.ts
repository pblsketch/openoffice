/**
 * AI highlight suggestions on the screen (reading-assist spec 3.5, 4.3, 4.6):
 * placing quotes in the text layer (whole quotes only), the preview that is
 * never part of the file, accept (a /Highlight with /Subj, `accepted` written
 * only after the save that wrote it, under the saved file's hash; nothing on
 * an unsaved close), dismiss (written at once), and the panel's suggestion
 * items, category and facet.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { createI18n } from '@genoffice/i18n'
import type { TranslationBlockKey } from '../../../packages/pdf-structure/src/store/keys'
import type {
  HighlightBlockEntry,
  HighlightRun,
} from '../../../packages/pdf-structure/src/store/reading'
import { applySaveRequest } from '../src/main/save-pdf'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import { HighlightSuggestions } from '../src/renderer/highlight/highlight-controller'
import { HighlightPreviewLayer } from '../src/renderer/highlight/HighlightPreview'
import { findWholeQuote, suggestionMarkup, suggestionViews } from '../src/renderer/highlight/locate'
import {
  HighlightPanelBar,
  categoryFacet,
  highlightItemActions,
  suggestionDrafts,
  suggestionKeyOf,
} from '../src/renderer/highlight/panel'
import { labelProblem, presetLabels, runIdOf } from '../src/renderer/highlight/presets'
import { AnnotPanel } from '../src/renderer/annot-panel/AnnotPanel'
import { filterAnnotItems, EMPTY_FILTER } from '../src/renderer/annot-panel/filter'
import { buildAnnotItems, type AnnotBuildInput } from '../src/renderer/annot-panel/items'
import { createSaveConfirmations } from '../src/renderer/reading/save-confirmations'
import {
  loadHighlightPreview,
  previewShown,
  saveHighlightPreview,
  showPreviewForSession,
  togglePreview,
} from '../src/renderer/highlight/useAiHighlights'
import type { PageEntry, SearchIndex } from '../src/renderer/search'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)
const tKo: TFunc = (key, params) => translate('ko', key, params)

const DOC = 'c'.repeat(64)
const NEW_DOC = 'd'.repeat(64)

const RUN: HighlightRun = {
  runId: 'r'.repeat(32),
  presetId: 'research',
  labels: [
    { id: 'l1', name: 'Key claim', color: [1, 0.85, 0.3] },
    { id: 'l2', name: 'Result', color: [0.55, 0.85, 0.45] },
  ],
  pages: [1, 2],
  provider: 'claude-code',
  model: '',
  createdAt: 10,
}

const key = (fp: string, n = 0): TranslationBlockKey => ({
  pageFingerprint: fp,
  textHash: `h${fp}${n}`,
  occurrence: 0,
})

const BLOCKS: HighlightBlockEntry[] = [
  {
    key: key('fp1'),
    status: 'done',
    savedAt: 1,
    suggestions: [
      { id: 's1', labelId: 'l1', quote: 'We show that rivers carry more silt.', state: 'pending' },
      // on a scanned page the text layer does not have it
      { id: 's2', labelId: 'l2', quote: 'A sentence only an image holds.', state: 'pending' },
    ],
  },
  {
    key: key('fp2'),
    status: 'done',
    savedAt: 1,
    suggestions: [
      { id: 's1', labelId: 'l2', quote: 'Silt doubled over the decade.', state: 'pending' },
      { id: 's2', labelId: 'l1', quote: 'An old one.', state: 'dismissed' },
    ],
  },
]

/** a page entry of the viewer's text index: one run per line */
function entry(lines: string[], y0 = 700): PageEntry {
  let text = ''
  const items: PageEntry['items'] = []
  lines.forEach((line, i) => {
    const start = text.length
    text += line
    items.push({ start, end: text.length, x: 72, y: y0 - i * 14, w: line.length * 5, h: 10 })
    text += '\n'
  })
  return { text, lower: text.toLowerCase(), items } as unknown as PageEntry
}

const INDEX: SearchIndex = [
  // the text layer breaks the line and hyphenates "car-ry"
  entry(['Intro text. We show that rivers car-', 'ry more silt. Next.']),
  entry(['Silt doubled over the decade.']),
]

function fakeStore() {
  const writes: PdfStoreWriteRequest[] = []
  let blocks = structuredClone(BLOCKS)
  let hash = DOC
  const store = {
    docHash: vi.fn(async () => ({ ok: true as const, docHash: hash })),
    pageFingerprints: vi.fn(async () => ({
      ok: true as const,
      docHash: hash,
      fingerprints: ['fp1', 'fp2'],
    })),
    latestHighlight: vi.fn(async () => ({ ok: true as const, run: RUN, blocks })),
    highlightRuns: vi.fn(async () => ({ ok: true as const, runs: [RUN] })),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      if (request.kind === 'highlightSuggestionStates') {
        blocks = blocks.map((b) =>
          b.key.pageFingerprint === request.key.pageFingerprint
            ? {
                ...b,
                suggestions: b.suggestions.map((s) =>
                  request.states[s.id] ? { ...s, state: request.states[s.id]! } : s,
                ),
              }
            : b,
        )
      }
      return { ok: true as const }
    }),
  }
  return {
    store,
    writes,
    /** an in-app save gave the file a new hash (the results moved with it) */
    saved: () => {
      hash = NEW_DOC
    },
  }
}

async function loaded(f = fakeStore()) {
  const confirmations = createSaveConfirmations()
  const s = new HighlightSuggestions({
    store: f.store as never,
    file: () => ({ path: 'C:\\docs\\a.pdf' }),
    searchIndex: () => Promise.resolve(INDEX),
    confirmations,
  })
  s.setPlacing(true)
  await s.load()
  return { s, f, confirmations }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function render(node: ReturnType<typeof createElement>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

describe('placing suggestions', () => {
  it('finds the whole quote across line breaks and hyphens, never a part of it', () => {
    expect(findWholeQuote(INDEX[0], 'We show that rivers carry more silt.')).toHaveLength(2)
    expect(findWholeQuote(INDEX[0], 'We show that rivers carry less silt.')).toBeNull()
    expect(findWholeQuote(INDEX[0], 'abc')).toBeNull()
    expect(findWholeQuote(undefined, 'We show')).toBeNull()
  })

  it('places each suggestion on its block page by fingerprint; unknown pages have no place', () => {
    const views = suggestionViews(RUN, BLOCKS, ['fp1', 'fp2'], INDEX)
    expect(views.map((v) => [v.id, v.page, v.found?.origIdx ?? null])).toEqual([
      ['s1', 0, 0],
      ['s2', 0, null],
      ['s1', 1, 1],
      ['s2', 1, null],
    ])
    // the page changed: its fingerprint is gone
    const moved = suggestionViews(RUN, BLOCKS, ['fpX', 'fp2'], INDEX)
    expect(moved[0]!.page).toBeNull()
    expect(moved[0]!.found).toBeNull()
  })
})

describe('accepting and dismissing', () => {
  it('reads the newest run and lists only pending suggestions', async () => {
    const { s } = await loaded()
    expect(s.snapshot().run?.runId).toBe(RUN.runId)
    expect(s.pending().map((v) => v.quote)).toEqual([
      'We show that rivers carry more silt.',
      'A sentence only an image holds.',
      'Silt doubled over the decade.',
    ])
  })

  it('an accepted suggestion becomes a /Highlight with its category as /Subj', async () => {
    const { s } = await loaded()
    const view = s.pending()[0]!
    const markup = suggestionMarkup(view)!
    expect(markup).toMatchObject({ type: 'highlight', subject: 'Key claim', color: [1, 0.85, 0.3] })
    expect(suggestionMarkup(s.pending()[1]!)).toBeNull()
    const blank = await (async () => {
      const d = await PDFDocument.create()
      d.addPage([600, 800])
      d.addPage([600, 800])
      return d.save({ useObjectStreams: false })
    })()
    const out = await applySaveRequest(blank, {
      path: '/x.pdf',
      markups: [markup],
      drawings: [],
      formValues: [],
      stamps: [],
    })
    const doc = await PDFDocument.load(out.bytes)
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    const annot = annots.lookup(0, PDFDict)
    expect(annot.lookup(PDFName.of('Subtype'), PDFName).decodeText()).toBe('Highlight')
    const subj = annot.lookup(PDFName.of('Subj')) as PDFString | PDFHexString
    expect(subj.decodeText()).toBe('Key claim')
  })

  it('writes accepted only after the save that wrote it, under the saved file’s hash', async () => {
    const { s, f, confirmations } = await loaded()
    const ids: string[] = []
    const count = s.accept(s.pending(), () => {
      const id = `m${ids.length + 1}`
      ids.push(id)
      return id
    })
    // the one with no place is skipped
    expect(count).toBe(2)
    expect(ids).toEqual(['m1', 'm2'])
    expect(f.writes).toEqual([])
    expect(s.pending().map((v) => v.id + v.blockKey.pageFingerprint)).toEqual(['s2fp1'])
    expect(confirmations.pendingIds().sort()).toEqual(['m1', 'm2'])

    // a save that wrote only m1; the store moved to the new hash first
    f.saved()
    await confirmations.afterSave(['m1'], async () => NEW_DOC)
    expect(f.writes).toEqual([
      {
        kind: 'highlightSuggestionStates',
        docHash: NEW_DOC,
        runId: RUN.runId,
        key: key('fp1'),
        states: { s1: 'accepted' },
      },
    ])
    expect(confirmations.isPending('m2')).toBe(true)
    await s.load()
    // m1 is accepted in the store; m2 still waits (not pending in the list either)
    expect(
      s.snapshot().accepting.has(`${key('fp2').pageFingerprint}:${key('fp2').textHash}:0#s1`),
    ).toBe(true)
    expect(s.pending().map((v) => v.id + v.blockKey.pageFingerprint)).toEqual(['s2fp1'])
  })

  it('a save keeps an accepted suggestion confirmed through the reload: accepted lands under the new hash, no duplicate', async () => {
    const { s, f, confirmations } = await loaded()
    const first = s.pending()[0]!
    s.accept([first], () => 'm1')
    expect(s.pending()).toHaveLength(2)
    // the save succeeded: what it wrote is held before the reload
    confirmations.hold(['m1'])
    // the reload subtracts the saved highlight from the editing document
    s.prune(new Set())
    expect(confirmations.isPending('m1')).toBe(true)
    // still waiting for its save: neither offered again nor acceptable twice
    expect(s.pending()).toHaveLength(2)
    expect(s.accept([first], () => 'm2')).toBe(0)
    // the migration finished: the confirmation runs under the new hash
    f.saved()
    await confirmations.afterSave(['m1'], async () => NEW_DOC)
    expect(f.writes).toEqual([
      {
        kind: 'highlightSuggestionStates',
        docHash: NEW_DOC,
        runId: RUN.runId,
        key: key('fp1'),
        states: { s1: 'accepted' },
      },
    ])
    await s.load()
    expect(s.pending().map((v) => v.quote)).not.toContain('We show that rivers carry more silt.')
  })

  it('a document closed without saving keeps the suggestion pending', async () => {
    const f = fakeStore()
    const first = await loaded(f)
    first.s.accept([first.s.pending()[0]!], () => 'm1')
    // the tab goes away: its confirmations go with it, nothing is written
    expect(f.writes).toEqual([])
    const reopened = await loaded(f)
    expect(reopened.s.pending()[0]!.quote).toBe('We show that rivers carry more silt.')
    expect(reopened.s.pending()[0]!.state).toBe('pending')
  })

  it('an accepted highlight removed before any save goes back to pending', async () => {
    const { s, confirmations } = await loaded()
    s.accept([s.pending()[0]!], () => 'm1')
    expect(s.pending()).toHaveLength(2)
    s.prune(new Set(['m1']))
    expect(s.pending()).toHaveLength(2)
    s.prune(new Set())
    expect(confirmations.isPending('m1')).toBe(false)
    expect(s.pending()).toHaveLength(3)
  })

  it('dismiss writes dismissed at once, grouped by block', async () => {
    const { s, f } = await loaded()
    const [a, b, c] = s.pending()
    expect(await s.dismiss([a!, b!, c!])).toBe(true)
    expect(f.writes).toEqual([
      {
        kind: 'highlightSuggestionStates',
        docHash: DOC,
        runId: RUN.runId,
        key: key('fp1'),
        states: { s1: 'dismissed', s2: 'dismissed' },
      },
      {
        kind: 'highlightSuggestionStates',
        docHash: DOC,
        runId: RUN.runId,
        key: key('fp2'),
        states: { s1: 'dismissed' },
      },
    ])
    expect(s.pending()).toEqual([])
  })
})

describe('the preview', () => {
  it('draws label-colored boxes over placed pending suggestions only, and writes nothing', async () => {
    const { s, f } = await loaded()
    const geom = { pw: 600, ph: 800, rot: 0 } as never
    const el = await render(
      createElement(HighlightPreviewLayer, { suggestions: s, origIdx: 0, geom, scale: 1 }),
    )
    const boxes = el.querySelectorAll('.pdf-hl-preview')
    // the quote spans two lines; the unplaced one is not drawn
    expect(boxes).toHaveLength(2)
    expect((boxes[0] as HTMLElement).style.background).toMatch(/rgba\(255, 217, 77, 0\.35\)/)
    expect(el.querySelector('.pdf-hl-preview-layer')?.getAttribute('aria-hidden')).toBe('true')
    // accepting hides it from the preview; nothing reaches the store or the save request
    await act(async () => {
      s.accept([s.pending()[0]!], () => 'm1')
    })
    expect(el.querySelectorAll('.pdf-hl-preview')).toHaveLength(0)
    expect(f.writes).toEqual([])
  })
})

describe('the preview switch', () => {
  it('a finished run shows the preview for this session without changing the remembered choice', () => {
    window.localStorage.clear()
    saveHighlightPreview(false)
    let sw = { saved: loadHighlightPreview(), session: false }
    expect(previewShown(sw)).toBe(false)
    sw = showPreviewForSession(sw)
    expect(previewShown(sw)).toBe(true)
    expect(sw.saved).toBe(false)
    // the person turns it off again: off, and still remembered as off
    sw = togglePreview(sw)
    expect(previewShown(sw)).toBe(false)
    expect(sw).toEqual({ saved: false, session: false })
    // turned on by the person: remembered
    sw = togglePreview(sw)
    expect(sw).toEqual({ saved: true, session: false })
  })

  it('suggestions read while the preview was off can be accepted and dismissed once it is on', async () => {
    const f = fakeStore()
    const confirmations = createSaveConfirmations()
    const s = new HighlightSuggestions({
      store: f.store as never,
      file: () => ({ path: 'C:\\docs\\a.pdf' }),
      searchIndex: () => Promise.resolve(INDEX),
      confirmations,
    })
    s.setPlacing(false)
    await s.load()
    // off: nothing is placed (the panel shows suggestions only with the preview on)
    expect(s.snapshot().views).toBeNull()
    s.setPlacing(true)
    await vi.waitFor(() => expect(s.snapshot().views).not.toBeNull())
    const [first, , third] = s.pending()
    expect(s.accept([first!], () => 'm1')).toBe(1)
    expect(await s.dismiss([third!])).toBe(true)
    expect(f.writes.map((w) => w.kind)).toEqual(['highlightSuggestionStates'])
    expect(s.pending().map((v) => v.quote)).toEqual(['A sentence only an image holds.'])
  })
})

describe('the panel', () => {
  const baseInput = (extra: AnnotBuildInput['extra'], categoryOf?: AnnotBuildInput['categoryOf']) =>
    ({
      saved: {
        markups: [
          {
            pageIndex: 1,
            objNum: 41,
            type: 'highlight',
            quads: [[72, 710, 200, 710, 72, 700, 200, 700]],
            rect: [72, 700, 200, 710],
            color: [0.55, 0.85, 0.45],
            createdMs: 1,
            text: 'Silt doubled',
          },
          {
            pageIndex: 1,
            objNum: 42,
            type: 'highlight',
            quads: [[72, 610, 200, 610, 72, 600, 200, 600]],
            rect: [72, 600, 200, 610],
            color: [1, 0.87, 0.35],
            createdMs: 2,
            text: 'plain',
          },
        ],
        notes: [],
        others: [],
      },
      unsavedMarkups: [
        {
          id: 'm9',
          pageIndex: 0,
          type: 'highlight',
          color: [1, 0.85, 0.3],
          quads: [[72, 700, 200, 700, 72, 690, 200, 690]],
          subject: 'Key claim',
        },
      ],
      pendingNotes: [],
      deletedObjNums: new Set(),
      editedNotes: new Map(),
      pageTexts: new Map(),
      cards: [],
      cardPage: () => null,
      cardsLocated: true,
      displayPage: (i: number) => i + 1,
      t,
      languageName: (c: string) => c,
      extra,
      categoryOf,
    }) as AnnotBuildInput

  it('shows suggestion items with their label, a place or "not located", and the category facet', async () => {
    const { s } = await loaded()
    const drafts = suggestionDrafts(s.pending(), RUN, t, vi.fn())
    const items = buildAnnotItems(
      baseInput(drafts, (m) => (m.objNum === 41 ? 'Result' : undefined)),
    )
    const suggestions = items.filter((i) => i.kind === 'suggestion')
    expect(suggestions.map((i) => [i.text, i.category, i.notFound, i.pageNo])).toEqual([
      ['We show that rivers carry more silt.', 'Key claim', false, 1],
      ['A sentence only an image holds.', 'Result', true, 1],
      ['Silt doubled over the decade.', 'Result', false, 2],
    ])
    expect(suggestionKeyOf(suggestions[0]!)).toBe(s.pending()[0]!.key)
    // accepted highlights: saved by /Subj, unsaved by their subject
    expect(items.find((i) => i.key === 'S41')?.category).toBe('Result')
    expect(items.find((i) => i.key === 'S42')?.category).toBeUndefined()
    expect(items.find((i) => i.key === 'Lm9')?.category).toBe('Key claim')
    const facet = categoryFacet(t)
    const results = filterAnnotItems(items, { ...EMPTY_FILTER, facets: { category: 'Result' } }, [
      facet,
    ])
    expect(results.map((i) => i.key).sort()).toEqual(
      ['S41', ...suggestions.filter((i) => i.category === 'Result').map((i) => i.key)].sort(),
    )
  })

  it('renders "Highlight · category", the facet, accept/dismiss and the label bar', async () => {
    const { s } = await loaded()
    const pending = s.pending()
    const items = buildAnnotItems({
      ...baseInput(suggestionDrafts(pending, RUN, tKo, vi.fn()), (m) =>
        m.objNum === 41 ? '결과' : undefined,
      ),
      t: tKo,
    })
    const onAccept = vi.fn()
    const onDismiss = vi.fn()
    const onAcceptLabel = vi.fn()
    const onAcceptAllSave = vi.fn()
    const el = await render(
      createElement(AnnotPanel, {
        items,
        loading: false,
        title: 'Doc',
        t: tKo,
        onActivate: vi.fn(),
        onClose: vi.fn(),
        onNotice: vi.fn(),
        facets: [categoryFacet(tKo)],
        toolbar: createElement(HighlightPanelBar, {
          pending,
          run: RUN,
          t: tKo,
          readOnly: false,
          onAcceptLabel,
          onAcceptAllSave,
          onDismissAll: vi.fn(),
        }),
        renderItemActions: (item) =>
          highlightItemActions(item, {
            t: tKo,
            readOnly: false,
            viewOf: (k) => pending.find((v) => v.key === k),
            onAccept,
            onDismiss,
            waitingSave: (id) => id === 'm9',
          }),
      }),
    )
    const saved = el.querySelector('[data-key="S41"] .pdf-annot-kind')
    expect(saved?.textContent).toBe('형광펜 · 결과')
    expect(el.querySelector('select[name="facet-category"]')).not.toBeNull()
    expect(el.querySelector('[data-key="Lm9"] [data-waiting-save]')?.textContent).toBe('저장 대기')
    const rows = [...el.querySelectorAll('[data-action="hl-accept"]')] as HTMLButtonElement[]
    expect(rows).toHaveLength(3)
    // the one with no place cannot be accepted
    expect(rows.filter((b) => b.disabled)).toHaveLength(1)
    const lost = el.querySelector(`[data-key="H${pending[1]!.key}"]`)
    expect(lost?.textContent).toContain(strings.ko.apNotFound)
    await act(async () => rows[0]!.click())
    expect(onAccept).toHaveBeenCalledWith(pending[0])
    await act(async () =>
      (el.querySelector('[data-action="hl-dismiss"]') as HTMLButtonElement).click(),
    )
    expect(onDismiss).toHaveBeenCalledWith(pending[0])
    const labelRows = el.querySelectorAll('[data-action="hl-accept-label"]')
    expect(labelRows).toHaveLength(2)
    await act(async () => (labelRows[0] as HTMLButtonElement).click())
    expect(onAcceptLabel).toHaveBeenCalledWith('l1')
    // One of the three suggestions has no place; the combined action counts only
    // the two that can be accepted, and the one click accepts + saves.
    const acceptSave = el.querySelector('[data-action="hl-accept-save"]') as HTMLButtonElement
    expect(acceptSave.textContent).toContain('모두 받아들이고 저장 (2)')
    expect(acceptSave.disabled).toBe(false)
    await act(async () => acceptSave.click())
    expect(onAcceptAllSave).toHaveBeenCalledTimes(1)
  })
})

describe('labels', () => {
  it('presets give default names in the UI language; custom starts with one empty label', () => {
    expect(presetLabels('research', tKo).map((l) => l.name)).toEqual([
      '핵심 주장',
      '방법',
      '결과',
      '한계',
    ])
    expect(presetLabels('contract', tKo).map((l) => l.name)).toEqual([
      '의무',
      '기한',
      '금액',
      '해지·위약',
    ])
    expect(presetLabels('textbook', tKo).map((l) => l.name)).toEqual([
      '정의',
      '핵심 개념',
      '예시',
      '주의',
    ])
    expect(presetLabels('custom', tKo)).toHaveLength(1)
    expect(labelProblem(presetLabels('custom', tKo))).toBe('empty')
    expect(
      labelProblem([
        { name: 'A', color: [1, 1, 1] },
        { name: ' A ', color: [1, 1, 1] },
      ]),
    ).toBe('duplicate')
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `L${i}`,
      color: [1, 1, 1] as [number, number, number],
    }))
    expect(labelProblem(six)).toBe('count')
    expect(runIdOf('custom', [{ name: 'A', color: [1, 1, 1] }])).not.toBe(
      runIdOf('custom', [{ name: 'B', color: [1, 1, 1] }]),
    )
  })
})
