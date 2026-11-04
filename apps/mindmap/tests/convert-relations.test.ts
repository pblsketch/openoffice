/**
 * The format of relationships, summary brackets and boundaries between the
 * engine's view data and the library's data: carried into the library's
 * records (and, for a curve, into its control points), and back into the
 * state so that a map only opened reconciles to "nothing changed" and the
 * values the screen holds are the ones a reconcile would write.
 */
import { describe, expect, it } from 'vitest'
import type { MindElixirData } from 'mind-elixir'
import { reconcileSheet, sheetToView, type ViewSheet } from '@genoffice/xmind-engine'
import {
  type MapArrow,
  type MapSummary,
  boundariesOf,
  mindToState,
  type StateBase,
  viewToMind,
} from '../src/renderer/document/convert'
import { copyOf, documentOf, FORMAT_IDS as ID, lineFormatSheet } from './helpers/fixtures'

const base = (view: ViewSheet, extra: Partial<StateBase> = {}): StateBase => ({
  view,
  layoutPicked: false,
  removedSummaries: new Set(),
  removedRelationships: new Set(),
  ...extra,
})

async function opened() {
  const document = await documentOf(lineFormatSheet())
  const view = sheetToView(document.sheets[0]!, 0)
  return { document, view, data: copyOf(viewToMind(view)) }
}

const arrowOf = (data: MindElixirData, id: string) =>
  (data.arrows as MapArrow[]).find((arrow) => arrow.id === id)!

describe('into the library', () => {
  it('a relationship without values is the record it always was', async () => {
    const { data } = await opened()
    expect(arrowOf(data, ID.plainLine)).toEqual({
      id: ID.plainLine,
      label: 'plain',
      from: ID.rightA,
      to: ID.left,
    })
  })

  it('a relationship carries its values, its curve as control points, and the line options of the library', async () => {
    const { data } = await opened()
    const styled = arrowOf(data, ID.styledLine)
    expect(styled.metadata).toEqual({
      style: {
        shape: 'org.xmind.relationshipShape.curved',
        begin: 'org.xmind.arrowShape.dot',
        end: 'org.xmind.arrowShape.triangle',
        color: '#cc3300',
        width: '3pt',
        pattern: 'solid',
      },
      curve: { from: { x: 40, y: -30 }, to: { x: -50, y: 25 } },
    })
    expect(styled.delta1).toEqual({ x: 40, y: -30 })
    expect(styled.delta2).toEqual({ x: -50, y: 25 })
    expect(styled.style).toEqual({ stroke: '#cc3300', strokeWidth: 3, strokeDasharray: 'none' })
    // never the library's line in two directions: the ends are drawn by this editor
    expect(styled).not.toHaveProperty('bidirectional')
  })

  it('a summary carries the values of its bracket', async () => {
    const { data } = await opened()
    expect(data.summaries).toEqual([
      {
        id: ID.summaryTopic,
        label: 'Both',
        parent: ID.right,
        start: 0,
        end: 1,
        metadata: { style: { shape: 'org.xmind.summaryShape.curly' } },
      },
    ])
  })

  it('the sheet’s boundaries ride with the data, those under a folded branch too', async () => {
    const { data, view } = await opened()
    const boundaries = boundariesOf(data)
    expect(boundaries.map((boundary) => boundary.id)).toEqual(
      view.boundaries!.map((boundary) => boundary.id),
    )
    expect(boundaries.map((boundary) => boundary.id)).toEqual(
      expect.arrayContaining([ID.around, ID.master, ID.sides, ID.underFold]),
    )
    const around = boundaries.find((boundary) => boundary.id === ID.around)!
    expect(around).toEqual({
      id: ID.around,
      topicId: ID.right,
      range: { start: 0, end: 1 },
      title: '<b>around</b>',
      style: {
        shape: 'org.xmind.boundaryShape.waves',
        color: '#336699',
        width: '2pt',
        pattern: 'dash',
        fill: '#eeddcc',
      },
    })
    // a copy: the data does not share the view's objects
    around.title = 'changed'
    expect(view.boundaries!.find((boundary) => boundary.id === ID.around)!.title).toBe(
      '<b>around</b>',
    )
  })

  it('a sheet without boundaries says so, so nothing of another sheet stays', () => {
    const view = sheetToView(
      {
        id: 's',
        class: 'sheet',
        title: 't',
        rootTopic: { id: 'r', class: 'topic', title: 'R' },
      },
      0,
    )
    expect(boundariesOf(viewToMind(view))).toEqual([])
    expect(viewToMind(view).meta).toEqual({ boundaries: [] })
  })
})

