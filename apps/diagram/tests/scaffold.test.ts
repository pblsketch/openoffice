import { describe, expect, it } from 'vitest'
import { appStrings } from '../src/renderer/i18n/strings-app'

describe('diagram editor scaffold', () => {
  it('names the editor in every language', () => {
    expect(Object.keys(appStrings)).toHaveLength(21)
  })
})
