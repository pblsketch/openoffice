import { describe, expect, it } from 'vitest'
import { createXmindDocumentFromSheets } from '../src/create'
import type { XmindDocument } from '../src/document'
import { reconcileSheet } from '../src/reconcile'
import { MAX_TOPIC_DEPTH } from '../src/structure-check'
import type { XmindSheet } from '../src/types'
import { sheetToView, type ViewSheet } from '../src/view'
import {
  buildMapFile,
  CONTENT,
  fakePng,
  listZip,
  openOk,
  sampleSheets,
  text,
  unzip,
} from './helpers'
import {
  copyOf,
  detach,
  differences,
  freshTopic,
  inSource,
  inView,
  openSheets,
  UUID_V4,
} from './reconcile-helpers'

const NOW = new Date(Date.UTC(2031, 4, 6, 7, 8, 10))
const SOME_UUID = '3f0c1d52-8a4e-4b7a-9c11-5d2e6f7a8b90'

const sample = (): XmindSheet => sampleSheets()[0] as XmindSheet

/** Opens the sample, lets the test edit the view as the editor would, and reconciles it. */
async function edit(change: (view: ViewSheet) => void, content: unknown[] = sampleSheets()) {
  const document = await openSheets(content)
  const before = copyOf(document.sheets)
  const view = document.viewSheets()[0]!
  change(view)
  const result = reconcileSheet(document, 0, view)
  return { document, before, result, sheet: document.sheets[0]! }
}

function expectApplied(result: ReturnType<typeof reconcileSheet>) {
  if (!result.ok) throw new Error(`expected the state to be applied, got: ${result.problem}`)
  return result
}

/**
 * A sheet no program would write: values of the wrong shape in the keys the
 * view reads, two summary records naming one summary topic, two relationships
 * with one id, and entries that are not records at all.
 */
function oddSheet(): unknown {
  return {
    id: 'odd',
    rootTopic: {
      id: 'r',
      title: 7,
      branch: 'something-else',
      labels: ['kept', 3, null],
      notes: { ops: { ops: [{ insert: 'old form' }] } },
      href: 'xap:resources/file.pdf',
      structureClass: 9,
      children: {
        attached: [{ id: 'k0' }, { id: 'k1' }, { id: 'k2' }],
        summary: [{ id: 'st', title: 'S' }],
        futureKind: [{ id: 'fk', title: 'from a later version' }, 5],
      },
      summaries: [
        { id: 's1', range: '(0,1)', topicId: 'st' },
        { id: 's1', range: '( 1 , 2 )', topicId: 'st' },
        { id: 'past-end', range: '(0,9)', topicId: 'st' },
        null,
        'text',
      ],
      boundaries: [{ id: 'b1', range: '( 0 , 1 )' }, { id: 'b2', range: 'master' }, 'text'],
    },
    relationships: [
      { id: 'dup', end1Id: 'k0', end2Id: 'k1' },
      { id: 'dup', end1Id: 'k1', end2Id: 'k2', title: 5 },
      null,
      { id: 'half', end1Id: 'k0' },
    ],
  }
}

describe('reconcileSheet: a state that changes nothing', () => {
  it('leaves the document unchanged, and the file saves byte for byte', async () => {
    const original = await buildMapFile({ content: [sample(), oddSheet()] })
    const document = await openOk(original)
    const sheets = [...document.sheets]
    for (const view of document.viewSheets()) {
      const result = expectApplied(reconcileSheet(document, view.index, view))
      expect(result.changed).toBe(false)
      expect(result.inSync).toBe(true)
      expect(result.view).toEqual(view)
      expect(result.ids.topics.size + result.ids.relationships.size).toBe(0)
    }
    expect(document.sheets.map((sheet, index) => sheet === sheets[index])).toEqual([true, true])
    expect(document.changed).toBe(false)
    expect(await document.save({ thumbnail: fakePng(5), now: NOW })).toEqual(original)
  })

  it('does not count the parts of the state it never writes', async () => {
    const { document, result } = await edit((view) => {
      const beta = inView(view, 'b')
      beta.image = null
      beta.markers = ['flag-red']
      beta.style = { color: '#000000' }
      view.title = 'not applied here'
      view.id = 'other'
      view.index = 9
    })
    expect(expectApplied(result).changed).toBe(false)
    expect(document.changed).toBe(false)
  })
})

describe('reconcileSheet: a picture the user removed', () => {
  async function removing(change: (view: ViewSheet) => void, removedPictures: string[]) {
    const document = await openSheets(sampleSheets())
    const before = copyOf(document.sheets)
    const entries = [...document.entryNames]
    const view = document.viewSheets()[0]!
    change(view)
    const result = expectApplied(reconcileSheet(document, 0, view, { removedPictures }))
    return { document, before, entries, result, sheet: document.sheets[0]! }
  }

  it('takes the picture off a topic named as removed, and nothing else', async () => {
    const { document, before, entries, result, sheet } = await removing(
      (view) => (inView(view, 'b').image = null),
      ['b'],
    )
    expect(result).toMatchObject({ changed: true, inSync: true })
    expect(inSource(sheet, 'b')!.image).toBeUndefined()
    expect(differences(before[0], sheet)).toEqual(['$.rootTopic.children.attached[1].image'])
    // no archive entry goes: another topic may show the same picture
    expect(document.entryNames).toEqual(entries)
    expect(document.changed).toBe(true)
  })

  it('keeps a picture the state still shows, even for a topic named as removed', async () => {
    const { result, sheet } = await removing(() => {}, ['b'])
    expect(result.changed).toBe(false)
    expect(inSource(sheet, 'b')!.image).toEqual({
      src: 'xap:resources/picture.png',
      width: 120.5,
      height: 80,
    })
  })

  it('changes nothing for a named topic that has no picture', async () => {
    const { document, result } = await removing(() => {}, ['a1'])
    expect(result.changed).toBe(false)
    expect(document.changed).toBe(false)
  })
})

