import { describe, expect, it } from 'vitest'
import {
  countSheetTopics,
  OUTLINE_FOLD_ABOVE_TOPICS,
  OUTLINE_FOLD_BELOW_LEVEL,
  OUTLINE_KIND_MARKS,
  OUTLINE_READING_OPTIONS,
  sheetsToOutline,
  sheetToOutline,
} from '../src/outline'
import type { XmindSheet, XmindTopic } from '../src/types'
import { buildMapFile, openOk, sampleSheets } from './helpers'
import { tripSheets } from './outline-fixtures'

const text = (...lines: string[]): string => `${lines.join('\n')}\n`

function sheetOf(rootTopic: Record<string, unknown>, more: object = {}): XmindSheet {
  return {
    id: 's',
    title: 'S',
    rootTopic: { id: 'r', title: 'R', ...rootTopic },
    ...more,
  } as XmindSheet
}

/** A sheet whose central topic has one branch per title. */
function branches(...topics: Record<string, unknown>[]): XmindSheet {
  return sheetOf({
    children: { attached: topics.map((topic, index) => ({ id: `t${index}`, ...topic })) },
  })
}

/** The lines of a sheet's outline below the central topic, without their indentation. */
function branchLines(sheet: XmindSheet): string[] {
  return sheetToOutline(sheet)
    .split('\n')
    .slice(3, -1)
    .map((line) => line.slice(2))
}

describe('the outline format', () => {
  it('is exactly the format of the specification for its example', () => {
    const sheet: XmindSheet = {
      id: 's',
      title: '시트 제목',
      rootTopic: {
        id: 'r',
        title: '중심 토픽 제목',
        children: {
          attached: [
            {
              id: 'a',
              title: '큰 가지 제목',
              labels: ['라벨1', '라벨2'],
              href: 'https://example.com',
              notes: { plain: { content: '메모 첫 줄\n메모 둘째 줄' } },
              children: { attached: [{ id: 'a1', title: '하위 토픽 제목' }] },
            },
          ],
        },
      },
    }
    expect(sheetToOutline(sheet)).toBe(
      text(
        '# 시트 제목',
        '',
        '- 중심 토픽 제목',
        '  - 큰 가지 제목 [라벨1, 라벨2] <https://example.com>',
        '    > 메모 첫 줄',
        '    > 메모 둘째 줄',
        '    - 하위 토픽 제목',
      ),
    )
  })

  it('pins the text of a map that uses everything, over two sheets', () => {
    expect(sheetsToOutline(tripSheets())).toBe(
      text(
        '# Trip',
        '',
        '- Summer trip',
        '  - Places [must see, coast] <https://example.com/places?x=1&y=2>',
        '    > Book early.',
        '    >',
        '    > Ask <b>Mina</b> & co.',
        '    - Old town walls',
        '    - Harbour',
        '      - Ferry times',
        '    - Museum',
        '      - (relationship) costs -> Budget',
        '    - (summary) Two days',
        '      - Split evenly',
        '    - (callout) Closed on Mondays',
        '    - (boundary) Indoors',
        '  - Budget',
        '  - Packing',
        '    > Light',
        '    > Rain coat',
        '  - (floating) Ideas [later]',
        '    - Kayak',
        '',
        '# 둘째 시트',
        '',
        '- 중심',
      ),
    )
  })

  it('writes one sheet the way it writes it among others', () => {
    const [first, second] = tripSheets()
    expect(sheetsToOutline([first!, second!])).toBe(
      `${sheetToOutline(first!)}\n${sheetToOutline(second!)}`,
    )
    expect(sheetToOutline(second!)).toBe(text('# 둘째 시트', '', '- 중심'))
    expect(sheetsToOutline([])).toBe('')
  })

  it('uses the marks the specification starts from', () => {
    expect(OUTLINE_KIND_MARKS).toMatchObject({
      summary: '(summary)',
      floating: '(floating)',
      callout: '(callout)',
    })
  })

  it('writes a folded topic like an open one', () => {
    const folded = tripSheets()
    const open = tripSheets()
    const places = open[0]!.rootTopic.children!.attached![0]!
    expect(places.branch).toBe('folded')
    delete places.branch
    expect(sheetsToOutline(folded)).toBe(sheetsToOutline(open))
  })

  it('walks the source tree of an opened file, not the view', async () => {
    const document = await openOk(await buildMapFile({ content: sampleSheets() }))
    const view = JSON.stringify(document.viewSheets())
    for (const hidden of ['kept only', 'Says', 'Floating']) {
      expect(view).not.toContain(hidden)
    }
    expect(sheetsToOutline(document.sheets)).toBe(
      text(
        '# Sheet one',
        '',
        '- Centre',
        '  - Alpha [one, two] <https://example.com/a?x=1&y=2>',
        '    > first line',
        '    > second <b>line</b> & more',
        '    - A one',
        '      - (relationship) leads to -> Beta \u{1F600} 한글',
        '    - A two',
        '    - A three',
        '    - (summary) Sums up',
        '      - kept only',
        '    - (callout) Says',
        '    - (boundary) Group',
        '  - Beta \u{1F600} 한글',
        '  -',
        '  - (floating) Floating',
      ),
    )
    expect(document.changed).toBe(false)
  })
})

