import { describe, expect, it } from 'vitest'
import { parseMcpPaste, type PastedServer } from '../../src/main/mcp-client/paste'

function servers(text: string, taken: string[] = []): PastedServer[] {
  const result = parseMcpPaste(text, taken)
  if (!result.ok) throw new Error(`paste failed: ${result.error}`)
  return result.servers
}

describe('parseMcpPaste: JSON with mcpServers', () => {
  it('reads a local server', () => {
    const result = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/docs'],
            env: { API_KEY: 'abc123' },
          },
        },
      }),
    )
    expect(result).toMatchObject({ ok: true, format: 'json', ignored: [] })
    if (!result.ok) return
    expect(result.servers).toEqual([
      {
        pastedName: 'filesystem',
        name: 'filesystem',
        nameChanged: false,
        kind: 'local',
        url: '',
        transport: 'auto',
        headers: {},
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/docs'],
        env: { API_KEY: 'abc123' },
        keyNeeded: false,
        keyEnvVar: null,
        headerVars: {},
        envVars: {},
        typeIgnored: null,
        ignored: [],
        problem: null,
      },
    ])
  })

  it('reads remote servers with url, serverUrl, type and headers', () => {
    const [a, b, c] = servers(
      JSON.stringify({
        mcpServers: {
          law: {
            type: 'http',
            url: 'https://law.example.com/mcp',
            headers: { Authorization: 'Bearer k-1' },
          },
          stream: { type: 'streamable-http', serverUrl: 'https://s.example.com/mcp' },
          old: { type: 'sse', url: 'https://old.example.com/sse' },
        },
      }),
    )
    expect(a).toMatchObject({
      name: 'law',
      kind: 'remote',
      url: 'https://law.example.com/mcp',
      transport: 'auto',
      headers: { Authorization: 'Bearer k-1' },
      problem: null,
    })
    expect(b).toMatchObject({ kind: 'remote', url: 'https://s.example.com/mcp', transport: 'auto' })
    expect(c).toMatchObject({ kind: 'remote', transport: 'sse' })
  })

  it('lists unknown fields as ignored, per server and at the top', () => {
    const result = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          x: { command: 'uvx', args: ['x-mcp'], disabled: false, alwaysAllow: ['a'], timeout: 30 },
        },
        theme: 'dark',
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ignored).toEqual(['theme'])
    expect(result.servers[0].ignored).toEqual(['disabled', 'alwaysAllow', 'timeout'])
  })

  it('reads a fenced block pasted from a guide', () => {
    const text =
      'Add this:\n```json\n{"mcpServers":{"a":{"url":"https://a.example.com/mcp"}}}\n```\n'
    expect(servers(text)[0]).toMatchObject({ name: 'a', kind: 'remote' })
  })
})

describe('parseMcpPaste: bare JSON', () => {
  it('reads several servers without the wrapper', () => {
    const result = parseMcpPaste(
      JSON.stringify({
        one: { command: 'node', args: ['server.js'] },
        two: { url: 'https://two.example.com/mcp' },
      }),
    )
    expect(result).toMatchObject({ ok: true, format: 'json-bare' })
    if (!result.ok) return
    expect(result.servers.map((s) => [s.name, s.kind])).toEqual([
      ['one', 'local'],
      ['two', 'remote'],
    ])
  })

  it('ignores top-level entries that are not servers', () => {
    const result = parseMcpPaste(JSON.stringify({ one: { command: 'node' }, note: 'hello' }))
    expect(result.ok && result.ignored).toEqual(['note'])
  })
})

