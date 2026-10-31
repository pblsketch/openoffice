import { JSDOM } from 'jsdom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __hanjaTest,
  conversionTarget,
  convertToHanja,
  convertedText,
  installHanjaKey,
  parseDictionary,
  wordAtEnd,
} from '../studio-plugin/hanja.mjs'
import { compactHanja, hanjaNotice } from '../scripts/hanja-dict.mjs'

const SOURCE = [
  '# Copyright (c) 2005,2006 Choe Hwanjin',
  '# All rights reserved.',
  '',
  'ㄱ자집:ㄱ字집:',
  '학:學:배울 학',
  '학:鶴:두루미 학',
  '학:學:배울 학',
  '교:校:학교 교',
  '학교:學校:',
  '학교:學敎:',
  '가:가:',
  '대한민국:大韓民國:',
  '값:價/값:값 가',
  '',
].join('\n')

const DICT_TEXT = compactHanja(SOURCE)
const dict = parseDictionary(DICT_TEXT)

describe('the dictionary the build writes', () => {
  it('keeps whole-syllable readings, in order, without duplicates', () => {
    expect(DICT_TEXT.split('\n')).toEqual([
      '학\t學/배울 학\t鶴/두루미 학',
      '교\t校/학교 교',
      '학교\t學校\t學敎',
      '대한민국\t大韓民國',
      '',
    ])
  })

  it('carries the notice of the data file', () => {
    expect(hanjaNotice(SOURCE)).toBe('Copyright (c) 2005,2006 Choe Hwanjin\nAll rights reserved.\n')
  })

  it('reads back with the meanings of single syllables', () => {
    expect(dict.get('학')).toEqual([
      { hanja: '學', meaning: '배울 학' },
      { hanja: '鶴', meaning: '두루미 학' },
    ])
    expect(dict.get('학교')?.map((c) => c.hanja)).toEqual(['學校', '學敎'])
  })
})

describe('the word before the caret', () => {
  it('takes the longest dictionary word that ends there', () => {
    expect(wordAtEnd(dict, '우리 학교')?.word).toBe('학교')
    expect(wordAtEnd(dict, '대한민국')?.word).toBe('대한민국')
  })

  it('falls back to the last syllable, and stops at anything that is not one', () => {
    expect(wordAtEnd(dict, '우리학')?.word).toBe('학')
    expect(wordAtEnd(dict, '학교a')).toBeNull()
    expect(wordAtEnd(dict, '없다')).toBeNull()
  })
})

describe('what goes in', () => {
  it('puts the Hanja alone or with the Hangul in brackets', () => {
    expect(convertedText('학교', '學校', 'hanja')).toBe('學校')
    expect(convertedText('학교', '學校', 'hanjaHangul')).toBe('學校(학교)')
    expect(convertedText('학교', '學校', 'hangulHanja')).toBe('학교(學校)')
  })
})

function body(charOffset: number) {
  return { sectionIndex: 0, paragraphIndex: 0, charOffset }
}

function fakeIh(text: string, caret = body(text.length)) {
  const ih: Record<string, any> = {
    text,
    caret,
    selection: null as null | { start: any; end: any },
    ops: [] as unknown[],
    cursor: {
      isInHeaderFooter: () => false,
      isInFootnote: () => false,
      isInPictureObjectSelection: () => false,
      isInTableObjectSelection: () => false,
      clearSelection: vi.fn(),
    },
    isFormMode: () => false,
    isInCellSelectionMode: () => false,
    hasSelection: () => ih.selection !== null,
    getSelection: () => ih.selection,
    getCursorPosition: () => ih.caret,
    executeOperation: (op: unknown) => ih.ops.push(op),
    focus: vi.fn(),
  }
  return ih
}

function fakeWasm(ih: Record<string, any>) {
  return {
    getTextRange: (_s: number, _p: number, offset: number, count: number) =>
      [...ih.text].slice(offset, offset + count).join(''),
    getTextInCell: vi.fn(
      (_s: number, _pp: number, _c: number, _ci: number, _cp: number, o: number, n: number) =>
        [...ih.text].slice(o, o + n).join(''),
    ),
    getTextInCellByPath: vi.fn((_s: number, _pp: number, _path: string, o: number, n: number) =>
      [...ih.text].slice(o, o + n).join(''),
    ),
  }
}

describe('what a press converts', () => {
  it('is the word that ends at the caret, from where it starts', () => {
    const ih = fakeIh('우리 학교')
    expect(conversionTarget(ih, fakeWasm(ih), dict)).toMatchObject({
      word: '학교',
      start: body(3),
    })
  })

  it('is the selected word when there is a block', () => {
    const ih = fakeIh('학교에 간다', body(0))
    ih.selection = { start: body(0), end: body(2) }
    expect(conversionTarget(ih, fakeWasm(ih), dict)).toMatchObject({ word: '학교', start: body(0) })
  })

  it('reads a table cell through its own call', () => {
    const cell = { ...body(2), parentParaIndex: 1, controlIndex: 0, cellIndex: 3, cellParaIndex: 0 }
    const ih = fakeIh('학교', cell)
    const wasm = fakeWasm(ih)
    expect(conversionTarget(ih, wasm, dict)).toMatchObject({ word: '학교' })
    expect(wasm.getTextInCell).toHaveBeenCalledWith(0, 1, 0, 3, 0, 0, 2)
  })

  it('says why when there is nothing to convert', () => {
    const empty = fakeIh('abc')
    expect(conversionTarget(empty, fakeWasm(empty), dict)).toEqual({ refusal: 'noWord' })
    const unknown = fakeIh('없다')
    expect(conversionTarget(unknown, fakeWasm(unknown), dict)).toEqual({ refusal: 'notFound' })
    const span = fakeIh('학교')
    span.selection = { start: body(0), end: { ...body(1), paragraphIndex: 1 } }
    expect(conversionTarget(span, fakeWasm(span), dict)).toEqual({ refusal: 'blockSpan' })
    const form = fakeIh('학교')
    form.isFormMode = () => true
    expect(conversionTarget(form, fakeWasm(form), dict)).toEqual({ refusal: 'formMode' })
  })
})

