import { describe, expect, it, vi } from 'vitest'
import {
  DRIVE_OUTBOUND_BLOCKED,
  composeWithDrive,
  createBridgedDriveSkill,
  createDriveSkill,
  readAnswerOf,
  searchAnswerOf,
  guardDriveContent,
  isOutboundCall,
  type DriveSkillDeps,
} from '../src/drive-skill'
import { composeSkills, type AgentSkill } from '../src/skill'
import type { AgentMessage, AgentToolCall } from '../src/types'

const call = (name: string, input: Record<string, unknown> = {}): AgentToolCall => ({
  id: name,
  name,
  input,
})

function setup(over: Partial<DriveSkillDeps> = {}) {
  let history: AgentMessage[] = []
  let enabled = true
  const deps: DriveSkillDeps = {
    enabled: () => enabled,
    search: vi.fn(async () => ({
      ok: true as const,
      hits: [{ id: 'f1', name: '회의록', type: 'document', modified: '2026-10-01T09:00:00Z' }],
    })),
    read: vi.fn(async (_id: string, offset: number) => ({
      ok: true as const,
      page: { name: '회의록', text: 'hello', totalChars: 10, offset },
    })),
    messages: () => history,
    ...over,
  }
  const drive = createDriveSkill(deps)
  const editor: AgentSkill = {
    id: 'editor',
    systemPrompt: 'editor',
    tools: [
      { name: 'web_search', description: '', inputSchema: { type: 'object' } },
      { name: 'insert_image', description: '', inputSchema: { type: 'object' } },
    ],
    executeTool: (c) => ({ output: `ran ${c.name}`, summary: c.name }),
  }
  const skill = guardDriveContent(composeSkills('x', '', [drive, editor]), drive)
  return {
    deps,
    drive,
    skill,
    setHistory: (h: AgentMessage[]) => (history = h),
    setEnabled: (v: boolean) => (enabled = v),
  }
}

describe('createDriveSkill', () => {
  it('offers its tools and prompt only while enabled', () => {
    const { skill, setEnabled } = setup()
    expect(skill.tools.map((t) => t.name)).toContain('drive_search')
    expect(skill.systemPrompt).toContain('Google Drive')
    setEnabled(false)
    expect(skill.tools.map((t) => t.name)).toEqual(['web_search', 'insert_image'])
    expect(skill.systemPrompt).not.toContain('Google Drive')
  })

  it('lists search hits with their ids', async () => {
    const { skill } = setup()
    const result = await skill.executeTool(call('drive_search', { query: '회의록', limit: 99 }))
    expect(result.output).toContain('id: f1')
    expect(result.output).toContain('changed 2026-10-01')
  })

  it('refuses an id that is not a Drive id', async () => {
    const { skill, deps } = setup()
    const result = await skill.executeTool(call('drive_read', { file_id: '../../etc' }))
    expect(result.isError).toBe(true)
    expect(deps.read).not.toHaveBeenCalled()
  })

  it('pages a read', async () => {
    const { skill } = setup()
    const result = await skill.executeTool(call('drive_read', { file_id: 'f1', offset: 5 }))
    expect(result.output).toContain('characters 5..10 of 10 (end)')
  })

  it('passes a Drive failure to the model as an error', async () => {
    const { skill } = setup({ read: async () => ({ ok: false, error: 'file not found' }) })
    const result = await skill.executeTool(call('drive_read', { file_id: 'f1' }))
    expect(result).toMatchObject({ isError: true, output: 'file not found' })
  })
})