describe('parseMcpPaste: Codex TOML', () => {
  const toml = `
# Codex config
model = "gpt-5"

[mcp_servers.docs]
command = "npx"
args = ["-y", "docs-mcp", "--root", 'C:\\Users\\me']
env = { DOCS_TOKEN = "t-1", MODE = "fast" }
startup_timeout_sec = 20

[mcp_servers.remote]
url = "https://remote.example.com/mcp"
http_headers = { "X-Team" = "blue" }
bearer_token_env_var = "REMOTE_TOKEN"

[mcp_servers."weird name"]
command = "uvx"
args = [
  "weird-mcp", # trailing comment
]
`
  it('reads every [mcp_servers.<name>] table', () => {
    const result = parseMcpPaste(toml)
    expect(result).toMatchObject({ ok: true, format: 'toml', ignored: ['model'] })
    if (!result.ok) return
    const [docs, remote, weird] = result.servers
    expect(docs).toMatchObject({
      name: 'docs',
      kind: 'local',
      command: 'npx',
      args: ['-y', 'docs-mcp', '--root', 'C:\\Users\\me'],
      env: { DOCS_TOKEN: 't-1', MODE: 'fast' },
      ignored: ['startup_timeout_sec'],
    })
    expect(remote).toMatchObject({
      name: 'remote',
      kind: 'remote',
      url: 'https://remote.example.com/mcp',
      transport: 'auto',
      headers: { 'X-Team': 'blue' },
    })
    expect(weird).toMatchObject({ pastedName: 'weird name', kind: 'local', args: ['weird-mcp'] })
  })

  it('leaves the key empty for bearer_token_env_var and never reads the environment', () => {
    process.env.REMOTE_TOKEN = 'from-the-pc'
    try {
      const remote = servers(toml).find((s) => s.pastedName === 'remote')
      expect(remote?.keyNeeded).toBe(true)
      expect(remote?.keyEnvVar).toBe('REMOTE_TOKEN')
      expect(JSON.stringify(remote)).not.toContain('from-the-pc')
      expect(remote?.headers.Authorization).toBeUndefined()
    } finally {
      delete process.env.REMOTE_TOKEN
    }
  })

  it('reads env given as its own table', () => {
    const [s] = servers('[mcp_servers.a]\ncommand = "x"\n[mcp_servers.a.env]\nK = "v"\n')
    expect(s.env).toEqual({ K: 'v' })
  })

  it('reports a broken TOML text as unreadable, with the line of the mistake (P2)', () => {
    expect(parseMcpPaste('[mcp_servers.a]\ncommand = "unterminated\n')).toEqual({
      ok: false,
      error: 'unreadable',
      line: 2,
    })
  })
})

describe('parseMcpPaste: names', () => {
  it('suggests a valid, free name and says it changed', () => {
    const [s] = servers(JSON.stringify({ mcpServers: { 'korean law!': { command: 'x' } } }))
    expect(s.name).toBe('korean-law')
    expect(s.nameChanged).toBe(true)
    expect(s.pastedName).toBe('korean law!')
  })

  it('avoids names already registered and names earlier in the same paste', () => {
    const list = servers(
      JSON.stringify({ mcpServers: { law: { command: 'x' }, 'law!': { command: 'y' } } }),
      ['LAW'],
    )
    expect(list.map((s) => s.name)).toEqual(['law-2', 'law-3'])
    expect(list.every((s) => s.nameChanged)).toBe(true)
  })

  it('refuses the app server name', () => {
    const [s] = servers(JSON.stringify({ mcpServers: { 'ieumoffice-editor': { command: 'x' } } }))
    expect(s.name).not.toBe('ieumoffice-editor')
    expect(s.nameChanged).toBe(true)
  })
})

