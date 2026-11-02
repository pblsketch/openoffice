import { describe, expect, it } from 'vitest'
import {
  countPreservedElements,
  countPreservedInDocument,
  countPreservedWithTopics,
} from '../src/preserved'
import { reconcileSheet } from '../src/reconcile'
import type { XmindSheet } from '../src/types'
import { sampleSheets } from './helpers'
import { detach, openSheets } from './reconcile-helpers'

const sample = (): XmindSheet => sampleSheets()[0] as XmindSheet

/**
 * A sheet with every kind of part the view leaves out, nested: 9 topics
 * (`u1` `u2` `u3` under a shown summary topic, the summary topic `unplaced-st`
 * that no shown summary names and `w1` under it, `f1` of a kind from a later
 * version, the floating `d` with `d1` and `d2`), 3 boundaries (`ub` `xb` `db`)
 * and 2 relationships the view does not show (`hidden`, `half`).
 */
function nested(): XmindSheet {
  return {
    id: 's',
    rootTopic: {
      id: 'r',
      children: {
        attached: [
          {
            id: 'x',
            children: {
              attached: [{ id: 'x1' }, { id: 'x2' }],
              summary: [
                {
                  id: 'shown-st',
                  children: {
                    attached: [
                      {
                        id: 'u1',
                        children: { attached: [{ id: 'u2' }], callout: [{ id: 'u3' }] },
                        boundaries: [{ id: 'ub', range: '(0,0)' }],
                      },
                    ],
                  },
                },
                { id: 'unplaced-st', children: { attached: [{ id: 'w1' }] } },
              ],
              futureKind: [{ id: 'f1' }, 5, { noId: true }],
            },
            summaries: [
              { id: 'rec', range: '(0,1)', topicId: 'shown-st' },
              { id: 'rec2', range: '(0,9)', topicId: 'unplaced-st' },
            ],
            boundaries: [{ id: 'xb', range: '(0,0)' }, 'text', null],
          },
          { id: 'y' },
        ],
        detached: [
          {
            id: 'd',
            children: { attached: [{ id: 'd1' }, { id: 'd2' }] },
            boundaries: [{ id: 'db', range: '(0,1)' }],
          },
        ],
      },
    },
    relationships: [
      { id: 'shown', end1Id: 'x1', end2Id: 'x2' },
      { id: 'hidden', end1Id: 'd', end2Id: 'x' },
      { id: 'half', end1Id: 'x' },
      null,
    ],
  } as XmindSheet
}

describe('countPreservedElements', () => {
  it('counts the topics, boundaries and relationships the view leaves out', () => {
    // float, callout-1, under-summary; bound-1; rel-2
    expect(countPreservedElements(sample())).toBe(5)
    expect(countPreservedElements(nested())).toBe(9 + 3 + 2)
  })

  it('is zero for a sheet that shows everything it has', () => {
    const plain = {
      id: 's',
      extensions: [{ provider: 'someone.else' }],
      rootTopic: {
        id: 'r',
        href: 'xmind:#k0',
        futureKey: { any: 'value' },
        children: {
          attached: [{ id: 'k0' }, { id: 'k1' }],
          summary: [{ id: 'st', title: 'S' }],
        },
        summaries: [{ id: 'rec', range: '(0,1)', topicId: 'st' }],
        boundaries: 'not a list',
      },
      relationships: [{ id: 'rel', end1Id: 'k0', end2Id: 'st' }],
    } as XmindSheet
    expect(countPreservedElements(plain)).toBe(0)
    expect(countPreservedElements({ rootTopic: { id: 'r' } })).toBe(0)
  })

  it('counts per sheet and for the whole document', async () => {
    const document = await openSheets([sample(), { id: 's2', rootTopic: { id: 'r' } }, nested()])
    expect(countPreservedInDocument(document)).toEqual({ total: 19, sheets: [5, 0, 14] })
  })

  it('does not change the sheet it counts', () => {
    const sheet = nested()
    const before = JSON.stringify(sheet)
    countPreservedElements(sheet)
    countPreservedWithTopics(sheet, ['x', 'y'])
    expect(JSON.stringify(sheet)).toBe(before)
  })
})

