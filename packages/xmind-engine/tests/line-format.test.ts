import { describe, expect, it } from 'vitest'
import type { XmindDocument } from '../src/document'
import {
  isWritableBoundaryStyle,
  isWritableBranchLine,
  isWritableFill,
  isWritableRelationshipStyle,
  isWritableSummaryStyle,
  readCurve,
} from '../src/line-style'
import { countPreservedElements } from '../src/preserved'
import { reconcileSheet, type ReconcileOptions, type ReconcileResult } from '../src/reconcile'
import { isRecord, type XmindSheet } from '../src/types'
import { sheetToView, type ViewBoundary, type ViewSheet } from '../src/view'
import { openOk } from './helpers'
import {
  copyOf,
  detach,
  freshTopic,
  inSource,
  inView,
  openSheets,
  UUID_V4,
} from './reconcile-helpers'

/**
 * A sheet that carries every line value the format has, the way the format
 * writes them, next to values the engine cannot draw. Written by hand.
 *
 * - `a` has a branch line format, a text colour and a fill in one style;
 *   `only-line` has a style that holds nothing but one line value.
 * - the central topic has a summary over `a`..`b` whose record carries a
 *   bracket shape, and whose summary topic carries a box shape of its own.
 * - boundaries: `bd-1` around `b`..`c` with every value, `bd-master` around
 *   the central topic, `bd-a` around `a1`, and three that cannot be drawn:
 *   `bd-bad` (a range that cannot be read), `bd-past` (past the branches) and
 *   `bd-float` (on a floating topic).
 * - `rel-1` has every relationship value and a curve; `rel-2` has none.
 */
function linedSheets(): XmindSheet[] {
  return [
    {
      id: 'sheet-1',
      title: 'Lines',
      rootTopic: {
        id: 'root',
        title: 'Centre',
        children: {
          attached: [
            {
              id: 'a',
              title: 'A',
              style: {
                id: 'style-a',
                properties: {
                  'line-class': 'org.xmind.branchConnection.elbow',
                  'line-width': '3pt',
                  'line-color': '#ff0000',
                  'line-pattern': 'dash',
                  'fo:color': '#112233',
                  'svg:fill': '#445566',
                  'future-property': 'kept',
                },
              },
              children: {
                attached: [
                  { id: 'a1', title: 'A one' },
                  { id: 'a2', title: 'A two' },
                ],
              },
              boundaries: [{ id: 'bd-a', range: '(0,0)' }],
            },
            { id: 'b', title: 'B' },
            { id: 'c', title: 'C' },
            {
              id: 'only-line',
              title: 'Only line',
              style: { id: 'style-only', properties: { 'line-color': '#00ff00' } },
            },
          ],
          summary: [
            {
              id: 'sum-topic',
              title: 'Sum',
              style: {
                id: 'style-sum-topic',
                properties: { 'shape-class': 'org.xmind.topicShape.roundedRect' },
              },
            },
          ],
          detached: [
            {
              id: 'float',
              title: 'Floating',
              children: { attached: [{ id: 'float-1', title: 'F one' }] },
              boundaries: [{ id: 'bd-float', range: '(0,0)' }],
            },
          ],
        },
        summaries: [
          {
            id: 'sum-rec',
            range: '(0,1)',
            topicId: 'sum-topic',
            style: {
              id: 'style-sum',
              properties: {
                'shape-class': 'org.xmind.summaryShape.square',
                'line-color': '#0000ff',
              },
            },
          },
        ],
        boundaries: [
          {
            id: 'bd-1',
            range: '(1,2)',
            title: 'Group',
            futureKey: 1,
            style: {
              id: 'style-bd-1',
              properties: {
                'shape-class': 'org.xmind.boundaryShape.waves',
                'line-color': '#123456',
                'line-width': '2pt',
                'line-pattern': 'dot',
                'svg:fill': '#abcdef',
                'future-property': 'kept',
              },
            },
          },
          { id: 'bd-master', range: 'master' },
          { id: 'bd-bad', range: 'oops' },
          { id: 'bd-past', range: '(2,9)' },
        ],
      },
      relationships: [
        {
          id: 'rel-1',
          end1Id: 'a',
          end2Id: 'b',
          title: 'leads',
          style: {
            id: 'style-rel-1',
            properties: {
              'shape-class': 'org.xmind.relationshipShape.curved',
              'arrow-begin-class': 'org.xmind.arrowShape.dot',
              'arrow-end-class': 'org.xmind.arrowShape.triangle',
              'line-color': '#654321',
              'line-width': '2pt',
              'line-pattern': 'dash',
            },
          },
          controlPoints: { '0': { x: 10, y: 20 }, '1': { x: -5, y: 7.5 } },
          lineEndPoints: { '0': { x: 1, y: 1 }, '1': { x: 2, y: 2 } },
        },
        { id: 'rel-2', end1Id: 'b', end2Id: 'c' },
      ],
    },
  ]
}

async function opened(): Promise<XmindDocument> {
  return openSheets(linedSheets())
}

function applied(result: ReconcileResult): Extract<ReconcileResult, { ok: true }> {
  if (!result.ok) throw new Error(result.problem)
  return result
}