describe('guardDriveContent', () => {
  it('lets outbound tools run before any Drive read', async () => {
    const { skill } = setup()
    expect((await skill.executeTool(call('web_search', { query: 'x' }))).output).toBe(
      'ran web_search',
    )
  })

  it('names page reading among the blocked tools', () => {
    expect(DRIVE_OUTBOUND_BLOCKED).toContain('reading pages or pictures by web address')
  })

  it('refuses outbound tools after a Drive read, until a new chat', async () => {
    const { skill, setHistory } = setup()
    await skill.executeTool(call('drive_read', { file_id: 'f1' }))
    expect((await skill.executeTool(call('web_search'))).output).toBe(DRIVE_OUTBOUND_BLOCKED)
    // reading a page by web address is a fetch too
    expect((await skill.executeTool(call('read_url', { url: 'https://x.example/a' }))).output).toBe(
      DRIVE_OUTBOUND_BLOCKED,
    )
    // an image by web address is a fetch too
    const byUrl = await skill.executeTool(call('insert_image', { url: 'https://x.example/a.png' }))
    expect(byUrl.output).toBe(DRIVE_OUTBOUND_BLOCKED)
    // a local picture is fine
    expect(
      (await skill.executeTool(call('insert_image', { path: 'C:/a.png' }))).isError,
    ).toBeFalsy()
    // next run in the same chat: still refused
    setHistory([{ role: 'user', text: 'hi' }])
    skill.buildContext?.()
    expect((await skill.executeTool(call('web_search'))).output).toBe(DRIVE_OUTBOUND_BLOCKED)
    // a new chat starts with an empty history
    setHistory([])
    skill.buildContext?.()
    expect((await skill.executeTool(call('web_search'))).output).toBe('ran web_search')
  })

  it('refuses user MCP tools after a Drive read', async () => {
    const { skill } = setup()
    expect((await skill.executeTool(call('mcp__law__search', { query: 'x' }))).output).not.toBe(
      DRIVE_OUTBOUND_BLOCKED,
    )
    await skill.executeTool(call('drive_read', { file_id: 'f1' }))
    expect((await skill.executeTool(call('mcp__law__search', { query: 'x' }))).output).toBe(
      DRIVE_OUTBOUND_BLOCKED,
    )
  })

  it('refuses outbound tools in a restored transcript that holds a Drive read', async () => {
    const { skill, setHistory } = setup()
    setHistory([
      { role: 'user', text: 'read it' },
      { role: 'assistant', text: '', toolCalls: [call('drive_read', { file_id: 'f1' })] },
      { role: 'tool', results: [{ id: 'drive_read', name: 'drive_read', output: 'secret' }] },
    ])
    skill.buildContext?.()
    expect((await skill.executeTool(call('web_search'))).output).toBe(DRIVE_OUTBOUND_BLOCKED)
  })
})

describe('isOutboundCall', () => {
  it('finds addresses in nested inputs', () => {
    expect(isOutboundCall(call('apply_ops', { ops: [{ op: 'image', src: 'http://a/b' }] }))).toBe(
      true,
    )
    expect(isOutboundCall(call('apply_ops', { ops: [{ op: 'link', href: 'https://a' }] }))).toBe(
      false,
    )
  })

  it('treats read_url as outbound even without an address', () => {
    expect(isOutboundCall(call('read_url'))).toBe(true)
  })

  it('treats every user MCP tool as outbound, by its mcp__ prefix alone', () => {
    expect(isOutboundCall(call('mcp__law__search'))).toBe(true)
    expect(isOutboundCall(call('mcp__anything__at_all', { text: 'local' }))).toBe(true)
    expect(isOutboundCall(call('mcp_law_search'))).toBe(false)
    expect(isOutboundCall(call('edit_text'))).toBe(false)
  })
})

describe('the preload bridge', () => {
  it('drops malformed answers instead of passing them to the model', () => {
    expect(
      searchAnswerOf({
        ok: true,
        hits: [{ id: 'a', name: 'n', type: 't', modified: 'm' }, { id: 1 }],
      }),
    ).toEqual({
      ok: true,
      hits: [{ id: 'a', name: 'n', type: 't', modified: 'm' }],
    })
    expect(searchAnswerOf(null)).toEqual({ ok: false, error: 'Google Drive did not answer.' })
    expect(readAnswerOf({ ok: true, page: { name: 'n', text: 1 } }).ok).toBe(false)
    expect(readAnswerOf({ ok: false, error: 'not connected' })).toEqual({
      ok: false,
      error: 'not connected',
    })
  })

  it('follows the enabled state the main process broadcasts', async () => {
    let notify: (on: boolean) => void = () => {}
    const skill = createBridgedDriveSkill(
      {
        driveAiEnabled: async () => false,
        driveSearch: async () => ({ ok: true, hits: [] }),
        driveRead: async () => null,
        onDriveAiChanged: (listener) => {
          notify = listener
          return () => {}
        },
      },
      () => [],
    )
    await Promise.resolve()
    expect(skill.tools).toEqual([])
    notify(true)
    expect(skill.tools.map((t) => t.name)).toEqual(['drive_search', 'drive_read'])
  })

  it('composes without Drive when the window has no bridge', () => {
    const editor: AgentSkill = {
      id: 'e',
      systemPrompt: '',
      tools: [{ name: 'web_search', description: '', inputSchema: { type: 'object' } }],
      executeTool: () => ({ output: 'ran', summary: '' }),
    }
    const skill = composeWithDrive('x', '', () => [], [editor])
    expect(skill.tools.map((t) => t.name)).toEqual(['web_search'])
  })
})
