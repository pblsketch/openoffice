import { describe, expect, it } from 'vitest'
import {
  clearRunningWait,
  markRunningWait,
  panelWaitOf,
  stepsWaitOf,
  WAIT_LABEL,
} from '../src/renderer/ai/waiting'
import { aiStrings } from '../src/renderer/i18n/strings-ai'

describe('panelWaitOf', () => {
  it('names the card in the order the composer slot shows them', () => {
    expect(panelWaitOf(null, null, null)).toBeNull()
    expect(panelWaitOf([{}], null, null)).toBe('answer')
    expect(panelWaitOf(null, {}, null)).toBe('confirm')
    expect(panelWaitOf(null, null, { lines: 3 })).toBe('choice')
    // the questionnaire hides the brief, the brief hides the partial page
    expect(panelWaitOf([{}], {}, { lines: 3 })).toBe('answer')
    expect(panelWaitOf(null, {}, { lines: 3 })).toBe('confirm')
  })
})

describe('markRunningWait / clearRunningWait', () => {
  const tools = [
    { name: 'get_outline', summary: 'Read outline' },
    { name: 'plan_page', summary: 'Drafting brief…', running: true },
  ]

  it('marks only the running step and gives it the waiting text', () => {
    const marked = markRunningWait(tools, 'confirm', 'Waiting · press Generate')!
    expect(marked[0]).toBe(tools[0])
    expect(marked[1]).toEqual({
      name: 'plan_page',
      summary: 'Waiting · press Generate',
      running: true,
      waiting: 'confirm',
    })
    expect(stepsWaitOf(marked)).toBe('confirm')
    expect(stepsWaitOf(tools)).toBeNull()
  })

  it('clears the mark and restores the tool label once the person acts', () => {
    const marked = markRunningWait(tools, 'confirm', 'Waiting')!
    const cleared = clearRunningWait(marked, (name) => `label:${name}`)!
    expect(cleared[1]).toEqual({ name: 'plan_page', summary: 'label:plan_page', running: true })
    expect('waiting' in cleared[1]!).toBe(false)
    expect(stepsWaitOf(cleared)).toBeNull()
    // a step that never waited keeps its text
    expect(clearRunningWait(tools, () => 'x')![1]).toBe(tools[1])
  })

  it('leaves a finished step alone and passes an empty list through', () => {
    const done = [{ name: 'plan_page', summary: 'Brief confirmed', waiting: 'confirm' as const }]
    expect(stepsWaitOf(done)).toBeNull()
    expect(clearRunningWait(done, () => 'x')![0]).toBe(done[0])
    expect(markRunningWait(undefined, 'answer', 'x')).toBeUndefined()
  })
})

describe('waiting strings', () => {
  it('every locale has the labels and the step texts with their placeholders', () => {
    for (const [locale, s] of Object.entries(aiStrings)) {
      for (const key of Object.values(WAIT_LABEL)) expect(s[key], `${locale}.${key}`).toBeTruthy()
      expect(s.aiWaitClarifyStep, `${locale}.aiWaitClarifyStep`).toBeTruthy()
      expect(s.aiWaitBriefStep, `${locale}.aiWaitBriefStep`).toContain('{action}')
      expect(s.aiWaitPartialStep, `${locale}.aiWaitPartialStep`).toContain('{adopt}')
      expect(s.aiWaitPartialStep, `${locale}.aiWaitPartialStep`).toContain('{discard}')
    }
  })
})
