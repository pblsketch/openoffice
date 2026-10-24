/**
 * The skill hand-off (spec 5.6, 5.7): a request with skill chips (and, for the
 * template preview, the pending skill proposal) queued for a new tab of any of
 * the eight editors, taken there once, beside the generate window's hand-off.
 */
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HANDOFF_EDITORS,
  dropGenerateHandoff,
  handoffEditorForFile,
  isHandoffEditor,
  queueGenerateHandoff,
  queueSkillHandoff,
  queueSkillHandoffFor,
  queuedSkillHandoffs,
  resetGenerateHandoffsForTest,
  takeGenerateHandoff,
  takeSkillHandoff,
  type GenerateHandoff,
  type HandoffEditor,
  type SkillHandoff,
} from '../src/generate-handoff'

function skillHandoff(overrides: Partial<SkillHandoff> = {}): SkillHandoff {
  return {
    id: 's1',
    mode: 'skill',
    target: 'hwp',
    text: 'fill the letter for Friday',
    chips: [{ id: 'app:letter', source: 'app', title: 'Letter' }],
    createdAt: 1,
    ...overrides,
  }
}

function generateHandoff(overrides: Partial<GenerateHandoff> = {}): GenerateHandoff {
  return {
    id: 'g1',
    mode: 'ai',
    target: 'slides',
    materials: [],
    text: 'make',
    defaultText: false,
    createdAt: 1,
    ...overrides,
  }
}

class FakeContents extends EventEmitter {
  destroyed = false
  constructor(readonly id: number) {
    super()
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

afterEach(() => resetGenerateHandoffsForTest())

describe('the editors a hand-off reaches', () => {
  it('lists all nine editors', () => {
    expect([...HANDOFF_EDITORS].sort()).toEqual(
      ['docs', 'epub', 'html', 'hwp', 'markdown', 'mindmap', 'pdf', 'sheets', 'slides'].sort(),
    )
    for (const editor of HANDOFF_EDITORS) expect(isHandoffEditor(editor)).toBe(true)
    expect(isHandoffEditor('home')).toBe(false)
    expect(isHandoffEditor(undefined)).toBe(false)
  })

  it('picks the editor of a template by its extension', () => {
    const cases: Array<[string, HandoffEditor | undefined]> = [
      ['letter.docx', 'docs'],
      ['letter.ODT', 'docs'],
      ['grades.xlsx', 'sheets'],
      ['macro.xlsm', 'sheets'],
      ['old.xls', 'sheets'],
      ['list.csv', 'sheets'],
      ['list.tsv', 'sheets'],
      ['deck.pptx', 'slides'],
      ['form.pdf', 'pdf'],
      ['notes.md', 'markdown'],
      ['notes.markdown', 'markdown'],
      ['notes.txt', 'markdown'],
      ['page.html', 'html'],
      ['page.htm', 'html'],
      ['map.xmind', 'mindmap'],
      ['공문.hwp', 'hwp'],
      ['공문.hwpx', 'hwp'],
      ['C:\\skills\\x\\assets\\공문.hwpx', 'hwp'],
      // a template opens as a new untitled document, and a book has none
      ['novel.epub', undefined],
      ['settings.json', undefined],
      ['noext', undefined],
      ['.docx', undefined],
    ]
    for (const [name, editor] of cases) expect(handoffEditorForFile(name)).toBe(editor)
  })
})

describe('taking a skill hand-off', () => {
  it('hands the request to its tab once, for its editor only', () => {
    queueSkillHandoff(7, skillHandoff())
    expect(takeSkillHandoff('docs', 7)).toBeNull()
    expect(takeSkillHandoff('hwp', 8)).toBeNull()
    expect(takeSkillHandoff('hwp', 7)).toEqual(skillHandoff())
    expect(takeSkillHandoff('hwp', 7)).toBeNull()
  })

  it('reaches every editor', () => {
    HANDOFF_EDITORS.forEach((target, i) => {
      queueSkillHandoff(100 + i, skillHandoff({ id: `s-${target}`, target }))
    })
    HANDOFF_EDITORS.forEach((target, i) => {
      expect(takeSkillHandoff(target, 100 + i)?.id).toBe(`s-${target}`)
    })
  })

  it('keeps the generate hand-off and the skill hand-off apart', () => {
    queueGenerateHandoff(3, generateHandoff())
    expect(takeSkillHandoff('slides', 3)).toBeNull()
    expect(takeGenerateHandoff('slides', 3)?.id).toBe('g1')

    queueSkillHandoff(4, skillHandoff({ target: 'slides' }))
    expect(takeGenerateHandoff('slides', 4)).toBeNull()
    expect(takeSkillHandoff('slides', 4)?.id).toBe('s1')
  })

  it('carries the pending proposal of a template preview as given', () => {
    const preview = {
      previewId: 'p1',
      title: 'Letter',
      fileName: 'letter.hwpx',
      originalRedacted: true,
      proposal: { key: 'k1', title: 'Letter', body: 'Steps' },
    }
    queueSkillHandoff(9, skillHandoff({ preview }))
    expect(takeSkillHandoff('hwp', 9)?.preview).toEqual(preview)
  })

  it('drops the request of a tab that closes before taking it', () => {
    const contents = new FakeContents(11)
    queueSkillHandoffFor(contents, skillHandoff())
    expect(queuedSkillHandoffs()).toEqual([{ webContentsId: 11, target: 'hwp', id: 's1' }])
    contents.destroy()
    expect(takeSkillHandoff('hwp', 11)).toBeNull()
    expect(queuedSkillHandoffs()).toEqual([])
  })

  it('queues nothing for a tab already gone, and a closed tab drops it too', () => {
    const gone = new FakeContents(12)
    gone.destroyed = true
    queueSkillHandoffFor(gone, skillHandoff())
    expect(takeSkillHandoff('hwp', 12)).toBeNull()
    queueSkillHandoff(13, skillHandoff())
    dropGenerateHandoff(13)
    expect(takeSkillHandoff('hwp', 13)).toBeNull()
  })

  it('lists what waits without the request text', () => {
    queueSkillHandoff(5, skillHandoff({ text: 'private words' }))
    expect(JSON.stringify(queuedSkillHandoffs())).not.toContain('private words')
  })
})