function properties(holder: unknown): Record<string, unknown> | undefined {
  if (!isRecord(holder) || !isRecord(holder.style)) return undefined
  return isRecord(holder.style.properties) ? holder.style.properties : undefined
}

function relationship(sheet: XmindSheet, id: string): Record<string, unknown> {
  const found = (sheet.relationships as Record<string, unknown>[]).find((entry) => entry.id === id)
  if (!found) throw new Error(`no relationship ${id}`)
  return found
}

function boundariesOf(sheet: XmindSheet, topicId: string): Record<string, unknown>[] {
  const list = inSource(sheet, topicId)?.boundaries
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

function boundary(view: ViewSheet, id: string): ViewBoundary {
  const found = view.boundaries?.find((entry) => entry.id === id)
  if (!found) throw new Error(`no boundary ${id} in the view`)
  return found
}

/** Reconciles the edited view of sheet 0 and returns what the document now holds. */
function reconcile(
  document: XmindDocument,
  edit: (state: ViewSheet) => void,
  options: ReconcileOptions = {},
): Extract<ReconcileResult, { ok: true }> {
  const state = copyOf(document.viewSheets()[0]!)
  edit(state)
  return applied(reconcileSheet(document, 0, state, options))
}

describe('reading line values', () => {
  it('carries the line values written on a topic, as the file holds them', async () => {
    const view = (await opened()).viewSheets()[0]!
    expect(inView(view, 'a').line).toEqual({
      shape: 'org.xmind.branchConnection.elbow',
      width: '3pt',
      color: '#ff0000',
      pattern: 'dash',
    })
    expect(inView(view, 'only-line').line).toEqual({ color: '#00ff00' })
    // no line value: no key, as with the width of a box
    expect(inView(view, 'b')).not.toHaveProperty('line')
    // the text format and the fill stay where they were
    expect(inView(view, 'a').style).toEqual({ color: '#112233', fill: '#445566' })
  })

  it('carries the style values and the curve of a relationship', async () => {
    const view = (await opened()).viewSheets()[0]!
    const [first, second] = view.relationships
    expect(first).toEqual({
      id: 'rel-1',
      fromId: 'a',
      toId: 'b',
      title: 'leads',
      style: {
        shape: 'org.xmind.relationshipShape.curved',
        begin: 'org.xmind.arrowShape.dot',
        end: 'org.xmind.arrowShape.triangle',
        color: '#654321',
        width: '2pt',
        pattern: 'dash',
      },
      curve: { from: { x: 10, y: 20 }, to: { x: -5, y: 7.5 } },
    })
    expect(second).toEqual({ id: 'rel-2', fromId: 'b', toId: 'c', title: '' })
  })

  it('reads the bracket shape off the summary record, not off the summary topic', async () => {
    const view = (await opened()).viewSheets()[0]!
    expect(view.root.summaries).toEqual([
      {
        id: 'sum-rec',
        topicId: 'sum-topic',
        title: 'Sum',
        start: 0,
        end: 1,
        style: { shape: 'org.xmind.summaryShape.square' },
      },
    ])
  })

  it('lists the boundaries it can draw, with their values, and no other', async () => {
    const view = (await opened()).viewSheets()[0]!
    expect(view.boundaries?.map((entry) => entry.id)).toEqual(['bd-1', 'bd-master', 'bd-a'])
    expect(boundary(view, 'bd-1')).toEqual({
      id: 'bd-1',
      topicId: 'root',
      range: { start: 1, end: 2 },
      title: 'Group',
      style: {
        shape: 'org.xmind.boundaryShape.waves',
        color: '#123456',
        width: '2pt',
        pattern: 'dot',
        fill: '#abcdef',
      },
    })
    expect(boundary(view, 'bd-master')).toEqual({
      id: 'bd-master',
      topicId: 'root',
      range: 'master',
      title: '',
      style: {},
    })
    expect(boundary(view, 'bd-a')).toMatchObject({ topicId: 'a', range: { start: 0, end: 0 } })
  })

  it('lists a boundary under a folded branch', async () => {
    const sheets = linedSheets()
    sheets[0]!.rootTopic.children!.attached![0]!.branch = 'folded'
    const view = (await openSheets(sheets)).viewSheets()[0]!
    expect(view.boundaries?.map((entry) => entry.id)).toContain('bd-a')
  })

  it('reads curves of the shape the format writes', () => {
    expect(readCurve({ '0': { x: 1, y: 2 }, '1': { x: 3, y: 4 } })).toEqual({
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    })
    expect(readCurve({ '0': { x: 1, y: 2 } })).toBeNull()
    expect(readCurve({ '0': { x: 1, y: 'n' }, '1': { x: 3, y: 4 } })).toBeNull()
    expect(readCurve('curve')).toBeNull()
  })
})

describe('which values the engine writes', () => {
  it('writes only the words the user can pick, #rrggbb and whole points from 1 to 20', () => {
    for (const word of ['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve', 'none']) {
      expect(isWritableBranchLine('shape', `org.xmind.branchConnection.${word}`)).toBe(true)
    }
    expect(isWritableBranchLine('shape', 'org.xmind.branchConnection.fold')).toBe(false)
    expect(isWritableBranchLine('shape', 'curve')).toBe(false)
    expect(isWritableBranchLine('width', '1pt')).toBe(true)
    expect(isWritableBranchLine('width', '20pt')).toBe(true)
    expect(isWritableBranchLine('width', '21pt')).toBe(false)
    expect(isWritableBranchLine('width', '0pt')).toBe(false)
    expect(isWritableBranchLine('width', '1.5pt')).toBe(false)
    expect(isWritableBranchLine('width', '2')).toBe(false)
    expect(isWritableBranchLine('color', '#a0B1c2')).toBe(true)
    expect(isWritableBranchLine('color', '#a0b1c2ff')).toBe(false)
    expect(isWritableBranchLine('color', 'red')).toBe(false)
    for (const pattern of ['solid', 'dash', 'dot', 'dash-dot', 'dash-dot-dot', 'round-dot']) {
      expect(isWritableBranchLine('pattern', pattern)).toBe(true)
    }
    expect(isWritableBranchLine('pattern', 'dashed')).toBe(false)

    for (const word of ['curved', 'straight', 'angled', 'zigzag']) {
      expect(isWritableRelationshipStyle('shape', `org.xmind.relationshipShape.${word}`)).toBe(true)
    }
    const arrows = ['none', 'normal', 'spearhead', 'triangle', 'dot', 'square', 'diamond']
    for (const word of [...arrows, 'herringbone']) {
      expect(isWritableRelationshipStyle('begin', `org.xmind.arrowShape.${word}`)).toBe(true)
      expect(isWritableRelationshipStyle('end', `org.xmind.arrowShape.${word}`)).toBe(true)
    }
    expect(isWritableRelationshipStyle('end', 'org.xmind.arrowShape.ring')).toBe(false)
    expect(isWritableRelationshipStyle('shape', 'org.xmind.branchConnection.curve')).toBe(false)

    for (const word of [
      'curly',
      'angle',
      'square',
      'round',
      'bracket',
      'sharp',
      'fold',
      'straight',
    ]) {
      expect(isWritableSummaryStyle('shape', `org.xmind.summaryShape.${word}`)).toBe(true)
    }
    expect(isWritableSummaryStyle('shape', 'org.xmind.summaryShape.wavy')).toBe(false)

    const boundaryShapes = ['rect', 'roundedRect', 'scallops', 'waves', 'tension', 'polygon']
    for (const word of [...boundaryShapes, 'roundedPolygon']) {
      expect(isWritableBoundaryStyle('shape', `org.xmind.boundaryShape.${word}`)).toBe(true)
    }
    expect(isWritableBoundaryStyle('shape', 'org.xmind.boundaryShape.newboundary1')).toBe(false)
    expect(isWritableBoundaryStyle('fill', 'none')).toBe(true)
    expect(isWritableBoundaryStyle('fill', '#ffffff')).toBe(true)
    expect(isWritableBoundaryStyle('fill', 'url(#x)')).toBe(false)
    expect(isWritableFill('#000000')).toBe(true)
    expect(isWritableFill('none')).toBe(true)
    expect(isWritableFill('transparent')).toBe(false)
  })
})

describe('saving what nobody changed', () => {
  it('leaves a map whose state equals the view as it was, byte for byte', async () => {
    const document = await opened()
    const original = await document.save()
    const reopened = await openOk(original)
    const result = reconcile(reopened, () => {}, {
      restyledTopicLines: ['a', 'b', 'only-line'],
      refilledTopics: ['a'],
      restyledRelationships: ['rel-1', 'rel-2'],
      restyledSummaries: ['sum-topic'],
      restyledBoundaries: ['bd-1', 'bd-master', 'bd-a'],
    })
    expect(result.changed).toBe(false)
    expect(result.inSync).toBe(true)
    expect(reopened.changed).toBe(false)
    expect(await reopened.save()).toEqual(original)
  })

  it('saves the original bytes once every line edit is taken back by another state', async () => {
    const document = await opened()
    const original = await document.save()
    const untouched = copyOf(document.viewSheets()[0]!)
    const lists: ReconcileOptions = {
      restyledTopicLines: ['a', 'b'],
      restyledRelationships: ['rel-1'],
      restyledSummaries: ['sum-topic'],
      restyledBoundaries: ['bd-1'],
    }
    reconcile(
      document,
      (state) => {
        inView(state, 'a').line = { ...inView(state, 'a').line, width: '6pt' }
        inView(state, 'b').line = { color: '#000000' }
        const line = state.relationships[0]!
        line.style = { ...line.style, shape: 'org.xmind.relationshipShape.zigzag' }
        state.root.summaries[0]!.style = { shape: 'org.xmind.summaryShape.curly' }
        const around = boundary(state, 'bd-1')
        around.style = { ...around.style, shape: 'org.xmind.boundaryShape.rect' }
        boundary(state, 'bd-1').title = 'Other'
        state.boundaries!.push({
          id: 'bd-new',
          topicId: 'a',
          range: { start: 0, end: 1 },
          title: '',
          style: {},
        })
      },
      lists,
    )
    expect(document.changed).toBe(true)
    const added = document
      .viewSheets()[0]!
      .boundaries!.find((entry) => entry.topicId === 'a' && entry.id !== 'bd-a')!
    applied(
      reconcileSheet(document, 0, copyOf(untouched), {
        ...lists,
        removedBoundaries: [added.id],
      }),
    )
    expect(document.changed).toBe(false)
    expect(await document.save()).toEqual(original)
  })

  it('saves the original bytes when an undo puts the tree back and nothing is listed', async () => {
    const document = await opened()
    const original = await document.save()
    const untouched = copyOf(document.viewSheets()[0]!)
    reconcile(
      document,
      (state) => (inView(state, 'a').line = { ...inView(state, 'a').line, width: '6pt' }),
      { restyledTopicLines: ['a'] },
    )
    expect(document.changed).toBe(true)
    applied(reconcileSheet(document, 0, untouched, { restyledTopicLines: ['a'] }))
    expect(document.changed).toBe(false)
    expect(await document.save()).toEqual(original)
  })
})

describe('the line format of a topic', () => {
  it('writes the values of a listed topic and keeps every other key and the style id', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => {
        inView(state, 'a').line = {
          shape: 'org.xmind.branchConnection.straight',
          width: '6pt',
          color: '#000000',
          pattern: 'round-dot',
        }
      },
      { restyledTopicLines: ['a'] },
    )
    expect(result.inSync).toBe(true)
    const topic = inSource(document.sheets[0]!, 'a')!
    expect(topic.style).toEqual({
      id: 'style-a',
      properties: {
        'line-class': 'org.xmind.branchConnection.straight',
        'line-width': '6pt',
        'line-color': '#000000',
        'line-pattern': 'round-dot',
        'fo:color': '#112233',
        'svg:fill': '#445566',
        'future-property': 'kept',
      },
    })
  })

  it('takes out only the keys the state no longer has, and a style left empty', async () => {
    const document = await opened()
    reconcile(
      document,
      (state) => {
        inView(state, 'a').line = { width: '3pt' }
        delete inView(state, 'only-line').line
      },
      { restyledTopicLines: ['a', 'only-line'] },
    )
    const sheet = document.sheets[0]!
    expect(properties(inSource(sheet, 'a'))).toEqual({
      'line-width': '3pt',
      'fo:color': '#112233',
      'svg:fill': '#445566',
      'future-property': 'kept',
    })
    expect(inSource(sheet, 'only-line')).not.toHaveProperty('style')
  })

  it('keeps the file values of a topic that is not listed, whatever the state shows', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      inView(state, 'a').line = { width: '9pt' }
      delete inView(state, 'only-line').line
      inView(state, 'b').line = { color: '#000000' }
    })
    expect(result.changed).toBe(false)
    expect(result.inSync).toBe(false)
    expect(inView(result.view, 'a').line?.width).toBe('3pt')
    expect(inView(result.view, 'only-line').line).toEqual({ color: '#00ff00' })
  })

  it('does not write a value of a shape it does not write, and keeps the file value', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => {
        inView(state, 'a').line = {
          shape: 'org.xmind.branchConnection.fold',
          width: '1.5pt',
          color: 'red',
          pattern: 'dashed',
        }
        inView(state, 'b').line = { width: '25pt' }
      },
      { restyledTopicLines: ['a', 'b'] },
    )
    expect(result.changed).toBe(false)
    expect(result.inSync).toBe(false)
    expect(inView(result.view, 'a').line).toEqual(inView(linedView(), 'a').line)
    expect(inSource(document.sheets[0]!, 'b')).not.toHaveProperty('style')
  })

  it('keeps a value the file holds in a shape it would not write when another key changes', async () => {
    const sheets = linedSheets()
    const odd = sheets[0]!.rootTopic.children!.attached![1]!
    odd.style = { id: 'style-b', properties: { 'line-class': 'org.xmind.branchConnection.fold' } }
    const document = await openSheets(sheets)
    reconcile(
      document,
      (state) => {
        inView(state, 'b').line = { shape: 'org.xmind.branchConnection.fold', width: '2pt' }
      },
      { restyledTopicLines: ['b'] },
    )
    expect(properties(inSource(document.sheets[0]!, 'b'))).toEqual({
      'line-class': 'org.xmind.branchConnection.fold',
      'line-width': '2pt',
    })
  })

  it('writes the line format of a topic the state adds, in a style with a new id', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      state.root.children.push(
        freshTopic('new-one', 'New', { line: { color: '#00aa00', width: '4pt', pattern: 'x' } }),
      )
    })
    const id = result.ids.topics.get('new-one') ?? 'new-one'
    const topic = inSource(document.sheets[0]!, id)!
    expect(topic.style).toEqual({
      id: expect.stringMatching(UUID_V4),
      properties: { 'line-color': '#00aa00', 'line-width': '4pt' },
    })
  })

  it('writes the fill only for a topic listed as refilled', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => {
        inView(state, 'a').style.fill = '#ffffff'
        inView(state, 'b').style.fill = '#000000'
        inView(state, 'c').style.fill = 'none'
      },
      { refilledTopics: ['a', 'c'] },
    )
    const sheet = document.sheets[0]!
    expect(properties(inSource(sheet, 'a'))?.['svg:fill']).toBe('#ffffff')
    expect(properties(inSource(sheet, 'a'))?.['line-color']).toBe('#ff0000')
    expect(inSource(sheet, 'b')).not.toHaveProperty('style')
    expect(properties(inSource(sheet, 'c'))).toEqual({ 'svg:fill': 'none' })
    expect(result.inSync).toBe(false)
  })

  it('takes the fill out of a listed topic whose state has none, and keeps a fill it would not write', async () => {
    const document = await opened()
    reconcile(
      document,
      (state) => {
        delete inView(state, 'a').style.fill
        inView(state, 'b').style.fill = 'url(#pattern)'
      },
      { refilledTopics: ['a', 'b'] },
    )
    const sheet = document.sheets[0]!
    expect(properties(inSource(sheet, 'a'))).not.toHaveProperty('svg:fill')
    expect(properties(inSource(sheet, 'a'))?.['fo:color']).toBe('#112233')
    expect(inSource(sheet, 'b')).not.toHaveProperty('style')
  })
})

