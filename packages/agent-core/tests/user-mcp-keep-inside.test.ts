import { describe, expect, it } from 'vitest'
import { guardReceivedContent, keepInsideRefusalText, keptInsideServersIn } from '../src/user-mcp'
import { composeSkills, type AgentSkill } from '../src/skill'
import type { AgentMessage, AgentToolCall, ToolExecution } from '../src/types'

const call = (name: string, input: Record<string, unknown> = {}): AgentToolCall => ({
  id: name,
  name,
  input,
})

const toolMessage = (name: string, isError = false): AgentMessage => ({
  role: 'tool',
  results: [{ id: name, name, output: 'content', isError }],
})

function setup(opts: { keepInside?: string[]; failing?: string[]; async?: boolean } = {}) {
  let history: AgentMessage[] = []
  const keepInside = new Set(opts.keepInside ?? ['notes', 'mail'])
  const executed: string[] = []
  const editor: AgentSkill = {
    id: 'editor',
    systemPrompt: 'editor',
    tools: [
      'web_search',
      'read_url',
      'insert_image',
      'edit_text',
      'mcp__notes__find',
      'mcp__notes__read',
      'mcp__mail__read',
      'mcp__law__search',
    ].map((name) => ({ name, description: name, inputSchema: { type: 'object' } })),
    executeTool: (c) => {
      executed.push(c.name)
      const result: ToolExecution = {
        output: `ran ${c.name}`,
        summary: c.name,
        ...(opts.failing?.includes(c.name) ? { isError: true } : {}),
      }
      return opts.async ? Promise.resolve(result) : result
    },
  }
  const skill = guardReceivedContent(composeSkills('x', '', [editor]), {
    keepsInside: (server) => keepInside.has(server),
    messages: () => history,
  })
  return {
    skill,
    executed,
    keepInside,
    setHistory: (h: AgentMessage[]) => (history = h),
    run: async (name: string, input: Record<string, unknown> = {}) =>
      await skill.executeTool(call(name, input)),
  }
}

describe('keptInsideServersIn', () => {
  it('finds keep-inside servers whose non-error results are in the history', () => {
    const history: AgentMessage[] = [
      { role: 'user', text: 'mcp__law__search' },
      toolMessage('mcp__notes__read'),
      toolMessage('mcp__mail__read', true),
      toolMessage('mcp__law__search'),
      toolMessage('web_search'),
    ]
    expect([...keptInsideServersIn(history, (s) => s !== 'law')]).toEqual(['notes'])
  })
})

describe('keepInsideRefusalText', () => {
  it('names the servers and says a new chat makes it usable again', () => {
    const text = keepInsideRefusalText(['notes'])
    expect(text).toContain('"notes"')
    expect(text).toContain('new chat')
    expect(keepInsideRefusalText(['notes', 'mail'])).toContain('"mail"')
  })
})

describe('guardReceivedContent', () => {
  it('lets every tool run before any keep-inside content comes in', async () => {
    const { run, executed } = setup()
    await run('web_search', { query: 'q' })
    await run('mcp__law__search')
    await run('mcp__notes__find')
    expect(executed).toEqual(['web_search', 'mcp__law__search', 'mcp__notes__find'])
  })

  it('keeps the tool list as it is', () => {
    const { skill } = setup()
    expect(skill.tools.map((t) => t.name)).toContain('web_search')
  })

  it('after server S returns content: S stays callable, web tools and other servers are refused', async () => {
    const { run, executed, skill } = setup()
    await run('mcp__notes__find')
    expect([...skill.keptInsideServers]).toEqual(['notes'])
    expect((await run('mcp__notes__read')).isError).toBeFalsy()
    for (const name of ['web_search', 'read_url', 'mcp__law__search', 'mcp__mail__read']) {
      const res = await run(name)
      expect(res.isError).toBe(true)
      expect(res.output).toBe(keepInsideRefusalText(['notes']))
    }
    // an on-PC tool that would fetch an address is outbound too
    expect((await run('insert_image', { src: 'https://x.example/a.png' })).isError).toBe(true)
    // on-PC work goes on
    expect((await run('edit_text', { text: 'x' })).isError).toBeFalsy()
    expect(executed).toEqual(['mcp__notes__find', 'mcp__notes__read', 'edit_text'])
  })

  it('works the same when the editor runs tools asynchronously', async () => {
    const { run } = setup({ async: true })
    await run('mcp__notes__find')
    expect((await run('web_search')).isError).toBe(true)
  })

  it('does not hold a server whose call failed or whose keep-inside is off', async () => {
    const { run, executed } = setup({ failing: ['mcp__notes__find'] })
    await run('mcp__notes__find')
    await run('mcp__law__search')
    await run('web_search')
    expect(executed).toEqual(['mcp__notes__find', 'mcp__law__search', 'web_search'])
  })

  it('with two keep-inside servers holding content, neither may call the other, nor itself (each is "another server" to the other one\'s content)', async () => {
    const { run, executed } = setup()
    await run('mcp__notes__find')
    // a run of the other keep-inside server is refused once notes holds content
    expect((await run('mcp__mail__read')).isError).toBe(true)
    // both in the conversation, as in a reopened chat
    const { run: run2, executed: executed2, setHistory, skill } = setup()
    setHistory([toolMessage('mcp__notes__find'), toolMessage('mcp__mail__read')])
    skill.buildContext?.()
    for (const name of ['mcp__notes__read', 'mcp__mail__read', 'mcp__law__search', 'web_search']) {
      expect((await run2(name)).isError).toBe(true)
    }
    expect((await run2('web_search')).output).toBe(keepInsideRefusalText(['notes', 'mail']))
    expect((await run2('mcp__notes__read')).output).toBe(keepInsideRefusalText(['mail']))
    expect((await run2('mcp__mail__read')).output).toBe(keepInsideRefusalText(['notes']))
    expect(executed).toEqual(['mcp__notes__find'])
    expect(executed2).toEqual([])
  })

  it('restores the block from a reopened conversation and clears it in a new chat', async () => {
    const { run, setHistory, skill } = setup()
    setHistory([
      { role: 'user', text: 'find my note' },
      { role: 'assistant', text: '', toolCalls: [call('mcp__notes__find')] },
      toolMessage('mcp__notes__find'),
    ])
    skill.buildContext?.()
    expect((await run('web_search')).output).toBe(keepInsideRefusalText(['notes']))
    // the next run of the same chat keeps it
    setHistory([{ role: 'user', text: 'compacted summary' }])
    skill.buildContext?.()
    expect((await run('web_search')).isError).toBe(true)
    // a new chat starts with an empty history
    setHistory([])
    skill.buildContext?.()
    expect((await run('web_search')).isError).toBeFalsy()
    expect([...skill.keptInsideServers]).toEqual([])
  })

  it('stays blocked when keep-inside is turned off during the conversation', async () => {
    const { run, keepInside } = setup()
    await run('mcp__notes__find')
    keepInside.delete('notes')
    expect((await run('web_search')).isError).toBe(true)
  })

  it('passes the composed skill’s context and prompt through', () => {
    const inner: AgentSkill = {
      id: 'i',
      systemPrompt: 'prompt',
      tools: [],
      buildContext: () => 'ctx',
      executeTool: () => ({ output: '', summary: '' }),
    }
    const skill = guardReceivedContent(inner, { keepsInside: () => true, messages: () => [] })
    expect(skill.systemPrompt).toBe('prompt')
    expect(skill.buildContext?.()).toBe('ctx')
  })
})