describe('parseMcpPaste: problems', () => {
  it('flags a server with neither command nor address', () => {
    const [s] = servers(JSON.stringify({ mcpServers: { a: { args: ['x'] } } }))
    expect(s.problem).toBe('no-target')
  })

  it('sets an unknown type aside and says so, instead of refusing quietly (P3)', () => {
    const [s] = servers(
      JSON.stringify({ mcpServers: { a: { type: 'websocket', url: 'https://x.example/mcp' } } }),
    )
    expect(s.problem).toBeNull()
    expect(s.typeIgnored).toBe('websocket')
    expect(s.transport).toBe('auto')
    const [local] = servers(JSON.stringify({ mcpServers: { b: { type: 'local', command: 'x' } } }))
    expect(local.typeIgnored).toBe('local')
    expect(local.problem).toBeNull()
  })

  it('takes the types it can connect with without a word (P3)', () => {
    const list = servers(
      JSON.stringify({
        mcpServers: {
          a: { type: 'sse', url: 'https://a.example/sse' },
          b: { type: 'streamable_http', url: 'https://b.example/mcp' },
          c: { type: 'stdio', command: 'x' },
        },
      }),
    )
    expect(list.map((s) => [s.typeIgnored, s.transport])).toEqual([
      [null, 'sse'],
      [null, 'auto'],
      [null, 'auto'],
    ])
  })

  it('reports empty text, unreadable text and no servers', () => {
    expect(parseMcpPaste('   ')).toEqual({ ok: false, error: 'empty' })
    expect(parseMcpPaste('{ not json')).toMatchObject({ ok: false, error: 'unreadable' })
    expect(parseMcpPaste('{"mcpServers": {}}')).toEqual({ ok: false, error: 'no-servers' })
    expect(parseMcpPaste('hello there')).toEqual({ ok: false, error: 'unreadable' })
  })

  it('does not let a __proto__ key reach an object prototype', () => {
    const [s] = servers(
      '{"mcpServers":{"a":{"command":"x","env":{"__proto__":{"polluted":true},"K":"v"}}}}',
    )
    expect(s.env).toEqual({ K: 'v' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('parseMcpPaste: values taken from PC variables (B2)', () => {
  it('never keeps ${VAR} as a key: the key field asks for it instead', () => {
    const [s] = servers(
      JSON.stringify({
        mcpServers: {
          dict: {
            type: 'http',
            url: 'https://dict.example.com/mcp',
            headers: { Authorization: 'Bearer ${DICT_API_KEY}', 'X-Team': '${env:TEAM_ID}' },
          },
        },
      }),
    )
    expect(s.headers.Authorization).toBeUndefined()
    expect(s.keyNeeded).toBe(true)
    expect(s.keyEnvVar).toBe('DICT_API_KEY')
    expect(s.headers['X-Team']).toBe('')
    expect(s.headerVars).toEqual({ 'X-Team': 'TEAM_ID' })
    expect(JSON.stringify(s)).not.toContain('${')
  })

  it('leaves a variable value written as ${VAR} empty and names the variable', () => {
    process.env.API_KEY = 'from-the-pc'
    try {
      const [s] = servers(
        JSON.stringify({
          mcpServers: {
            notes: {
              command: 'node',
              args: ['server.js'],
              env: { API_KEY: '${API_KEY}', MODE: 'fast', OTHER: 'x-${env:OTHER_KEY}' },
            },
          },
        }),
      )
      expect(s.env).toEqual({ API_KEY: '', MODE: 'fast', OTHER: '' })
      expect(s.envVars).toEqual({ API_KEY: 'API_KEY', OTHER: 'OTHER_KEY' })
      // the PC is never read
      expect(JSON.stringify(s)).not.toContain('from-the-pc')
    } finally {
      delete process.env.API_KEY
    }
  })

  it('keeps values that only look a little like a placeholder', () => {
    const [s] = servers(
      JSON.stringify({ mcpServers: { a: { command: 'x', env: { A: '$HOME', B: '{x}' } } } }),
    )
    expect(s.env).toEqual({ A: '$HOME', B: '{x}' })
    expect(s.envVars).toEqual({})
  })
})

describe('parseMcpPaste: where a JSON mistake is (P2)', () => {
  it('names the line of a trailing comma, counted in the pasted text', () => {
    const text = [
      '{',
      '  "mcpServers": {',
      '    "dict": { "url": "https://d.example/mcp" },',
      '  }',
      '}',
    ].join('\n')
    expect(parseMcpPaste(text)).toEqual({ ok: false, error: 'unreadable', line: 4 })
    // a fence and prose before it do not shift the count off the paste
    const fenced = `Add this:\n\n\`\`\`json\n${text}\n\`\`\``
    expect(parseMcpPaste(fenced)).toEqual({ ok: false, error: 'unreadable', line: 7 })
  })

  it('names no line for text that is not settings at all', () => {
    expect(parseMcpPaste('npx -y @example/dict-mcp --key YOUR_KEY')).toEqual({
      ok: false,
      error: 'unreadable',
    })
  })
})

describe('parseMcpPaste: names from the address or the command (P7)', () => {
  it('makes a name from the host or the package when the pasted one has no letters to keep', () => {
    const list = servers(
      JSON.stringify({
        mcpServers: {
          '내 사전': { url: 'https://dict.example.com/mcp' },
          법령: { command: 'npx', args: ['-y', '@scope/korean-law-mcp@1.2.0'] },
          메모: { command: 'node', args: ['C:/tools/notes-server.mjs'] },
          숫자: { url: 'http://127.0.0.1:9000/mcp' },
        },
      }),
    )
    expect(list.map((s) => s.name)).toEqual(['dict', 'korean-law-mcp', 'notes-server', 'server'])
    expect(list.every((s) => s.nameChanged)).toBe(true)
  })
})
