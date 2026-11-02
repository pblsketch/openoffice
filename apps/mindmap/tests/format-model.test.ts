// @vitest-environment node
/**
 * What the format panel shows for what is selected (`format-model.ts`), and
 * the status line's words for what the map turned down (`map-notices.ts`),
 * against a map read through a stand-in.
 */
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type { ViewLayout } from '@genoffice/xmind-engine'
import { formatModel, type FormatReader } from '../src/renderer/components/format-model'
import { noticeText } from '../src/renderer/components/map-notices'
import type { MapSelection } from '../src/renderer/map/controller'
import type { ResolvedBranchLine } from '../src/renderer/map/line-resolve'
import { strings } from '../src/renderer/i18n/strings'

function drawn(change: Partial<ResolvedBranchLine> = {}): ResolvedBranchLine {
  return {
    color: '#336699ff',
    colorFrom: 'rainbow',
    width: 2,
    widthFrom: 'theme',
    pattern: 'solid',
    patternFrom: 'theme',
    shape: 'curve',
    shapeFrom: 'theme',
    shapeOther: false,
    ...change,
  }
}

function reader(
  selection: MapSelection,
  parts: Partial<FormatReader> & { lines?: Record<string, ResolvedBranchLine> } = {},
  layout: ViewLayout = 'right',
): FormatReader {
  return {
    layout,
    selection: () => selection,
    topicLine: (id) => {
      const line = parts.lines?.[id]
      return line ? { own: {}, drawn: line } : null
    },
    relationshipFormat: parts.relationshipFormat ?? (() => null),
    summaryFormat: parts.summaryFormat ?? (() => null),
    boundary: parts.boundary ?? (() => null),
  }
}

describe('the format panel model', () => {
  it('is empty with nothing selected', () => {
    expect(formatModel(reader({ kind: 'none' }))).toEqual({ kind: 'none' })
  })

  it('shows the line a topic is drawn with; a colour of the rainbow or theme is automatic', () => {
    const model = formatModel(
      reader({ kind: 'topics', ids: ['a'] }, { lines: { a: drawn({ width: 1.5 }) } }),
    )
    expect(model).toEqual({
      kind: 'topics',
      line: {
        shape: { state: 'value', value: 'curve' },
        shapeLocked: false,
        width: { state: 'value', value: 1.5 },
        color: { state: 'value', value: null },
        pattern: { state: 'value', value: 'solid' },
      },
    })
  })

  it('shows a colour written on the topic or above it as #rrggbb', () => {
    for (const colorFrom of ['own', 'inherited'] as const) {
      const model = formatModel(
        reader(
          { kind: 'topics', ids: ['a'] },
          { lines: { a: drawn({ color: '#AA0011', colorFrom }) } },
        ),
      )
      expect(model.kind === 'topics' && model.line?.color).toEqual({
        state: 'value',
        value: '#aa0011',
      })
    }
  })

  it('says "mixed" for a value the selected topics draw differently, and agrees on the rest', () => {
    const model = formatModel(
      reader(
        { kind: 'topics', ids: ['a', 'b'] },
        {
          lines: {
            a: drawn({ width: 3, colorFrom: 'own', color: '#112233' }),
            b: drawn({ width: 3, pattern: 'dot', shape: 'elbow' }),
          },
        },
      ),
    )
    if (model.kind !== 'topics' || !model.line) throw new Error('no line section')
    expect(model.line.width).toEqual({ state: 'value', value: 3 })
    expect(model.line.pattern).toEqual({ state: 'mixed' })
    expect(model.line.shape).toEqual({ state: 'mixed' })
    expect(model.line.color).toEqual({ state: 'mixed' })
  })

  it('says "other" for a shape the file has that cannot be picked', () => {
    const model = formatModel(
      reader(
        { kind: 'topics', ids: ['a'] },
        { lines: { a: drawn({ shape: 'elbow', shapeOther: true }) } },
      ),
    )
    expect(model.kind === 'topics' && model.line?.shape).toEqual({ state: 'other' })
  })

  it('locks the shape in the tree and timeline layouts only', () => {
    const lockedIn = (layout: ViewLayout): boolean | undefined => {
      const model = formatModel(
        reader({ kind: 'topics', ids: ['a'] }, { lines: { a: drawn() } }, layout),
      )
      return model.kind === 'topics' ? model.line?.shapeLocked : undefined
    }
    expect(lockedIn('tree')).toBe(true)
    expect(lockedIn('timeline')).toBe(true)
    for (const layout of ['right', 'left', 'both', 'down'] as const) {
      expect(lockedIn(layout)).toBe(false)
    }
  })

  it('shows a relationship without values as it is drawn: curved, dashed, an arrow at the end', () => {
    const model = formatModel(
      reader(
        { kind: 'relationship', id: 'r' },
        { relationshipFormat: () => ({ style: {}, curve: null }) },
      ),
    )
    expect(model).toEqual({
      kind: 'relationship',
      id: 'r',
      format: {
        shape: { state: 'value', value: 'curved' },
        begin: { state: 'value', value: 'none' },
        end: { state: 'value', value: 'normal' },
        color: { state: 'value', value: null },
        width: { state: 'value', value: 1.5 },
        pattern: { state: 'value', value: 'dash' },
        hasCurve: false,
      },
    })
  })

  it('shows the values of a relationship, another program’s end as "other", and whether it has a curve', () => {
    const model = formatModel(
      reader(
        { kind: 'relationship', id: 'r' },
        {
          relationshipFormat: () => ({
            style: {
              shape: 'org.xmind.relationshipShape.zigzag',
              begin: 'org.xmind.arrowShape.ring',
              end: 'org.xmind.arrowShape.diamond',
              color: '#CC3300',
              width: '4pt',
              pattern: 'round-dot',
            },
            curve: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
          }),
        },
      ),
    )
    if (model.kind !== 'relationship') throw new Error('no relationship section')
    expect(model.format).toEqual({
      shape: { state: 'value', value: 'zigzag' },
      begin: { state: 'other' },
      end: { state: 'value', value: 'diamond' },
      color: { state: 'value', value: '#cc3300' },
      width: { state: 'value', value: 4 },
      pattern: { state: 'value', value: 'round-dot' },
      hasCurve: true,
    })
  })

  it('shows a summary bracket without a shape as the bracket it is drawn with', () => {
    const plain = formatModel(reader({ kind: 'summary', id: 's' }, { summaryFormat: () => ({}) }))
    expect(plain).toEqual({ kind: 'summary', id: 's', shape: { state: 'value', value: 'bracket' } })
    const curly = formatModel(
      reader(
        { kind: 'summary', id: 's' },
        { summaryFormat: () => ({ shape: 'org.xmind.summaryShape.curly' }) },
      ),
    )
    expect(curly.kind === 'summary' && curly.shape).toEqual({ state: 'value', value: 'curly' })
  })

  it('shows a boundary: its default look, "no fill", and another program’s shape as "other"', () => {
    const boundary = (style: Record<string, string>) =>
      formatModel(
        reader(
          { kind: 'boundary', id: 'b' },
          {
            boundary: () => ({ id: 'b', topicId: 't', range: 'master', title: '', style }),
          },
        ),
      )
    expect(boundary({})).toEqual({
      kind: 'boundary',
      id: 'b',
      format: {
        shape: { state: 'value', value: 'roundedRect' },
        color: { state: 'value', value: null },
        width: { state: 'value', value: 1.5 },
        pattern: { state: 'value', value: 'solid' },
        fill: { state: 'value', value: null },
      },
    })
    const other = boundary({
      shape: 'org.xmind.boundaryShape.newboundary2',
      fill: 'none',
      width: '6pt',
    })
    if (other.kind !== 'boundary') throw new Error('no boundary section')
    expect(other.format.shape).toEqual({ state: 'other' })
    expect(other.format.fill).toEqual({ state: 'value', value: 'none' })
    expect(other.format.width).toEqual({ state: 'value', value: 6 })
    const filled = boundary({ fill: '#FFEEDD' })
    expect(filled.kind === 'boundary' && filled.format.fill).toEqual({
      state: 'value',
      value: '#ffeedd',
    })
  })

  it('falls back to nothing when what is selected is gone', () => {
    expect(formatModel(reader({ kind: 'relationship', id: 'gone' }))).toEqual({ kind: 'none' })
    expect(formatModel(reader({ kind: 'summary', id: 'gone' }))).toEqual({ kind: 'none' })
    expect(formatModel(reader({ kind: 'boundary', id: 'gone' }))).toEqual({ kind: 'none' })
  })
})

