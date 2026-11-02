import { describe, expect, it } from 'vitest'
import { reconcileSheet, type ReconcileResult } from '../src/reconcile'
import { isWritableTextStyle, titleRunsToView } from '../src/text-style'
import type { XmindSheet } from '../src/types'
import { openOk } from './helpers'
import { copyOf, freshTopic, inSource, inView, openSheets } from './reconcile-helpers'

/** A sheet whose topics carry text formats the way the format writes them. Written by hand. */
function formattedSheets(): XmindSheet[] {
  return [
    {
      id: 'sheet-1',
      title: 'Formats',
      rootTopic: {
        id: 'root',
        title: 'Centre',
        children: {
          attached: [
            {
              id: 'plain',
              title: 'Plain',
            },
            {
              id: 'styled',
              title: 'Styled',
              style: {
                id: 'style-styled',
                properties: {
                  'svg:fill': '#445566',
                  'fo:font-style': 'italic',
                  'line-width': '2pt',
                },
              },
            },
            {
              id: 'rich',
              title: 'Hello world',
              attributedTitle: [
                { text: 'Hello ' },
                { text: 'world', 'fo:font-weight': '700', 'fo:font-size': '20pt', future: 'kept' },
              ],
            },
            {
              id: 'stale',
              title: 'New text',
              attributedTitle: [{ text: 'Old text', 'fo:font-weight': '700' }],
            },
          ],
          summary: [
            {
              id: 'sum-topic',
              title: 'Sum',
              attributedTitle: [{ text: 'Sum', 'fo:color': '#ff0000' }],
            },
          ],
        },
        summaries: [{ id: 'sum-rec', range: '(0,1)', topicId: 'sum-topic' }],
      },
    },
  ]
}

function applied(result: ReconcileResult): Extract<ReconcileResult, { ok: true }> {
  if (!result.ok) throw new Error(result.problem)
  return result
}

describe('reading a text format', () => {
  it('shows the parts of a title only when they spell it and carry a format', () => {
    expect(titleRunsToView([{ text: 'a' }, { text: 'b', 'fo:font-weight': '700' }], 'ab')).toEqual([
      { text: 'a', style: {} },
      { text: 'b', style: { fontWeight: '700' } },
    ])
    // from before an edit: another title
    expect(titleRunsToView([{ text: 'old', 'fo:font-weight': '700' }], 'new')).toBeNull()
    // no part carries a format
    expect(titleRunsToView([{ text: 'a' }, { text: 'b' }], 'ab')).toBeNull()
    // not parts
    expect(titleRunsToView('ab', 'ab')).toBeNull()
    expect(titleRunsToView([{ text: 1 }], '1')).toBeNull()
    expect(titleRunsToView([], '')).toBeNull()
    // alignment and case belong to the whole topic, and a value that is not text is no value
    expect(
      titleRunsToView(
        [{ text: 'a', 'fo:text-align': 'center', 'fo:color': 5, 'fo:font-style': 'italic' }],
        'a',
      ),
    ).toEqual([{ text: 'a', style: { fontStyle: 'italic' } }])
  })

  it('carries the whole-topic text values and the parts in the view', async () => {
    const view = (await openSheets(formattedSheets())).viewSheets()[0]!
    expect(inView(view, 'styled').style).toEqual({ fill: '#445566', fontStyle: 'italic' })
    expect(inView(view, 'rich').titleRuns).toEqual([
      { text: 'Hello ', style: {} },
      { text: 'world', style: { fontWeight: '700', fontSize: '20pt' } },
    ])
    expect(inView(view, 'stale').titleRuns).toBeNull()
    expect(inView(view, 'plain').titleRuns).toBeNull()
  })

  it('takes only values of the shapes the engine writes', () => {
    const good: [Parameters<typeof isWritableTextStyle>[0], string][] = [
      ['color', '#a1b2c3'],
      ['color', '#a1b2c3ff'],
      ['fontWeight', '700'],
      ['fontWeight', '400'],
      ['fontSize', '14pt'],
      ['fontSize', '10.5pt'],
      ['fontFamily', 'Noto Sans KR'],
      ['fontFamily', '맑은 고딕'],
      ['fontStyle', 'italic'],
      ['textDecoration', 'underline line-through'],
      ['textAlign', 'center'],
      ['textTransform', 'uppercase'],
    ]
    for (const [key, value] of good)
      expect(isWritableTextStyle(key, value), `${key} ${value}`).toBe(true)
    const bad: [Parameters<typeof isWritableTextStyle>[0], string][] = [
      ['color', 'red'],
      ['color', '#abc'],
      ['fontWeight', 'bold'],
      ['fontWeight', '750'],
      ['fontSize', '14px'],
      ['fontSize', '0pt'],
      ['fontSize', '401pt'],
      ['fontFamily', 'x; color: red'],
      ['fontFamily', '"quoted"'],
      ['fontFamily', ' padded'],
      ['fontFamily', 'url(x)'],
      ['fontFamily', ''],
      ['fontStyle', 'oblique'],
      ['textDecoration', 'overline'],
      ['textAlign', 'justify'],
      ['textTransform', 'full-width'],
    ]
    for (const [key, value] of bad)
      expect(isWritableTextStyle(key, value), `${key} ${value}`).toBe(false)
  })
})

