/** @vitest-environment jsdom */
/**
 * The template flow in an AI panel (spec 5.6, 5.7, 9.11): a chip whose skill
 * has a template runs in a new tab; a template the model used offers its new
 * document; a tab takes its hand-off once and runs it through the panel's
 * send; the card's template buttons and the template preview's states.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillProposal, UserSkillText } from '@genoffice/agent-core'
import { useSkillTemplates, type SkillTemplates } from '../src/use-skill-templates'
import { useSkillProposals, type SkillProposals } from '../src/use-skill-proposals'
import type { SkillUse } from '../src/use-composer-skills'
import type { SkillCardBridge } from '../src/skill-card-model'
import type { SkillChipView } from '../src/skill-picker-model'
import type {
  HandedPreview,
  SkillTemplateBridge,
  TemplateDocument,
  TemplateEditor,
} from '../src/skill-template-model'

const PROPOSAL: SkillProposal = {
  key: 'call-1',
  title: 'Letter',
  name: 'letter',
  description: 'Writes the family letter.',
  body: '1. Greeting\n2. Dates',
  wantsTemplate: true,
  target: undefined,
}

function templateBridge(over: Partial<SkillTemplateBridge> = {}) {
  const ended: Array<(raw: unknown) => void> = []
  const bridge = {
    openTemplate: vi.fn(async (): Promise<unknown> => ({ ok: true, tabId: 't9' })),
    openPreview: vi.fn(async (): Promise<unknown> => ({ ok: true, tabId: 't7', previewId: 'p1' })),
    previewOriginal: vi.fn(async (): Promise<unknown> => ({
      ok: true,
      bytes: new Uint8Array([9, 9]),
      fileName: 'letter.docx',
    })),
    finishPreview: vi.fn(async (): Promise<unknown> => ({ ok: true })),
    takeHandoff: vi.fn(async (): Promise<unknown> => null),
    focusTab: vi.fn(async (): Promise<unknown> => ({ ok: true })),
    onPreviewEnded: vi.fn((listener: (raw: unknown) => void) => {
      ended.push(listener)
      return () => {}
    }),
    aiRead: vi.fn(async (id: string): Promise<unknown> => ({
      ok: true,
      skill: {
        id,
        title: id === 'app:letter' ? 'Letter' : 'Tone',
        body: `body of ${id}`,
        files: [],
      },
    })),
    ...over,
  }
  return { bridge, end: (raw: unknown) => ended.forEach((listener) => listener(raw)) }
}

function cardBridge(): SkillCardBridge & { saveFromCard: ReturnType<typeof vi.fn> } {
  return {
    suggestName: vi.fn(async () => 'letter'),
    checkName: vi.fn(async (): Promise<unknown> => ({ ok: true })),
    saveFromCard: vi.fn(async (): Promise<unknown> => ({ ok: true, id: 'app:letter' })),
    openSettings: vi.fn(async () => {}),
  }
}

const chip = (id: string, title: string, extra: Partial<SkillChipView> = {}): SkillChipView => ({
  id,
  source: 'app',
  title,
  ...extra,
})

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => await Promise.resolve())
}
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320))
  })
  await flush()
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label)
const text = () => host.textContent ?? ''

interface Harness {
  templates: SkillTemplates
  cards: SkillProposals
}

/** one panel: its cards and its template flow, rendered as a panel would */
function renderPanel(options: {
  editor: TemplateEditor | null
  bridge: SkillTemplateBridge | null
  cards?: SkillCardBridge
  document?: TemplateDocument | null
  send?: (text: string, use: SkillUse) => boolean | void
  busy?: boolean
  setComposer?: (text: string) => void
  onTaken?: () => void
}): { current: () => Harness; rerender: (busy: boolean) => void } {
  let latest: Harness | null = null
  let busy = options.busy ?? false
  function Panel() {
    const cards = useSkillProposals({
      lang: 'ko',
      templateDocument: options.document ?? null,
      templateBridge: options.bridge,
      bridge: options.cards ?? cardBridge(),
    })
    const templates = useSkillTemplates({
      lang: 'ko',
      editor: options.editor,
      cards,
      busy,
      send: options.send,
      setComposer: options.setComposer,
      onTaken: options.onTaken,
      bridge: options.bridge,
    })
    latest = { templates, cards }
    return createElement('div', null, cards.render(PROPOSAL.key), templates.notes)
  }
  act(() => root.render(createElement(Panel)))
  return {
    current: () => latest!,
    rerender: (next) => {
      busy = next
      act(() => root.render(createElement(Panel)))
    },
  }
}

