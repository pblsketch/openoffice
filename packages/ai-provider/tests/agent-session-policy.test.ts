/**
 * The agent-mode policy: what goes ahead, what asks the person, and what is
 * refused whatever the person chose.
 */
import { describe, expect, it } from 'vitest'
import {
  agentPolicyVerdict,
  comparablePath,
  isInsidePath,
  webHostOf,
  type AgentAction,
  type AgentPolicyContext,
} from '../src/agent-session'

const ctx = (overrides: Partial<AgentPolicyContext> = {}): AgentPolicyContext => ({
  mode: 'ask-commands',
  projectRoot: 'C:\\Users\\me\\Project',
  openDocuments: ['C:\\Users\\me\\Project\\report.docx', 'C:\\Users\\me\\Project\\notes.md'],
  protectedPaths: ['C:\\Users\\me\\.codex', 'C:\\Users\\me\\AppData\\Roaming\\IeumOffice'],
  skillBundleDir: 'C:\\Temp\\ieum-skills-1',
  platform: 'win32',
  ...overrides,
})

const action = (overrides: Partial<AgentAction>): AgentAction => ({
  kind: 'other',
  tool: 'X',
  paths: [],
  ...overrides,
})

describe('paths', () => {
  it('compares Windows paths without regard to case or separator', () => {
    expect(comparablePath('c:/users/ME/project/a.txt', 'C:\\', 'win32')).toBe(
      comparablePath('C:\\Users\\me\\Project\\A.TXT', 'C:\\', 'win32'),
    )
  })

  it('does not take a sibling folder with a shared prefix as inside', () => {
    expect(isInsidePath('C:\\a\\project-old\\x', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('C:\\a\\project\\x', 'C:\\a\\project', 'win32')).toBe(true)
    expect(isInsidePath('C:\\a\\project', 'C:\\a\\project', 'win32')).toBe(true)
  })

  it('takes a name that only starts with ".." as inside, on both systems', () => {
    for (const name of ['..x', '...', '..config']) {
      expect(isInsidePath(`C:\\a\\project\\${name}\\f.md`, 'C:\\a\\project', 'win32'), name).toBe(
        true,
      )
      expect(isInsidePath(`C:\\a\\project\\${name}`, 'C:\\a\\project', 'win32'), name).toBe(true)
      expect(isInsidePath(`/a/project/${name}/f.md`, '/a/project', 'linux'), name).toBe(true)
      expect(isInsidePath(`/a/project/${name}`, '/a/project', 'linux'), name).toBe(true)
    }
  })

  it('still takes the parent, a way up, another drive and a share as outside', () => {
    expect(isInsidePath('C:\\a', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('C:\\a\\other\\f.md', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('C:\\a\\..x', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('D:\\a\\project\\f.md', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('\\\\server\\share\\f.md', 'C:\\a\\project', 'win32')).toBe(false)
    expect(isInsidePath('/a', '/a/project', 'linux')).toBe(false)
    expect(isInsidePath('/a/other/f.md', '/a/project', 'linux')).toBe(false)
    expect(isInsidePath('/a/..x', '/a/project', 'linux')).toBe(false)
    expect(isInsidePath('/a/project', '/a/project', 'linux')).toBe(true)
  })

  it('resolves a relative path against the command folder, then the project', () => {
    const verdict = agentPolicyVerdict(
      action({ kind: 'write', tool: 'Write', paths: ['..\\outside.txt'] }),
      ctx(),
    )
    expect(verdict).toEqual({ decision: 'deny', reason: 'outside-project' })
  })
})

describe('writes', () => {
  it('go ahead inside the project when only commands ask', () => {
    expect(
      agentPolicyVerdict(action({ kind: 'write', tool: 'Write', paths: ['sub\\new.md'] }), ctx()),
    ).toEqual({ decision: 'allow' })
  })

  it('ask when writes ask', () => {
    expect(
      agentPolicyVerdict(
        action({ kind: 'write', tool: 'Write', paths: ['new.md'] }),
        ctx({ mode: 'ask-writes' }),
      ),
    ).toEqual({ decision: 'ask' })
  })

  it('never write a document open in a tab, in any mode', () => {
    for (const mode of ['ask-commands', 'ask-writes', 'trust-project'] as const) {
      expect(
        agentPolicyVerdict(
          action({ kind: 'write', tool: 'Edit', paths: ['C:/users/me/project/NOTES.md'] }),
          ctx({ mode }),
        ),
      ).toEqual({ decision: 'deny', reason: 'open-document' })
    }
  })

  it('never write outside the project, even when the project is trusted', () => {
    expect(
      agentPolicyVerdict(
        action({ kind: 'write', tool: 'Write', paths: ['C:\\Users\\me\\Documents\\x.txt'] }),
        ctx({ mode: 'trust-project' }),
      ),
    ).toEqual({ decision: 'deny', reason: 'outside-project' })
  })

  it('do not count the skill copy as a place to write', () => {
    expect(
      agentPolicyVerdict(
        action({ kind: 'write', tool: 'Write', paths: ['C:\\Temp\\ieum-skills-1\\a\\SKILL.md'] }),
        ctx(),
      ),
    ).toEqual({ decision: 'deny', reason: 'outside-project' })
  })
})

describe('reads', () => {
  it('go ahead inside the project and the skill copy', () => {
    expect(
      agentPolicyVerdict(action({ kind: 'read', tool: 'Read', paths: ['a.md'] }), ctx()),
    ).toEqual({ decision: 'allow' })
    expect(
      agentPolicyVerdict(
        action({ kind: 'read', tool: 'Read', paths: ['C:\\Temp\\ieum-skills-1\\pdf\\SKILL.md'] }),
        ctx(),
      ),
    ).toEqual({ decision: 'allow' })
  })

  it('ask outside the project, even when the project is trusted', () => {
    expect(
      agentPolicyVerdict(
        action({ kind: 'read', tool: 'Read', paths: ['D:\\elsewhere\\a.txt'] }),
        ctx({ mode: 'trust-project' }),
      ),
    ).toEqual({ decision: 'ask' })
  })
})

describe('protected paths', () => {
  it('refuse a read, a write and a command that names them', () => {
    for (const a of [
      action({ kind: 'read', tool: 'Read', paths: ['C:\\Users\\me\\.codex\\config.toml'] }),
      action({ kind: 'write', tool: 'Write', paths: ['C:\\Users\\me\\.codex\\x'] }),
      action({ kind: 'command', tool: 'Bash', command: 'cat c:/users/me/.codex/config.toml' }),
      // as Codex reports it: quoted, every backslash doubled
      action({
        kind: 'command',
        tool: 'commandExecution',
        command: '"powershell.exe" -Command "type C:\\\\Users\\\\me\\\\.codex\\\\config.toml"',
      }),
    ]) {
      expect(agentPolicyVerdict(a, ctx({ mode: 'trust-project' }))).toEqual({
        decision: 'deny',
        reason: 'protected-path',
      })
    }
  })
})

describe('names that only start with ".."', () => {
  it('are inside the project: reads and writes go ahead', () => {
    for (const path of ['..x\\a.md', 'C:\\Users\\me\\Project\\...\\a.md']) {
      expect(
        agentPolicyVerdict(action({ kind: 'read', tool: 'Read', paths: [path] }), ctx()),
        path,
      ).toEqual({ decision: 'allow' })
      expect(
        agentPolicyVerdict(action({ kind: 'write', tool: 'Write', paths: [path] }), ctx()),
        path,
      ).toEqual({ decision: 'allow' })
    }
  })

  it('are inside a protected folder: refused, in any mode', () => {
    for (const mode of ['ask-commands', 'ask-writes', 'trust-project'] as const) {
      for (const path of [
        'C:\\Users\\me\\.codex\\..x\\config.toml',
        'C:\\Users\\me\\AppData\\Roaming\\IeumOffice\\..config\\ai-settings.json',
      ]) {
        expect(
          agentPolicyVerdict(action({ kind: 'read', tool: 'Read', paths: [path] }), ctx({ mode })),
          `${mode} ${path}`,
        ).toEqual({ decision: 'deny', reason: 'protected-path' })
      }
    }
  })

  it('are inside a protected folder on macOS and Linux too', () => {
    expect(
      agentPolicyVerdict(
        action({ kind: 'read', tool: 'Read', paths: ['/home/me/.claude/..x/notes.json'] }),
        ctx({
          projectRoot: '/home/me/Project',
          openDocuments: [],
          protectedPaths: ['/home/me/.claude'],
          skillBundleDir: undefined,
          platform: 'linux',
        }),
      ),
    ).toEqual({ decision: 'deny', reason: 'protected-path' })
  })
})

describe('commands', () => {
  it('ask unless the project is trusted', () => {
    const run = action({ kind: 'command', tool: 'Bash', command: 'python make.py' })
    expect(agentPolicyVerdict(run, ctx())).toEqual({ decision: 'ask' })
    expect(agentPolicyVerdict(run, ctx({ mode: 'ask-writes' }))).toEqual({ decision: 'ask' })
    expect(agentPolicyVerdict(run, ctx({ mode: 'trust-project' }))).toEqual({ decision: 'allow' })
  })
})

describe('other actions', () => {
  it('let skills and the app tools through, and ask about anything unknown', () => {
    expect(agentPolicyVerdict(action({ kind: 'skill', tool: 'Skill' }), ctx())).toEqual({
      decision: 'allow',
    })
    expect(agentPolicyVerdict(action({ kind: 'app-tool', tool: 'mcp__x' }), ctx())).toEqual({
      decision: 'allow',
    })
    expect(
      agentPolicyVerdict(
        action({ kind: 'other', tool: 'WebFetch' }),
        ctx({ mode: 'trust-project' }),
      ),
    ).toEqual({ decision: 'ask' })
  })
})

describe('the web', () => {
  const modes = ['ask-commands', 'ask-writes', 'trust-project'] as const
  const search = action({ kind: 'web-search', tool: 'WebSearch', target: 'tides' })
  const fetch = (url: string) =>
    action({ kind: 'web-fetch', tool: 'WebFetch', target: url, host: webHostOf(url) })

  it('asks the first time, in every mode', () => {
    for (const mode of modes) {
      expect(agentPolicyVerdict(search, ctx({ mode }))).toEqual({ decision: 'ask' })
      expect(agentPolicyVerdict(fetch('https://example.com/a'), ctx({ mode }))).toEqual({
        decision: 'ask',
      })
    }
  })

  it('lets every search through once searches are allowed for the session', () => {
    const allowances = { webSearch: true, webHosts: new Set<string>() }
    for (const mode of modes) {
      expect(agentPolicyVerdict(search, ctx({ mode, allowances }))).toEqual({ decision: 'allow' })
      // searches allowed do not open pages
      expect(agentPolicyVerdict(fetch('https://example.com/'), ctx({ mode, allowances }))).toEqual({
        decision: 'ask',
      })
    }
  })

  it('lets the pages of an allowed site through, and only that site', () => {
    const allowances = { webSearch: false, webHosts: new Set(['example.com']) }
    expect(agentPolicyVerdict(fetch('https://EXAMPLE.com/x'), ctx({ allowances }))).toEqual({
      decision: 'allow',
    })
    expect(agentPolicyVerdict(fetch('http://example.com:8080/y'), ctx({ allowances }))).toEqual({
      decision: 'allow',
    })
    expect(agentPolicyVerdict(fetch('https://docs.example.com/'), ctx({ allowances }))).toEqual({
      decision: 'ask',
    })
    expect(agentPolicyVerdict(fetch('https://example.com.evil.net/'), ctx({ allowances }))).toEqual(
      { decision: 'ask' },
    )
    expect(agentPolicyVerdict(search, ctx({ allowances }))).toEqual({ decision: 'ask' })
    // an address with no site is asked every time
    expect(
      agentPolicyVerdict(
        action({ kind: 'web-fetch', tool: 'WebFetch', target: 'not a url' }),
        ctx({ allowances }),
      ),
    ).toEqual({ decision: 'ask' })
  })

  it('reads the site of http and https addresses only', () => {
    expect(webHostOf('https://Example.COM/a')).toBe('example.com')
    expect(webHostOf('file:///C:/secret.txt')).toBeUndefined()
    expect(webHostOf('not a url')).toBeUndefined()
    expect(webHostOf(undefined)).toBeUndefined()
  })

  it('leaves the protected folders refused, whatever was allowed', () => {
    const allowances = { webSearch: true, webHosts: new Set(['example.com']) }
    expect(
      agentPolicyVerdict(
        action({ kind: 'read', tool: 'Read', paths: [String.raw`C:\Users\me\.codex\auth.json`] }),
        ctx({ mode: 'trust-project', allowances }),
      ),
    ).toEqual({ decision: 'deny', reason: 'protected-path' })
  })
})
