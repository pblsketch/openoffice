import { describe, expect, it } from 'vitest'
import { transposeChartSeries } from '../src/domain/chart-visual'

describe('transposeChartSeries label truncation', () => {
  it('does not split a trailing emoji when capping a category name at 255 units', () => {
    const long = `${'A'.repeat(254)}\u{1F600}`
    expect(long.length).toBe(256)
    const seriesSet = transposeChartSeries(
      [{ name: 'S1', categories: [long], values: [1] }],
      (n) => `Series ${n}`,
    )
    expect(seriesSet).toHaveLength(1)
    expect(seriesSet![0]!.name).toBe('A'.repeat(254))
    expect(seriesSet![0]!.name.length).toBe(254)
    expect(/[\uD800-\uDBFF]$/.test(seriesSet![0]!.name)).toBe(false)
  })
})
