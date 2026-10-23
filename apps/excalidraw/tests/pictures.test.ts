import { describe, expect, it } from 'vitest'
import { missingPictureCount, pictureRefsToRead } from '../src/renderer/pictures'
import { excalidrawLangCode } from '../src/renderer/lang'
import { LANGS } from '@genoffice/i18n'

describe('pictures of a note', () => {
  it('asks only for pictures named in the vault', () => {
    expect(
      pictureRefsToRead([
        { fileId: 'a', target: 'cat.png', kind: 'wiki' },
        { fileId: 'b', target: 'https://x.test/a.png', kind: 'link' },
        { fileId: 'c', target: '$$x$$', kind: 'formula' },
      ]),
    ).toEqual([{ fileId: 'a', target: 'cat.png' }])
  })

  it('counts live picture elements whose file did not arrive', () => {
    const elements = [
      { id: '1', type: 'image', fileId: 'a' },
      { id: '2', type: 'image', fileId: 'b' },
      { id: '3', type: 'image', fileId: 'c', isDeleted: true },
      { id: '4', type: 'rectangle' },
    ]
    expect(missingPictureCount(elements, ['a'])).toBe(1)
  })
})

describe('the canvas language', () => {
  it('has one for every app language', () => {
    for (const lang of LANGS)
      expect(excalidrawLangCode(lang), lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/)
    expect(excalidrawLangCode('ko')).toBe('ko-KR')
    expect(excalidrawLangCode('zh-TW')).toBe('zh-TW')
  })
})