describe('what is written of a topic', () => {
  it('joins a title of several lines into one', () => {
    expect(
      branchLines(
        branches(
          { title: 'one\ntwo' },
          { title: '  first  \r\n\r\n  second\rthird  ' },
          { title: '\n' },
          // Line breaks that only some readers honour are breaks too.
          { title: 'a\u2028b\u2029c\vd\fe\u0085f' },
        ),
      ),
    ).toEqual(['- one two', '- first second third', '-', '- a b c d e f'])
    expect(sheetToOutline({ title: 'Two\nlines', rootTopic: { id: 'r', title: 'R' } })).toBe(
      text('# Two lines', '', '- R'),
    )
  })

  it('writes only a web link in angle brackets', () => {
    expect(
      branchLines(
        branches(
          { title: 'web', href: 'https://example.com/x' },
          { title: 'mail', href: 'mailto:someone@example.com' },
          { title: 'topic', href: 'xmind:#t0' },
          { title: 'file', href: 'xap:resources/a.pdf' },
          { title: 'script', href: 'javascript:alert(1)' },
          { title: 'odd', href: 7 },
        ),
      ),
    ).toEqual([
      '- web <https://example.com/x>',
      '- mail <mailto:someone@example.com>',
      '- topic',
      '- file',
      '- script',
      '- odd',
    ])
  })

  it('keeps a link on one line and inside its brackets', () => {
    expect(branchLines(branches({ title: 'x', href: 'https://example.com/a b<c>\nd' }))).toEqual([
      '- x <https://example.com/a%20b%3Cc%3E%0Ad>',
    ])
  })

  it('writes the note under its topic, without the blank lines at its end', () => {
    const sheet = branches(
      { title: 'as the format writes it', notes: { plain: { content: 'one\ntwo\n' } } },
      { title: 'blank inside', notes: { plain: { content: '\n  indented\r\n\r\nlast  \n\n \n' } } },
      { title: 'rich only', notes: { realHTML: { content: '<div>a &amp; b</div><div>c</div>' } } },
      { title: 'only blank', notes: { plain: { content: ' \n\n' } } },
      { title: 'no note', notes: 'nonsense' },
    )
    expect(branchLines(sheet)).toEqual([
      '- as the format writes it',
      '  > one',
      '  > two',
      '- blank inside',
      '  >',
      '  >   indented',
      '  >',
      '  > last  ',
      '- rich only',
      '  > a & b',
      '  > c',
      '- only blank',
      '- no note',
    ])
  })

  it('keeps a note that looks like markdown inside its quote lines', () => {
    const note = '# not a sheet\n- not a topic\n  - nor this\n> quoted\n```\n[x] <https://e.com>'
    expect(branchLines(branches({ title: 't', notes: { plain: { content: note } } }))).toEqual([
      '- t',
      '  > # not a sheet',
      '  > - not a topic',
      '  >   - nor this',
      '  > > quoted',
      '  > ```',
      '  > [x] <https://e.com>',
    ])
  })

  it('never throws for values of the wrong shape, and writes what it can', () => {
    const sheet = sheetOf(
      {
        title: 7,
        labels: ['ok', 3, null, '', ' \n '],
        notes: { plain: { content: 5 } },
        boundaries: [{ id: 'b', title: 9 }, 'x', { id: 'c', title: 'Named' }],
        summaries: 'nonsense',
        children: { attached: [{ id: 'a', title: null, labels: 'x' }], future: 'kept' },
      },
      { title: null, relationships: [{ id: 'q', end1Id: 5, title: 'Loose' }, 'x'] },
    )
    expect(sheetToOutline(sheet)).toBe(
      text('#', '', '- [ok]', '  -', '  - (boundary) Named', '  - (relationship) Loose'),
    )
  })
})

