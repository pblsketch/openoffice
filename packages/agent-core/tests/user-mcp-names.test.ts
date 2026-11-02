import { describe, expect, it } from 'vitest'
import {
  APP_MCP_SERVER_NAME,
  MCP_SERVER_NAME_MAX,
  MCP_TOOL_NAME_MAX,
  isMcpToolName,
  mapServerToolNames,
  mcpToolName,
  parseMcpToolName,
  parseMcpToolNameIn,
  sanitizeToolName,
  serverNameProblem,
  suggestServerName,
  suggestServerNameFrom,
  toolStepLabel,
} from '../src/user-mcp'

describe('server names', () => {
  it('accepts letters, digits, - and _ up to the length limit', () => {
    expect(MCP_SERVER_NAME_MAX).toBe(24)
    for (const ok of ['law', 'korean-law', 'my_server', 'A1', 'a-b_c-9', 'x'.repeat(24), 'a-']) {
      expect(serverNameProblem(ok)).toBeNull()
    }
  })

  it('names what is wrong', () => {
    expect(serverNameProblem('')).toBe('empty')
    expect(serverNameProblem('x'.repeat(25))).toBe('too-long')
    expect(serverNameProblem('법령')).toBe('bad-char')
    expect(serverNameProblem('a b')).toBe('bad-char')
    expect(serverNameProblem('a.b')).toBe('bad-char')
    expect(serverNameProblem('a__b')).toBe('double-underscore')
    expect(serverNameProblem('_a')).toBe('edge-underscore')
    expect(serverNameProblem('a_')).toBe('edge-underscore')
    expect(serverNameProblem(APP_MCP_SERVER_NAME)).toBe('reserved')
    expect(serverNameProblem('IeumOffice-Editor')).toBe('reserved')
  })

  it('takes a different length limit', () => {
    expect(serverNameProblem('abcdef', 5)).toBe('too-long')
    expect(serverNameProblem('x'.repeat(30), 30)).toBeNull()
  })

  it('suggests a name that follows the rule', () => {
    expect(suggestServerName('korean law')).toBe('korean-law')
    expect(suggestServerName('__a__b__')).toBe('a_b')
    expect(suggestServerName('법령')).toBe('server')
    expect(suggestServerName('x'.repeat(40))).toBe('x'.repeat(24))
    expect(suggestServerName('x'.repeat(23) + '_y')).toBe('x'.repeat(23))
    expect(suggestServerName(APP_MCP_SERVER_NAME)).toBe('ieumoffice-editor-2')
    expect(suggestServerName('law', ['law', 'law-2'])).toBe('law-3')
    expect(suggestServerName('good_name')).toBe('good_name')
    for (const raw of ['a b', '__', '', 'x'.repeat(40), '.-.', 'ieumoffice-editor']) {
      expect(serverNameProblem(suggestServerName(raw))).toBeNull()
    }
    // a number suffix still fits the limit
    const long = 'y'.repeat(24)
    const next = suggestServerName(long, [long])
    expect(next).toHaveLength(24)
    expect(next.endsWith('-2')).toBe(true)
  })
})

describe('tool names', () => {
  it('builds mcp__<server>__<tool>', () => {
    expect(mcpToolName('law', 'search_law')).toBe('mcp__law__search_law')
    expect(isMcpToolName('mcp__law__search_law')).toBe(true)
    expect(isMcpToolName('web_search')).toBe(false)
    expect(isMcpToolName('mcp_law')).toBe(false)
  })

  it('replaces characters outside [A-Za-z0-9_-] with _', () => {
    expect(sanitizeToolName('get.law text/v2')).toBe('get_law_text_v2')
    expect(sanitizeToolName('검색')).toBe('__')
    expect(sanitizeToolName('ok-name_1')).toBe('ok-name_1')
  })

  it('marks collisions after sanitizing, over-long names and empty names unusable', () => {
    const longTool = 't'.repeat(MCP_TOOL_NAME_MAX)
    const entries = mapServerToolNames('law', [
      'search',
      'get.text',
      'get_text',
      'fine',
      longTool,
      '',
      'fine',
    ])
    expect(entries.map((e) => [e.original, e.name, e.changed, e.problem])).toEqual([
      ['search', 'mcp__law__search', false, null],
      ['get.text', 'mcp__law__get_text', true, 'collision'],
      ['get_text', 'mcp__law__get_text', false, 'collision'],
      ['fine', 'mcp__law__fine', false, 'collision'],
      [longTool, `mcp__law__${longTool}`, false, 'too-long'],
      ['', 'mcp__law__', false, 'empty'],
      ['fine', 'mcp__law__fine', false, 'collision'],
    ])
  })

  it('keeps a full name of exactly 64 characters', () => {
    const tool = 'a'.repeat(MCP_TOOL_NAME_MAX - 'mcp__law__'.length)
    const [entry] = mapServerToolNames('law', [tool])
    expect(entry?.name).toHaveLength(64)
    expect(entry?.problem).toBeNull()
  })

  it('marks every tool of a server whose name breaks the rule unusable', () => {
    expect(mapServerToolNames('a__b', ['x']).map((e) => e.problem)).toEqual(['server-name'])
  })
})

