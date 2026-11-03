import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { parseFileToText } from '../src/index'
import { checkedHwpBytes, hwpToText } from '../src/hwp'
import { buildPdfFixture, writeFixture } from './helpers/fixtures'

/**
 * The documents are built with the engine the reader uses (there is no other
 * writer for the format here), then saved and read back as files.
 */
beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const cell = (text: string) => `<td>${text}</td>`
const tableHtml = (rows: string[][]) =>
  `<table>${rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}</table>`

/**
 * A document of the given lines; a line that is an array of rows becomes a table in a
 * paragraph of its own. The paragraphs are all made first: splitting a paragraph that
 * already holds a table would carry the table along.
 */
function build(lines: (string | string[][])[]): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (typeof line === 'string' && line) doc.insertText(0, index, 0, line)
  })
  lines.forEach((line, index) => {
    if (typeof line !== 'string') doc.pasteHtml(0, index, 0, tableHtml(line))
  })
  return doc
}

const REPORT: (string | string[][])[] = [
  '등록제 시행 안내',
  '7월 1일부터 시행합니다.',
  [
    ['구분', '세관명', '연락처'],
    ['특송', '인천세관', '032-722-4315'],
    ['우편', '국제우편세관', '032-720-7428'],
  ],
  '끝.',
]

/** A document of the same shape with one memo on paragraph `para`. */
function withMemo(
  lines: (string | string[][])[],
  memo: { author?: string; text: string },
  para = 0,
): HwpDocument {
  const doc = build(lines)
  const length = doc.getParagraphLength(0, para)
  const created = JSON.parse(doc.insertMemo(0, para, 0, length, JSON.stringify(memo))) as {
    ok: boolean
  }
  expect(created.ok).toBe(true)
  return doc
}

