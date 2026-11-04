import { describe, expect, it, vi } from 'vitest'

import {
  COPY_PICTURE_MAX_PIXELS,
  copyPictureScale,
  estimateCopyPictureSize,
  isNumberLikeCellText,
  isRangeCopyHtml,
  withCopyPicture,
  withoutRenderingFiles,
} from '../src/renderer/copy-picture'

// The shape Univer's USMToHtmlService writes for a range copy.
const RANGE_HTML =
  '<google-sheets-html-origin><table data-copy-id="copy-1" xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" style="table-layout:fixed">' +
  '<colgroup><col width="88" /><col width="120.5" /></colgroup>\n' +
  '<tbody><tr style="height: 24px;"><td>이름</td><td>점수</td></tr>' +
  '<tr style="height: 19.5px;"><td>홍길동</td><td>95</td></tr></tbody></table>'

describe('copy picture', () => {
  it('only range copies get a picture', () => {
    expect(isRangeCopyHtml(RANGE_HTML)).toBe(true)
    expect(isRangeCopyHtml('<p>cell editor text</p>')).toBe(false)
    expect(isRangeCopyHtml('<table><tr><td>a</td></tr></table>')).toBe(false)
  })

  it('reads the picture size off column widths and row heights', () => {
    expect(estimateCopyPictureSize(RANGE_HTML)).toEqual({ width: 208.5, height: 43.5 })
  })

  it('draws at the screen pixel ratio while it fits, then at 1, then not at all', () => {
    expect(copyPictureScale(400, 200, 2)).toBe(2)
    expect(copyPictureScale(400, 200, 0.75)).toBe(1)
    expect(copyPictureScale(400, 200, Number.NaN)).toBe(1)
    // 3000 x 3000 fits at 1 (9M px) but not at 2 (36M px).
    expect(copyPictureScale(3000, 3000, 2)).toBe(1)
    expect(copyPictureScale(5000, 5000, 1)).toBeNull()
    expect(copyPictureScale(4096, 4096, 1)).toBe(1)
    expect(4096 * 4096).toBe(COPY_PICTURE_MAX_PIXELS)
    expect(copyPictureScale(0, 200, 2)).toBeNull()
  })

  it('right-aligns number-like cell text the grid would right-align', () => {
    for (const text of ['95', '1,234', '-12.5', '12.5%', '₩1,000', '(1,234)', '2026. 10. 29.']) {
      expect(isNumberLikeCellText(text), text).toBe(true)
    }
    for (const text of ['홍길동', '', 'A1', '010-1234-5678', 'TRUE', '-']) {
      expect(isNumberLikeCellText(text), text).toBe(false)
    }
  })

  it('adds the PNG to a range copy write as custom data', async () => {
    const write = vi.fn(async () => {})
    const png = new Blob(['png'], { type: 'image/png' })
    const wrapped = withCopyPicture(write, async () => png)
    await wrapped('이름\t점수', RANGE_HTML)
    expect(write).toHaveBeenCalledWith('이름\t점수', RANGE_HTML, { 'image/png': png })
  })

  it('writes text and HTML as before when there is no picture', async () => {
    const write = vi.fn(async () => {})
    await withCopyPicture(write, async () => null)('a', RANGE_HTML)
    expect(write).toHaveBeenLastCalledWith('a', RANGE_HTML, undefined)
    await withCopyPicture(write, async () => {
      throw new Error('decode failed')
    })('a', RANGE_HTML, { 'x-custom': '1' })
    expect(write).toHaveBeenLastCalledWith('a', RANGE_HTML, { 'x-custom': '1' })
  })

  it('leaves other writes alone and does not render for them', async () => {
    const write = vi.fn(async () => {})
    const render = vi.fn(async () => new Blob(['png']))
    const wrapped = withCopyPicture(write, render)
    await wrapped('text', '<p>text</p>')
    await wrapped('a', RANGE_HTML, { 'image/png': 'already' })
    expect(render).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('keyboard paste drops a picture that only renders the table', async () => {
    const paste = vi.fn(async () => true)
    const guarded = withoutRenderingFiles(paste)
    const picture = [new File(['png'], 'clipboard.png', { type: 'image/png' })]
    await guarded(RANGE_HTML, '이름\t점수', picture)
    expect(paste).toHaveBeenLastCalledWith(RANGE_HTML, '이름\t점수', undefined)
    // a screenshot (no text, no HTML) still pastes as a picture
    await guarded('', '', picture)
    expect(paste).toHaveBeenLastCalledWith('', '', picture)
    await guarded('<img src="a.png">', '', picture)
    expect(paste).toHaveBeenLastCalledWith('<img src="a.png">', '', picture)
  })
})
