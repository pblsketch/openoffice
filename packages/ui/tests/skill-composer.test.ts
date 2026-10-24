/** @vitest-environment jsdom */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiComposer } from '../src/AiComposer'
import { SentSkillChips } from '../src/SkillPicker'
import {
  useComposerSkills,
  type ComposerSkills,
  type OnTemplateSkill,
  type SkillUse,
} from '../src/use-composer-skills'
import type { AiSkillsBridge } from '../src/skill-picker-model'

const view = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  source: id.split(':')[0],
  name: id.split(':').pop(),
  title,
  description: '',
  enabled: true,
  hidden: false,
  agentOnly: false,
  hasScripts: false,
  template: undefined,
  templateExists: false,
  ...over,
})

function fakeBridge(initial: unknown[]) {
  let list = initial
  const listeners = new Set<() => void>()
  const bodies = new Map<string, string>()
  const bridge: AiSkillsBridge & {
    setList(next: unknown[]): void
    fire(): void
    setBody(id: string, body: string | null): void
  } = {
    list: vi.fn(async () => list),
    aiRead: vi.fn(async (id: string) => {
      const body = bodies.get(id)
      if (body === undefined) return { ok: false, reason: 'not-found' }
      return { ok: true, skill: { id, name: id, title: id, body, files: [], hasScripts: false } }
    }),
    openSettings: vi.fn(async () => {}),
    onChanged: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setList: (next) => {
      list = next
    },
    fire: () => listeners.forEach((l) => l()),
    setBody: (id, body) => {
      if (body === null) bodies.delete(id)
      else bodies.set(id, body)
    },
  }
  return bridge
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => await Promise.resolve())
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

interface Handles {
  skills: ComposerSkills
  sent: string[]
  stops: number
}

function mount(
  bridge: AiSkillsBridge,
  props: {
    busy?: boolean
    dollarAtStartOnly?: boolean
    onTemplateSkill?: OnTemplateSkill
    maxChars?: number
  } = {},
): Handles {
  const handles = { sent: [] as string[], stops: 0 } as unknown as Handles
  function Panel() {
    const [value, setValue] = useState('')
    const skills = useComposerSkills({
      lang: 'ko',
      bridge,
      dollarAtStartOnly: props.dollarAtStartOnly,
      onTemplateSkill: props.onTemplateSkill,
      maxChars: props.maxChars,
    })
    handles.skills = skills
    return createElement(AiComposer, {
      value,
      busy: props.busy ?? false,
      placeholder: '',
      hintIdle: '',
      hintBusy: '',
      sendLabel: 'send',
      stopLabel: 'stop',
      onChange: setValue,
      onSend: () => {
        skills.withSkills(value, (use: SkillUse) => {
          handles.sent.push(value + use.text)
          skills.consume(use)
          setValue('')
        })
      },
      onStop: () => {
        handles.stops += 1
      },
      skills: skills.composer,
    })
  }
  act(() => root.render(createElement(Panel)))
  return handles
}

const textarea = () => host.querySelector('textarea') as HTMLTextAreaElement

function type(text: string) {
  const ta = textarea()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(ta, text)
    ta.setSelectionRange(text.length, text.length)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function key(k: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => {
    textarea().dispatchEvent(ev)
  })
  return ev
}

const rows = () => [...host.querySelectorAll('.ai-skill-picker-row')].map((r) => r.textContent)
const chipTitles = () =>
  [...host.querySelectorAll('.ai-skill-chips .ai-skill-chip-title')].map((c) => c.textContent)