function linedView(): ViewSheet {
  // the view of the sheet as written, without opening an archive
  return copyOf(viewOf(linedSheets()[0]!))
}

function viewOf(sheet: XmindSheet): ViewSheet {
  return sheetToView(sheet, 0)
}

describe('the format and the curve of a relationship', () => {
  it('writes the style values of a listed relationship and keeps the style id', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => {
        state.relationships[0]!.style = {
          shape: 'org.xmind.relationshipShape.angled',
          begin: 'org.xmind.arrowShape.diamond',
          color: '#000000',
          width: '4pt',
          pattern: 'solid',
        }
      },
      { restyledRelationships: ['rel-1'] },
    )
    expect(result.inSync).toBe(true)
    const rel = relationship(document.sheets[0]!, 'rel-1')
    expect(rel.style).toEqual({
      id: 'style-rel-1',
      properties: {
        'shape-class': 'org.xmind.relationshipShape.angled',
        'arrow-begin-class': 'org.xmind.arrowShape.diamond',
        'line-color': '#000000',
        'line-width': '4pt',
        'line-pattern': 'solid',
      },
    })
    // the curve is not touched by a change of format
    expect(rel.controlPoints).toEqual({ '0': { x: 10, y: 20 }, '1': { x: -5, y: 7.5 } })
    expect(rel.lineEndPoints).toEqual({ '0': { x: 1, y: 1 }, '1': { x: 2, y: 2 } })
  })

  it('gives a style to a listed relationship that had none, and drops it again when emptied', async () => {
    const document = await opened()
    reconcile(
      document,
      (state) => (state.relationships[1]!.style = { end: 'org.xmind.arrowShape.normal' }),
      { restyledRelationships: ['rel-2'] },
    )
    expect(relationship(document.sheets[0]!, 'rel-2').style).toEqual({
      id: expect.stringMatching(UUID_V4),
      properties: { 'arrow-end-class': 'org.xmind.arrowShape.normal' },
    })
    reconcile(document, (state) => delete state.relationships[1]!.style, {
      restyledRelationships: ['rel-2'],
    })
    expect(relationship(document.sheets[0]!, 'rel-2')).not.toHaveProperty('style')
  })

  it('keeps the format and curve of a relationship that is not listed', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      state.relationships[0]!.style = {}
      state.relationships[0]!.curve = null
    })
    expect(result.changed).toBe(false)
    expect(result.inSync).toBe(false)
  })

  it('writes the curve the user drew and takes the end points out', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) =>
        (state.relationships[0]!.curve = { from: { x: 3, y: -4 }, to: { x: 0, y: 12.25 } }),
      { restyledRelationships: ['rel-1'] },
    )
    expect(result.inSync).toBe(true)
    const rel = relationship(document.sheets[0]!, 'rel-1')
    expect(rel.controlPoints).toEqual({ '0': { x: 3, y: -4 }, '1': { x: 0, y: 12.25 } })
    expect(rel).not.toHaveProperty('lineEndPoints')
    expect(properties(rel)?.['line-color']).toBe('#654321')
  })

  it('takes the curve out when the state asks for the automatic one', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => (state.relationships[0]!.curve = null), {
      restyledRelationships: ['rel-1'],
    })
    expect(result.inSync).toBe(true)
    const rel = relationship(document.sheets[0]!, 'rel-1')
    expect(rel).not.toHaveProperty('controlPoints')
    expect(rel).not.toHaveProperty('lineEndPoints')
  })

  it('keeps the curve keys of a listed relationship whose state does not carry a curve', async () => {
    const sheets = linedSheets()
    const partial = (sheets[0]!.relationships as Record<string, unknown>[])[1]!
    partial.controlPoints = { '0': { x: 1, y: 2 } }
    const document = await openSheets(sheets)
    reconcile(document, (state) => (state.relationships[1]!.style = { color: '#111111' }), {
      restyledRelationships: ['rel-2'],
    })
    expect(relationship(document.sheets[0]!, 'rel-2').controlPoints).toEqual({
      '0': { x: 1, y: 2 },
    })
  })

  it('takes the curve out of a relationship named as reshaped by an editor that sends no curve', async () => {
    const document = await opened()
    reconcile(
      document,
      (state) => {
        for (const line of state.relationships) delete line.curve
      },
      { reshapedRelationships: ['rel-1'] },
    )
    const rel = relationship(document.sheets[0]!, 'rel-1')
    expect(rel).not.toHaveProperty('controlPoints')
    expect(rel).not.toHaveProperty('lineEndPoints')
    expect(properties(rel)?.['line-color']).toBe('#654321')
  })

  it('leaves the file’s curve for a curve that is not two points, and applies the rest of the state', async () => {
    for (const curve of [{ from: { x: 1 } }, 'curved', { from: { x: 1, y: 2 }, to: null }]) {
      const document = await opened()
      const before = copyOf(relationship(document.sheets[0]!, 'rel-1'))
      const state = copyOf(document.viewSheets()[0]!)
      const line = state.relationships[0]!
      ;(line as unknown as Record<string, unknown>).curve = curve
      line.title = 'renamed'
      line.style = { ...line.style, color: '#111111' }
      const result = reconcileSheet(document, 0, state, { restyledRelationships: ['rel-1'] })
      expect(result.ok, JSON.stringify(curve)).toBe(true)
      // the editor showed a curve the file does not hold: it draws the file's again
      expect(applied(result).inSync).toBe(false)
      const rel = relationship(document.sheets[0]!, 'rel-1')
      expect(rel.title).toBe('renamed')
      expect(properties(rel)?.['line-color']).toBe('#111111')
      expect(rel.controlPoints).toEqual(before.controlPoints)
      expect(rel.lineEndPoints).toEqual(before.lineEndPoints)
    }
  })

  it('writes the format and curve of a relationship the state adds', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      state.relationships.push({
        id: 'rel-new',
        fromId: 'c',
        toId: 'a1',
        title: '',
        style: { shape: 'org.xmind.relationshipShape.straight', width: '0pt' },
        curve: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
      })
    })
    const id = result.ids.relationships.get('rel-new') ?? 'rel-new'
    const rel = relationship(document.sheets[0]!, id)
    expect(rel).toEqual({
      id,
      end1Id: 'c',
      end2Id: 'a1',
      style: {
        id: expect.stringMatching(UUID_V4),
        properties: { 'shape-class': 'org.xmind.relationshipShape.straight' },
      },
      controlPoints: { '0': { x: 1, y: 2 }, '1': { x: 3, y: 4 } },
    })
  })
})

