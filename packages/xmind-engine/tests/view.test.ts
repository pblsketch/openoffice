import { describe, expect, it } from 'vitest'
import { layoutFromStructureClass, structureClassForLayout, VIEW_LAYOUTS } from '../src/layout'
import { htmlToPlainText, noteText } from '../src/notes'
import type { XmindSheet } from '../src/types'
import {
  formatRange,
  isInternalLink,
  isShownLink,
  isWebLink,
  parseRange,
  sheetToView,
  type ViewTopic,
} from '../src/view'
import { buildMapFile, openOk, sampleSheets } from './helpers'

const sample = (): XmindSheet => sampleSheets()[0] as XmindSheet

function sheetWithRoot(rootTopic: Record<string, unknown>, more: object = {}): XmindSheet {
  return { id: 's', rootTopic: { id: 'r', ...rootTopic }, ...more } as XmindSheet
}

function find(topic: ViewTopic, id: string): ViewTopic | null {
  if (topic.id === id) return topic
  for (const child of topic.children) {
    const hit = find(child, id)
    if (hit) return hit
  }
  return null
}

describe('sheetToView', () => {
  it('gives one view per sheet, in file order, through the document', async () => {
    const second = { id: 'sheet-2', title: 'Second', rootTopic: { id: 'root', title: 'Other' } }
    const document = await openOk(await buildMapFile({ content: [sample(), second] }))
    const views = document.viewSheets()
    expect(views.map((view) => [view.index, view.id, view.title])).toEqual([
      [0, 'sheet-1', 'Sheet one'],
      [1, 'sheet-2', 'Second'],
    ])
    expect(views[1]!.root).toMatchObject({ id: 'root', title: 'Other', children: [] })
  })

  it('carries title, child order and folding', () => {
    const view = sheetToView(sample(), 0)
    expect(view.root.title).toBe('Centre')
    expect(view.root.children.map((topic) => topic.id)).toEqual(['a', 'b', 'c'])
    const alpha = find(view.root, 'a')!
    expect(alpha.children.map((topic) => [topic.id, topic.title, topic.folded])).toEqual([
      ['a1', 'A one', false],
      ['a2', 'A two', true],
      ['a3', 'A three', false],
    ])
    expect(find(view.root, 'c')!.title).toBe('')
  })

  it('carries labels, the note as plain text, marker ids and the web link', () => {
    const alpha = find(sheetToView(sample(), 0).root, 'a')!
    expect(alpha.labels).toEqual(['one', 'two'])
    expect(alpha.note).toBe('first line\nsecond <b>line</b> & more\n')
    expect(alpha.markers).toEqual(['priority-1', 'task-half'])
    expect(alpha.link).toBe('https://example.com/a?x=1&y=2')
    const beta = find(sheetToView(sample(), 0).root, 'b')!
    expect(beta).toMatchObject({ labels: [], note: null, markers: [], link: null })
  })

  it('a link to a topic or to an attachment is not view data; every other link is', () => {
    expect(find(sheetToView(sample(), 0).root, 'c')!.link).toBeNull()
    const linked = (href: unknown) =>
      sheetToView({ rootTopic: { id: 'r', children: { attached: [{ id: 'x', href }] } } }, 0).root
        .children[0]!.link
    // Shown as they are in the file, whether or not anything would open them.
    for (const shown of [
      'https://example.com',
      'mailto:someone@example.com',
      'javascript:alert(1)',
      'file:///C:/secret.txt',
      'ftp://example.com/x',
      'example.com/no-scheme',
    ]) {
      expect(linked(shown), shown).toBe(shown)
      expect(isShownLink(shown), shown).toBe(true)
    }
    // The two kinds that are kept in the file only, and what is no link at all.
    for (const hidden of [
      'xmind:#abc',
      'XMIND:#abc',
      'xap:resources/file.pdf',
      'Xap:attachments/a',
    ]) {
      expect(linked(hidden), hidden).toBeNull()
      expect(isInternalLink(hidden), hidden).toBe(true)
      expect(isShownLink(hidden), hidden).toBe(false)
    }
    for (const none of ['', '   ', 7, null, undefined, { url: 'x' }]) {
      expect(linked(none), String(none)).toBeNull()
      expect(isShownLink(none), String(none)).toBe(false)
    }
  })

  it('a web link keeps its meaning: http, https and mailto only', () => {
    expect(isWebLink('https://example.com')).toBe(true)
    expect(isWebLink('HTTP://example.com')).toBe(true)
    expect(isWebLink('mailto:someone@example.com')).toBe(true)
    for (const other of [
      'xmind:#abc',
      'xap:resources/file.pdf',
      'file:///c:/x.txt',
      'javascript:alert(1)',
      'ftp://example.com/x',
      '',
      7,
      null,
    ]) {
      expect(isWebLink(other), String(other)).toBe(false)
    }
  })

  it('carries the picture reference and the topic style as the raw values in the file', () => {
    const beta = find(sheetToView(sample(), 0).root, 'b')!
    expect(beta.image).toEqual({
      src: 'xap:resources/picture.png',
      entryName: 'resources/picture.png',
      width: 120.5,
      height: 80,
    })
    expect(beta.style).toEqual({
      color: '#112233',
      fill: '#445566',
      fontWeight: '700',
      fontSize: '18pt',
      fontFamily: 'Some Family',
    })
    expect(find(sheetToView(sample(), 0).root, 'a')!.style).toEqual({})
    const remote = sheetWithRoot({ image: { src: 'https://example.com/p.png' } })
    expect(sheetToView(remote, 0).root.image).toEqual({
      src: 'https://example.com/p.png',
      entryName: null,
      width: null,
      height: null,
    })
  })

  it('carries summaries by record, with the covered range and the summary title', () => {
    const alpha = find(sheetToView(sample(), 0).root, 'a')!
    expect(alpha.summaries).toEqual([
      { id: 'sum-rec', topicId: 'sum-topic', title: 'Sums up', start: 1, end: 2 },
    ])
  })

  it('leaves out summaries it cannot place, and never throws on them', () => {
    const root = {
      children: {
        attached: [{ id: 'k0' }, { id: 'k1' }],
        summary: [{ id: 'st', title: 'S' }],
      },
      summaries: [
        { id: 'past-end', range: '(0,5)', topicId: 'st' },
        { id: 'backwards', range: '(1,0)', topicId: 'st' },
        { id: 'other-form', range: 'master', topicId: 'st' },
        { id: 'no-topic', range: '(0,1)', topicId: 'gone' },
        { range: '(0,1)', topicId: 'st' },
        'text',
        null,
        { id: 'good', range: '(0,1)', topicId: 'st' },
      ],
    }
    expect(sheetToView(sheetWithRoot(root), 0).root.summaries).toEqual([
      { id: 'good', topicId: 'st', title: 'S', start: 0, end: 1 },
    ])
    expect(sheetToView(sheetWithRoot({ summaries: 'x' }), 0).root.summaries).toEqual([])
  })

  it('carries relationships between shown topics only', () => {
    const view = sheetToView(sample(), 0)
    expect(view.relationships).toEqual([
      {
        id: 'rel-1',
        fromId: 'a1',
        toId: 'b',
        title: 'leads to',
        curve: { from: { x: 1.5, y: 2 }, to: { x: 3, y: 4 } },
      },
    ])
    const odd = sheetWithRoot(
      { children: { attached: [{ id: 'x' }, { id: 'y' }] } },
      {
        relationships: [
          null,
          'r',
          { id: 'r1', end1Id: 'x' },
          { id: 'r2', end1Id: 'x', end2Id: 'y' },
        ],
      },
    )
    expect(sheetToView(odd, 0).relationships).toEqual([
      { id: 'r2', fromId: 'x', toId: 'y', title: '' },
    ])
    expect(sheetToView(sheetWithRoot({}, { relationships: {} }), 0).relationships).toEqual([])
  })

  it('carries a relationship that ends on a shown summary topic, from either side', () => {
    const sheet = sheetWithRoot(
      {
        children: {
          attached: [
            {
              id: 'p',
              children: {
                attached: [{ id: 'k0' }, { id: 'k1' }],
                summary: [
                  {
                    id: 'shown-summary',
                    title: 'Shown',
                    children: { attached: [{ id: 'under-summary' }] },
                  },
                  { id: 'unplaced-summary', title: 'Not shown' },
                ],
                callout: [{ id: 'callout' }],
              },
              summaries: [
                { id: 'placed', range: '(0,1)', topicId: 'shown-summary' },
                { id: 'past-end', range: '(0,9)', topicId: 'unplaced-summary' },
              ],
            },
            { id: 'q' },
          ],
          detached: [{ id: 'floating' }],
        },
      },
      {
        relationships: [
          { id: 'to-summary', end1Id: 'q', end2Id: 'shown-summary', title: 'into' },
          { id: 'from-summary', end1Id: 'shown-summary', end2Id: 'k0' },
          { id: 'to-branch-under-summary', end1Id: 'q', end2Id: 'under-summary' },
          { id: 'to-unplaced-summary', end1Id: 'q', end2Id: 'unplaced-summary' },
          { id: 'to-callout', end1Id: 'q', end2Id: 'callout' },
          { id: 'to-floating', end1Id: 'floating', end2Id: 'q' },
        ],
      },
    )
    const view = sheetToView(sheet, 0)
    expect(view.root.children[0]!.summaries.map((summary) => summary.topicId)).toEqual([
      'shown-summary',
    ])
    expect(view.relationships).toEqual([
      { id: 'to-summary', fromId: 'q', toId: 'shown-summary', title: 'into' },
      { id: 'from-summary', fromId: 'shown-summary', toId: 'k0', title: '' },
    ])
  })

  it('keeps preserve-only parts out of the view', () => {
    const view = sheetToView(sample(), 0)
    const serialised = JSON.stringify(view)
    for (const hidden of [
      'float',
      'callout-1',
      'under-summary',
      'futureTopicKey',
      'futureSheetKey',
      'line-width',
      'theme-map',
      'controlPoints',
      'someone.else',
    ]) {
      expect(serialised, hidden).not.toContain(hidden)
    }
  })

  it('does not touch the source tree and shares nothing with it', () => {
    const sheet = sample()
    const before = JSON.stringify(sheet)
    const view = sheetToView(sheet, 0)
    view.root.children[0]!.labels.push('view only')
    view.root.children[0]!.title = 'view only'
    view.root.children.reverse()
    expect(JSON.stringify(sheet)).toBe(before)
  })

  it('reads whatever sits in a modelled key without throwing', () => {
    const odd = sheetWithRoot(
      {
        title: 5,
        branch: true,
        labels: ['ok', 3, null, 'also ok'],
        notes: 'text',
        href: { url: 'x' },
        markers: [{ markerId: 4 }, 'm', { markerId: 'flag' }],
        image: 'picture',
        style: { properties: { 'fo:color': 12, 'svg:fill': '#abc' } },
        structureClass: 9,
        summaries: {},
      },
      { title: null, id: 3 },
    )
    const view = sheetToView(odd, 4)
    expect(view).toMatchObject({ index: 4, id: null, title: '', layout: 'both' })
    expect(view.root).toEqual({
      id: 'r',
      title: '',
      folded: false,
      labels: ['ok', 'also ok'],
      note: null,
      link: null,
      image: null,
      markers: ['flag'],
      style: { fill: '#abc' },
      titleRuns: null,
      summaries: [],
      children: [],
    })
  })
})

