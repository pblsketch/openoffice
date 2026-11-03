/**
 * The app's side of the editor's right-click 쉬운 말로 풀기: the item's name and the request
 * the AI panel runs at once, in every screen language, and how App.tsx wires them.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createI18n, type Lang } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'
import { easyWordsRequest } from '../src/renderer/ai/easy-words'

const translate = createI18n(strings)
const LANGS = Object.keys(strings) as Lang[]
const SELECTED = '본인부담금은 소득 하위 30%에 면제한다.\n신청은 3월 31일까지 한다.'

describe('쉬운 말로 풀기 in the screen languages', () => {
  it('has a name and a request in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    const labels = new Set<string>()
    for (const lang of LANGS) {
      const label = translate(lang, 'easyWordsLabel')
      expect(label.trim(), lang).not.toBe('')
      labels.add(label)
      const prompt = translate(lang, 'easyWordsPrompt', { text: SELECTED })
      expect(prompt, lang).toContain(SELECTED)
      expect(prompt, lang).not.toContain('{text}')
    }
    // each language writes its own name, not a copy of another's
    expect(labels.size).toBeGreaterThanOrEqual(20)
    expect(translate('ko', 'easyWordsLabel')).toBe('쉬운 말로 풀기')
  })

  it('asks for plain words in the screen language and no change to the document', () => {
    const ko = translate('ko', 'easyWordsPrompt', { text: SELECTED })
    expect(ko).toContain('쉬운 글이 필요한 사람')
    expect(ko).toContain('한국어로')
    expect(ko).toContain('문서는 고치지 마세요')
    const en = translate('en', 'easyWordsPrompt', { text: SELECTED })
    expect(en).toContain('in English')
    expect(en).toContain('Do not change the document')
    expect(translate('ja', 'easyWordsPrompt', { text: SELECTED })).toContain('日本語')
    expect(translate('de', 'easyWordsPrompt', { text: SELECTED })).toContain('auf Deutsch')
  })
})

describe('the request a click hands the AI panel', () => {
  const t = (key: 'easyWordsPrompt', params?: Record<string, string | number>) =>
    translate('ko', key, params)

  it('runs at once, with the selected text in the request of the screen language', () => {
    expect(easyWordsRequest({ text: `  ${SELECTED}\n` }, t, 7)).toEqual({
      text: translate('ko', 'easyWordsPrompt', { text: SELECTED }),
      nonce: 7,
      autoRun: true,
    })
  })

  it('is nothing without selected text', () => {
    for (const detail of [null, undefined, {}, { text: '' }, { text: '  \n' }, { text: 3 }, 'x']) {
      expect(easyWordsRequest(detail, t, 1)).toBeNull()
    }
  })

  it('keeps braces in the selected text as they are', () => {
    expect(easyWordsRequest({ text: '{text} 와 {n}' }, t, 1)?.text).toContain('{text} 와 {n}')
  })
})

describe('the wiring in App.tsx', () => {
  const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8')

  it('names the item in the screen language and hears the editor window', () => {
    expect(app).toContain("pluginBridge.installEasyWords(t('easyWordsLabel'))")
    expect(app).toContain('frame.addEventListener(EASY_WORDS_EVENT, onEasyWords)')
    expect(app).toContain('frame.removeEventListener(EASY_WORDS_EVENT, onEasyWords)')
  })

  it('hands the request to the AI panel and brings it out', () => {
    expect(app).toMatch(
      /easyWordsRequest\([\s\S]{0,60}\.detail, t, Date\.now\(\)\)[\s\S]{0,60}setAiPrefill\(request\)\s+setAiOpen\(true\)/,
    )
    expect(app).toContain('prefill={aiPrefill}')
  })
})