describe('a chip whose skill has a template (spec 5.7, called by the person)', () => {
  it('opens the template in a new tab with the request and every chip, and says so here', async () => {
    const { bridge } = templateBridge()
    const setComposer = vi.fn()
    const panel = renderPanel({ editor: 'docs', bridge, setComposer })
    const letter = chip('app:letter', 'Letter', { template: true })
    let taken: unknown
    await act(async () => {
      taken = await panel.current().templates.onTemplateSkill({
        skill: letter,
        chips: [letter, chip('app:tone', 'Tone')],
        text: 'for Friday',
      })
    })
    expect(taken).toBe(true)
    expect(bridge.openTemplate).toHaveBeenCalledWith({
      skillId: 'app:letter',
      text: 'for Friday',
      chips: [
        { id: 'app:letter', source: 'app', title: 'Letter' },
        { id: 'app:tone', source: 'app', title: 'Tone' },
      ],
    })
    expect(setComposer).toHaveBeenCalledWith('')
    expect(text()).toContain('새 탭에서 양식으로 작업합니다')
    expect(text()).not.toContain('의 것을 씁니다')
    act(() => button('탭으로 가기')!.click())
    expect(bridge.focusTab).toHaveBeenCalledWith('t9')
  })

  it('uses the first of two templates and says whose', async () => {
    const { bridge } = templateBridge()
    const panel = renderPanel({ editor: 'hwp', bridge })
    const report = chip('app:report', 'Report', { template: true })
    const letter = chip('app:letter', 'Letter', { template: true })
    await act(async () => {
      await panel.current().templates.onTemplateSkill({
        skill: letter,
        chips: [report, letter],
        text: 'x',
      })
    })
    expect(bridge.openTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'app:report' }),
    )
    expect(text()).toContain('양식은 Report의 것을 씁니다')
  })

  it('sends nothing and says so when the template file is missing', async () => {
    const { bridge } = templateBridge({
      openTemplate: vi.fn(async (): Promise<unknown> => ({ ok: false, reason: 'no-template' })),
    })
    const send = vi.fn()
    const setComposer = vi.fn()
    const panel = renderPanel({ editor: 'docs', bridge, send, setComposer })
    const gone = chip('app:letter', 'Letter', { templateMissing: true })
    let taken: unknown
    await act(async () => {
      taken = await panel.current().templates.onTemplateSkill({
        skill: gone,
        chips: [gone],
        text: 'x',
      })
    })
    expect(taken).toBe('stop')
    expect(send).not.toHaveBeenCalled()
    expect(setComposer).not.toHaveBeenCalled()
    expect(text()).toContain('Letter 스킬의 양식 파일이 없습니다')
  })

  it('works the same in the home ask panel, which has no document', async () => {
    const { bridge } = templateBridge()
    const panel = renderPanel({ editor: null, bridge })
    const letter = chip('app:letter', 'Letter', { template: true })
    await act(async () => {
      await panel.current().templates.onTemplateSkill({ skill: letter, chips: [letter], text: 'y' })
    })
    expect(bridge.openTemplate).toHaveBeenCalled()
    expect(bridge.takeHandoff).not.toHaveBeenCalled()
  })
})