describe('the bracket shape of a summary', () => {
  it('writes on the summary record and leaves the summary topic shape alone', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => (state.root.summaries[0]!.style = { shape: 'org.xmind.summaryShape.bracket' }),
      { restyledSummaries: ['sum-topic'] },
    )
    expect(result.inSync).toBe(true)
    const root = document.sheets[0]!.rootTopic
    const record = (root.summaries as Record<string, unknown>[])[0]!
    expect(record.style).toEqual({
      id: 'style-sum',
      properties: { 'shape-class': 'org.xmind.summaryShape.bracket', 'line-color': '#0000ff' },
    })
    expect(properties(inSource(document.sheets[0]!, 'sum-topic'))).toEqual({
      'shape-class': 'org.xmind.topicShape.roundedRect',
    })
  })

  it('takes the shape out, keeps a summary that is not listed, and skips a shape it would not write', async () => {
    const document = await opened()
    reconcile(document, (state) => delete state.root.summaries[0]!.style, {
      restyledSummaries: ['sum-topic'],
    })
    const record = (): Record<string, unknown> =>
      (document.sheets[0]!.rootTopic.summaries as Record<string, unknown>[])[0]!
    expect(properties(record())).toEqual({ 'line-color': '#0000ff' })
    const unlisted = reconcile(
      document,
      (state) => (state.root.summaries[0]!.style = { shape: 'org.xmind.summaryShape.round' }),
    )
    expect(unlisted.changed).toBe(false)
    const odd = reconcile(
      document,
      (state) => (state.root.summaries[0]!.style = { shape: 'org.xmind.summaryShape.wavy' }),
      { restyledSummaries: ['sum-topic'] },
    )
    expect(odd.changed).toBe(false)
    expect(odd.inSync).toBe(false)
  })

  it('writes the shape of a summary the state adds', async () => {
    const document = await opened()
    reconcile(document, (state) => {
      inView(state, 'a').summaries.push({
        id: 'new-sum',
        topicId: 'new-sum-topic',
        title: 'New',
        start: 0,
        end: 1,
        style: { shape: 'org.xmind.summaryShape.angle' },
      })
    })
    const record = (inSource(document.sheets[0]!, 'a')!.summaries as Record<string, unknown>[])[0]!
    expect(properties(record)).toEqual({ 'shape-class': 'org.xmind.summaryShape.angle' })
  })
})