describe('back into the state', () => {
  it('a map only opened reconciles to "nothing changed", in sync', async () => {
    const { document, view, data } = await opened()
    const before = copyOf(document.sheets)
    const result = reconcileSheet(document, 0, mindToState(copyOf(data), base(view)))
    expect(result).toMatchObject({ ok: true, changed: false, inSync: true })
    expect(document.sheets).toEqual(before)
  })

  it('the state holds the values the screen holds', async () => {
    const { view, data } = await opened()
    arrowOf(data, ID.styledLine).metadata = {
      style: { shape: 'org.xmind.relationshipShape.zigzag' },
      curve: { from: { x: 1, y: 1 }, to: { x: 2, y: 2 } },
    }
    ;(data.summaries as MapSummary[])[0]!.metadata = {
      style: { shape: 'org.xmind.summaryShape.angle' },
    }
    const carried = data.meta!.boundaries as { id: string; title: string }[]
    carried.find((boundary) => boundary.id === ID.master)!.title = 'renamed'
    const state = mindToState(copyOf(data), base(view))
    const styled = state.relationships.find((line) => line.id === ID.styledLine)!
    expect(styled.style).toEqual({ shape: 'org.xmind.relationshipShape.zigzag' })
    expect(styled.curve).toEqual({ from: { x: 1, y: 1 }, to: { x: 2, y: 2 } })
    const right = state.root.children.find((topic) => topic.id === ID.right)!
    expect(right.summaries[0]!.style).toEqual({ shape: 'org.xmind.summaryShape.angle' })
    expect(state.boundaries!.find((boundary) => boundary.id === ID.master)!.title).toBe('renamed')
    // the plain line: no values, no curve given (the file keeps whatever it has)
    const plain = state.relationships.find((line) => line.id === ID.plainLine)!
    expect(plain.style).toEqual({})
    expect(plain).not.toHaveProperty('curve')
  })

  it('a curve the screen asks to be automatic is null; the control points the library worked out are never the curve', async () => {
    const { view, data } = await opened()
    // the library writes its own control points on every line it draws
    arrowOf(data, ID.plainLine).delta1 = { x: 5, y: 5 }
    arrowOf(data, ID.plainLine).delta2 = { x: 6, y: 6 }
    arrowOf(data, ID.styledLine).metadata = { curve: null }
    const state = mindToState(copyOf(data), base(view))
    expect(state.relationships.find((line) => line.id === ID.plainLine)).not.toHaveProperty('curve')
    expect(state.relationships.find((line) => line.id === ID.styledLine)!.curve).toBeNull()
  })

  it('what the user changed is written, and only that', async () => {
    const { document, view, data } = await opened()
    arrowOf(data, ID.styledLine).metadata = {
      style: { end: 'org.xmind.arrowShape.diamond' },
      curve: { from: { x: 7, y: 8 }, to: { x: 9, y: 10 } },
    }
    arrowOf(data, ID.straightLine).metadata = { style: {} }
    const result = reconcileSheet(document, 0, mindToState(copyOf(data), base(view)), {
      restyledRelationships: [ID.styledLine],
    })
    expect(result.ok).toBe(true)
    const lines = document.sheets[0]!.relationships as {
      id: string
      style?: { properties?: Record<string, string> }
      controlPoints?: unknown
    }[]
    const styled = lines.find((line) => line.id === ID.styledLine)!
    expect(styled.style!.properties).toEqual({ 'arrow-end-class': 'org.xmind.arrowShape.diamond' })
    expect(styled.controlPoints).toEqual({ '0': { x: 7, y: 8 }, '1': { x: 9, y: 10 } })
    // not named as changed: the file keeps its values and its curve
    const straight = lines.find((line) => line.id === ID.straightLine)!
    expect(straight.style!.properties).toEqual({
      'shape-class': 'org.xmind.relationshipShape.straight',
    })
    expect(straight.controlPoints).toEqual({ '0': { x: 1, y: 2 }, '1': { x: 3, y: 4 } })
  })

  it('a summary or relationship the library forgot keeps its values; one the user removed goes', async () => {
    const { document, view, data } = await opened()
    data.summaries = []
    data.arrows = (data.arrows as MapArrow[]).filter((arrow) => arrow.id !== ID.styledLine)
    const forgot = mindToState(copyOf(data), base(view))
    const right = forgot.root.children.find((topic) => topic.id === ID.right)!
    expect(right.summaries[0]!.style).toEqual({ shape: 'org.xmind.summaryShape.curly' })
    expect(forgot.relationships.find((line) => line.id === ID.styledLine)!.style).toMatchObject({
      end: 'org.xmind.arrowShape.triangle',
    })
    const removed = mindToState(
      copyOf(data),
      base(view, {
        removedSummaries: new Set([ID.summaryTopic]),
        removedRelationships: new Set([ID.styledLine]),
      }),
    )
    expect(removed.root.children.find((topic) => topic.id === ID.right)!.summaries).toEqual([])
    expect(removed.relationships.map((line) => line.id)).not.toContain(ID.styledLine)
    expect(reconcileSheet(document, 0, removed).ok).toBe(true)
  })

  it('without boundaries in the data, the view’s are handed back; a broken record is left out', async () => {
    const { view, data } = await opened()
    const lost = copyOf(data)
    delete lost.meta
    expect(mindToState(lost, base(view)).boundaries).toEqual(view.boundaries)
    const broken = copyOf(data)
    broken.meta = {
      boundaries: [
        ...boundariesOf(data),
        { id: 42, topicId: ID.root, range: 'master', title: '', style: {} },
        { id: 'x', topicId: ID.root, range: { start: 2, end: 1 }, title: '', style: {} },
        'not a boundary',
      ],
    }
    expect(mindToState(broken, base(view)).boundaries).toEqual(view.boundaries)
  })
})