describe('a template skill the model used on its own (spec 5.7)', () => {
  const used = (template: string | undefined): UserSkillText => ({
    id: 'app:letter',
    name: 'letter',
    title: 'Letter',
    body: 'b',
    files: [],
    template,
    hasScripts: false,
  })

  it('opens no tab by itself and offers the template with that turn’s request', async () => {
    const { bridge } = templateBridge()
    const panel = renderPanel({ editor: 'docs', bridge })
    act(() => panel.current().templates.noteRequest('write the letter for the trip'))
    act(() => panel.current().templates.onUsed(used('assets/letter.docx')))
    act(() => panel.current().templates.onUsed(used('assets/letter.docx')))
    expect(bridge.openTemplate).not.toHaveBeenCalled()
    const offers = [...host.querySelectorAll('button')].filter(
      (b) => b.textContent === '이 양식으로 새 문서 열기',
    )
    expect(offers).toHaveLength(1)
    await act(async () => offers[0]!.click())
    await flush()
    expect(bridge.openTemplate).toHaveBeenCalledWith({
      skillId: 'app:letter',
      text: 'write the letter for the trip',
      // the chip shows the skill by its name
      chips: [{ id: 'app:letter', source: 'app', title: 'letter' }],
    })
    expect(text()).toContain('새 탭에서 양식으로 작업합니다')
  })

  it('offers nothing for a skill without a template', () => {
    const { bridge } = templateBridge()
    const panel = renderPanel({ editor: 'docs', bridge })
    act(() => panel.current().templates.onUsed(used(undefined)))
    expect(button('이 양식으로 새 문서 열기')).toBeUndefined()
  })
})

describe('the tab a request was handed to', () => {
  it('takes it once and sends it through the panel’s send with the chips’ skills', async () => {
    const { bridge } = templateBridge({
      takeHandoff: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'h1',
          mode: 'skill',
          target: 'hwp',
          text: 'for Friday',
          chips: [{ id: 'app:letter', source: 'app', title: 'Letter' }],
        })
        .mockResolvedValue(null),
    })
    const send = vi.fn((): boolean => true)
    const onTaken = vi.fn()
    renderPanel({ editor: 'hwp', bridge, send, onTaken })
    await flush()
    expect(bridge.takeHandoff).toHaveBeenCalledTimes(1)
    expect(bridge.takeHandoff).toHaveBeenCalledWith('hwp')
    expect(onTaken).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    const [sentText, use] = send.mock.calls[0] as unknown as [string, SkillUse]
    expect(sentText).toBe('for Friday')
    expect(use.chips).toEqual([{ id: 'app:letter', source: 'app', title: 'Letter' }])
    expect(use.text).toContain('body of app:letter')
  })

  it('sends nothing when a handed-over skill cannot be read', async () => {
    const { bridge } = templateBridge({
      takeHandoff: vi.fn(async (): Promise<unknown> => ({
        id: 'h1',
        mode: 'skill',
        target: 'docs',
        text: 'go',
        chips: [{ id: 'app:gone', source: 'app', title: 'Gone' }],
      })),
      aiRead: vi.fn(async (): Promise<unknown> => ({ ok: false, reason: 'disabled' })),
    })
    const send = vi.fn()
    const setComposer = vi.fn()
    renderPanel({ editor: 'docs', bridge, send, setComposer })
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(setComposer).toHaveBeenCalledWith('go')
    expect(text()).toContain('넘겨받은 스킬을 읽지 못해')
  })

  it('takes nothing in a panel with no editor (the home ask panel)', async () => {
    const { bridge } = templateBridge()
    renderPanel({ editor: null, bridge })
    await flush()
    expect(bridge.takeHandoff).not.toHaveBeenCalled()
  })
})

const DOC = (over: Partial<TemplateDocument> = {}): TemplateDocument => ({
  fileName: 'letter.docx',
  title: 'letter',
  bytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  redacted: () => false,
  ...over,
})