describe('reconciling a text format', () => {
  it('leaves a map whose state equals the view as it was, byte for byte', async () => {
    const document = await openSheets(formattedSheets())
    const original = await document.save()
    const reopened = await openOk(original)
    const result = applied(reconcileSheet(reopened, 0, reopened.viewSheets()[0]!))
    expect(result).toMatchObject({ changed: false, inSync: true })
    expect(await reopened.save()).toEqual(original)
  })

  it('writes the whole-topic values only for a topic the editor names', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    inView(state, 'plain').style = { fontWeight: '700' }
    inView(state, 'styled').style = { fill: '#445566', textDecoration: 'line-through' }
    // not named: the state's values are not taken
    expect(applied(reconcileSheet(document, 0, state))).toMatchObject({
      changed: false,
      inSync: false,
    })
    expect(inSource(document.sheets[0]!, 'plain')!.style).toBeUndefined()

    const named = applied(
      reconcileSheet(document, 0, state, { restyledTopics: ['plain', 'styled'] }),
    )
    expect(named).toMatchObject({ changed: true, inSync: true })
    expect(inSource(document.sheets[0]!, 'plain')!.style).toEqual({
      id: expect.any(String),
      properties: { 'fo:font-weight': '700' },
    })
    // italic taken out, the strike put in; the fill, another property and the id stay
    expect(inSource(document.sheets[0]!, 'styled')!.style).toEqual({
      id: 'style-styled',
      properties: {
        'svg:fill': '#445566',
        'line-width': '2pt',
        'fo:text-decoration': 'line-through',
      },
    })
  })

  it('takes out a style that held only the values the user took off', async () => {
    const document = await openSheets(formattedSheets())
    const original = await document.save()
    const state = copyOf(document.viewSheets()[0]!)
    inView(state, 'plain').style = { fontWeight: '700', color: '#123456' }
    applied(reconcileSheet(document, 0, state, { restyledTopics: ['plain'] }))
    inView(state, 'plain').style = {}
    const back = applied(reconcileSheet(document, 0, state, { restyledTopics: ['plain'] }))
    expect(back).toMatchObject({ changed: true, inSync: true })
    expect(inSource(document.sheets[0]!, 'plain')).toEqual({ id: 'plain', title: 'Plain' })
    expect(await document.save()).toEqual(original)
  })

  it('does not write a value of a shape it does not write, and keeps the file’s', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    inView(state, 'styled').style = {
      fill: '#445566',
      fontStyle: 'italic',
      color: 'red; background: url(x)',
      fontFamily: 'a"b',
    }
    const result = applied(reconcileSheet(document, 0, state, { restyledTopics: ['styled'] }))
    expect(result).toMatchObject({ changed: false, inSync: false })
    expect(inSource(document.sheets[0]!, 'styled')!.style).toEqual(
      formattedSheets()[0]!.rootTopic.children!.attached![1]!.style,
    )
  })

  it('writes the parts of a title with the title they spell', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    const plain = inView(state, 'plain')
    plain.titleRuns = [
      { text: 'Pl', style: { fontWeight: '700', color: '#ff0000' } },
      { text: 'ain', style: {} },
    ]
    const result = applied(reconcileSheet(document, 0, state, { restyledTopics: ['plain'] }))
    expect(result).toMatchObject({ changed: true, inSync: true })
    expect(inSource(document.sheets[0]!, 'plain')).toEqual({
      id: 'plain',
      title: 'Plain',
      attributedTitle: [
        { text: 'Pl', 'fo:color': '#ff0000', 'fo:font-weight': '700' },
        { text: 'ain' },
      ],
    })
    expect(
      inView((await openOk(await document.save())).viewSheets()[0]!, 'plain').titleRuns,
    ).toEqual(plain.titleRuns.map((part) => ({ text: part.text, style: part.style })))
  })

  it('keeps every key of parts the user did not change', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    inView(state, 'rich').style = { textAlign: 'center' }
    applied(reconcileSheet(document, 0, state, { restyledTopics: ['rich'] }))
    expect(inSource(document.sheets[0]!, 'rich')!.attributedTitle).toEqual(
      formattedSheets()[0]!.rootTopic.children!.attached![2]!.attributedTitle,
    )
  })

  it('takes the parts out when the title is edited to text they do not spell', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    const rich = inView(state, 'rich')
    rich.title = 'Hello there'
    // the state still carries the parts of the old title (an editor that only sets the title)
    const result = applied(reconcileSheet(document, 0, state))
    expect(result).toMatchObject({ changed: true, inSync: false })
    expect(inSource(document.sheets[0]!, 'rich')).toEqual({ id: 'rich', title: 'Hello there' })
  })

  it('writes parts that spell an edited title', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    const rich = inView(state, 'rich')
    rich.title = 'Hello big world'
    rich.titleRuns = [
      { text: 'Hello big ', style: {} },
      { text: 'world', style: { fontWeight: '700', fontSize: '20pt' } },
    ]
    expect(applied(reconcileSheet(document, 0, state))).toMatchObject({
      changed: true,
      inSync: true,
    })
    expect(inSource(document.sheets[0]!, 'rich')!.attributedTitle).toEqual([
      { text: 'Hello big ' },
      { text: 'world', 'fo:font-weight': '700', 'fo:font-size': '20pt' },
    ])
  })

  it('takes out parts from before an edit when the title is restyled or edited', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    // not named and not retitled: the old parts stay, as the file had them
    applied(reconcileSheet(document, 0, state))
    expect(inSource(document.sheets[0]!, 'stale')!.attributedTitle).toBeDefined()
    inView(state, 'stale').style = { fontWeight: '700' }
    applied(reconcileSheet(document, 0, state, { restyledTopics: ['stale'] }))
    expect(inSource(document.sheets[0]!, 'stale')!.attributedTitle).toBeUndefined()
  })

  it('writes a new topic with the text format the state shows', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!)
    state.root.children.push(
      freshTopic('new-one', 'Bold and red', {
        style: { color: '#ff0000', fill: '#000000', fontStyle: 'italic' },
        titleRuns: [
          { text: 'Bold', style: { fontWeight: '700' } },
          { text: ' and red', style: {} },
        ],
      }),
    )
    const result = applied(reconcileSheet(document, 0, state))
    const id = result.ids.topics.get('new-one') ?? 'new-one'
    const made = inSource(document.sheets[0]!, id)!
    // the fill is not a text format: it is not written from a state
    expect(made.style).toEqual({
      id: expect.any(String),
      properties: { 'fo:color': '#ff0000', 'fo:font-style': 'italic' },
    })
    expect(made.attributedTitle).toEqual([
      { text: 'Bold', 'fo:font-weight': '700' },
      { text: ' and red' },
    ])
  })

  it('takes the parts off a summary topic and a relationship whose title is edited', async () => {
    const sheets = formattedSheets()
    sheets[0]!.relationships = [
      {
        id: 'rel',
        end1Id: 'plain',
        end2Id: 'styled',
        title: 'Link',
        attributedTitle: [{ text: 'Link', 'fo:font-weight': '700' }],
      },
    ]
    const document = await openSheets(sheets)
    const state = copyOf(document.viewSheets()[0]!)
    state.root.summaries[0]!.title = 'Total'
    state.relationships[0]!.title = 'Line'
    applied(reconcileSheet(document, 0, state))
    const sheet = document.sheets[0]!
    expect(sheet.rootTopic.children!.summary![0]).toEqual({ id: 'sum-topic', title: 'Total' })
    expect(sheet.relationships).toEqual([
      { id: 'rel', end1Id: 'plain', end2Id: 'styled', title: 'Line' },
    ])
  })

  it('refuses parts that are not text with a format', async () => {
    const document = await openSheets(formattedSheets())
    const state = copyOf(document.viewSheets()[0]!) as unknown as { root: { titleRuns: unknown } }
    state.root.titleRuns = [{ text: 3 }]
    expect(reconcileSheet(document, 0, state as never).ok).toBe(false)
    state.root.titleRuns = 'Centre'
    expect(reconcileSheet(document, 0, state as never).ok).toBe(false)
  })
})
