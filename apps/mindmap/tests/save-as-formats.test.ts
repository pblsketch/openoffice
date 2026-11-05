// @vitest-environment node
/**
 * The Save As format list: .xmind first, then the exports, and what the
 * dialog's answer means.
 */
import { describe, expect, it } from 'vitest'
import {
  saveAsDefaultPath,
  saveAsFilters,
  saveAsTarget,
  type SaveAsLabelKey,
} from '../src/main/save-as-formats'

const label = (key: SaveAsLabelKey): string => key

describe('the filters', () => {
  it('Save As lists the map first, then PNG, SVG, PDF and the outline', () => {
    expect(saveAsFilters(true, label)).toEqual([
      { name: 'filterMindmap', extensions: ['xmind'] },
      { name: 'filterPng', extensions: ['png'] },
      { name: 'filterSvg', extensions: ['svg'] },
      { name: 'filterPdf', extensions: ['pdf'] },
      { name: 'filterOutline', extensions: ['md'] },
    ])
  })

  it('without exports only the map is offered', () => {
    expect(saveAsFilters(false, label)).toEqual([{ name: 'filterMindmap', extensions: ['xmind'] }])
  })
})

describe('the suggestion', () => {
  it('drops .xmind only when exports are offered', () => {
    expect(saveAsDefaultPath('C:/maps/Plan.xmind', true)).toBe('C:/maps/Plan')
    expect(saveAsDefaultPath('C:/maps/Plan.XMIND', true)).toBe('C:/maps/Plan')
    expect(saveAsDefaultPath('C:/maps/Plan.xmind', false)).toBe('C:/maps/Plan.xmind')
    expect(saveAsDefaultPath('C:/maps/Plan.v2', true)).toBe('C:/maps/Plan.v2')
  })
})

describe('the answer', () => {
  it('an export extension picks that export, with the path as typed', () => {
    expect(saveAsTarget('C:/out/a.png', true)).toEqual({ path: 'C:/out/a.png', kind: 'png' })
    expect(saveAsTarget('C:/out/a.SVG', true)).toEqual({ path: 'C:/out/a.SVG', kind: 'svg' })
    expect(saveAsTarget('C:/out/a.pdf', true)).toEqual({ path: 'C:/out/a.pdf', kind: 'pdf' })
    expect(saveAsTarget('C:/out/a.md', true)).toEqual({
      path: 'C:/out/a.md',
      kind: 'markdown',
    })
  })

  it('.xmind, a bare name or an unknown extension saves the map as .xmind', () => {
    expect(saveAsTarget('C:/out/a.xmind', true)).toEqual({
      path: 'C:/out/a.xmind',
      kind: 'xmind',
    })
    expect(saveAsTarget('C:/out/a', true)).toEqual({ path: 'C:/out/a.xmind', kind: 'xmind' })
    expect(saveAsTarget('C:/out/a.txt', true)).toEqual({
      path: 'C:/out/a.txt.xmind',
      kind: 'xmind',
    })
    expect(saveAsTarget('C:/out.d/a', true)).toEqual({
      path: 'C:/out.d/a.xmind',
      kind: 'xmind',
    })
  })

  it('without exports an export extension is no export', () => {
    expect(saveAsTarget('C:/out/a.png', false)).toEqual({
      path: 'C:/out/a.png.xmind',
      kind: 'xmind',
    })
  })
})
