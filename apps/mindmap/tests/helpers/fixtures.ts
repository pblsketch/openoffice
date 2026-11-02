/**
 * Test maps, built here with the engine. No file from another program is read
 * or copied: every id, key and value below is made up for these tests.
 */
import JSZip from 'jszip'
import {
  createXmindDocumentFromSheets,
  openXmind,
  type XmindDocument,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'

export const IDS = {
  sheet: '11111111-1111-4111-8111-111111111111',
  root: '22222222-2222-4222-8222-222222222222',
  // an id that is not UUID-shaped: files from other programs use their own shapes
  a: 'b9aa22deba98b3b20c7ac8aca2',
  a1: '33333333-3333-4333-8333-333333333331',
  a2: '33333333-3333-4333-8333-333333333332',
  a3: '33333333-3333-4333-8333-333333333333',
  b: '44444444-4444-4444-8444-444444444444',
  b1: '44444444-4444-4444-8444-444444444441',
  c: '55555555-5555-4555-8555-555555555555',
  summaryRecord: '66666666-6666-4666-8666-666666666661',
  summaryTopic: '66666666-6666-4666-8666-666666666662',
  underSummary: '66666666-6666-4666-8666-666666666663',
  boundary: '77777777-7777-4777-8777-777777777777',
  callout: '88888888-8888-4888-8888-888888888881',
  floating: '88888888-8888-4888-8888-888888888882',
  floatingChild: '88888888-8888-4888-8888-888888888883',
  relShown: '99999999-9999-4999-8999-999999999991',
  relHidden: '99999999-9999-4999-8999-999999999992',
} as const

/** What the rich sheet holds that the editor does not show: callout, branch under the summary, floating topic and its child, hidden relationship. Its boundary is drawn. */
export const RICH_PRESERVED = 5

/** A structure class the editor only stands in for; the file's value must survive. */
export const FISHBONE = 'org.xmind.ui.fishbone.leftHeaded'

export function topic(
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
  attached: XmindTopic[] = [],
): XmindTopic {
  const out: XmindTopic = { id, class: 'topic', title, ...extra }
  if (attached.length > 0) {
    out.children = { ...((extra.children as object | undefined) ?? {}), attached }
  }
  return out
}

/**
 * One sheet with everything T8 shows or keeps: labels, a note in both forms,
 * a web link, a topic link, a folded branch, a summary with a branch under
 * it, a boundary, a callout, a floating topic, a shown and a hidden
 * relationship, a stand-in layout, a theme this app did not write, and keys
 * the engine has never heard of.
 */
export function richSheet(): XmindSheet {
  const a = topic(
    IDS.a,
    'Alpha',
    {
      labels: ['urgent', 'draft'],
      notes: {
        plain: { content: 'note of alpha' },
        realHTML: { content: '<div>note of alpha</div>' },
      },
      href: 'https://example.com/alpha',
      markers: [{ markerId: 'priority-1' }],
      image: { src: 'xap:resources/picture.png', width: 40, height: 30 },
      style: { id: 'style-a', properties: { 'fo:color': '#aa0000', 'unknown:prop': 'kept' } },
      unknownTopicKey: { nested: ['kept', 1, true] },
      summaries: [{ id: IDS.summaryRecord, range: '(0,1)', topicId: IDS.summaryTopic }],
      boundaries: [{ id: IDS.boundary, range: '(0,2)', title: 'group' }],
      children: {
        summary: [
          topic(IDS.summaryTopic, 'Summary', {}, [topic(IDS.underSummary, 'Under the summary')]),
        ],
        callout: [topic(IDS.callout, 'Callout')],
      },
    },
    [topic(IDS.a1, 'Alpha one'), topic(IDS.a2, 'Alpha two'), topic(IDS.a3, 'Alpha three')],
  )
  const b = topic(IDS.b, 'Beta', { branch: 'folded', href: `xmind:#${IDS.a}` }, [
    topic(IDS.b1, 'Beta one'),
  ])
  const c = topic(IDS.c, 'Gamma')
  const root = topic(
    IDS.root,
    'Plan',
    {
      structureClass: FISHBONE,
      children: {
        detached: [
          topic(IDS.floating, 'Floating', {}, [topic(IDS.floatingChild, 'Below floating')]),
        ],
      },
    },
    [a, b, c],
  )
  return {
    id: IDS.sheet,
    class: 'sheet',
    rootTopic: root,
    title: 'First',
    relationships: [
      {
        id: IDS.relShown,
        end1Id: IDS.a1,
        end2Id: IDS.c,
        title: 'leads to',
        controlPoints: { '0': { x: 10, y: 20 }, '1': { x: -10, y: -20 } },
      },
      { id: IDS.relHidden, end1Id: IDS.floating, end2Id: IDS.c, title: 'hidden line' },
    ],
    theme: { map: { id: 'theme-map', properties: { 'svg:fill': '#101010' } } },
    extensions: [{ provider: 'org.example.unknown', content: { kept: true } }],
  }
}

/** A small plain sheet: a root and two branches, nothing hidden, no theme. */
export function plainSheet(title = 'Plain'): XmindSheet {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    class: 'sheet',
    rootTopic: topic('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Center', {}, [
      topic('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'One'),
      topic('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'Two'),
    ]),
    title,
  }
}

const FIXED_TIME = new Date('2026-01-02T03:04:05Z')

export function documentOf(...sheets: XmindSheet[]): Promise<XmindDocument> {
  return createXmindDocumentFromSheets(sheets, { now: FIXED_TIME })
}

/** A deep copy that can be compared with the tree later. */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** The bytes of a 2x1 PNG. Enough to be told as a picture; nothing has to decode it. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
])

