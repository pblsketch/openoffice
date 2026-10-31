import { describe, expect, it } from 'vitest'

import { categoryOptionForPattern, numberFormatCategories } from '../src/renderer/number-format'

describe('numberFormatCategories', () => {
  it('every category pattern echoes back as its own dropdown option', () => {
    for (const category of numberFormatCategories()) {
      expect(categoryOptionForPattern(category.pattern)).toBe(category.label)
    }
  })

  it('Korean Currency/Accounting/long-date patterns echo back as their own option', () => {
    for (const category of numberFormatCategories('ko')) {
      expect(categoryOptionForPattern(category.pattern)).toBe(category.label)
    }
  })

  it('Korean currency patterns start with ₩ instead of $', () => {
    const currency = numberFormatCategories('ko').find((c) => c.label === 'Currency')
    expect(currency?.pattern.startsWith('₩')).toBe(true)
    const accounting = numberFormatCategories('ko').find((c) => c.label === 'Accounting')
    expect(accounting?.pattern).toContain('₩')
  })
})

describe('categoryOptionForPattern', () => {
  it.each([
    ['', 'General'],
    ['m/d/yy', 'Short Date'],
    ['yyyy-mm-dd', 'Short Date'],
    ['dddd, mmmm dd, yyyy', 'Long Date'],
    ['[$-409]d-mmmm-yy', 'Long Date'],
    ['yyyy"년" m"월" d"일" aaaa', 'Long Date'],
    ['₩#,##0', 'Currency'],
    ['₩#,##0.00_);(₩#,##0.00)', 'Currency'],
    ['0.0', 'Number'],
    ['0.00_);[Red](0.00)', 'Number'],
    ['#,##0 "units"', 'Number'],
  ])('%s → %s', (pattern, label) => {
    expect(categoryOptionForPattern(pattern)).toBe(label)
  })
})