class FakeInsert {
  constructor(
    readonly position: unknown,
    readonly text: string,
    readonly timestamp: unknown,
    readonly charFormat: unknown,
    readonly replacedText: string,
  ) {}
}

describe('the conversion command', () => {
  beforeEach(() => __hanjaTest.reset())

  it('overwrites the word as one step of the editor history', async () => {
    const ih = fakeIh('우리 학교')
    const services = {
      getInputHandler: () => ih,
      wasm: fakeWasm(ih),
      eventBus: { emit: vi.fn() },
    }
    const result = await convertToHanja(
      services,
      { InsertTextCommand: FakeInsert, locale: 'ko' },
      async () => DICT_TEXT,
    )
    expect(result).toEqual({ ok: true })
    expect(ih.ops).toHaveLength(1)
    const { command } = ih.ops[0] as { command: FakeInsert }
    expect(command).toMatchObject({ position: body(3), text: '學校', replacedText: '학교' })
    expect(services.eventBus.emit).toHaveBeenCalledWith('document-changed')
  })

  it('tells the user when the dictionary cannot be read, and reads it again next time', async () => {
    const ih = fakeIh('학교')
    const toast = vi.fn()
    const services = { getInputHandler: () => ih, wasm: fakeWasm(ih) }
    const failed = await convertToHanja(services, { showToast: toast, locale: 'ko' }, async () => {
      throw new Error('gone')
    })
    expect(failed.reason).toBe('noDictionary')
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: '한자 사전을 읽지 못했습니다.' }),
    )
    const again = await convertToHanja(
      services,
      { InsertTextCommand: FakeInsert, locale: 'ko' },
      async () => DICT_TEXT,
    )
    expect(again.ok).toBe(true)
  })

  it('opens the list, and the number keys pick a candidate', async () => {
    const { window } = new JSDOM('<!doctype html><body></body>')
    const doc = window.document
    vi.stubGlobal('document', doc)
    try {
      class Dialog {
        dialog!: HTMLDivElement
        afterClose?: () => void
        constructor(readonly title: string) {}
        createBody(): HTMLElement {
          throw new Error('abstract')
        }
        onConfirm(): boolean | void {}
        show() {
          this.dialog = doc.createElement('div')
          this.dialog.appendChild(this.createBody())
          const ok = doc.createElement('button')
          ok.className = 'dialog-btn-primary'
          ok.addEventListener('click', () => {
            if (this.onConfirm() !== false) this.hide()
          })
          this.dialog.appendChild(ok)
          doc.body.appendChild(this.dialog)
        }
        hide() {
          this.dialog.remove()
          this.afterClose?.()
        }
      }
      const ih = fakeIh('학')
      const services = { getInputHandler: () => ih, wasm: fakeWasm(ih) }
      const result = await convertToHanja(
        services,
        { InsertTextCommand: FakeInsert, ModalDialog: Dialog, locale: 'ko' },
        async () => DICT_TEXT,
      )
      expect(result).toEqual({ ok: true, opened: true })
      const rows = doc.querySelectorAll('[role="option"]')
      expect([...rows].map((row) => row.textContent)).toEqual(['1學배울 학', '2鶴두루미 학'])
      doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '2', bubbles: true }))
      expect((ih.ops[0] as { command: FakeInsert }).command).toMatchObject({
        text: '鶴',
        replacedText: '학',
      })
      expect(doc.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the Hanja key', () => {
  function setup() {
    const { window } = new JSDOM('<!doctype html><textarea></textarea>')
    const textarea = window.document.querySelector('textarea')!
    const dispatcher = { isEnabled: vi.fn(() => true), dispatch: vi.fn() }
    installHanjaKey(window, () => ({ textarea }), dispatcher)
    const key = (type: string, init: Record<string, unknown>) =>
      textarea.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, ...init }))
    return { dispatcher, key }
  }

  it('converts when the key comes up alone, as Windows sends it after a word is typed', () => {
    const { dispatcher, key } = setup()
    key('keyup', { key: 'HanjaMode', code: 'ControlRight', keyCode: 25 })
    expect(dispatcher.dispatch).toHaveBeenCalledWith('ieum:hanja')
  })

  it('leaves a press during composition to the input method', () => {
    const { dispatcher, key } = setup()
    key('keydown', { key: 'Process', code: 'ControlRight', keyCode: 229, isComposing: true })
    key('keyup', { key: 'Process', code: 'ControlRight', keyCode: 229 })
    key('keyup', { key: 'HanjaMode', code: 'ControlRight', keyCode: 25 })
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
    // and the next press, after the word is in, converts again
    key('keyup', { key: 'HanjaMode', code: 'ControlRight', keyCode: 25 })
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
  })

  it('converts once when the system sends a key down too', () => {
    const { dispatcher, key } = setup()
    key('keydown', { key: 'HanjaMode', code: 'Lang2', keyCode: 25 })
    key('keyup', { key: 'HanjaMode', code: 'Lang2', keyCode: 25 })
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
  })
})