describe('reconcileSheet: a topic that is in both', () => {
  it('writes one edited title and nothing else, into content.json and no other entry', async () => {
    const original = await buildMapFile({
      extra: [
        { name: 'resources/picture.png', data: fakePng(9), store: true },
        { name: 'unknown/future.bin', data: new Uint8Array([0, 255, 1, 254]) },
      ],
      legacy: true,
    })
    const document = await openOk(original)
    const live = document.sheets[0]!
    const view = document.viewSheets()[0]!
    inView(view, 'b').title = 'Beta, renamed'
    const result = expectApplied(reconcileSheet(document, 0, view))
    expect(result).toMatchObject({ changed: true, inSync: true })
    expect(document.changed).toBe(true)
    // the sheet stays the object the document held; a caller that kept it reads the new tree
    expect(document.sheets[0]).toBe(live)
    expect(live.rootTopic.children!.attached![1]!.title).toBe('Beta, renamed')

    const saved = await document.save({ now: NOW })
    const before = listZip(original)
    const after = listZip(saved)
    expect(after.map((entry) => entry.name)).toEqual(before.map((entry) => entry.name))
    for (const [index, entry] of before.entries()) {
      if (entry.name !== CONTENT) expect(after[index]!.raw, entry.name).toEqual(entry.raw)
    }
    const rewritten = JSON.parse(text((await unzip(saved)).get(CONTENT)!))
    expect(differences(sampleSheets(), rewritten)).toEqual([
      '$[0].rootTopic.children.attached[1].title',
    ])
    expect(rewritten[0].rootTopic.children.attached[1].title).toBe('Beta, renamed')
  })

  it('writes folding, labels and the web link only where they differ', async () => {
    const { before, sheet } = await edit((view) => {
      inView(view, 'a1').folded = true
      inView(view, 'a2').folded = false
      inView(view, 'a3').labels = ['fresh']
      inView(view, 'a').labels = []
      inView(view, 'b').link = 'https://example.com/b'
      inView(view, 'a').link = null
    })
    expect(inSource(sheet, 'a1')).toEqual({ id: 'a1', title: 'A one', branch: 'folded' })
    expect(inSource(sheet, 'a2')).toEqual({ id: 'a2', title: 'A two', children: { attached: [] } })
    expect(inSource(sheet, 'a3')).toEqual({ id: 'a3', title: 'A three', labels: ['fresh'] })
    expect(inSource(sheet, 'b')!.href).toBe('https://example.com/b')
    expect(differences(before[0], sheet).sort()).toEqual(
      [
        '$.rootTopic.children.attached[0].children.attached[0].branch',
        '$.rootTopic.children.attached[0].children.attached[1].branch',
        '$.rootTopic.children.attached[0].children.attached[2].labels',
        '$.rootTopic.children.attached[0].href',
        '$.rootTopic.children.attached[0].labels',
        '$.rootTopic.children.attached[1].href',
      ].sort(),
    )
  })

  it('keeps a link to another topic while the view shows none, and replaces it by a web link', async () => {
    const kept = await edit((view) => {
      inView(view, 'c').title = 'Gamma'
    })
    expect(inSource(kept.sheet, 'c')).toEqual({ id: 'c', href: 'xmind:#a', title: 'Gamma' })
    const replaced = await edit((view) => {
      inView(view, 'c').link = 'mailto:someone@example.com'
    })
    expect(inSource(replaced.sheet, 'c')!.href).toBe('mailto:someone@example.com')
  })

  it('a link nothing would open is a link like any other: kept untouched, written when changed, removed when cleared', async () => {
    const withLinks = (): XmindSheet => ({
      id: 's',
      rootTopic: {
        id: 'r',
        title: 'Root',
        children: {
          attached: [
            { id: 'j', title: 'J', href: 'javascript:alert(1)' },
            { id: 'f', title: 'F', href: 'file:///C:/secret.txt' },
            { id: 'p', title: 'P', href: 'ftp://example.com/x' },
            { id: 't', title: 'T', href: 'xmind:#j' },
          ],
        },
      },
      title: 'Links',
    })
    const run = async (change: (view: ViewSheet) => void) => {
      const document = await createXmindDocumentFromSheets([withLinks()])
      const view = sheetToView(document.sheets[0]!, 0)
      change(view)
      const result = reconcileSheet(document, 0, view)
      if (!result.ok) throw new Error(result.problem)
      const topics = document.sheets[0]!.rootTopic.children!.attached!
      return {
        document,
        result,
        href: (id: string) => topics.find((topic) => topic.id === id)!.href,
      }
    }

    const shown = sheetToView(withLinks(), 0).root.children.map((topic) => topic.link)
    expect(shown).toEqual([
      'javascript:alert(1)',
      'file:///C:/secret.txt',
      'ftp://example.com/x',
      null,
    ])

    // an unrelated edit leaves every address exactly as the file had it
    const unrelated = await run((view) => void (view.root.children[0]!.title = 'J, renamed'))
    expect(unrelated.result).toMatchObject({ changed: true, inSync: true })
    expect(['j', 'f', 'p', 't'].map(unrelated.href)).toEqual([
      'javascript:alert(1)',
      'file:///C:/secret.txt',
      'ftp://example.com/x',
      'xmind:#j',
    ])
    const untouched = await run(() => {})
    expect(untouched.result.changed).toBe(false)
    expect(untouched.document.changed).toBe(false)

    // changed, cleared, and set where the file holds a link to another topic
    const edited = await run((view) => {
      view.root.children[0]!.link = 'javascript:void(0)'
      view.root.children[1]!.link = null
      view.root.children[3]!.link = 'file:///D:/other.txt'
    })
    expect(edited.href('j')).toBe('javascript:void(0)')
    expect(edited.href('f')).toBeUndefined()
    expect(edited.href('p')).toBe('ftp://example.com/x')
    expect(edited.href('t')).toBe('file:///D:/other.txt')
  })

  it('leaves values of a shape it does not read alone until that very value is edited', async () => {
    const untouched = await edit(
      (view) => {
        inView(view, 'k0').title = 'Only this'
      },
      [oddSheet()],
    )
    expect(differences(untouched.before[0], untouched.sheet)).toEqual([
      '$.rootTopic.children.attached[0].title',
    ])
    const edited = await edit(
      (view) => {
        view.root.title = 'Now a text'
        view.root.labels = ['kept', 'more']
      },
      [oddSheet()],
    )
    expect(edited.sheet.rootTopic).toMatchObject({
      title: 'Now a text',
      labels: ['kept', 'more'],
      branch: 'something-else',
      href: 'xap:resources/file.pdf',
      structureClass: 9,
    })
  })

  it('changes the order of branches without rewriting the branches', async () => {
    const { before, sheet, result } = await edit((view) => {
      view.root.children.reverse()
    })
    expect(expectApplied(result)).toMatchObject({ changed: true, inSync: true })
    const [a, b, c] = before[0]!.rootTopic.children!.attached!
    expect(JSON.stringify(sheet.rootTopic.children!.attached)).toBe(JSON.stringify([c, b, a]))
    expect(sheet.rootTopic.children!.detached).toEqual(before[0]!.rootTopic.children!.detached)
  })
})