describe('layout', () => {
  it('maps the arrangements the editor can draw', () => {
    const cases: [string | undefined, string, boolean][] = [
      ['org.xmind.ui.logic.right', 'right', true],
      ['org.xmind.ui.logic.left', 'left', true],
      ['org.xmind.ui.map', 'both', true],
      ['org.xmind.ui.map.unbalanced', 'both', true],
      ['org.xmind.ui.map.clockwise', 'both', true],
      ['org.xmind.ui.map.anticlockwise', 'both', true],
      ['org.xmind.ui.org-chart.down', 'down', true],
      ['org.xmind.ui.tree.right', 'tree', true],
      ['org.xmind.ui.timeline.horizontal', 'timeline', true],
      [undefined, 'both', true],
    ]
    for (const [structureClass, layout, exact] of cases) {
      expect(layoutFromStructureClass(structureClass), String(structureClass)).toEqual({
        layout,
        exact,
      })
    }
  })

  it('draws every other arrangement as a stand-in and says so', () => {
    for (const rightward of ['org.xmind.ui.brace.right', 'org.xmind.ui.fishbone.right']) {
      expect(layoutFromStructureClass(rightward), rightward).toEqual({
        layout: 'right',
        exact: false,
      })
    }
    for (const other of [
      'org.xmind.ui.tree.left',
      'org.xmind.ui.brace.left',
      'org.xmind.ui.org-chart.up',
      'org.xmind.ui.fishbone.leftHeaded',
      'org.xmind.ui.timeline.vertical',
      'org.xmind.ui.spreadsheet',
      'something.new',
      '',
      42,
      null,
    ]) {
      expect(layoutFromStructureClass(other), String(other)).toEqual({
        layout: 'both',
        exact: false,
      })
    }
  })

  it('never stands in with left, down, tree or timeline: those are only drawn for the classes that mean them', () => {
    for (const unknown of [
      'org.xmind.ui.tree.left',
      'org.xmind.ui.brace.left',
      'org.xmind.ui.fishbone.rightHeaded',
      'org.xmind.ui.timeline.down',
      'org.xmind.ui.timeline.vertical',
      'org.xmind.ui.org-chart.up',
      'vendor.new.left',
      'vendor.new.down',
      'vendor.tree',
      'left',
      'down',
      'tree',
      'timeline',
    ]) {
      const { layout, exact } = layoutFromStructureClass(unknown)
      expect(exact, unknown).toBe(false)
      expect(['both', 'right'], unknown).toContain(layout)
    }
  })

  it('puts the layout of the central topic on the sheet', () => {
    expect(sheetToView(sample(), 0)).toMatchObject({ layout: 'right', layoutExact: true })
    const timeline = sheetWithRoot({ structureClass: 'org.xmind.ui.timeline.vertical' })
    expect(sheetToView(timeline, 0)).toMatchObject({ layout: 'both', layoutExact: false })
  })

  it('names a structure class for each layout that maps back to the same layout', () => {
    for (const layout of VIEW_LAYOUTS) {
      expect(layoutFromStructureClass(structureClassForLayout(layout))).toEqual({
        layout,
        exact: true,
      })
    }
  })
})