describe('boundaries', () => {
  it('writes the format and the title of a listed boundary and keeps unknown keys', async () => {
    const document = await opened()
    const result = reconcile(
      document,
      (state) => {
        const target = boundary(state, 'bd-1')
        target.style = {
          shape: 'org.xmind.boundaryShape.roundedPolygon',
          color: '#000000',
          fill: 'none',
        }
        target.title = 'Renamed'
      },
      { restyledBoundaries: ['bd-1'] },
    )
    expect(result.inSync).toBe(true)
    expect(boundariesOf(document.sheets[0]!, 'root')[0]).toEqual({
      id: 'bd-1',
      range: '(1,2)',
      title: 'Renamed',
      futureKey: 1,
      style: {
        id: 'style-bd-1',
        properties: {
          'shape-class': 'org.xmind.boundaryShape.roundedPolygon',
          'line-color': '#000000',
          'svg:fill': 'none',
          'future-property': 'kept',
        },
      },
    })
  })

  it('keeps the format of a boundary that is not listed, and takes an emptied title out', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      boundary(state, 'bd-1').style = {}
      boundary(state, 'bd-1').title = ''
    })
    const record = boundariesOf(document.sheets[0]!, 'root')[0]!
    expect(properties(record)?.['shape-class']).toBe('org.xmind.boundaryShape.waves')
    expect(record).not.toHaveProperty('title')
    expect(result.inSync).toBe(false)
  })

  it('adds a boundary around a run of branches, with a new id', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => {
      state.boundaries!.push({
        id: 'not-a-uuid',
        topicId: 'a',
        range: { start: 0, end: 1 },
        title: 'Pair',
        style: { color: '#00ff00', width: '7pt', pattern: 'nonsense' },
      })
    })
    const added = boundariesOf(document.sheets[0]!, 'a')[1]!
    expect(added).toEqual({
      id: expect.stringMatching(UUID_V4),
      range: '(0,1)',
      title: 'Pair',
      style: {
        id: expect.stringMatching(UUID_V4),
        properties: { 'line-color': '#00ff00', 'line-width': '7pt' },
      },
    })
    expect(result.ids.boundaries.get('not-a-uuid')).toBe(added.id)
    // the id the state gave was replaced: the editor draws the view again
    expect(result.inSync).toBe(false)
  })

  it('adds a boundary around the central topic, keeping an id of the format shape', async () => {
    const document = await opened()
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const result = reconcile(document, (state) => {
      state.boundaries!.push({ id, topicId: 'root', range: 'master', title: '', style: {} })
    })
    expect(result.inSync).toBe(true)
    expect(boundariesOf(document.sheets[0]!, 'root').at(-1)).toEqual({ id, range: 'master' })
  })

  it('adds a boundary on a topic the same state adds', async () => {
    const document = await opened()
    reconcile(document, (state) => {
      state.root.children.push(
        freshTopic('n', 'N', { children: [freshTopic('n1', 'N1'), freshTopic('n2', 'N2')] }),
      )
      state.boundaries!.push({
        id: 'bd-n',
        topicId: 'n',
        range: { start: 1, end: 1 },
        title: '',
        style: {},
      })
    })
    const sheet = document.sheets[0]!
    const topic = sheet.rootTopic.children!.attached!.at(-1)!
    expect(topic.boundaries).toEqual([{ id: expect.stringMatching(UUID_V4), range: '(1,1)' }])
  })

  it('refuses a new boundary on a topic the state does not have, or past its branches', async () => {
    const document = await opened()
    const bad: ViewBoundary[] = [
      { id: 'x1', topicId: 'nowhere', range: { start: 0, end: 0 }, title: '', style: {} },
      { id: 'x2', topicId: 'a', range: { start: 1, end: 2 }, title: '', style: {} },
      { id: 'x3', topicId: 'float', range: { start: 0, end: 0 }, title: '', style: {} },
      { id: 'bd-float', topicId: 'a', range: { start: 0, end: 0 }, title: '', style: {} },
    ]
    for (const entry of bad) {
      const state = copyOf(document.viewSheets()[0]!)
      state.boundaries!.push(entry)
      expect(reconcileSheet(document, 0, state).ok, entry.id).toBe(false)
    }
    const twice = copyOf(document.viewSheets()[0]!)
    twice.boundaries!.push(copyOf(twice.boundaries![0]!))
    expect(reconcileSheet(document, 0, twice).ok).toBe(false)
    expect(document.changed).toBe(false)
  })

  it('removes only the boundaries listed as removed', async () => {
    const document = await opened()
    const before = countPreservedElements(document.sheets[0]!)
    reconcile(
      document,
      (state) => {
        // missing from the state without being listed: stays
        state.boundaries = state.boundaries!.filter((entry) => entry.id !== 'bd-1')
        state.boundaries = state.boundaries.filter((entry) => entry.id !== 'bd-a')
      },
      { removedBoundaries: ['bd-a', 'bd-float', 'bd-bad'] },
    )
    const sheet = document.sheets[0]!
    expect(boundariesOf(sheet, 'root').map((entry) => entry.id)).toEqual([
      'bd-1',
      'bd-master',
      'bd-bad',
      'bd-past',
    ])
    expect(inSource(sheet, 'a')).not.toHaveProperty('boundaries')
    // ones the editor cannot draw stay even when named
    expect(boundariesOf(sheet, 'float').map((entry) => entry.id)).toEqual(['bd-float'])
    expect(countPreservedElements(sheet)).toBe(before - 1)
  })

  it('shows and settles only the first of the boundaries that share an id, and leaves the others as they are', async () => {
    const sheets = linedSheets()
    const root = sheets[0]!.rootTopic
    const a = root.children!.attached![0]!
    const second = {
      id: 'bd-dup',
      range: '(1,1)',
      title: 'Second',
      style: { id: 'style-dup-2', properties: { 'line-color': '#222222' } },
    }
    const third = { id: 'bd-dup', range: '(0,0)', title: 'Third' }
    // the first in the view's order: the central topic's comes before its branches'
    ;(root.boundaries as unknown[]).push({ id: 'bd-dup', range: '(0,0)', title: 'First' }, third)
    a.boundaries = [...(a.boundaries as unknown[]), second]
    const document = await openSheets(sheets)
    const view = document.viewSheets()[0]!
    expect(view.boundaries!.filter((entry) => entry.id === 'bd-dup')).toEqual([
      { id: 'bd-dup', topicId: 'root', range: { start: 0, end: 0 }, title: 'First', style: {} },
    ])
    const untouched = { second: copyOf(second), third: copyOf(third) }

    const result = reconcile(
      document,
      (state) => {
        const target = boundary(state, 'bd-dup')
        target.title = 'Renamed'
        target.style = { color: '#123456' }
        inView(state, 'b').title = 'B again'
      },
      { restyledBoundaries: ['bd-dup'] },
    )
    expect(result.inSync).toBe(true)
    const sheet = document.sheets[0]!
    const dups = (topicId: string) =>
      boundariesOf(sheet, topicId).filter((entry) => entry.id === 'bd-dup')
    expect(dups('root')).toEqual([
      {
        id: 'bd-dup',
        range: '(0,0)',
        title: 'Renamed',
        style: { id: expect.any(String), properties: { 'line-color': '#123456' } },
      },
      untouched.third,
    ])
    expect(dups('a')).toEqual([untouched.second])

    // removing it takes the first alone; the next of that id is the one shown then
    const removed = reconcile(
      document,
      (state) => {
        state.boundaries = state.boundaries!.filter((entry) => entry.id !== 'bd-dup')
      },
      { removedBoundaries: ['bd-dup'] },
    )
    expect(dups('root')).toEqual([untouched.third])
    expect(dups('a')).toEqual([untouched.second])
    expect(removed.view.boundaries!.filter((entry) => entry.id === 'bd-dup')).toEqual([
      { id: 'bd-dup', topicId: 'root', range: { start: 0, end: 0 }, title: 'Third', style: {} },
    ])
  })

  it('leaves the boundaries alone for a state that carries none', async () => {
    const document = await opened()
    const result = reconcile(document, (state) => delete state.boundaries)
    expect(result.changed).toBe(false)
    expect(result.inSync).toBe(true)
  })

  it('lets a new boundary follow the branches it covers when they move or go', async () => {
    const document = await opened()
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    reconcile(document, (state) => {
      state.boundaries!.push({
        id,
        topicId: 'root',
        range: { start: 2, end: 3 },
        title: 'Moves',
        style: {},
      })
    })
    const placed = (): Record<string, unknown> | undefined =>
      boundariesOf(document.sheets[0]!, 'root').find((entry) => entry.id === id)
    expect(placed()).toEqual({ id, range: '(2,3)', title: 'Moves' })
    // `b` goes under `a`: `c` and `only-line` are now at 1 and 2
    reconcile(document, (state) => {
      inView(state, 'a').children.push(detach(state, 'b'))
    })
    expect(placed()?.range).toBe('(1,2)')
    // the first covered branch goes under `a`: the boundary goes with it
    reconcile(document, (state) => {
      inView(state, 'a').children.push(detach(state, 'c'))
    })
    expect(placed()).toBeUndefined()
    expect(boundariesOf(document.sheets[0]!, 'a').find((entry) => entry.id === id)).toEqual({
      id,
      range: '(3,3)',
      title: 'Moves',
    })
    // every covered branch is deleted: the boundary goes
    reconcile(document, (state) => {
      detach(state, 'c')
      detach(state, 'only-line')
    })
    expect(JSON.stringify(document.sheets[0])).not.toContain(id)
  })

  it('keeps a boundary over a branch that is dragged away by moving it along', async () => {
    const document = await opened()
    reconcile(document, (state) => {
      const moved = detach(state, 'a1')
      inView(state, 'c').children.push(moved)
    })
    expect(boundariesOf(document.sheets[0]!, 'c')).toEqual([{ id: 'bd-a', range: '(0,0)' }])
    expect(inSource(document.sheets[0]!, 'a')).not.toHaveProperty('boundaries')
    expect(document.viewSheets()[0]!.boundaries?.find((entry) => entry.id === 'bd-a')).toEqual({
      id: 'bd-a',
      topicId: 'c',
      range: { start: 0, end: 0 },
      title: '',
      style: {},
    })
  })
})

describe('what stays out of the file', () => {
  it('writes no key the format does not have', async () => {
    const document = await opened()
    reconcile(
      document,
      (state) => {
        inView(state, 'b').line = { width: '2pt' }
        state.relationships[1]!.curve = { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }
        state.boundaries!.push({
          id: 'bd-z',
          topicId: 'root',
          range: { start: 0, end: 0 },
          title: 'Z',
          style: { fill: '#ffffff' },
        })
      },
      { restyledTopicLines: ['b'], restyledRelationships: ['rel-2'] },
    )
    const text = JSON.stringify(document.sheets[0])
    for (const key of ['"line"', '"curve"', '"from"', '"topicId":"root"', '"start"', 'ieum']) {
      expect(text, key).not.toContain(key)
    }
  })
})