describe('the card’s template buttons in the original tab (spec 5.6)', () => {
  it('saves the document as edited, as it is', async () => {
    const { bridge } = templateBridge()
    const cards = cardBridge()
    const panel = renderPanel({ editor: 'docs', bridge, cards, document: DOC() })
    act(() => panel.current().cards.add(PROPOSAL))
    await settle()
    await act(async () => button('원래 문서 그대로 저장')!.click())
    await flush()
    expect(cards.saveFromCard).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { bytes: new Uint8Array([1, 2, 3]), fileName: 'letter.docx' },
      }),
    )
    expect(text()).toContain('저장했습니다')
  })

  it('blocks "save as is" with the reason when the document has redaction marks', async () => {
    const { bridge } = templateBridge()
    const cards = cardBridge()
    const panel = renderPanel({
      editor: 'markdown',
      bridge,
      cards,
      document: DOC({ fileName: 'notes.md', redacted: () => true }),
    })
    act(() => panel.current().cards.add(PROPOSAL))
    await settle()
    const asIs = button('원래 문서 그대로 저장')!
    expect(asIs.disabled).toBe(true)
    expect(text()).toContain('가린 내용이 있어')
    await act(async () => asIs.click())
    expect(cards.saveFromCard).not.toHaveBeenCalled()
  })

  it('opens the preview tab with the copy, the clearing request and the pending card', async () => {
    const { bridge, end } = templateBridge()
    const cards = cardBridge()
    const document = DOC()
    const panel = renderPanel({ editor: 'docs', bridge, cards, document })
    act(() => panel.current().cards.add(PROPOSAL))
    await settle()
    await act(async () => button('비운 양식 만들기')!.click())
    await flush()
    expect(bridge.openPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: new Uint8Array([1, 2, 3]),
        fileName: 'letter.docx',
        title: 'letter',
        tabTitle: '양식 미리보기 - letter',
        originalRedacted: false,
        proposal: PROPOSAL,
        draft: expect.objectContaining({ title: 'Letter', withTemplate: true }),
      }),
    )
    const request = (bridge.openPreview.mock.calls[0] as unknown as [{ text: string }])[0].text
    expect(request).toContain('채워진 값')
    // nothing is written yet; the card continues in the preview tab
    expect(cards.saveFromCard).not.toHaveBeenCalled()
    expect(text()).toContain('양식 미리보기 탭에서 이어집니다')
    act(() => button('탭으로 가기')!.click())
    expect(bridge.focusTab).toHaveBeenCalledWith('t7')

    // the preview tab closed without saving: the card ends as not saved
    act(() => end({ previewId: 'p1', outcome: 'unsaved' }))
    expect(text()).toContain('저장하지 않은 스킬 제안')
    expect(cards.saveFromCard).not.toHaveBeenCalled()
  })

  it('ends as saved when the preview tab saved it', async () => {
    const { bridge, end } = templateBridge()
    const panel = renderPanel({ editor: 'docs', bridge, document: DOC() })
    act(() => panel.current().cards.add(PROPOSAL))
    await settle()
    await act(async () => button('비운 양식 만들기')!.click())
    await flush()
    act(() => end({ previewId: 'p1', outcome: 'saved', skillId: 'app:letter', title: 'Letter' }))
    expect(text()).toContain('저장했습니다')
  })

  it('offers no template buttons without a document (the home ask panel)', async () => {
    const { bridge } = templateBridge()
    const panel = renderPanel({ editor: null, bridge, document: null })
    act(() => panel.current().cards.add(PROPOSAL))
    await settle()
    expect(button('비운 양식 만들기')).toBeUndefined()
    expect(text()).not.toContain('이 문서를 양식으로 함께 저장')
  })
})