describe('reconcileSheet: notes', () => {
  it('rewrites an edited rich note as plain text and drops the rich form', async () => {
    const { sheet } = await edit((view) => {
      inView(view, 'a').note = 'rewritten\nby the user <b>as typed</b>'
    })
    expect(inSource(sheet, 'a')!.notes).toEqual({
      plain: { content: 'rewritten\nby the user <b>as typed</b>' },
    })
  })

  it('keeps a rich note that was not edited exactly as it was', async () => {
    const { before, sheet } = await edit((view) => {
      inView(view, 'a').title = 'Alpha, renamed'
    })
    expect(JSON.stringify(inSource(sheet, 'a')!.notes)).toBe(
      JSON.stringify(inSource(before[0]!, 'a')!.notes),
    )
    expect(inSource(sheet, 'a')!.notes).toHaveProperty('realHTML')
  })

  it('keeps a note that only has the rich form until it is edited', async () => {
    const content = [
      {
        id: 's',
        rootTopic: { id: 'r', notes: { realHTML: { content: '<div>only <b>rich</b></div>' } } },
      },
    ]
    const unchanged = await edit(() => {}, content)
    expect(expectApplied(unchanged.result).changed).toBe(false)
    const edited = await edit((view) => {
      expect(view.root.note).toBe('only rich\n')
      view.root.note = 'only rich, edited'
    }, content)
    expect(edited.sheet.rootTopic.notes).toEqual({ plain: { content: 'only rich, edited' } })
  })

  it('adds a note to a topic without one, and takes a cleared note out of the file', async () => {
    const { sheet, result } = await edit((view) => {
      inView(view, 'b').note = 'new note'
      inView(view, 'a').note = null
      inView(view, 'a1').note = ''
    })
    expect(inSource(sheet, 'b')!.notes).toEqual({ plain: { content: 'new note' } })
    expect(inSource(sheet, 'a')).not.toHaveProperty('notes')
    expect(inSource(sheet, 'a1')).not.toHaveProperty('notes')
    expect(expectApplied(result).inSync).toBe(true)
  })
})