describe('parsing a tool name', () => {
  it('takes the server up to the first __ after the prefix', () => {
    expect(parseMcpToolName('mcp__law__search_law')).toEqual({
      server: 'law',
      tool: 'search_law',
    })
    // the tool part may itself hold __
    expect(parseMcpToolName('mcp__law__a__b')).toEqual({ server: 'law', tool: 'a__b' })
    expect(parseMcpToolName('mcp__korean-law_kr__x')).toEqual({
      server: 'korean-law_kr',
      tool: 'x',
    })
  })

  it('returns null for names that are not a well-formed MCP tool name', () => {
    for (const bad of [
      'web_search',
      'mcp__',
      'mcp__law',
      'mcp__law__',
      'mcp____x',
      'mcp___law__x',
      'mcp__law_.x__y',
      'mcp__law__a.b',
      `mcp__law__${'t'.repeat(64)}`,
    ]) {
      expect(parseMcpToolName(bad)).toBeNull()
    }
  })

  it('finds only registered servers with the table', () => {
    const servers = new Set(['law', 'notes'])
    expect(parseMcpToolNameIn('mcp__law__search', servers)).toEqual({
      server: 'law',
      tool: 'search',
    })
    expect(parseMcpToolNameIn('mcp__other__search', servers)).toBeNull()
    expect(parseMcpToolNameIn('mcp__notes__a__b', ['notes'])).toEqual({
      server: 'notes',
      tool: 'a__b',
    })
  })
})

describe('suggestServerNameFrom (P7)', () => {
  it('keeps the usual suggestion when the name has letters to keep', () => {
    expect(suggestServerNameFrom('korean law', [], { url: 'https://x.example.com/mcp' })).toBe(
      'korean-law',
    )
  })

  it('takes a telling host label for an address server', () => {
    expect(suggestServerNameFrom('내 사전', [], { url: 'https://dict.example.com/mcp' })).toBe(
      'dict',
    )
    expect(suggestServerNameFrom('법령', [], { url: 'https://mcp.law.go.kr/sse' })).toBe('law')
    expect(suggestServerNameFrom('사전', ['dict'], { url: 'https://dict.example.com' })).toBe(
      'dict-2',
    )
    // an address by number or this PC says nothing
    expect(suggestServerNameFrom('메모', [], { url: 'http://127.0.0.1:9/mcp' })).toBe('server')
    expect(suggestServerNameFrom('메모', [], { url: 'http://localhost:9/mcp' })).toBe('server')
  })

  it('takes the package or script a command runs', () => {
    const from = (command: string, args: string[]) =>
      suggestServerNameFrom('도구', [], { command, args })
    expect(from('npx', ['-y', '@modelcontextprotocol/server-filesystem', 'C:/docs'])).toBe(
      'server-filesystem',
    )
    expect(from('uvx', ['mcp-server-fetch@latest'])).toBe('mcp-server-fetch')
    expect(from('uv', ['run', 'notes'])).toBe('notes')
    expect(from('node', ['C:\\tools\\notes-server.mjs'])).toBe('notes-server')
    expect(from('C:\\Program Files\\Dict\\dict.exe', [])).toBe('dict')
    expect(from('npx', [])).toBe('server')
  })
})

describe('toolStepLabel (P9)', () => {
  it('reads a user MCP tool as "server · tool" and other tools with spaces', () => {
    expect(toolStepLabel('mcp__dict__save_note')).toBe('dict · save_note')
    expect(toolStepLabel('read_document')).toBe('read document')
    expect(toolStepLabel('web-search')).toBe('web search')
  })
})