describe('the template preview tab (spec 5.6 steps 2-4, 9.11)', () => {
  const PREVIEW: HandedPreview = {
    previewId: 'p1',
    title: 'letter',
    fileName: 'letter.docx',
    originalRedacted: false,
    proposal: { ...PROPOSAL, key: 'call-1' },
    draft: { title: 'Family letter', name: 'family-letter', invoke: 'manual' },
  }
  const handoff = (preview: HandedPreview) =>
    vi
      .fn()
      .mockResolvedValueOnce({
        id: 'h1',
        mode: 'skill',
        target: 'docs',
        text: 'clear the values',
        chips: [],
        preview,
      })
      .mockResolvedValue(null)

  it('runs the clearing request, then shows the card with the preview buttons', async () => {
    const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
    const send = vi.fn((): boolean => true)
    const panel = renderPanel({ editor: 'docs', bridge, send, document: DOC() })
    await flush()
    expect(send).toHaveBeenCalledWith('clear the values', { text: '', chips: [] })
    // still running: no card yet
    panel.rerender(true)
    await flush()
    expect(button('이 탭을 양식으로 저장')).toBeUndefined()
    panel.rerender(false)
    await settle()
    expect(button('이 탭을 양식으로 저장')).toBeDefined()
    expect(button('원래 문서 그대로 저장')).toBeDefined()
    expect(button('취소')).toBeDefined()
    // the pending card's fields came along (the name is the first field)
    const name = host.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(name.value).toBe('family-letter')
  })

  it('shows the card at once when the send gate did not start the run', async () => {
    const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
    const setComposer = vi.fn()
    renderPanel({ editor: 'docs', bridge, send: () => false, setComposer, document: DOC() })
    await settle()
    expect(setComposer).toHaveBeenCalledWith('clear the values')
    expect(button('이 탭을 양식으로 저장')).toBeDefined()
  })

  it('shows the card anyway when a send that says nothing never started a run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
      const send = vi.fn((): void => undefined)
      renderPanel({ editor: 'docs', bridge, send, document: DOC() })
      await flush()
      expect(send).toHaveBeenCalled()
      expect(button('이 탭을 양식으로 저장')).toBeUndefined()
      await act(async () => {
        vi.advanceTimersByTime(5100)
      })
      await flush()
      expect(button('이 탭을 양식으로 저장')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves this tab’s content at that moment under the original file name', async () => {
    const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
    const cards = cardBridge()
    const tabDocument = DOC({
      fileName: '양식 미리보기 - letter.docx',
      bytes: vi.fn(async () => new Uint8Array([7])),
    })
    renderPanel({ editor: 'docs', bridge, cards, send: () => false, document: tabDocument })
    await settle()
    // the card's name check runs once the card is up
    await settle()
    await act(async () => button('이 탭을 양식으로 저장')!.click())
    await flush()
    expect(cards.saveFromCard).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Family letter',
        name: 'family-letter',
        invoke: 'manual',
        template: { bytes: new Uint8Array([7]), fileName: 'letter.docx' },
      }),
    )
    // the preview tab is told the saved skill's name
    expect(bridge.finishPreview).toHaveBeenCalledWith('p1', 'saved', {
      skillId: 'app:letter',
      title: 'family-letter',
    })
  })

  it('saves the original as it was handed over', async () => {
    const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
    const cards = cardBridge()
    renderPanel({ editor: 'docs', bridge, cards, send: () => false, document: DOC() })
    await settle()
    await settle()
    await act(async () => button('원래 문서 그대로 저장')!.click())
    await flush()
    expect(bridge.previewOriginal).toHaveBeenCalledWith('p1')
    expect(cards.saveFromCard).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { bytes: new Uint8Array([9, 9]), fileName: 'letter.docx' },
      }),
    )
  })

  it('blocks "save the original" when the original had redaction marks', async () => {
    const { bridge } = templateBridge({
      takeHandoff: handoff({ ...PREVIEW, originalRedacted: true }),
    })
    const cards = cardBridge()
    renderPanel({ editor: 'docs', bridge, cards, send: () => false, document: DOC() })
    await settle()
    const asIs = button('원래 문서 그대로 저장')!
    expect(asIs.disabled).toBe(true)
    await act(async () => asIs.click())
    expect(bridge.previewOriginal).not.toHaveBeenCalled()
    expect(cards.saveFromCard).not.toHaveBeenCalled()
  })

  it('cancel writes nothing and ends the preview as not saved', async () => {
    const { bridge } = templateBridge({ takeHandoff: handoff(PREVIEW) })
    const cards = cardBridge()
    renderPanel({ editor: 'docs', bridge, cards, send: () => false, document: DOC() })
    await settle()
    act(() => button('취소')!.click())
    expect(cards.saveFromCard).not.toHaveBeenCalled()
    expect(bridge.finishPreview).toHaveBeenCalledWith('p1', 'unsaved')
    expect(text()).toContain('저장하지 않은 스킬 제안')
  })
})