/**
 * A map file with entries added to its archive (pictures under `resources/`),
 * opened. The engine itself only ever makes the three entries a map needs.
 */
export async function documentWithEntries(
  sheets: XmindSheet[],
  entries: Record<string, Uint8Array>,
): Promise<XmindDocument> {
  const plain = await (await documentOf(...sheets)).save()
  const zip = await JSZip.loadAsync(plain)
  for (const [name, bytes] of Object.entries(entries)) zip.file(name, bytes)
  const opened = await openXmind(await zip.generateAsync({ type: 'uint8array' }))
  if (opened.status !== 'ok') throw new Error(`the test map does not open: ${opened.status}`)
  return opened.document
}

export const FORMAT_IDS = {
  sheet: 'f0000000-0000-4000-8000-000000000000',
  root: 'f0000000-0000-4000-8000-000000000001',
  right: 'f0000000-0000-4000-8000-000000000002',
  rightA: 'f0000000-0000-4000-8000-000000000003',
  rightB: 'f0000000-0000-4000-8000-000000000004',
  left: 'f0000000-0000-4000-8000-000000000005',
  folded: 'f0000000-0000-4000-8000-000000000006',
  foldedA: 'f0000000-0000-4000-8000-000000000007',
  summaryRecord: 'f0000000-0000-4000-8000-000000000008',
  summaryTopic: 'f0000000-0000-4000-8000-000000000009',
  plainLine: 'f0000000-0000-4000-8000-00000000000a',
  styledLine: 'f0000000-0000-4000-8000-00000000000b',
  straightLine: 'f0000000-0000-4000-8000-00000000000c',
  around: 'f0000000-0000-4000-8000-00000000000d',
  master: 'f0000000-0000-4000-8000-00000000000e',
  sides: 'f0000000-0000-4000-8000-00000000000f',
  underFold: 'f0000000-0000-4000-8000-000000000010',
} as const

/**
 * A sheet with the line format of what hangs on no branch: a relationship
 * without values, one with every value and a curve, a straight one; a summary
 * bracket with a shape; boundaries around a range, around the whole map, over
 * both sides of the central topic and under a folded branch.
 */
export function lineFormatSheet(): XmindSheet {
  const id = FORMAT_IDS
  const right = topic(
    id.right,
    'Right',
    {
      summaries: [
        {
          id: id.summaryRecord,
          range: '(0,1)',
          topicId: id.summaryTopic,
          style: {
            id: 'summary-style',
            properties: { 'shape-class': 'org.xmind.summaryShape.curly' },
          },
        },
      ],
      boundaries: [
        {
          id: id.around,
          range: '(0,1)',
          title: '<b>around</b>',
          style: {
            id: 'boundary-style',
            properties: {
              'shape-class': 'org.xmind.boundaryShape.waves',
              'line-color': '#336699',
              'line-width': '2pt',
              'line-pattern': 'dash',
              'svg:fill': '#eeddcc',
            },
          },
        },
      ],
      children: { summary: [topic(id.summaryTopic, 'Both')] },
    },
    [topic(id.rightA, 'Right A'), topic(id.rightB, 'Right B')],
  )
  const folded = topic(
    id.folded,
    'Folded',
    { branch: 'folded', boundaries: [{ id: id.underFold, range: '(0,0)', title: 'unseen' }] },
    [topic(id.foldedA, 'Folded A')],
  )
  const root = topic(
    id.root,
    'Centre',
    {
      structureClass: 'org.xmind.ui.map.unbalanced',
      boundaries: [
        { id: id.master, range: 'master', title: 'everything' },
        { id: id.sides, range: '(0,2)', title: 'both sides' },
      ],
    },
    [right, folded, topic(id.left, 'Left')],
  )
  return {
    id: id.sheet,
    class: 'sheet',
    title: 'Lines',
    rootTopic: root,
    relationships: [
      { id: id.plainLine, end1Id: id.rightA, end2Id: id.left, title: 'plain' },
      {
        id: id.styledLine,
        end1Id: id.rightB,
        end2Id: id.left,
        title: 'styled',
        style: {
          id: 'line-style',
          properties: {
            'shape-class': 'org.xmind.relationshipShape.curved',
            'arrow-begin-class': 'org.xmind.arrowShape.dot',
            'arrow-end-class': 'org.xmind.arrowShape.triangle',
            'line-color': '#cc3300',
            'line-width': '3pt',
            'line-pattern': 'solid',
          },
        },
        controlPoints: { '0': { x: 40, y: -30 }, '1': { x: -50, y: 25 } },
      },
      {
        id: id.straightLine,
        end1Id: id.rightA,
        end2Id: id.folded,
        title: '',
        style: {
          id: 'straight-style',
          properties: { 'shape-class': 'org.xmind.relationshipShape.straight' },
        },
        controlPoints: { '0': { x: 1, y: 2 }, '1': { x: 3, y: 4 } },
      },
    ],
  }
}