describe('reconcileSheet: topics only the state has', () => {
  it('creates them with ids in the shape the format uses, and says which ids it gave', async () => {
    const { sheet, result } = await edit((view) => {
      inView(view, 'b').children.push(
        freshTopic('me-1', 'New one', {
          folded: true,
          labels: ['x'],
          note: 'hello',
          link: 'https://example.com/new',
          children: [freshTopic(SOME_UUID, 'Nested')],
        }),
      )
    })
    const applied = expectApplied(result)
    const written = applied.ids.topics.get('me-1')!
    expect(written).toMatch(UUID_V4)
    expect([...applied.ids.topics.keys()]).toEqual(['me-1'])
    expect(inSource(sheet, 'b')!.children).toEqual({
      attached: [
        {
          id: written,
          title: 'New one',
          branch: 'folded',
          labels: ['x'],
          notes: { plain: { content: 'hello' } },
          href: 'https://example.com/new',
          children: { attached: [{ id: SOME_UUID, title: 'Nested' }] },
        },
      ],
    })
    expect(applied).toMatchObject({ changed: true, inSync: true })
    expect(inView(applied.view, written).children[0]!.id).toBe(SOME_UUID)
  })

  it('never writes the picture, markers or style of the state onto a new topic', async () => {
    const { sheet } = await edit((view) => {
      view.root.children.push(
        freshTopic(SOME_UUID, 'Plain', {
          image: { src: 'https://example.com/p.png', entryName: null, width: 1, height: 1 },
          markers: ['priority-1'],
          style: { fill: '#ff0000' },
        }),
      )
    })
    expect(inSource(sheet, SOME_UUID)).toEqual({ id: SOME_UUID, title: 'Plain' })
  })

  it('gives a new id when the one handed in is taken anywhere in the file', async () => {
    const other = { id: 'sheet-2', rootTopic: { id: 'root-2', children: { attached: [] } } }
    const taken = [
      { ...other, rootTopic: { id: SOME_UUID } },
      { ...other, relationships: [{ id: SOME_UUID, end1Id: 'root-2', end2Id: 'root-2' }] },
      { ...other, rootTopic: { id: 'root-2', boundaries: [{ id: SOME_UUID, range: '(0,0)' }] } },
    ]
    for (const second of taken) {
      const { result } = await edit(
        (view) => {
          view.root.children.push(freshTopic(SOME_UUID, 'New'))
        },
        [sample(), second],
      )
      const written = expectApplied(result).ids.topics.get(SOME_UUID)
      expect(written).toMatch(UUID_V4)
      expect(written).not.toBe(SOME_UUID)
    }
  })

  it('brings a deleted topic back under its own id when the state shows it again', async () => {
    const content = sampleSheets()
    ;(content[0] as XmindSheet).rootTopic.children!.attached![1]!.id = SOME_UUID
    const document = await openSheets(content)
    const shown = document.viewSheets()[0]!
    const gone = copyOf(shown)
    detach(gone, SOME_UUID)
    gone.relationships = []
    expect(expectApplied(reconcileSheet(document, 0, gone)).changed).toBe(true)
    expect(inSource(document.sheets[0]!, SOME_UUID)).toBeNull()

    shown.relationships = []
    const back = expectApplied(reconcileSheet(document, 0, shown))
    expect(back.ids.topics.size).toBe(0)
    expect(back.inSync).toBe(false) // the picture and style were not brought back
    expect(inSource(document.sheets[0]!, SOME_UUID)).toEqual({
      id: SOME_UUID,
      title: 'Beta \u{1F600} 한글',
    })
  })
})

describe('reconcileSheet: topics only the source has', () => {
  it('deletes the topic and everything below it, shown or not', async () => {
    const { sheet, before, result } = await edit((view) => {
      detach(view, 'a')
      view.relationships = []
    })
    expect(expectApplied(result)).toMatchObject({ changed: true, inSync: true })
    for (const id of ['a', 'a1', 'a2', 'a3', 'sum-topic', 'under-summary', 'callout-1']) {
      expect(inSource(sheet, id), id).toBeNull()
    }
    expect(sheet.rootTopic.children!.attached!.map((topic) => topic.id)).toEqual(['b', 'c'])
    expect(sheet.rootTopic.children!.detached).toEqual(before[0]!.rootTopic.children!.detached)
    expect(sheet.relationships).toEqual([{ id: 'rel-2', end1Id: 'float', end2Id: 'b' }])
  })

  it('does not take a part the view never shows for deleted', async () => {
    const { sheet, before } = await edit((view) => {
      detach(view, 'c')
    })
    for (const id of ['float', 'callout-1', 'sum-topic', 'under-summary']) {
      expect(inSource(sheet, id), id).toEqual(inSource(before[0]!, id))
    }
    expect(inSource(sheet, 'a')!.boundaries).toEqual(inSource(before[0]!, 'a')!.boundaries)
    expect(sheet.relationships).toEqual(before[0]!.relationships)
    expect(sheet.extensions).toEqual(before[0]!.extensions)
  })

  it('drops the list of branches when the last branch goes', async () => {
    const content = [{ id: 's', rootTopic: { id: 'r', children: { attached: [{ id: 'only' }] } } }]
    const { sheet } = await edit((view) => {
      view.root.children = []
    }, content)
    expect(sheet.rootTopic).toEqual({ id: 'r' })
  })

  it('removes a relationship the state still lists when one of its ends is gone', async () => {
    const { sheet, result } = await edit((view) => {
      detach(view, 'a1')
    })
    expect(sheet.relationships).toEqual([{ id: 'rel-2', end1Id: 'float', end2Id: 'b' }])
    const applied = expectApplied(result)
    expect(applied.inSync).toBe(false)
    expect(applied.view.relationships).toEqual([])
  })

  it('removes a relationship the view does not show when its hidden end goes with the topic', async () => {
    const content = sampleSheets()
    ;(content[0] as XmindSheet).relationships = [
      { id: 'from-callout', end1Id: 'callout-1', end2Id: 'c', controlPoints: {} },
      { id: 'under', end1Id: 'b', end2Id: 'under-summary' },
      { id: 'elsewhere', end1Id: 'float', end2Id: 'c' },
      { id: 'dangling-already', end1Id: 'c', end2Id: 'never-existed' },
      'text',
    ]
    const { sheet } = await edit((view) => {
      detach(view, 'a')
    }, content)
    expect(sheet.relationships).toEqual([
      { id: 'elsewhere', end1Id: 'float', end2Id: 'c' },
      { id: 'dangling-already', end1Id: 'c', end2Id: 'never-existed' },
      'text',
    ])
  })
})