describe('ranges', () => {
  it('reads and writes the "(start,end)" form', () => {
    expect(parseRange('(1,2)')).toEqual({ start: 1, end: 2 })
    expect(parseRange('(0,0)')).toEqual({ start: 0, end: 0 })
    expect(parseRange(' ( 3 , 10 ) ')).toEqual({ start: 3, end: 10 })
    expect(formatRange(1, 2)).toBe('(1,2)')
    for (const bad of ['(2,1)', '(-1,2)', '(1.5,2)', '(1,2', 'master', '', null, 12, '(1,2,3)']) {
      expect(parseRange(bad), String(bad)).toBeNull()
    }
  })
})

describe('notes', () => {
  it('prefers the plain form and falls back to the rich one as text', () => {
    expect(
      noteText({ plain: { content: 'plain' }, realHTML: { content: '<div>rich</div>' } }),
    ).toBe('plain')
    expect(noteText({ realHTML: { content: '<div>rich <strong>text</strong></div>' } })).toBe(
      'rich text\n',
    )
    expect(noteText({ plain: { content: '' } })).toBe('')
    for (const none of [undefined, null, 'x', {}, { plain: 'x' }, { plain: { content: 3 } }]) {
      expect(noteText(none), JSON.stringify(none)).toBeNull()
    }
  })

  it('turns a rich note into lines of text', () => {
    expect(htmlToPlainText('<div>one</div><div>two&nbsp;</div>')).toBe('one\ntwo \n')
    expect(htmlToPlainText('<ul><li>a</li><li>b</li></ul><ol><li><br></li></ol>')).toBe('a\nb\n\n')
    expect(htmlToPlainText('<div>x &lt;b&gt; &amp;amp; &quot;q&quot; &#65;&#x42;</div>')).toBe(
      'x <b> &amp; "q" AB\n',
    )
    expect(htmlToPlainText('line<br>break &unknown; & alone')).toBe('line\nbreak &unknown; & alone')
  })
})
