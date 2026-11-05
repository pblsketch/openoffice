/**
 * The skill's answers to the model over the real plugin and engine, in the case a training
 * run found: a form whose sections each have a blank "○ " line, filled by inserting lines
 * after the headings and then removing "○" by the occurrence numbers counted before the
 * insert, which hit the new lines instead of the blank ones.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import type { AgentToolCall } from '@genoffice/agent-core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'
import { createHwpSkill } from '../src/renderer/ai/hwp-skill'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const FORM = [
  '지구의 날 운영 계획',
  '2. 목적',
  '○ ',
  '6. 안전 관리 계획',
  '○ ',
  '7. 기대 효과',
  '○ ',
]

/** The form in the engine, the plugin over it, and the skill talking to the plugin. */
function openForm() {
  let doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  FORM.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    doc.insertText(0, index, 0, line)
  })
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        return fn({ doc: () => doc, deferPagination: () => {} } as never)
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: () => {} },
    automation: { execute: () => null },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host) as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >
  const bridge = new Proxy({} as AgentBridge, {
    get:
      (_target, method: string) =>
      async (...args: unknown[]) =>
        plugin[method]!(...args),
  })
  const { skill, beginRun } = createHwpSkill({
    bridge,
    label: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    onChange: () => {},
    confirmMemoRemoval: async () => false,
  })
  const call = (name: string, input: Record<string, unknown>) =>
    skill.executeTool({ id: '1', name, input } satisfies AgentToolCall)
  const lines = () =>
    (plugin.readText!() as string).split(/\r?\n/).filter((line) => line.length > 0)
  return { call, beginRun, lines }
}

describe('a form filled by inserting after its headings', () => {
  it('lists each blank line with the heading in front of it', async () => {
    const { call } = openForm()
    const found = await call('find_text', { text: '○' })
    expect(found.output).toContain('3 occurrence(s)')
    expect(found.output).toContain('#1: …○ …')
    expect(found.output).toContain('(after "2. 목적")')
    expect(found.output).toContain('#2: …○ … (after "6. 안전 관리 계획")')
    expect(found.output).toContain('#3: …○ … (after "7. 기대 효과")')
    // the refusal of an ambiguous edit shows the same list
    const refused = await call('delete_paragraph', { find: '○' })
    expect(refused.isError).toBe(true)
    expect(refused.output).toContain('#3: …○ … (after "7. 기대 효과")')
  })

  it('refuses once to remove an added line by a stale occurrence, and removes it when asked again', async () => {
    const { call, beginRun, lines } = openForm()
    beginRun()
    const added = await call('insert_paragraphs', {
      where: 'after',
      anchor: '2. 목적',
      paragraphs: ['○ 기후변화 및 환경오염의 심각성을 인식함.', '○ 하천 정화 활동과 텃밭 가꾸기.'],
    })
    expect(added.mutated).toBe(true)
    expect(added.output).toContain('call find_text again before passing occurrence')
    await call('insert_paragraphs', {
      where: 'after',
      anchor: '6. 안전 관리 계획',
      paragraphs: ['○ 안전 교육 실시함.'],
    })

    // before the inserts "○" #2 was the blank line under 6.; now it is a line just added
    const stale = await call('delete_paragraph', { find: '○', occurrence: 2 })
    expect(stale.isError).toBe(true)
    expect(stale.output).toContain(
      'that paragraph is one you added in this request: "○ 하천 정화 활동과 텃밭 가꾸기."',
    )
    expect(lines()).toContain('○ 하천 정화 활동과 텃밭 가꾸기.')

    // the blank lines themselves are not guarded: #3 is the one under 2. now
    const blank = await call('delete_paragraph', { find: '○', occurrence: 3 })
    expect(blank.mutated).toBe(true)
    expect(blank.output).toContain('Removed the paragraph "○".')

    // asked again with the same arguments: the model means it
    const insisted = await call('delete_paragraph', { find: '○', occurrence: 2 })
    expect(insisted.mutated).toBe(true)
    expect(insisted.output).toContain('Removed the paragraph "○ 하천 정화 활동과 텃밭 가꾸기."')
    expect(lines()).toEqual([
      '지구의 날 운영 계획',
      '2. 목적',
      '○ 기후변화 및 환경오염의 심각성을 인식함.',
      '6. 안전 관리 계획',
      '○ 안전 교육 실시함.',
      '○ ',
      '7. 기대 효과',
      '○ ',
    ])
  })

  it('removes an added line asked for again with the same arguments', async () => {
    const { call, beginRun, lines } = openForm()
    beginRun()
    await call('insert_paragraphs', {
      where: 'after',
      anchor: '7. 기대 효과',
      paragraphs: ['○ 친환경 실천 함양함.'],
    })
    const find = { find: '친환경 실천' }
    expect((await call('delete_paragraph', find)).isError).toBe(true)
    const again = await call('delete_paragraph', find)
    expect(again.mutated).toBe(true)
    expect(again.output).toContain('Removed the paragraph "○ 친환경 실천 함양함."')
    expect(lines()).not.toContain('○ 친환경 실천 함양함.')
  })
})