describe('reconcileSheet: a topic that moved', () => {
  it('moves the whole source subtree, with every value the view does not know', async () => {
    const { sheet, before, result } = await edit((view) => {
      inView(view, 'c').children.push(detach(view, 'a'))
    })
    expect(expectApplied(result)).toMatchObject({ changed: true, inSync: true })
    const original = inSource(before[0]!, 'a')!
    expect(original).toMatchObject({ futureTopicKey: 'kept', boundaries: [{ id: 'bound-1' }] })
    expect(JSON.stringify(inSource(sheet, 'c')!.children)).toBe(
      JSON.stringify({ attached: [original] }),
    )
    expect(sheet.rootTopic.children!.attached!.map((topic) => topic.id)).toEqual(['b', 'c'])
    expect(sheet.relationships).toEqual(before[0]!.relationships)
  })

  it('swaps a topic with its own branch', async () => {
    const { sheet } = await edit((view) => {
      const a = detach(view, 'a')
      const a2 = a.children.splice(1, 1)[0]!
      a2.children.push(a)
      view.root.children.unshift(a2)
    })
    expect(sheet.rootTopic.children!.attached!.map((topic) => topic.id)).toEqual(['a2', 'b', 'c'])
    const a2 = inSource(sheet, 'a2')!
    expect(a2.children!.attached!.map((topic) => topic.id)).toEqual(['a'])
    const a = a2.children!.attached![0]!
    expect(a.children!.attached!.map((topic) => topic.id)).toEqual(['a1', 'a3'])
    expect(a).toMatchObject({
      futureTopicKey: 'kept',
      children: { callout: [{ id: 'callout-1' }] },
    })
  })

  it('keeps the branches of a deleted topic that the state shows somewhere else', async () => {
    const { sheet } = await edit((view) => {
      const a = detach(view, 'a')
      view.root.children.push(a.children[2]!)
      view.relationships = []
    })
    expect(sheet.rootTopic.children!.attached!.map((topic) => topic.id)).toEqual(['b', 'c', 'a3'])
    expect(inSource(sheet, 'a')).toBeNull()
    expect(inSource(sheet, 'callout-1')).toBeNull()
  })
})

describe('reconcileSheet: layout', () => {
  const fishbone = (): unknown[] => {
    const sheet = sample()
    sheet.rootTopic.structureClass = 'org.xmind.ui.fishbone.leftHeaded'
    return [sheet]
  }

  it('keeps an arrangement it only stands in for when a title is edited', async () => {
    const original = await buildMapFile({ content: fishbone() })
    const document = await openOk(original)
    const view = document.viewSheets()[0]!
    expect(view).toMatchObject({ layout: 'both', layoutExact: false })
    view.root.title = 'Edited'
    expectApplied(reconcileSheet(document, 0, view))
    const saved = JSON.parse(text((await unzip(await document.save({ now: NOW }))).get(CONTENT)!))
    expect(differences(fishbone(), saved)).toEqual(['$[0].rootTopic.title'])
    expect(saved[0].rootTopic.structureClass).toBe('org.xmind.ui.fishbone.leftHeaded')
  })

  it('writes the layout the user picked', async () => {
    const { sheet, result } = await edit((view) => {
      view.layout = 'down'
      view.layoutExact = true
    }, fishbone())
    expect(sheet.rootTopic.structureClass).toBe('org.xmind.ui.org-chart.down')
    expect(expectApplied(result).view).toMatchObject({ layout: 'down', layoutExact: true })
  })

  it('writes the tree and the timeline as the classes of the format', async () => {
    const cases = [
      ['tree', 'org.xmind.ui.tree.right'],
      ['timeline', 'org.xmind.ui.timeline.horizontal'],
    ] as const
    for (const [layout, structureClass] of cases) {
      const { sheet, result } = await edit((view) => {
        view.layout = layout
        view.layoutExact = true
      }, fishbone())
      expect(sheet.rootTopic.structureClass, layout).toBe(structureClass)
      expect(expectApplied(result).view).toMatchObject({ layout, layoutExact: true })
    }
  })

  it('writes the stand-in layout too once the user picks it', async () => {
    const { sheet } = await edit((view) => {
      view.layoutExact = true
    }, fishbone())
    expect(sheet.rootTopic.structureClass).toBe('org.xmind.ui.map.clockwise')
  })

  it('keeps the exact class of the file while the layout it is drawn as stays', async () => {
    const content = sampleSheets()
    ;(content[0] as XmindSheet).rootTopic.structureClass = 'org.xmind.ui.map.unbalanced'
    const { result, sheet } = await edit((view) => {
      view.layoutExact = false
    }, content)
    expect(expectApplied(result).changed).toBe(false)
    expect(sheet.rootTopic.structureClass).toBe('org.xmind.ui.map.unbalanced')
  })
})