describe('AiComposer with skills', () => {
  const list = [
    view('app:minutes', '회의록 정리'),
    view('app:letter', '가정통신문', { hasScripts: true }),
    view('builtin:find-skills', '찾기', { agentOnly: true }),
    view('user:off', '꺼진 스킬', { enabled: false }),
  ]

  it('opens on / with enabled, non-agent skills and a manage row; filters as typed', async () => {
    const bridge = fakeBridge(list)
    mount(bridge)
    await flush()
    type('/')
    await flush()
    expect(rows()).toHaveLength(3)
    expect(rows()[2]).toBe('스킬 관리…')
    expect(host.textContent).not.toContain('꺼진 스킬')
    // rows show the skill name, not its title
    expect(rows()[0]).toContain('minutes')
    expect(rows()[0]).not.toContain('회의록 정리')
    type('/let')
    await flush()
    expect(rows()).toEqual([expect.stringContaining('letter'), '스킬 관리…'])
    expect(textarea().getAttribute('aria-expanded')).toBe('true')
  })

  it('closes when nothing matches or a space is typed', async () => {
    mount(fakeBridge(list))
    await flush()
    type('/zzz')
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
    type('/회의 ')
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
  })

  it('re-reads the list each time it opens', async () => {
    const bridge = fakeBridge(list)
    mount(bridge)
    await flush()
    const before = (bridge.list as ReturnType<typeof vi.fn>).mock.calls.length
    type('/')
    await flush()
    expect((bridge.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1)
  })

  it('Enter picks instead of sending: the /word leaves the input and a chip appears', async () => {
    const h = mount(fakeBridge(list))
    await flush()
    type('요약해 줘 /min')
    key('Enter')
    await flush()
    expect(h.sent).toEqual([])
    expect(textarea().value).toBe('요약해 줘 ')
    expect(chipTitles()).toEqual(['minutes'])
  })

  it('↓ then Tab picks the next row; the same skill goes in only once', async () => {
    const h = mount(fakeBridge(list))
    await flush()
    type('/')
    key('ArrowDown')
    key('Tab')
    await flush()
    type('/')
    key('ArrowDown')
    key('Enter')
    await flush()
    expect(h.skills.chips.map((c) => c.id)).toEqual(['app:letter'])
    // a chip whose skill has scripts gets the one-line notice
    expect(host.textContent).toContain('이 스킬의 스크립트는 일반 AI 창에서 실행되지 않습니다')
  })

  it('Esc closes the open list without stopping a run; a closed list lets Esc stop it', async () => {
    const h = mount(fakeBridge(list), { busy: true })
    await flush()
    type('/')
    expect(host.querySelector('.ai-skill-picker')).not.toBeNull()
    // a window-level handler that stops runs on Esc never sees this one
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    key('Escape')
    document.removeEventListener('keydown', outer)
    expect(h.stops).toBe(0)
    expect(outer).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
    key('Escape')
    expect(h.stops).toBe(1)
  })

  it('Enter sends as before while the list is closed', async () => {
    const h = mount(fakeBridge(list))
    await flush()
    type('hello')
    key('Enter')
    await flush()
    expect(h.sent).toEqual(['hello'])
  })

  it('sheets: $ opens at the start of the input only', async () => {
    mount(fakeBridge(list), { dollarAtStartOnly: true })
    await flush()
    type('sum $A')
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
    type('$')
    expect(host.querySelector('.ai-skill-picker')).not.toBeNull()
  })

  it('does not open while a composition runs', async () => {
    mount(fakeBridge(list))
    await flush()
    act(() => {
      textarea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    type('/가')
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
  })

  it('the manage row opens the skills settings', async () => {
    const bridge = fakeBridge(list)
    mount(bridge)
    await flush()
    type('/')
    key('ArrowUp')
    key('Enter')
    expect(bridge.openSettings).toHaveBeenCalledTimes(1)
  })

  it('drops a chip when its skill is turned off', async () => {
    const bridge = fakeBridge(list)
    const h = mount(bridge)
    await flush()
    type('/min')
    key('Enter')
    await flush()
    expect(h.skills.chips).toHaveLength(1)
    bridge.setList(list.filter((v) => v.id !== 'app:minutes'))
    act(() => bridge.fire())
    await flush()
    expect(h.skills.chips).toHaveLength(0)
    expect(chipTitles()).toEqual([])
  })
})

describe('useComposerSkills: sending', () => {
  const list = [view('app:a', 'A'), view('app:b', 'B')]

  it('adds each chip skill to the request and clears the chips once sent', async () => {
    const bridge = fakeBridge(list)
    bridge.setBody('app:a', 'Body of A')
    const h = mount(bridge)
    await flush()
    type('/A')
    key('Enter')
    type('do it')
    key('Enter')
    await flush()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatch(/^do it/)
    expect(h.sent[0]).toContain('<skill id="app:a" title="app:a">\nBody of A\n</skill>')
    expect(h.skills.chips).toHaveLength(0)
  })

  it('refuses a total over the cap with the spec sentence and keeps the chips', async () => {
    const bridge = fakeBridge(list)
    bridge.setBody('app:a', 'x'.repeat(500))
    const h = mount(bridge, { maxChars: 200 })
    await flush()
    type('/A')
    key('Enter')
    type('go')
    key('Enter')
    await flush()
    expect(h.sent).toEqual([])
    expect(host.textContent).toContain('스킬이 너무 커서 함께 보낼 수 없습니다')
    expect(h.skills.chips).toHaveLength(1)
  })

  it('a chosen skill that cannot be read becomes unavailable and nothing is sent', async () => {
    const bridge = fakeBridge(list)
    const h = mount(bridge)
    await flush()
    type('/A')
    key('Enter')
    type('go')
    key('Enter')
    await flush()
    expect(h.sent).toEqual([])
    expect(host.querySelector('.ai-skill-chip.is-missing')?.textContent).toContain('없음')
  })

  it('re-reads a reopened conversation’s skills once; a gone one is left out', async () => {
    const bridge = fakeBridge(list)
    bridge.setBody('app:a', 'Current A')
    const h = mount(bridge)
    await flush()
    act(() =>
      h.skills.restoreHistory([
        [{ id: 'app:a', source: 'app', title: 'A' }],
        undefined,
        [{ id: 'app:gone', source: 'app', title: 'Gone' }],
      ]),
    )
    type('next')
    key('Enter')
    await flush()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toContain('Current A')
    expect(h.sent[0]).not.toContain('app:gone')
    expect(h.skills.isAvailable('app:gone')).toBe(false)
    type('again')
    key('Enter')
    await flush()
    expect(h.sent[1]).toBe('again')
  })

  it('hands a template skill to the template hook, which may take the request over', async () => {
    const bridge = fakeBridge([
      view('app:t', 'T', { template: 'assets/t.docx', templateExists: true }),
    ])
    bridge.setBody('app:t', 'Fill it')
    const onTemplateSkill = vi.fn(async () => true)
    const h = mount(bridge, { onTemplateSkill })
    await flush()
    type('/T')
    key('Enter')
    type('make one')
    key('Enter')
    await flush()
    expect(onTemplateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'make one',
        skill: expect.objectContaining({ id: 'app:t' }),
      }),
    )
    expect(h.sent).toEqual([])
    expect(h.skills.chips).toHaveLength(0)
  })
})

describe('SentSkillChips', () => {
  it('shows "없음" on a chip whose skill is no longer available', () => {
    act(() =>
      root.render(
        createElement(SentSkillChips, {
          lang: 'ko',
          chips: [
            { id: 'app:a', source: 'app', title: 'A' },
            { id: 'app:b', source: 'app', title: 'B' },
          ],
          isAvailable: (id: string) => id === 'app:a',
        }),
      ),
    )
    const chips = [...host.querySelectorAll('.ai-skill-chip')]
    expect(chips[0]?.textContent).toBe('/A')
    expect(chips[1]?.textContent).toBe('/B없음')
    expect(host.querySelector('.ai-skill-chip-remove')).toBeNull()
  })
})