describe('the words for what the map turned down', () => {
  it('says why a boundary was not made', () => {
    const reason = (
      code: 'nothing-selected' | 'different-parents' | 'central-mixed' | 'both-sides',
    ) => strings.en[noticeText({ code: 'boundary-refused', reason: code })]
    expect(reason('different-parents')).toBe(
      'Only topics under the same parent can share a boundary',
    )
    expect(reason('central-mixed')).toBe('Only topics under the same parent can share a boundary')
    expect(reason('both-sides')).toBe('Only topics on the same side can share a boundary')
    expect(reason('nothing-selected')).toBe(strings.en.selectTopicFirst)
    expect(strings.ko[noticeText({ code: 'boundary-refused', reason: 'different-parents' })]).toBe(
      '같은 부모 아래의 토픽만 경계로 묶을 수 있습니다',
    )
    expect(strings.ko[noticeText({ code: 'boundary-refused', reason: 'both-sides' })]).toBe(
      '같은 쪽의 토픽만 경계로 묶을 수 있습니다',
    )
  })

  it('names the kind the format painter holds when another kind was pressed', () => {
    const held = (kind: 'topic' | 'relationship' | 'summary' | 'boundary') =>
      strings.en[noticeText({ code: 'painter-wrong-kind', held: kind, pressed: 'topic' })]
    expect(held('topic')).toBe("A topic's format can only go onto topics")
    expect(held('relationship')).toBe("A relationship's format can only go onto relationships")
    expect(held('summary')).toBe("A summary's format can only go onto summaries")
    expect(held('boundary')).toBe("A boundary's format can only go onto boundaries")
    expect(strings.en[noticeText({ code: 'painter-nothing-selected' })]).toBe(
      'Select what to copy the format from first',
    )
  })

  it('has every one of those texts in all 21 languages', () => {
    const notices = [
      { code: 'boundary-refused', reason: 'different-parents' },
      { code: 'boundary-refused', reason: 'both-sides' },
      { code: 'painter-wrong-kind', held: 'topic', pressed: 'boundary' },
      { code: 'painter-wrong-kind', held: 'relationship', pressed: 'topic' },
      { code: 'painter-wrong-kind', held: 'summary', pressed: 'topic' },
      { code: 'painter-wrong-kind', held: 'boundary', pressed: 'topic' },
      { code: 'painter-nothing-selected' },
    ] as const
    for (const lang of LANGS) {
      for (const notice of notices) {
        expect(strings[lang][noticeText(notice)].trim(), `${lang}`).not.toBe('')
      }
    }
  })
})