describe('reconcileSheet: relationships', () => {
  it('retitles a relationship and keeps its curve', async () => {
    const { sheet, before } = await edit((view) => {
      view.relationships[0]!.title = 'follows'
    })
    expect(differences(before[0], sheet)).toEqual(['$.relationships[0].title'])
    expect(sheet.relationships).toMatchObject([{ title: 'follows', controlPoints: {} }, {}])
  })

  it('drops the curve of a relationship whose end changed', async () => {
    const content = sampleSheets()
    Object.assign(((content[0] as XmindSheet).relationships as object[])[0]!, {
      lineEndPoints: { '0': { x: 1, y: 1 } },
      style: { id: 'rel-style', properties: { 'line-color': '#123456' } },
    })
    const { sheet } = await edit((view) => {
      view.relationships[0]!.toId = 'c'
    }, content)
    expect((sheet.relationships as unknown[])[0]).toEqual({
      id: 'rel-1',
      end1Id: 'a1',
      end2Id: 'c',
      title: 'leads to',
      style: { id: 'rel-style', properties: { 'line-color': '#123456' } },
    })
  })

  it('drops the curve of a relationship the caller says was reshaped', async () => {
    const document = await openSheets(sampleSheets())
    const view = document.viewSheets()[0]!
    const result = reconcileSheet(document, 0, view, { reshapedRelationships: ['rel-1', 'rel-2'] })
    expect(expectApplied(result).changed).toBe(true)
    expect(document.sheets[0]!.relationships).toEqual([
      { id: 'rel-1', end1Id: 'a1', end2Id: 'b', title: 'leads to' },
      { id: 'rel-2', end1Id: 'float', end2Id: 'b' },
    ])
  })

  it('deletes a relationship the state no longer has, and keeps the ones the view never shows', async () => {
    const { sheet } = await edit((view) => {
      view.relationships = []
    })
    expect(sheet.relationships).toEqual([{ id: 'rel-2', end1Id: 'float', end2Id: 'b' }])
  })

  it('creates a relationship, also on a sheet that had none, and to a summary topic', async () => {
    const { sheet, result } = await edit((view) => {
      view.relationships.push(
        { id: 'me-rel', fromId: 'c', toId: 'sum-topic', title: 'see' },
        { id: SOME_UUID, fromId: 'b', toId: 'c', title: '' },
      )
    })
    const applied = expectApplied(result)
    const written = applied.ids.relationships.get('me-rel')!
    expect(written).toMatch(UUID_V4)
    expect([...applied.ids.relationships.keys()]).toEqual(['me-rel'])
    expect((sheet.relationships as unknown[]).slice(2)).toEqual([
      { id: written, end1Id: 'c', end2Id: 'sum-topic', title: 'see' },
      { id: SOME_UUID, end1Id: 'b', end2Id: 'c' },
    ])
    expect(applied.inSync).toBe(true)

    const bare = [{ id: 's', rootTopic: { id: 'r', children: { attached: [{ id: 'x' }] } } }]
    const added = await edit((view) => {
      view.relationships.push({ id: SOME_UUID, fromId: 'r', toId: 'x', title: '' })
    }, bare)
    expect(added.sheet.relationships).toEqual([{ id: SOME_UUID, end1Id: 'r', end2Id: 'x' }])
  })

  it('ends a new relationship on a topic made in the same state', async () => {
    const { sheet, result } = await edit((view) => {
      view.root.children.push(freshTopic('me-new', 'New'))
      view.relationships.push({ id: SOME_UUID, fromId: 'me-new', toId: 'b', title: '' })
    })
    const written = expectApplied(result).ids.topics.get('me-new')!
    expect((sheet.relationships as unknown[])[2]).toEqual({
      id: SOME_UUID,
      end1Id: written,
      end2Id: 'b',
    })
  })

  it('matches relationships that share an id in the order the file has them', async () => {
    const { sheet, before } = await edit(
      (view) => {
        expect(view.relationships.map((relationship) => relationship.id)).toEqual(['dup', 'dup'])
        view.relationships[1]!.title = 'second'
      },
      [oddSheet()],
    )
    expect(differences(before[0], sheet)).toEqual(['$.relationships[1].title'])
  })

  it('starts a list anew when the file holds something else where the list belongs', async () => {
    const content = [
      {
        id: 's',
        relationships: 'not a list',
        rootTopic: { id: 'r', summaries: { not: 'a list' }, children: { attached: [{ id: 'x' }] } },
      },
    ]
    const kept = await edit((view) => {
      inView(view, 'x').title = 'Only this'
    }, content)
    expect(differences(kept.before[0], kept.sheet)).toEqual([
      '$.rootTopic.children.attached[0].title',
    ])
    const { sheet } = await edit((view) => {
      view.relationships.push({ id: SOME_UUID, fromId: 'r', toId: 'x', title: '' })
      view.root.summaries.push({ id: 'n', topicId: 'new-summary', title: 'S', start: 0, end: 0 })
    }, content)
    expect(sheet.relationships).toEqual([{ id: SOME_UUID, end1Id: 'r', end2Id: 'x' }])
    expect(sheet.rootTopic.summaries).toMatchObject([{ range: '(0,0)' }])
  })
})

describe('reconcileSheet: summaries', () => {
  it('retitles the summary topic and keeps what hangs under it', async () => {
    const { sheet, before } = await edit((view) => {
      inView(view, 'a').summaries[0]!.title = 'In short'
    })
    expect(differences(before[0], sheet)).toEqual([
      '$.rootTopic.children.attached[0].children.summary[0].title',
    ])
  })

  it('removes a summary the state no longer has: record, summary topic and its branches', async () => {
    const { sheet, result } = await edit((view) => {
      inView(view, 'a').summaries = []
    })
    const alpha = inSource(sheet, 'a')!
    expect(alpha).not.toHaveProperty('summaries')
    expect(alpha.children).not.toHaveProperty('summary')
    expect(Object.keys(alpha.children!)).toEqual(['attached', 'callout'])
    expect(inSource(sheet, 'under-summary')).toBeNull()
    expect(alpha.boundaries).toEqual([{ id: 'bound-1', range: '(0,1)', title: 'Group' }])
    expect(expectApplied(result).inSync).toBe(true)
  })

  it('creates a summary: a record on the topic and a summary topic below it', async () => {
    const { sheet, result } = await edit((view) => {
      view.root.summaries.push({
        id: 'me-sum',
        topicId: 'me-sum-topic',
        title: 'All',
        start: 0,
        end: 2,
      })
    })
    const applied = expectApplied(result)
    const topicId = applied.ids.topics.get('me-sum-topic')!
    expect(topicId).toMatch(UUID_V4)
    const [record] = sheet.rootTopic.summaries as Record<string, unknown>[]
    expect(record).toEqual({ id: expect.stringMatching(UUID_V4), range: '(0,2)', topicId })
    expect(sheet.rootTopic.children!.summary).toEqual([{ id: topicId, title: 'All' }])
    expect(applied.view.root.summaries).toEqual([
      { id: record!.id, topicId, title: 'All', start: 0, end: 2 },
    ])
    expect(applied.inSync).toBe(true)
  })

  it('moves a summary the state shows on another topic, with what hangs under it', async () => {
    const { sheet, before } = await edit((view) => {
      const [summary] = inView(view, 'a').summaries.splice(0, 1)
      view.root.summaries.push({ ...summary!, start: 0, end: 0 })
    })
    expect(sheet.rootTopic.summaries).toEqual([
      { id: 'sum-rec', range: '(0,0)', topicId: 'sum-topic' },
    ])
    expect(sheet.rootTopic.children!.summary).toEqual(inSource(before[0]!, 'a')!.children!.summary)
    expect(inSource(sheet, 'a')).not.toHaveProperty('summaries')
  })

  it('matches two records that name one summary topic in the order the file has them', async () => {
    const { sheet, before, result } = await edit(
      (view) => {
        expect(view.root.summaries.map((summary) => summary.topicId)).toEqual(['st', 'st'])
        view.root.summaries.pop()
      },
      [oddSheet()],
    )
    expect(expectApplied(result).inSync).toBe(true)
    expect(differences(before[0], sheet)).toEqual([
      '$.rootTopic.summaries[1].id',
      '$.rootTopic.summaries[1].range',
      '$.rootTopic.summaries[2]',
      '$.rootTopic.summaries[3]',
      '$.rootTopic.summaries[4]',
    ])
    expect(sheet.rootTopic.children!.summary).toEqual([{ id: 'st', title: 'S' }])
  })
})