describe('what the editor does not draw', () => {
  it('writes summaries, callouts, floating topics and unknown kinds under their topic', () => {
    const sheet = sheetOf({
      children: {
        callout: [{ id: 'c', title: 'Call', labels: ['l'], href: 'https://example.com' }],
        future: [{ id: 'f', title: 'From a later version' }, { notATopic: true }, 'text'],
        detached: [{ id: 'd', title: 'Float', notes: { plain: { content: 'floating note' } } }],
        summary: [
          { id: 's1', title: 'Sum one', children: { summary: [{ id: 's2', title: 'Nested' }] } },
          { id: 's3', title: 'No record points here' },
        ],
        attached: [{ id: 'a', title: 'Branch' }],
      },
    })
    expect(sheetToOutline(sheet)).toBe(
      text(
        '# S',
        '',
        '- R',
        '  - Branch',
        '  - (summary) Sum one',
        '    - (summary) Nested',
        '  - (summary) No record points here',
        '  - (callout) Call [l] <https://example.com>',
        '  - (floating) Float',
        '    > floating note',
        '  - (other) From a later version',
      ),
    )
  })

  it('writes the text of boundaries and relationships, and skips the ones without text', () => {
    const sheet = sheetOf(
      {
        children: {
          attached: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B [x]' },
          ],
          detached: [{ id: 'f', title: 'F' }],
        },
        boundaries: [
          { id: 'b1', range: '(0,0)', title: 'Group\none' },
          { id: 'b2', range: '(1,1)' },
        ],
      },
      {
        relationships: [
          { id: 'r1', end1Id: 'a', end2Id: 'b', title: 'then' },
          { id: 'r2', end1Id: 'a', end2Id: 'f', title: 'feeds\ninto' },
          { id: 'r3', end1Id: 'b', end2Id: 'a' },
          { id: 'r4', end1Id: 'f', end2Id: 'gone', title: 'to nowhere' },
          { id: 'r5', end1Id: 'gone', end2Id: 'a', title: 'from nowhere' },
        ],
      },
    )
    expect(sheetToOutline(sheet)).toBe(
      text(
        '# S',
        '',
        '- R',
        '  - A',
        '    - (relationship) then -> B \\[x\\]',
        '    - (relationship) feeds into -> F',
        '  - B \\[x\\]',
        '  - (floating) F',
        '    - (relationship) to nowhere',
        '  - (boundary) Group one',
        '  - (relationship) from nowhere -> A',
      ),
    )
  })
})

