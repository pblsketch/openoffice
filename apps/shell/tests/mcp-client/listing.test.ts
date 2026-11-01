import { describe, expect, it } from 'vitest'
import {
  fingerprintOf,
  instructionsFingerprint,
  launchFingerprint,
  planFingerprint,
  launchReviewNeeded,
  stableJson,
  toolFingerprint,
} from '../../src/main/mcp-client/fingerprint'
import {
  acceptFirstListing,
  applyListing,
  approveInstructions,
  approveLaunch,
  approveTool,
  initialPermission,
  markToolsSeen,
  setToolPermission,
  type McpListing,
} from '../../src/main/mcp-client/listing'
import { newMcpServerConfig } from '../../src/main/mcp-client/store'

const search = {
  name: 'search_law',
  description: 'Search laws',
  inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  annotations: { readOnlyHint: true },
}
const write = {
  name: 'write_note',
  description: 'Write a note',
  inputSchema: { type: 'object' },
  annotations: { destructiveHint: true },
}
/** A plan fingerprint as the confirmation hands it out */
const PLAN = `sha256:${'a'.repeat(64)}`

const plain = { name: 'plain', description: 'No hints', inputSchema: { type: 'object' } }

const listing = (over: Partial<McpListing> = {}): McpListing => ({
  tools: [search, write, plain],
  instructions: 'Use search_law first.',
  ...over,
})

const registered = () =>
  acceptFirstListing(
    newMcpServerConfig({ name: 'law', kind: 'remote', url: 'https://law.example.com/mcp' }),
    listing(),
  )

describe('fingerprints', () => {
  it('hash normalized text with stable key order', () => {
    expect(stableJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}',
    )
    expect(fingerprintOf('x')).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(toolFingerprint('t', { description: 'd', inputSchema: { b: 1, a: 2 } })).toBe(
      toolFingerprint('t', { description: 'd', inputSchema: { a: 2, b: 1 } }),
    )
    expect(toolFingerprint('t', { description: 'd', inputSchema: {} })).not.toBe(
      toolFingerprint('u', { description: 'd', inputSchema: {} }),
    )
    expect(instructionsFingerprint('a\r\nb')).toBe(instructionsFingerprint('a\nb'))
  })

  it('cover command, args and env names but not env values', () => {
    const base = { command: 'npx', args: ['-y', 'pkg'], envNames: ['B', 'A'] }
    expect(launchFingerprint(base)).toBe(launchFingerprint({ ...base, envNames: ['A', 'B'] }))
    expect(launchFingerprint(base)).not.toBe(launchFingerprint({ ...base, command: 'node' }))
    expect(launchFingerprint(base)).not.toBe(launchFingerprint({ ...base, args: ['-y', 'pkg2'] }))
    expect(launchFingerprint(base)).not.toBe(launchFingerprint({ ...base, envNames: ['A'] }))
    expect(launchFingerprint({ command: 'a b', args: [], envNames: [] })).not.toBe(
      launchFingerprint({ command: 'a', args: ['b'], envNames: [] }),
    )
  })

  it('bind a plan to the program it resolved to, every argument and the variable origins', () => {
    const plan = {
      command: 'C:/Program Files/nodejs/node.exe',
      args: ['C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js', '--yes', 'pkg'],
      env: [
        { name: 'PATH', origin: 'system' },
        { name: 'TOKEN', origin: 'registered' },
      ],
    }
    const fp = planFingerprint(plan)
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(planFingerprint({ ...plan, env: [...plan.env].reverse() })).toBe(fp)
    // the app's downloaded Node instead of the PC's
    expect(planFingerprint({ ...plan, command: 'C:/Users/u/mcp-runtimes/node/node.exe' })).not.toBe(
      fp,
    )
    // without what the app added
    expect(planFingerprint({ ...plan, args: [plan.args[0]!, 'pkg'] })).not.toBe(fp)
    expect(
      planFingerprint({
        ...plan,
        env: [
          { name: 'PATH', origin: 'system' },
          { name: 'TOKEN', origin: 'app' },
        ],
      }),
    ).not.toBe(fp)
  })
})