describe('reconcileSheet: sheets are reconciled one at a time', () => {
  it('changes only the sheet it was called for, though both use the same ids', async () => {
    const second = sample()
    second.id = 'sheet-2'
    second.title = 'Sheet two'
    const document = await openSheets([sample(), second])
    const before = copyOf(document.sheets)
    const view = document.viewSheets()[1]!
    inView(view, 'a').title = 'Only on the second sheet'
    detach(view, 'b')
    view.relationships = []
    expectApplied(reconcileSheet(document, 1, view))
    expect(document.sheets[0]).toEqual(before[0])
    expect(inSource(document.sheets[1]!, 'a')!.title).toBe('Only on the second sheet')
    expect(inSource(document.sheets[1]!, 'b')).toBeNull()
    expect(inSource(document.sheets[0]!, 'b')).not.toBeNull()
    expect(document.viewSheets()[0]).toEqual(reconcileSheetView(document, 0))
  })

  function reconcileSheetView(document: XmindDocument, index: number): ViewSheet {
    const result = expectApplied(reconcileSheet(document, index, document.viewSheets()[index]!))
    expect(result.changed).toBe(false)
    return result.view
  }

  it('throws for a sheet the document does not have', async () => {
    const document = await openSheets(sampleSheets())
    const view = document.viewSheets()[0]!
    expect(() => reconcileSheet(document, 1, view)).toThrow(/no sheet 1/)
    expect(() => reconcileSheet(document, -1, view)).toThrow(/no sheet/)
  })
})