describe('text that could be taken for markdown', () => {
  it('escapes a title so it stays one plain item', () => {
    const cases: [title: string, written: string][] = [
      ['<img src=x onerror=alert(1)>', '- \\<img src=x onerror=alert(1)>'],
      ['</script><!-- x --><?php', '- \\</script>\\<!-- x -->\\<?php'],
      ['[a] <b>', '- \\[a\\] \\<b>'],
      ['x [label] <https://example.com>', '- x \\[label\\] \\<https://example.com>'],
      ['[click](javascript:alert(1))', '- \\[click\\](javascript:alert(1))'],
      ['# heading', '- \\# heading'],
      ['###### six', '- \\###### six'],
      ['- item', '- \\- item'],
      ['* item', '- \\* item'],
      ['+ item', '- \\+ item'],
      ['-', '- \\-'],
      ['> quote', '- \\> quote'],
      ['1. one', '- 1\\. one'],
      ['12) twelve', '- 12\\) twelve'],
      ['```js', '- \\```js'],
      ['~~~', '- \\~~~'],
      ['---', '- \\---'],
      ['* * *', '- \\* * *'],
      ['___', '- \\___'],
      ['(summary) fake', '- \\(summary) fake'],
      ['(floating)', '- \\(floating)'],
      ['back\\slash\\', '- back\\\\slash\\\\'],
      // Nothing here can start anything, so it is left as typed.
      [
        'a < b -> c <- d, 1.5 #tag -x (note) *bold* 2026.',
        '- a < b -> c <- d, 1.5 #tag -x (note) *bold* 2026.',
      ],
      ['####### seven', '- ####### seven'],
      ['(summaries)', '- (summaries)'],
    ]
    for (const [title, written] of cases) {
      expect(branchLines(branches({ title })), title).toEqual([written])
    }
  })

  it('escapes labels, and the comma that would split one', () => {
    expect(
      branchLines(branches({ title: 't', labels: ['a, b', '[x]', '<i>', 'c\\', 'two\nlines'] })),
    ).toEqual(['- t [a\\, b, \\[x\\], \\<i>, c\\\\, two lines]'])
  })

  it('escapes a sheet title so it stays one heading', () => {
    const cases: [title: string, written: string][] = [
      ['C #', '# C \\#'],
      ['#', '# \\#'],
      ['a ##', '# a \\##'],
      ['C#', '# C#'],
      ['Plan [v2] <draft>', '# Plan \\[v2\\] \\<draft>'],
      ['- not a list', '# - not a list'],
    ]
    for (const [title, written] of cases) {
      const sheet: XmindSheet = { title, rootTopic: { id: 'r', title: 'R' } }
      expect(sheetToOutline(sheet), title).toBe(text(written, '', '- R'))
    }
  })

  it('never lets a title, label or note start a line of its own', () => {
    const hostile = '\n# Sheet\n- topic\r\n> note\r<script>'
    const outline = sheetToOutline(
      branches({ title: hostile, labels: [hostile], notes: { plain: { content: hostile } } }),
    )
    expect(outline.split('\n')).toEqual([
      '# S',
      '',
      '- R',
      '  - \\# Sheet - topic > note \\<script> [# Sheet - topic > note \\<script>]',
      '    >',
      '    > # Sheet',
      '    > - topic',
      '    > > note',
      '    > <script>',
      '',
    ])
  })
})