describe('hwp and hwpx to text', () => {
  it('reads paragraphs as lines and a data table as rows, from a .hwp file', async () => {
    const path = writeFixture('report.hwp', build(REPORT).exportHwp())
    const result = await parseFileToText(path)
    expect(result).toMatchObject({ ok: true, kind: 'text' })
    expect(result.text!.split('\n')).toEqual([
      '등록제 시행 안내',
      '7월 1일부터 시행합니다.',
      '구분 | 세관명 | 연락처',
      '특송 | 인천세관 | 032-722-4315',
      '우편 | 국제우편세관 | 032-720-7428',
      '끝.',
    ])
  })

  it('reads the same from a .hwpx file', async () => {
    const path = writeFixture('report.hwpx', build(REPORT).exportHwpx())
    const result = await parseFileToText(path)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('특송 | 인천세관 | 032-722-4315')
    expect(result.text!.split('\n')[0]).toBe('등록제 시행 안내')
  })

  it('reads an HWPX saved under a .hwp name', async () => {
    const path = writeFixture('renamed.hwp', build(REPORT).exportHwpx())
    expect((await parseFileToText(path)).text).toContain('구분 | 세관명 | 연락처')
  })

  it('keeps a merged cell at its first place and leaves the rest of its span empty', async () => {
    const doc = build([
      '앞',
      [
        ['구분', '세관명', '연락처'],
        ['특송', '인천세관', '032-722-4315'],
        ['통관', '평택세관', '031-8054-7110'],
      ],
    ])
    // the first column of the two data rows becomes one cell
    doc.mergeTableCells(0, 1, 0, 1, 0, 2, 0)
    const lines = (await hwpToText(doc.exportHwp())).split('\n')
    expect(lines[1]).toBe('구분 | 세관명 | 연락처')
    expect(lines[2]).toMatch(/^특송.* \| 인천세관 \| 032-722-4315$/)
    expect(lines[3]).toMatch(/^ \| 평택세관 \| 031-8054-7110$/)
  })

  it('does not end a row in the empty places a wide merged cell spans', async () => {
    const doc = build([
      '앞',
      [
        ['보도일시', '배포 즉시', '담당'],
        ['배포일시', '2021. 6. 22.', '통관국'],
      ],
    ])
    // the last two columns of the first row become one cell
    doc.mergeTableCells(0, 1, 0, 0, 1, 0, 2)
    const lines = (await hwpToText(doc.exportHwp())).split('\n')
    expect(lines[1]).toMatch(/^보도일시 \| 배포 즉시.*[^| ]$/)
    expect(lines[1]!.split(' | ')).toHaveLength(2)
    expect(lines[2]).toBe('배포일시 | 2021. 6. 22. | 통관국')
  })

  it('writes a table that lays out a page as its paragraphs, not as one long row', async () => {
    const doc = build(['앞', [['본문 첫째 문단']], '뒤'])
    // a one-cell table holding running text, as press releases are made
    for (const [index, line] of ['둘째 문단', '셋째 문단', '넷째 문단'].entries()) {
      const at = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: index }])
      doc.splitParagraphInCellByPath(0, 1, at, doc.getCellParagraphLengthByPath(0, 1, at))
      const next = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: index + 1 }])
      doc.insertTextInCellByPath(0, 1, next, 0, line)
    }
    expect((await hwpToText(doc.exportHwp())).split('\n')).toEqual([
      '앞',
      '본문 첫째 문단',
      '둘째 문단',
      '셋째 문단',
      '넷째 문단',
      '뒤',
    ])
  })

  it('does not lose the text of a table inside a table cell', async () => {
    const doc = build(['앞', [['바깥 가', '바깥 나']], '뒤'])
    const cellOne = JSON.stringify([{ controlIndex: 0, cellIndex: 1, cellParaIndex: 0 }])
    doc.splitParagraphInCellByPath(0, 1, cellOne, 4)
    doc.pasteHtmlInCellByPath(
      0,
      1,
      JSON.stringify([{ controlIndex: 0, cellIndex: 1, cellParaIndex: 1 }]),
      0,
      tableHtml([['안쪽 하나', '안쪽 둘']]),
    )
    const text = await hwpToText(doc.exportHwp())
    expect(text).toContain('안쪽 하나')
    expect(text).toContain('안쪽 둘')
    // and where it belongs: after the outer table's own text, before what follows the table
    expect(text.indexOf('안쪽 하나')).toBeGreaterThan(text.indexOf('바깥 나'))
    expect(text.indexOf('안쪽 하나')).toBeLessThan(text.indexOf('뒤'))
  })

  it('keeps characters as they are: leading zeros, inner spaces, symbols', async () => {
    const doc = build(['우편번호 02139,  두 칸  띄움', '□ 항목 ㅇ 세부 ※ 참고 → 결과'])
    expect((await hwpToText(doc.exportHwp())).split('\n')).toEqual([
      '우편번호 02139,  두 칸  띄움',
      '□ 항목 ㅇ 세부 ※ 참고 → 결과',
    ])
  })

  it('reads an empty document as empty text', async () => {
    expect(await hwpToText(build(['']).exportHwp())).toBe('')
  })
})