describe('reconcileSheet: a state that cannot be applied', () => {
  const deep = (levels: number) => {
    let topic = freshTopic('deep-0', 'bottom')
    for (let level = 1; level < levels; level++) {
      topic = freshTopic(`deep-${level}`, 'level', { children: [topic] })
    }
    return topic
  }
  const summary = { id: 'n', topicId: 'new-summary', title: '', start: 0, end: 0 }

  const cases: [string, (view: ViewSheet) => void, RegExp][] = [
    [
      'an id used twice',
      (view) => void inView(view, 'b').children.push(freshTopic('a1', 'x')),
      /a1/,
    ],
    ['another central topic', (view) => void (view.root.id = 'other'), /central topic/],
    [
      'a new relationship to a topic that is not there',
      (view) => void view.relationships.push({ id: 'r', fromId: 'a1', toId: 'nowhere', title: '' }),
      /nowhere/,
    ],
    [
      'a relationship moved to a topic that is not there',
      (view) => void (view.relationships[0]!.toId = 'nowhere'),
      /nowhere/,
    ],
    [
      'a relationship moved to a topic the view does not show',
      (view) => void (view.relationships[0]!.toId = 'float'),
      /float/,
    ],
    [
      'a link in the form of a link to another topic',
      (view) => void (inView(view, 'b').link = 'xmind:#a'),
      /link/,
    ],
    [
      'a link in the form of a link to an attachment',
      (view) => void (inView(view, 'b').link = 'xap:resources/file.pdf'),
      /link/,
    ],
    ['an empty link', (view) => void (inView(view, 'b').link = ''), /link/],
    [
      'the id of a floating topic',
      (view) => void view.root.children.push(freshTopic('float', 'x')),
      /float/,
    ],
    [
      'the id of a branch under a summary topic',
      (view) => void view.root.children.push(freshTopic('under-summary', 'x')),
      /under-summary/,
    ],
    [
      'the id of a summary topic',
      (view) => void view.root.children.push(freshTopic('sum-topic', 'x')),
      /sum-topic/,
    ],
    [
      'a summary named like a topic',
      (view) => void view.root.summaries.push({ ...summary, topicId: 'b' }),
      /\bb\b/,
    ],
    [
      'a summary named like a callout',
      (view) => void view.root.summaries.push({ ...summary, topicId: 'callout-1' }),
      /callout-1/,
    ],
    [
      'two new summaries with one summary topic',
      (view) => void view.root.summaries.push(summary, { ...summary, id: 'm' }),
      /new-summary/,
    ],
    [
      'a new summary past the last branch',
      (view) => void view.root.summaries.push({ ...summary, start: 1, end: 3 }),
      /range/,
    ],
    [
      'a summary moved past the last branch',
      (view) => void (inView(view, 'a').summaries[0]!.end = 3),
      /range/,
    ],
    [
      'a summary that ends before it starts',
      (view) => void Object.assign(inView(view, 'a').summaries[0]!, { start: 2, end: 1 }),
      /range/,
    ],
    [
      'a summary at half a position',
      (view) => void (inView(view, 'a').summaries[0]!.start = 0.5),
      /range/,
    ],
    [
      'a summary on a topic without branches',
      (view) => void inView(view, 'b').summaries.push(summary),
      /range/,
    ],
    [
      'a title that is not text',
      (view) => void ((inView(view, 'b') as { title: unknown }).title = 5),
      /title/,
    ],
    ['a topic without an id', (view) => void (inView(view, 'b').id = ''), /id/],
    [
      'folding that is not yes or no',
      (view) => void ((inView(view, 'b') as { folded: unknown }).folded = 'yes'),
      /folded/,
    ],
    [
      'a label that is not text',
      (view) => void ((inView(view, 'b') as { labels: unknown }).labels = ['ok', 3]),
      /labels/,
    ],
    [
      'a note that is not text',
      (view) => void ((inView(view, 'b') as { note: unknown }).note = {}),
      /note/,
    ],
    [
      'branches that are not a list',
      (view) => void ((inView(view, 'b') as { children: unknown }).children = {}),
      /children/,
    ],
    [
      'a branch that is not a topic',
      (view) => void (inView(view, 'b').children as unknown[]).push('text'),
      /topic/,
    ],
    [
      'summaries that are not a list',
      (view) => void ((inView(view, 'b') as { summaries: unknown }).summaries = null),
      /summaries/,
    ],
    [
      'a layout the editor cannot draw',
      (view) => void ((view as { layout: unknown }).layout = 'fishbone'),
      /layout/,
    ],
    [
      'relationships that are not a list',
      (view) => void ((view as { relationships: unknown }).relationships = {}),
      /relationships/,
    ],
    [
      'a relationship without an end',
      (view) => void (view.relationships as unknown[]).push({ id: 'r', fromId: 'a1', title: '' }),
      /relationship/,
    ],
    [
      'no central topic',
      (view) => void ((view as { root: unknown }).root = undefined),
      /central topic/,
    ],
    [
      'topics nested deeper than a file may hold',
      (view) => void inView(view, 'b').children.push(deep(MAX_TOPIC_DEPTH + 1)),
      /deeper/,
    ],
  ]

  it.each(cases)(
    'refuses %s and leaves the source tree as it was',
    async (_name, change, problem) => {
      const document = await openSheets(sampleSheets())
      const live = document.sheets[0]!
      const before = JSON.stringify(document.sheets)
      const view = document.viewSheets()[0]!
      const shown = copyOf(view)
      // an edit that could be applied, alongside the one that cannot
      inView(view, 'c').title = 'must not be written'
      change(view)
      const result = reconcileSheet(document, 0, view)
      if (result.ok) throw new Error('expected the state to be refused')
      expect(result.problem).toMatch(problem)
      expect(result.view).toEqual(shown)
      expect(document.sheets[0]).toBe(live)
      expect(JSON.stringify(document.sheets)).toBe(before)
      expect(document.changed).toBe(false)
    },
  )

  it('refuses a state that is not a sheet at all', async () => {
    const document = await openSheets(sampleSheets())
    for (const state of [null, undefined, 'text', 5, [], {}]) {
      const result = reconcileSheet(document, 0, state as unknown as ViewSheet)
      expect(result.ok, String(state)).toBe(false)
    }
    expect(document.changed).toBe(false)
  })

  it('refuses a state that would nest the source tree too deep through a moved topic', async () => {
    const chain = (from: number, to: number): unknown =>
      from === to
        ? { id: `h-${from}` }
        : { id: `h-${from}`, children: { callout: [chain(from + 1, to)] } }
    const content = [
      {
        id: 's',
        rootTopic: {
          id: 'r',
          children: {
            attached: [
              { id: 'heavy', children: { callout: [chain(0, MAX_TOPIC_DEPTH - 3)] } },
              {
                id: 'p0',
                children: { attached: [{ id: 'p1', children: { attached: [{ id: 'p2' }] } }] },
              },
            ],
          },
        },
      },
    ]
    const { result, document } = await edit((view) => {
      inView(view, 'p2').children.push(detach(view, 'heavy'))
    }, content)
    if (result.ok) throw new Error('expected the state to be refused')
    expect(result.problem).toMatch(/deeper/)
    expect(document.changed).toBe(false)
  })
})

describe('reconcileSheet: telling the caller what the tree now shows', () => {
  it('returns the view of the tree after the change', async () => {
    const { document, result } = await edit((view) => {
      inView(view, 'b').title = 'Renamed'
    })
    expect(expectApplied(result).view).toEqual(document.viewSheets()[0])
  })

  it('is in sync once the ids it gave are put into the state', async () => {
    const document = await openSheets(sampleSheets())
    const view = document.viewSheets()[0]!
    view.root.children.push(freshTopic('me-1', 'One'))
    const first = expectApplied(reconcileSheet(document, 0, view))
    expect(first.inSync).toBe(true)
    // the editor did not rename its topic: the next state names it by the old id again
    const second = expectApplied(reconcileSheet(document, 0, view))
    expect(second.changed).toBe(true)
    expect(second.ids.topics.get('me-1')).not.toBe(first.ids.topics.get('me-1'))
    // the editor renamed it: nothing left to do
    inView(view, 'me-1').id = second.ids.topics.get('me-1')!
    expect(expectApplied(reconcileSheet(document, 0, view))).toMatchObject({
      changed: false,
      inSync: true,
    })
  })
})