describe('leaving out the boundaries the view draws', () => {
  it('counts only the boundaries the view cannot draw', () => {
    // bound-1 is drawn; ub (under a summary topic) and db (on a floating topic) are not, xb is
    expect(countPreservedElements(sample(), { shownBoundaries: false })).toBe(4)
    expect(countPreservedElements(nested(), { shownBoundaries: false })).toBe(9 + 2 + 2)
    expect(countPreservedElements(sample(), { shownBoundaries: true })).toBe(5)
  })

  it('still counts a boundary whose range the view cannot read or whose id repeats', () => {
    const sheet = {
      id: 's',
      rootTopic: {
        id: 'r',
        children: { attached: [{ id: 'k0' }, { id: 'k1' }] },
        boundaries: [
          { id: 'drawn', range: '(0,1)' },
          { id: 'drawn', range: '(0,0)' },
          { id: 'past-the-end', range: '(1,2)' },
          { id: 'unreadable', range: 'everything' },
          { range: '(0,0)' },
          { id: 'whole', range: 'master' },
        ],
      },
    } as XmindSheet
    expect(countPreservedElements(sheet)).toBe(6)
    expect(countPreservedElements(sheet, { shownBoundaries: false })).toBe(4)
  })

  it('applies to the whole document', async () => {
    const document = await openSheets([sample(), { id: 's2', rootTopic: { id: 'r' } }, nested()])
    expect(countPreservedInDocument(document, { shownBoundaries: false })).toEqual({
      total: 17,
      sheets: [4, 0, 13],
    })
    expect(countPreservedInDocument(document).total).toBe(19)
  })

  it('does not count a drawn boundary that goes with the topics; the default still does', () => {
    expect(countPreservedWithTopics(sample(), ['a1', 'a2'], { shownBoundaries: false })).toBe(0)
    expect(countPreservedWithTopics(sample(), ['a1', 'a2'])).toBe(1)
    expect(countPreservedWithTopics(sample(), ['a'], { shownBoundaries: false })).toBe(2)
    expect(countPreservedWithTopics(sample(), ['a'])).toBe(3)
    // ub goes with x and is not drawn; xb is drawn
    expect(countPreservedWithTopics(nested(), ['x'], { shownBoundaries: false })).toBe(6 + 1 + 2)
    expect(countPreservedWithTopics(nested(), ['x'])).toBe(6 + 2 + 2)
  })
})

describe('countPreservedWithTopics', () => {
  it('counts what the view leaves out below the topic', () => {
    // callout-1, under-summary, bound-1
    expect(countPreservedWithTopics(sample(), ['a'])).toBe(3)
    expect(countPreservedWithTopics(sample(), ['c'])).toBe(0)
    expect(countPreservedWithTopics(sample(), ['a3'])).toBe(0)
  })

  it('counts a relationship the view does not show that ends on the topic', () => {
    // rel-2 runs from the floating topic to b
    expect(countPreservedWithTopics(sample(), ['b'])).toBe(1)
    // six topics, ub and xb, hidden and half
    expect(countPreservedWithTopics(nested(), ['x'])).toBe(6 + 2 + 2)
  })

  it('counts a boundary and the branches under a summary that go with the last covered branch', () => {
    expect(countPreservedWithTopics(sample(), ['a1'])).toBe(0)
    expect(countPreservedWithTopics(sample(), ['a1', 'a2'])).toBe(1) // bound-1
    expect(countPreservedWithTopics(sample(), ['a2', 'a3'])).toBe(1) // under-summary
    expect(countPreservedWithTopics(sample(), ['a1', 'a2', 'a3'])).toBe(2)
    // u1, u2, u3 and ub under the summary topic; xb around x1 alone
    expect(countPreservedWithTopics(nested(), ['x1'])).toBe(1)
    expect(countPreservedWithTopics(nested(), ['x1', 'x2'])).toBe(4 + 1)
  })

  it('counts each part once when a topic and one of its branches are both named', () => {
    expect(countPreservedWithTopics(sample(), ['a', 'a1', 'a', 'b'])).toBe(4)
  })

  it('counts the branches under a summary topic when the summary itself is named', () => {
    expect(countPreservedWithTopics(sample(), ['sum-topic'])).toBe(1)
    expect(countPreservedWithTopics(nested(), ['shown-st'])).toBe(4)
  })

  it('is zero for the central topic, an id it does not know and a part the view does not show', () => {
    expect(countPreservedWithTopics(sample(), ['root'])).toBe(0)
    expect(countPreservedWithTopics(sample(), ['nowhere'])).toBe(0)
    expect(countPreservedWithTopics(sample(), ['float', 'callout-1', 'under-summary'])).toBe(0)
    expect(countPreservedWithTopics(sample(), [])).toBe(0)
    expect(countPreservedWithTopics(nested(), ['unplaced-st'])).toBe(0)
  })

  it('agrees with what reconciling the deletion then takes out of the file', async () => {
    const cases: [XmindSheet, string[]][] = [
      [sample(), ['a']],
      [sample(), ['b']],
      [sample(), ['a1', 'a2']],
      [nested(), ['x']],
      [nested(), ['x2', 'y']],
    ]
    for (const [sheet, ids] of cases) {
      const expected = countPreservedWithTopics(sheet, ids)
      const document = await openSheets([sheet])
      const view = document.viewSheets()[0]!
      for (const id of ids) detach(view, id)
      const result = reconcileSheet(document, 0, view)
      expect(result.ok, ids.join()).toBe(true)
      const left = countPreservedElements(document.sheets[0]!)
      expect(countPreservedElements(sheet) - left, ids.join()).toBe(expected)
    }
  })
})