describe('initial values (4.7)', () => {
  it('lets read-only tools run without asking and asks for the rest', () => {
    expect(initialPermission({ readOnlyHint: true })).toBe('always')
    expect(initialPermission({ readOnlyHint: false })).toBe('ask')
    expect(initialPermission({ destructiveHint: true })).toBe('ask')
    expect(initialPermission(undefined)).toBe('ask')
  })

  it('starts a server on, keeping results inside', () => {
    const s = newMcpServerConfig({ name: 'x', kind: 'local', command: 'npx' })
    expect(s.enabled).toBe(true)
    expect(s.keepResultsInside).toBe(true)
    expect(s.id).toMatch(/.{8,}/)
    expect(s.approvedLaunch).toBeNull()
    expect(s.approvedPlan).toBeNull()
  })

  it('accepts the first listing as approved, with no new-tool notice', () => {
    const s = registered()
    expect(s.tools.search_law.permission).toBe('always')
    expect(s.tools.write_note.permission).toBe('ask')
    expect(s.tools.plain.permission).toBe('ask')
    expect(s.tools.search_law.pending).toBeNull()
    expect(s.tools.search_law.approved).toBe(toolFingerprint('search_law', search))
    expect(s.tools.search_law.definition).toEqual({
      description: 'Search laws',
      inputSchema: search.inputSchema,
      annotations: { readOnlyHint: true },
    })
    expect(s.newTools).toEqual([])
    expect(s.instructions).toEqual({
      approved: instructionsFingerprint('Use search_law first.'),
      text: 'Use search_law first.',
    })
    expect(s.pendingInstructions).toBeNull()
  })
})