describe('the outline an assistant reads', () => {
  it('writes ids when asked, and none by default', () => {
    const sheet = sheetOf({
      id: 'root-1',
      children: {
        attached: [{ id: '0b1c-22', title: 'A', labels: ['l'], href: 'https://example.com' }],
        summary: [{ id: 'has space', title: 'S' }],
        callout: [{ id: 'new\nline}', title: '' }],
      },
    })
    expect(sheetToOutline(sheet, { ids: true })).toBe(
      text(
        '# S',
        '',
        '- R {#root-1}',
        '  - A [l] <https://example.com> {#0b1c-22}',
        '  - (summary) S {#"has space"}',
        '  - (callout) {#"new\\nline}"}',
      ),
    )
    expect(sheetToOutline(sheet)).not.toContain('{#')
  })

  it('folds the levels below the one asked for into counts', () => {
    expect(sheetsToOutline(tripSheets(), { ids: true, foldBelowLevel: 1 })).toBe(
      text(
        '# Trip',
        '',
        '- Summer trip {#root}',
        '  - Places [must see, coast] <https://example.com/places?x=1&y=2> {#a}',
        '    > Book early.',
        '    >',
        '    > Ask <b>Mina</b> & co.',
        '    - (+7 more)',
        '    - (boundary) Indoors',
        '  - Budget {#b}',
        '  - Packing {#c}',
        '    > Light',
        '    > Rain coat',
        '  - (floating) Ideas [later] {#float}',
        '    - (+1 more)',
        '',
        '# 둘째 시트',
        '',
        '- 중심 {#root}',
      ),
    )
    expect(sheetToOutline(tripSheets()[0]!, { foldBelowLevel: 0 })).toBe(
      text('# Trip', '', '- Summer trip', '  - (+12 more)'),
    )
  })

  it('folds nothing by default, and nothing for a level that makes no sense', () => {
    const whole = sheetsToOutline(tripSheets())
    expect(whole).not.toContain('more)')
    for (const foldBelowLevel of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sheetsToOutline(tripSheets(), { foldBelowLevel })).toBe(whole)
    }
    expect(sheetsToOutline(tripSheets(), { foldBelowLevel: 50 })).toBe(whole)
  })

  it('counts every kind of topic, and folds only a sheet above the limit', () => {
    const trip = tripSheets()[0]!
    expect(countSheetTopics(trip)).toBe(13)
    expect(sheetToOutline(trip, { foldBelowLevel: 1, foldAboveTopics: 13 })).toBe(
      sheetToOutline(trip),
    )
    expect(sheetToOutline(trip, { foldBelowLevel: 1, foldAboveTopics: 12 })).toBe(
      sheetToOutline(trip, { foldBelowLevel: 1 }),
    )
  })

  it('reads a large map with ids and everything below level three folded', () => {
    expect(OUTLINE_READING_OPTIONS).toEqual({ ids: true, foldBelowLevel: 3, foldAboveTopics: 300 })
    expect([OUTLINE_FOLD_ABOVE_TOPICS, OUTLINE_FOLD_BELOW_LEVEL]).toEqual([300, 3])

    // 1 + 4 + 16 + 64 + 256 topics: the last level is level 4.
    const grow = (id: string, level: number): XmindTopic => ({
      id,
      title: `T${id}`,
      ...(level < 4
        ? { children: { attached: [0, 1, 2, 3].map((n) => grow(`${id}${n}`, level + 1)) } }
        : {}),
    })
    const large: XmindSheet = { title: 'Large', rootTopic: grow('r', 0) }
    expect(countSheetTopics(large)).toBe(341)
    const lines = sheetToOutline(large, OUTLINE_READING_OPTIONS).split('\n')
    expect(lines.slice(0, 8)).toEqual([
      '# Large',
      '',
      '- Tr {#r}',
      '  - Tr0 {#r0}',
      '    - Tr00 {#r00}',
      '      - Tr000 {#r000}',
      '        - (+4 more)',
      '      - Tr001 {#r001}',
    ])
    expect(lines.filter((line) => line.endsWith('- (+4 more)'))).toHaveLength(64)
    expect(lines.some((line) => /Tr\d{4}/.test(line))).toBe(false)

    // At the limit itself nothing is folded: 1 + 293 + 6 topics, six levels deep.
    const small: XmindSheet = {
      title: 'Small',
      rootTopic: {
        id: 'r',
        title: 'R',
        children: {
          attached: Array.from({ length: 293 }, (_, n): XmindTopic => ({
            id: `a${n}`,
            title: 'a',
          })),
        },
      },
    }
    small.rootTopic.children!.attached![0]!.children = { attached: [deepChain(6)] }
    expect(countSheetTopics(small)).toBe(300)
    const whole = sheetToOutline(small, OUTLINE_READING_OPTIONS)
    expect(whole).toContain(`${'  '.repeat(7)}- chain 1 {#chain1}`)
    expect(whole).not.toContain('more)')
  })
})

describe('large and deep maps', () => {
  it('writes a map as deep as a file may be', () => {
    const outline = sheetToOutline({ title: 'Deep', rootTopic: deepChain(257) })
    const lines = outline.split('\n')
    expect(lines).toHaveLength(2 + 257 + 1)
    expect(lines[258]).toBe(`${'  '.repeat(256)}- chain 1`)
  })

  it('handles long hostile text in time that grows with its length', () => {
    const size = 200_000
    const started = Date.now()
    const outline = sheetToOutline(
      branches(
        { title: ' '.repeat(size) },
        { title: '\n'.repeat(size) },
        { title: '['.repeat(size) },
        { title: '\\'.repeat(size) },
        { title: '- '.repeat(size) },
        { title: '#'.repeat(size) },
        { title: `${'<a'.repeat(size)}>`, labels: [','.repeat(size)] },
        { title: 't', notes: { plain: { content: '\n'.repeat(size) } } },
        { title: 't', href: `https://example.com/${' <'.repeat(size)}` },
      ),
    )
    expect(Date.now() - started).toBeLessThan(5000)
    expect(outline.split('\n')).toHaveLength(3 + 9 + 1)
  })
})

/** A chain of `length` topics, each the only branch of the one before; the last is `chain 1`. */
function deepChain(length: number): XmindTopic {
  let topic: XmindTopic = { id: 'chain1', title: 'chain 1' }
  for (let n = 2; n <= length; n++) {
    topic = { id: `chain${n}`, title: `chain ${n}`, children: { attached: [topic] } }
  }
  return topic
}