describe('hwp and hwpx memos', () => {
  it('adds no comment block when the document has no memos', async () => {
    const result = await parseFileToText(writeFixture('plain.hwp', build(REPORT).exportHwp()))
    expect(result.ok).toBe(true)
    expect(result.text).not.toContain('### Comments')
    expect(result.text!.split('\n')).toEqual([
      '등록제 시행 안내',
      '7월 1일부터 시행합니다.',
      '구분 | 세관명 | 연락처',
      '특송 | 인천세관 | 032-722-4315',
      '우편 | 국제우편세관 | 032-720-7428',
      '끝.',
    ])
  })

  it('appends a body memo as a comment block, from a .hwp file', async () => {
    const doc = withMemo(['본문 첫 줄', '본문 둘째 줄'], {
      author: 'user',
      text: 'first line\nsecond line',
    })
    const result = await parseFileToText(writeFixture('memo.hwp', doc.exportHwp()))
    expect(result).toMatchObject({ ok: true, kind: 'text' })
    expect(result.text!.split('\n')).toEqual([
      '본문 첫 줄',
      '본문 둘째 줄',
      '### Comments',
      '- user (p.1): first line',
      '  second line',
    ])
    // the memo body is document data, not a second copy of the body text
    expect(result.text!.split('\n').filter((line) => line.includes('first line'))).toHaveLength(1)
  })

  it('writes unknown for a memo without an author', async () => {
    const doc = withMemo(['본문'], { text: '작성자 없는 메모' })
    const text = await hwpToText(doc.exportHwp())
    expect(text.split('\n')).toEqual(['본문', '### Comments', '- unknown (p.1): 작성자 없는 메모'])
  })

  it('leaves out the page marker when the engine knows no page', async () => {
    // a memo the engine cannot place on a page (header/footer memos) reports page 0;
    // the body API cannot make one, so the engine's list shape is fed in directly
    const spy = vi
      .spyOn(HwpDocument.prototype, 'getMemoList')
      .mockReturnValue(JSON.stringify([{ author: 'user', text: 'no page', page: 0 }]))
    try {
      expect(await hwpToText(build(['본문']).exportHwp())).toBe(
        '본문\n### Comments\n- user: no page',
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('appends the same comment block from a .hwpx file', async () => {
    const doc = withMemo(['본문'], { author: '한글', text: '첫 줄\n둘째 줄' })
    const result = await parseFileToText(writeFixture('memo.hwpx', doc.exportHwpx()))
    expect(result.ok).toBe(true)
    expect(result.text!.split('\n')).toEqual([
      '본문',
      '### Comments',
      '- 한글 (p.1): 첫 줄',
      '  둘째 줄',
    ])
  })
})

describe('hwp files that cannot be read', () => {
  it('reports a password-protected document instead of throwing', async () => {
    const path = writeFixture('locked.hwp', build(REPORT).exportHwpWithPassword('1234'))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('password-protected')
  })

  it('rejects other content under the two extensions', async () => {
    const pdfAsHwp = await parseFileToText(writeFixture('fake.hwp', buildPdfFixture('hello')))
    expect(pdfAsHwp).toMatchObject({ ok: false })
    expect(pdfAsHwp.error).toContain('Content mismatch')
    // an old-format document is not a zip
    const hwpAsHwpx = await parseFileToText(writeFixture('old.hwpx', build(REPORT).exportHwp()))
    expect(hwpAsHwpx.error).toContain('Content mismatch')
  })

  it('reports a zip that is not a document', async () => {
    const zip = new JSZip()
    zip.file('readme.txt', 'not a document')
    const path = writeFixture('empty.hwpx', await zip.generateAsync({ type: 'uint8array' }))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('reports a truncated document', async () => {
    const whole = build(REPORT).exportHwp()
    const result = await parseFileToText(writeFixture('cut.hwp', whole.slice(0, 2000)))
    expect(result.ok).toBe(false)
  })

  it('stops a zip that declares more than the limit before the engine inflates it', async () => {
    const zip = new JSZip()
    zip.file('Contents/section0.xml', '<x/>')
    const bytes = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer
    const centralName = bytes.lastIndexOf(Buffer.from('Contents/section0.xml'))
    bytes.writeUInt32LE(600_000_000, centralName - 46 + 24)
    await expect(hwpToText(new Uint8Array(bytes))).rejects.toThrow(
      /declares 600000000 uncompressed bytes/,
    )
  })
})

describe('the bytes handed to an engine that reads them itself', () => {
  it('passes an HWPX zip and an HWP 5 file under their own names', async () => {
    const doc = build(['한 줄'])
    const hwpx = new Uint8Array(doc.exportHwpx())
    const hwp = new Uint8Array(doc.exportHwp())
    await expect(checkedHwpBytes(hwpx, 'hwpx')).resolves.toBe(hwpx)
    await expect(checkedHwpBytes(hwp, 'hwp')).resolves.toBe(hwp)
    // an HWPX saved under the old name is read by its content
    await expect(checkedHwpBytes(hwpx, 'hwp')).resolves.toBe(hwpx)
  })

  it('refuses content that is not what the name says', async () => {
    const hwp = new Uint8Array(build(['한 줄']).exportHwp())
    await expect(checkedHwpBytes(hwp, 'hwpx')).rejects.toThrow(/Content mismatch/)
    await expect(checkedHwpBytes(new TextEncoder().encode('plain text'), 'hwp')).rejects.toThrow(
      /Content mismatch/,
    )
  })
})