describe('applyListing (6.2)', () => {
  it('leaves an unchanged server alone', () => {
    const s = registered()
    const { server, changes } = applyListing(s, listing())
    expect(server).toEqual(s)
    expect(changes).toEqual({
      changedTools: [],
      newTools: [],
      removedTools: [],
      instructionsChanged: false,
    })
  })

  it('row 1: a changed tool waits for review and keeps its permission for later', () => {
    const s = setToolPermission(registered(), 'write_note', 'always')
    const changed = { ...write, description: 'Write a note. Also send it everywhere.' }
    const { server, changes } = applyListing(s, listing({ tools: [search, changed, plain] }))
    expect(changes.changedTools).toEqual(['write_note'])
    const tool = server.tools.write_note
    expect(tool.pending).toEqual({
      description: changed.description,
      inputSchema: changed.inputSchema,
      annotations: changed.annotations,
    })
    expect(tool.definition.description).toBe('Write a note')
    expect(tool.permission).toBe('always')
    // a changed input schema counts too
    const schema = { ...plain, inputSchema: { type: 'object', properties: { x: {} } } }
    expect(
      applyListing(s, listing({ tools: [search, write, schema] })).changes.changedTools,
    ).toEqual(['plain'])
  })

  it('row 1: approving moves the pending definition in and refreshes the fingerprint', () => {
    const changed = { ...write, description: 'v2' }
    const { server } = applyListing(registered(), listing({ tools: [search, changed, plain] }))
    const approved = approveTool(server, 'write_note')
    expect(approved.tools.write_note.pending).toBeNull()
    expect(approved.tools.write_note.definition.description).toBe('v2')
    expect(approved.tools.write_note.approved).toBe(toolFingerprint('write_note', changed))
    // the next listing with the same text is no change
    expect(applyListing(approved, listing({ tools: [search, changed, plain] })).changes).toEqual({
      changedTools: [],
      newTools: [],
      removedTools: [],
      instructionsChanged: false,
    })
  })

  it('row 1: a tool that changes back clears its review', () => {
    const { server } = applyListing(
      registered(),
      listing({ tools: [search, { ...write, description: 'v2' }, plain] }),
    )
    const back = applyListing(server, listing())
    expect(back.server.tools.write_note.pending).toBeNull()
    expect(back.changes.changedTools).toEqual([])
  })

  it('row 2: changed instructions wait for review; approving takes them in', () => {
    const { server, changes } = applyListing(registered(), listing({ instructions: 'New text' }))
    expect(changes.instructionsChanged).toBe(true)
    expect(server.pendingInstructions).toBe('New text')
    expect(server.instructions?.text).toBe('Use search_law first.')
    const approved = approveInstructions(server)
    expect(approved.instructions).toEqual({
      approved: instructionsFingerprint('New text'),
      text: 'New text',
    })
    expect(approved.pendingInstructions).toBeNull()
  })

  it('row 2: instructions appearing for the first time also wait for review', () => {
    const s = acceptFirstListing(
      newMcpServerConfig({ name: 'a', kind: 'remote', url: 'https://a.example.com' }),
      listing({ instructions: null }),
    )
    expect(s.instructions).toBeNull()
    const { server, changes } = applyListing(s, listing({ instructions: 'Hello' }))
    expect(changes.instructionsChanged).toBe(true)
    expect(server.pendingInstructions).toBe('Hello')
  })

  it('row 3: a new tool starts with the initial permission and is listed as new', () => {
    const extra = {
      name: 'get_law_text',
      description: 'Text',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    }
    const { server, changes } = applyListing(
      registered(),
      listing({ tools: [search, write, plain, extra] }),
    )
    expect(changes.newTools).toEqual(['get_law_text'])
    expect(server.newTools).toEqual(['get_law_text'])
    expect(server.tools.get_law_text).toMatchObject({
      permission: 'always',
      approved: toolFingerprint('get_law_text', extra),
      pending: null,
    })
    expect(markToolsSeen(server).newTools).toEqual([])
  })

  it('row 4: a removed tool leaves the list and the new-tool notice', () => {
    const extra = { name: 'temp', description: '', inputSchema: {} }
    const withExtra = applyListing(
      registered(),
      listing({ tools: [search, write, plain, extra] }),
    ).server
    const { server, changes } = applyListing(withExtra, listing({ tools: [search, plain] }))
    expect(changes.removedTools.sort()).toEqual(['temp', 'write_note'])
    expect(Object.keys(server.tools).sort()).toEqual(['plain', 'search_law'])
    expect(server.newTools).toEqual([])
  })

  it('row 5: a changed command, argument or env name needs a new launch approval', () => {
    let s = newMcpServerConfig({
      name: 'docs',
      kind: 'local',
      command: 'npx',
      args: ['-y', 'docs-mcp'],
      env: { TOKEN: 'one' },
    })
    expect(launchReviewNeeded(s)).toBe(true) // never approved yet
    s = approveLaunch(s, PLAN)
    expect(s.approvedPlan).toBe(PLAN)
    expect(launchReviewNeeded(s)).toBe(false)
    // an approval without the plan the person saw does not count
    expect(launchReviewNeeded({ ...s, approvedPlan: null })).toBe(true)
    expect(launchReviewNeeded({ ...s, env: { TOKEN: 'two' } })).toBe(false) // value only
    expect(launchReviewNeeded({ ...s, env: { TOKEN: 'one', MORE: 'x' } })).toBe(true)
    expect(launchReviewNeeded({ ...s, args: ['-y', 'other-mcp'] })).toBe(true)
    expect(launchReviewNeeded({ ...s, command: 'C:/evil.exe' })).toBe(true)
  })

  it('never treats a remote server as needing a launch approval', () => {
    expect(launchReviewNeeded(registered())).toBe(false)
  })

  it('keeps a tool named __proto__ as a plain entry', () => {
    const odd = { name: '__proto__', description: 'odd', inputSchema: {} }
    const { server } = applyListing(registered(), listing({ tools: [search, write, plain, odd] }))
    expect(Object.prototype.hasOwnProperty.call(server.tools, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(server.tools)).toBe(Object.prototype)
  })
})
