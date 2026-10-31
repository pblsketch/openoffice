import { describe, expect, it } from 'vitest'
import type { RenderNode } from '@genoffice/pptx-render'
import { computeBrushApply, extractBrushFormat } from '../src/renderer/format-brush'

const box = { x: 0, y: 0, w: 100, h: 50, rotationDeg: 0 }

function shape(over: Record<string, unknown> = {}): RenderNode {
  return {
    id: 'n',
    type: 'shape',
    sourceId: 's1',
    box,
    fill: { kind: 'solid', color: '#FF0000' },
    ...over,
  } as unknown as RenderNode
}

function textLine(runs: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return { runs, top: 0, height: 20, paraStart: true, ...extra }
}

describe('format painter: extract', () => {
  it('carries gradient fill, full line spec and every effect', () => {
    const fmt = extractBrushFormat(
      shape({
        fill: {
          kind: 'gradient',
          stops: [
            { pos: 0, color: '#112233' },
            { pos: 1, color: '#445566CC' },
          ],
          angleDeg: 45,
          path: 'circle',
          center: { x: 0.2, y: 0.8 },
        },
        stroke: {
          color: '#00FF0080',
          widthPx: 4,
          widthPt: 3,
          dashPreset: 'dash',
          cap: 'round',
          join: 'bevel',
          compound: 'dbl',
        },
        shadow: { color: '#00000066', blurPx: 8, offsetX: 0, offsetY: 0, distPx: 4, dirDeg: 90 },
        glow: { color: '#FFCC00', blurPx: 6 },
      }),
      2,
    )!
    expect(fmt.fill).toEqual({
      gradient: {
        from: '#112233',
        to: '#445566',
        stops: [
          { pos: 0, color: '#112233' },
          { pos: 1, color: '#445566CC' },
        ],
        angleDeg: 45,
        path: 'circle',
        center: { x: 0.2, y: 0.8 },
      },
    })
    expect(fmt.stroke).toEqual({
      color: '#00FF0080',
      widthPt: 3,
      dash: 'dash',
      cap: 'rnd',
      join: 'bevel',
      compound: 'dbl',
    })
    // px at render scale 2 → EMU at scale 1 (9525 EMU per px)
    expect(fmt.effects).toEqual({
      shadow: { color: '#00000066', blurRad: 38100, dist: 19050, dirDeg: 90 },
      glow: { color: '#FFCC00', radius: 28575 },
      reflection: null,
      softEdge: null,
    })
  })

  it('reads a missing line as "no line" and keeps picture fills on the target', () => {
    const fmt = extractBrushFormat(shape({ fill: { kind: 'image', mode: 'stretch' } }))!
    expect(fmt.stroke).toBeNull()
    expect('fill' in fmt).toBe(false)
  })

  it('takes the run font size without render scale and autofit shrink, and the raw font name', () => {
    const fmt = extractBrushFormat(
      shape({
        text: {
          fontScale: 0.5,
          lines: [
            textLine(
              [
                { text: '•', isBullet: true, fontSizePx: 10 },
                {
                  text: 'Hello',
                  fontFamily: 'Fallback Sans',
                  srcFontFamily: 'Pretendard',
                  // 24pt × 96/72 × scale 2 × fontScale 0.5 = 32px
                  fontSizePx: 32,
                  color: '#123456FF',
                  bold: true,
                  italic: false,
                  underline: true,
                  strike: true,
                },
              ],
              { align: 'center' },
            ),
          ],
        },
      }),
      2,
    )!
    expect(fmt.run).toEqual({
      fontFamily: 'Pretendard',
      fontSize: 24,
      bold: true,
      italic: false,
      underline: true,
      strike: true,
      color: '#123456FF',
    })
    expect(fmt.align).toBe('center')
  })

  it('leaves the font name out when the run inherits it', () => {
    const fmt = extractBrushFormat(
      shape({
        text: {
          fontScale: 1,
          lines: [textLine([{ text: 'x', fontFamily: 'Theme Fallback', fontSizePx: 24 }])],
        },
      }),
    )!
    expect(fmt.run).not.toHaveProperty('fontFamily')
  })

  it('treats a connector as a line source: line and effects only', () => {
    const fmt = extractBrushFormat(
      shape({
        line: { points: [0, 0, 10, 10] },
        stroke: { color: '#000000', widthPx: 1, widthPt: 1 },
      }),
    )!
    expect(fmt.sourceType).toBe('line')
    expect(fmt).not.toHaveProperty('fill')
    expect(fmt.stroke).toMatchObject({ color: '#000000', widthPt: 1, dash: 'solid' })
  })
})

describe('format painter: apply plan', () => {
  const fmt = extractBrushFormat(
    shape({
      stroke: { color: '#000000', widthPx: 1, widthPt: 1 },
      text: { fontScale: 1, lines: [textLine([{ text: 'a', fontSizePx: 16, color: '#000000' }])] },
    }),
  )!

  it('gives pictures and lines only line and effects', () => {
    const pic = { id: 'p', type: 'picture', sourceId: 'p', box } as unknown as RenderNode
    const plan = computeBrushApply(fmt, pic)
    expect(Object.keys(plan).sort()).toEqual(['effects', 'stroke'])
    const line = shape({ line: { points: [0, 0, 1, 1] } })
    expect(Object.keys(computeBrushApply(fmt, line)).sort()).toEqual(['effects', 'stroke'])
  })

  it('applies text format only to targets that have text', () => {
    expect(computeBrushApply(fmt, shape())).not.toHaveProperty('runFormat')
    const withText = shape({
      text: { fontScale: 1, lines: [textLine([{ text: 'b', fontSizePx: 16 }])] },
    })
    expect(computeBrushApply(fmt, withText)).toHaveProperty('runFormat')
  })

  it('paints nothing onto tables and charts', () => {
    const table = { id: 't', type: 'table', sourceId: 't', box } as unknown as RenderNode
    expect(computeBrushApply(fmt, table)).toEqual({})
  })
})
