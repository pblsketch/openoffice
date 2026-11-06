/**
 * The person's skills in the agent window (spec 6.2 to 6.6, 9.4): the session
 * MCP server's 13 tools, the two skill tools that only show something, the
 * three management calls the agent window may make, a chip's instruction,
 * the template candidates and their redaction check, the one-time notice and
 * the "next session" line. Nothing here starts a program or calls a model.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AGENT_APP_MCP_TOOLS } from '@genoffice/ai-provider/agent-session'
import { USER_SKILLS_CHANNELS as C } from '@genoffice/electron-utils/user-skills-channels'
import {
  AGENT_MCP_TOOL_NAMES,
  buildAgentMcpTools,
  createAgentSkillTools,
  startAgentMcpServer,
} from '../../src/main/agent/agent-mcp'
import {
  AGENT_WINDOW_MANAGE_CHANNELS,
  agentSessionSkillsOf,
  agentSkillProposalOf,
  agentTemplateCandidates,
  projectTemplateFiles,
  readTemplateCandidate,
  templateRedactionOf,
  userSkillsManageGate,
} from '../../src/main/agent/agent-skills'
import { AGENT_CHANNELS, type AgentSessionSkill } from '../../src/shared/agent-api'
import {
  agentPickerSkillsRaw,
  agentSkillInstruction,
  agentSkillNoticeShown,
  agentSkillRequest,
} from '../../src/renderer/src/agent/agent-skills-model'
import {
  EMPTY_AGENT_LOG,
  agentLogAfterSend,
  agentLogAfterSkillsChanged,
  agentLogWith,
  agentLogWithSkillItem,
} from '../../src/renderer/src/agent/agent-log'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
  shell: {},
}))
const { agentSkillToolsFor } = await import('../../src/main/agent/agent-window')

const roots: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-skills-test-'))
  roots.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Every file under a folder, `/` between parts */
function filesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...filesUnder(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out.sort()
}

const SKILL: AgentSessionSkill = {
  id: 'app:minutes',
  name: 'minutes',
  source: 'app',
  plugin: undefined,
  title: 'Meeting minutes',
  description: 'Writes minutes.',
  invoke: 'auto',
  skillMd: 'C:\\Users\\me\\AppData\\Local\\IeumOffice\\agent-skills\\skills\\minutes\\SKILL.md',
  template: undefined,
}

/** the editors' controls as the shell wires them; no tool is run here */
const CONTROLS = {
  docsControl: {} as never,
  sheetsControl: {} as never,
  slidesControl: {} as never,
  openDocumentsControl: { list: async () => [] } as never,
  resolveTarget: async () => ({ id: 1 }) as never,
}

describe('the session MCP server', () => {
  it('has the 13 tools, the same list the programs’ start checks hold a session to', () => {
    expect(AGENT_MCP_TOOL_NAMES).toHaveLength(13)
    expect([...AGENT_MCP_TOOL_NAMES]).toEqual([...AGENT_APP_MCP_TOOLS])
    const names = buildAgentMcpTools(
      { version: '0.0.0', defaultSaveDir: () => 'C:\\Out', ...CONTROLS },
      'C:\\Users\\me\\Project',
      'win32',
    ).map((tool) => tool.name)
    expect(names.sort()).toEqual([...AGENT_MCP_TOOL_NAMES].sort())
  })

  it('lists the 13 tools to a client that connects with the token (no program, no model)', async () => {
    const project = temp()
    const server = await startAgentMcpServer(
      { version: '0.0.0', defaultSaveDir: () => project, ...CONTROLS },
      project,
    )
    const client = new Client({ name: 'test', version: '0.0.0' })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers: { Authorization: `Bearer ${server.token}` } },
        }),
      )
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name).sort()).toEqual([...AGENT_APP_MCP_TOOLS].sort())
    } finally {
      await client.close().catch(() => undefined)
      await server.stop()
    }
  })

  it('refuses the two skill tools when no agent window is behind the session', async () => {
    const [propose, install] = createAgentSkillTools()
    await expect(
      Promise.resolve(propose!.handler({ title: 'T', description: 'D', body: 'B' })),
    ).rejects.toThrow(/not available/)
    await expect(Promise.resolve(install!.handler({ address: 'a/b@c' }))).rejects.toThrow(
      /not available/,
    )
  })
})

describe('propose_skill', () => {
  function tools(project: string, sent: Array<[string, unknown]>, window = true) {
    const kept: unknown[] = []
    const hooks = agentSkillToolsFor({ ownerId: 7, sessionId: 's1' }, project, {
      window: () => (window ? { send: (channel, payload) => sent.push([channel, payload]) } : null),
      listSkills: async () => [
        { id: 'app:minutes', source: 'app', name: 'minutes', title: 'Minutes', owned: true },
        { id: 'builtin:letter', source: 'builtin', name: 'letter', title: 'Letter', owned: false },
      ],
      keep: (shown) => kept.push(shown),
      newKey: () => 'k1',
    })
    const all = createAgentSkillTools(hooks, async () => [
      { title: 'open.docx', filePath: join(project, 'open.docx'), dirty: true },
      { title: 'Untitled', dirty: true },
    ])
    return { propose: all[0]!, install: all[1]!, kept }
  }

  it('shows the card in the agent window and writes nothing', async () => {
    const project = temp()
    writeFileSync(join(project, 'open.docx'), 'docx bytes')
    mkdirSync(join(project, 'forms'))
    writeFileSync(join(project, 'forms', 'report.hwpx'), 'hwpx bytes')
    writeFileSync(join(project, 'notes.bin'), 'not a document')
    const before = filesUnder(project)
    const sent: Array<[string, unknown]> = []
    const { propose, kept } = tools(project, sent)

    const result = await propose.handler({
      title: 'Report',
      description: 'Writes the weekly report.',
      body: 'Steps…',
      wantsTemplate: true,
      suggestedTemplatePath: 'forms/report.hwpx',
    })

    expect(String(result)).toMatch(/^Skill card shown: "Report"/)
    expect(String(result)).toMatch(/not saved yet/)
    expect(filesUnder(project)).toEqual(before)
    expect(sent).toHaveLength(1)
    const [channel, payload] = sent[0]! as [string, Record<string, any>]
    expect(channel).toBe(AGENT_CHANNELS.skillProposal)
    expect(payload.sessionId).toBe('s1')
    expect(payload.proposal).toMatchObject({ key: 'k1', title: 'Report', wantsTemplate: true })
    expect(payload.proposal.target).toBeUndefined()
    // the open tab first (unsaved), then the project's document files; no paths reach the window
    expect(payload.candidates).toEqual([
      { id: 'c0', title: 'open', fileName: 'open.docx', from: 'tab', unsaved: true },
      { id: 'c1', title: 'report', fileName: 'report.hwpx', from: 'project', unsaved: false },
    ])
    expect(JSON.stringify(payload)).not.toContain(project)
    expect(payload.selected).toBe('c1')
    expect(kept).toHaveLength(1)
  })

  it('names the skill a change is for, and refuses an unknown one', async () => {
    const project = temp()
    const sent: Array<[string, unknown]> = []
    const { propose } = tools(project, sent)
    await propose.handler({ title: 'L', description: 'D', body: 'B', targetId: 'builtin:letter' })
    expect((sent[0]![1] as Record<string, any>).proposal.target).toEqual({
      id: 'builtin:letter',
      name: 'letter',
      title: 'Letter',
      owned: false,
      source: 'builtin',
    })
    await expect(
      Promise.resolve(
        propose.handler({ title: 'L', description: 'D', body: 'B', targetId: 'app:nope' }),
      ),
    ).rejects.toThrow(/No skill/)
  })

  it('finds the skill a change is for by the name the session sees it under', async () => {
    const project = temp()
    const sent: Array<[string, unknown]> = []
    const hooks = agentSkillToolsFor({ ownerId: 7, sessionId: 's1' }, project, {
      window: () => ({ send: (channel, payload) => sent.push([channel, payload]) }),
      listSkills: async () => [
        { id: 'app:minutes', source: 'app', name: 'minutes', title: 'Minutes', owned: true },
        { id: 'builtin:minutes', source: 'builtin', name: 'minutes', title: 'M', owned: false },
      ],
      sessionSkills: () => [
        { id: 'app:minutes', name: 'minutes' },
        { id: 'builtin:minutes', name: 'minutes--builtin' },
      ],
      keep: () => undefined,
      newKey: () => 'k1',
    })
    const propose = createAgentSkillTools(hooks)[0]!
    for (const targetId of ['minutes--builtin', 'ieum-skills:minutes--builtin', 'minutes']) {
      await propose.handler({ title: 'L', description: 'D', body: 'B', targetId })
    }
    expect(sent.map(([, p]) => (p as Record<string, any>).proposal.target.id)).toEqual([
      'builtin:minutes',
      'builtin:minutes',
      'app:minutes',
    ])
  })

  it('refuses an empty card and a closed window', async () => {
    const project = temp()
    const sent: Array<[string, unknown]> = []
    await expect(
      Promise.resolve(tools(project, sent).propose.handler({ title: ' ', body: 'B' })),
    ).rejects.toThrow(/title/)
    await expect(
      Promise.resolve(
        tools(project, sent, false).propose.handler({ title: 'T', description: 'D', body: 'B' }),
      ),
    ).rejects.toThrow(/closed/)
    expect(sent).toEqual([])
  })
})

describe('propose_skill_install', () => {
  it('only shows the address in the agent window; installing waits for the person', async () => {
    const sent: Array<[string, unknown]> = []
    const hooks = agentSkillToolsFor({ ownerId: 7, sessionId: 's1' }, temp(), {
      window: () => ({ send: (channel, payload) => sent.push([channel, payload]) }),
      keep: () => undefined,
      newKey: () => 'k2',
    })
    const install = createAgentSkillTools(hooks)[1]!
    const result = await install.handler({ address: 'vercel-labs/skills@find-skills' })
    expect(String(result)).toMatch(/Nothing is installed unless they open the preview/)
    expect(sent).toEqual([
      [
        AGENT_CHANNELS.installProposal,
        { sessionId: 's1', key: 'k2', address: 'vercel-labs/skills@find-skills' },
      ],
    ])
  })
})

describe('the skills gateway for the agent window', () => {
  const gate = userSkillsManageGate<string>({
    isMainWindow: (sender) => sender === 'main',
    isAgentWindow: (sender) => sender === 'agent',
  })

  it('lets the agent window make only the install-preview calls', () => {
    expect([...AGENT_WINDOW_MANAGE_CHANNELS].sort()).toEqual(
      [C.importGitHub, C.cancelImport, C.install].sort(),
    )
    for (const channel of [C.importGitHub, C.cancelImport, C.install]) {
      expect(gate('agent', channel)).toBe(true)
    }
    for (const channel of [
      C.setState,
      C.remove,
      C.copyToMine,
      C.save,
      C.importFolder,
      C.importZip,
      C.checkUpdate,
      C.applyUpdate,
      C.exportZip,
      C.openFolder,
      C.hideBuiltin,
      C.unhideBuiltins,
    ]) {
      expect(gate('agent', channel)).toBe(false)
    }
  })

  it('keeps every management call for the main window, and none for an editor', () => {
    for (const channel of Object.values(C)) expect(gate('main', channel)).toBe(true)
    expect(gate('editor', C.install)).toBe(false)
    expect(gate('editor', C.importGitHub)).toBe(false)
  })
})

describe('a chip in the agent window', () => {
  it('becomes the instruction to read the bundle copy’s SKILL.md, the same for both programs', () => {
    const request = agentSkillRequest(
      'Write this week’s minutes.',
      [{ id: 'app:minutes' }],
      [SKILL],
    )
    expect(request).toEqual({
      ok: true,
      text: `Use this skill: read ${SKILL.skillMd} and follow it.\n\nWrite this week’s minutes.`,
      titles: ['Meeting minutes'],
    })
  })

  it('keeps the title the chip showed, such as a default skill’s translated one', () => {
    const builtin = { ...SKILL, id: 'builtin:meeting-minutes', name: 'meeting-minutes', title: '' }
    const request = agentSkillRequest('go', [{ id: builtin.id, title: '회의록 정리' }], [builtin])
    expect(request).toEqual(expect.objectContaining({ ok: true, titles: ['회의록 정리'] }))
    const untitled = agentSkillRequest('go', [{ id: builtin.id }], [builtin])
    expect(untitled).toEqual(expect.objectContaining({ titles: ['meeting-minutes'] }))
  })

  it('carries a skill used only when called the same way', () => {
    const manual = { ...SKILL, id: 'claude:deck', name: 'deck', invoke: 'manual' as const }
    expect(agentSkillInstruction(manual)).toBe(
      `Use this skill: read ${manual.skillMd} and follow it.`,
    )
  })

  it('names the template and says to fill a copy in the project folder', () => {
    const withTemplate = {
      ...SKILL,
      template:
        'C:\\Users\\me\\AppData\\Local\\IeumOffice\\agent-skills\\skills\\minutes\\assets\\form.hwpx',
    }
    const text = agentSkillInstruction(withTemplate)
    expect(text).toContain(`Its template document is ${withTemplate.template}.`)
    expect(text).toMatch(/Copy it into the project folder under a new name and fill in the copy/)
  })

  it('is not sent around a skill the session does not hold', () => {
    expect(agentSkillRequest('x', [{ id: 'app:gone' }], [SKILL])).toEqual({
      ok: false,
      missing: ['app:gone'],
    })
    expect(agentSkillRequest('plain', [], [SKILL])).toEqual({ ok: true, text: 'plain', titles: [] })
  })

  it('lists the session’s skills, agent-only and template ones included', () => {
    const raw = agentPickerSkillsRaw([SKILL, { ...SKILL, id: 'project:x', template: 'C:\\t.docx' }])
    expect(raw).toEqual([
      expect.objectContaining({ id: 'app:minutes', enabled: true, templateExists: false }),
      expect.objectContaining({ id: 'project:x', enabled: true, templateExists: true }),
    ])
  })
})

describe('the session’s skills for the window', () => {
  it('give each copy’s SKILL.md and its copied template', async () => {
    const bundle = temp()
    const a = join(bundle, 'skills', 'form')
    mkdirSync(join(a, 'assets'), { recursive: true })
    writeFileSync(
      join(a, 'SKILL.md'),
      '---\nname: form\ndescription: d\nmetadata:\n  ieum-template: assets/form.docx\n---\nBody\n',
    )
    writeFileSync(join(a, 'assets', 'form.docx'), 'x')
    const b = join(bundle, 'skills', 'plain')
    mkdirSync(b, { recursive: true })
    writeFileSync(
      join(b, 'SKILL.md'),
      '---\nname: plain\ndescription: d\nmetadata:\n  ieum-template: ../escape.docx\n---\nBody\n',
    )
    const entry = (name: string, dir: string) => ({
      id: `app:${name}`,
      name,
      source: 'app' as const,
      plugin: undefined,
      title: name,
      description: 'd',
      invoke: 'auto' as const,
      skillMd: join(dir, 'SKILL.md'),
    })
    // a template outside `assets/` is not a template (the same rule as the skill list)
    const c = join(bundle, 'skills', 'loose')
    mkdirSync(c, { recursive: true })
    writeFileSync(
      join(c, 'SKILL.md'),
      '---\nname: loose\ndescription: d\nmetadata:\n  ieum-template: form.docx\n---\nBody\n',
    )
    writeFileSync(join(c, 'form.docx'), 'x')
    const skills = await agentSessionSkillsOf([
      entry('form', a),
      entry('plain', b),
      entry('loose', c),
    ])
    expect(skills[0]!.template).toBe(join(a, 'assets', 'form.docx'))
    expect(skills[1]!.template).toBeUndefined()
    expect(skills[2]!.template).toBeUndefined()
  })
})

describe('template candidates', () => {
  it('skip hidden folders, lock files and files the editors do not open', async () => {
    const project = temp()
    mkdirSync(join(project, '.git'))
    writeFileSync(join(project, '.git', 'a.md'), 'x')
    mkdirSync(join(project, 'node_modules'))
    writeFileSync(join(project, 'node_modules', 'b.md'), 'x')
    writeFileSync(join(project, '~$lock.docx'), 'x')
    writeFileSync(join(project, 'plan.md'), 'x')
    writeFileSync(join(project, 'tool.exe'), 'x')
    expect((await projectTemplateFiles(project)).map((p) => p.slice(project.length + 1))).toEqual([
      'plan.md',
    ])
  })

  it('take a suggestion outside the project folder as no choice', async () => {
    const project = temp()
    const outside = temp()
    writeFileSync(join(outside, 'secret.docx'), 'x')
    const { candidates, selected } = await agentTemplateCandidates({
      projectRoot: project,
      tabs: [],
      suggested: join(outside, 'secret.docx'),
    })
    expect(candidates).toEqual([])
    expect(selected).toBeUndefined()
  })

  it('take a suggestion in a project folder whose name starts with ".."', async () => {
    const project = temp()
    mkdirSync(join(project, '..x'))
    writeFileSync(join(project, '..x', 'form.docx'), 'x')
    const { candidates, selected } = await agentTemplateCandidates({
      projectRoot: project,
      tabs: [],
      suggested: join('..x', 'form.docx'),
      projectFiles: [],
    })
    expect(candidates.map((c) => c.path)).toEqual([join(project, '..x', 'form.docx')])
    expect(selected).toBe(candidates[0]?.id)
  })

  it('take a suggestion through a link leading out of the project folder as no choice', async () => {
    const project = temp()
    const outside = temp()
    writeFileSync(join(outside, 'secret.docx'), 'x')
    try {
      symlinkSync(outside, join(project, 'linked'), 'junction')
    } catch {
      return
    }
    const { candidates, selected } = await agentTemplateCandidates({
      projectRoot: project,
      tabs: [],
      suggested: join('linked', 'secret.docx'),
      projectFiles: [],
    })
    expect(candidates).toEqual([])
    expect(selected).toBeUndefined()
  })

  it('refuse a change to a project skill', () => {
    const made = agentSkillProposalOf(
      {
        title: 'T',
        name: '',
        description: 'D',
        body: 'B',
        wantsTemplate: false,
        targetId: 'project:x',
        suggestedTemplatePath: '',
      },
      [{ id: 'project:x', source: 'project', name: 'x', title: 'X', owned: false }],
      'k',
    )
    expect(made).toMatchObject({ ok: false, message: expect.stringMatching(/project folder/) })
  })
})

describe('the skill a change is for', () => {
  const input = (targetId: string) => ({
    title: 'T',
    name: '',
    description: 'D',
    body: 'B',
    wantsTemplate: false,
    targetId,
    suggestedTemplatePath: '',
  })
  const list = [
    { id: 'project:minutes', source: 'project', name: 'minutes', title: 'P', owned: false },
    { id: 'app:minutes', source: 'app', name: 'minutes', title: 'A', owned: true },
    { id: 'builtin:minutes', source: 'builtin', name: 'minutes', title: 'B', owned: false },
    { id: 'plugin:tools:minutes', source: 'plugin', name: 'minutes', title: 'T', owned: false },
    { id: 'user:letter', source: 'user', name: 'letter', title: 'L', owned: false },
    { id: 'builtin:letter', source: 'builtin', name: 'letter', title: 'L', owned: false },
    { id: 'app:ieumoffice', source: 'app', name: 'ieumoffice', title: 'I', owned: true },
  ]
  const session = [
    { id: 'project:minutes', name: 'minutes' },
    { id: 'app:minutes', name: 'minutes--app' },
    { id: 'builtin:minutes', name: 'minutes--builtin' },
    { id: 'plugin:tools:minutes', name: 'minutes--plugin-tools' },
  ]
  const targetOf = (targetId: string) => {
    const made = agentSkillProposalOf(input(targetId), list, 'k', session)
    return made.ok ? made.proposal.target?.id : made.message
  }

  it('is found by its identifier, as before', () => {
    expect(targetOf('builtin:minutes')).toBe('builtin:minutes')
  })

  it('is found by its name in the session, renamed duplicates included', () => {
    expect(targetOf('minutes--app')).toBe('app:minutes')
    expect(targetOf('Minutes--Builtin')).toBe('builtin:minutes')
    expect(targetOf('minutes--plugin-tools')).toBe('plugin:tools:minutes')
    expect(targetOf('ieum-skills:minutes--app')).toBe('app:minutes')
  })

  it('takes a shared plain name as the skill that won it in the session', () => {
    expect(targetOf('minutes')).toMatch(/project folder/)
  })

  it('takes a plain name of a skill not in the session by the same priority', () => {
    expect(targetOf('letter')).toBe('builtin:letter')
  })

  it('refuses a name no skill has, and a hidden one', () => {
    expect(targetOf('nope')).toMatch(/No skill/)
    expect(targetOf('ieumoffice')).toMatch(/No skill/)
    expect(targetOf('app:ieumoffice')).toMatch(/No skill/)
  })
})

describe('reading a candidate in main', () => {
  it('never reads the sign-in stores, the original app’s folder or the app’s own data', async () => {
    const home = temp()
    const userData = join(home, 'AppData', 'IeumOffice')
    const guard = {
      homeDir: home,
      protectedPaths: ['.claude', '.codex', '.genoffice', '.ieumoffice'].map((n) => join(home, n)),
    }
    guard.protectedPaths.push(userData)
    for (const dir of [...guard.protectedPaths]) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'form.docx'), 'secret')
      expect(await readTemplateCandidate(join(dir, 'form.docx'), guard), dir).toEqual({
        ok: false,
        reason: 'unreadable',
      })
      // a folder in it whose name only starts with ".." is in it too
      mkdirSync(join(dir, '..x'))
      writeFileSync(join(dir, '..x', 'form.docx'), 'secret')
      expect(await readTemplateCandidate(join(dir, '..x', 'form.docx'), guard), dir).toEqual({
        ok: false,
        reason: 'unreadable',
      })
    }
    const docs = join(home, 'Documents')
    mkdirSync(docs)
    writeFileSync(join(docs, 'form.docx'), 'mine')
    const read = await readTemplateCandidate(join(docs, 'form.docx'), guard)
    expect(read.ok && new TextDecoder().decode(read.bytes)).toBe('mine')
    // a linked folder leading into one of them is judged by where it really is
    try {
      symlinkSync(join(home, '.genoffice'), join(docs, 'linked'), 'junction')
    } catch {
      return
    }
    expect(await readTemplateCandidate(join(docs, 'linked', 'form.docx'), guard)).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})

describe('saving a candidate as it is', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  it('is blocked by the markdown and HTML editors’ marks', async () => {
    expect(
      await templateRedactionOf(
        'a.md',
        bytes('<span class="redact-span" data-redaction="" data-label="x">y</span>'),
        false,
      ),
    ).toBe('redacted')
    expect(await templateRedactionOf('a.md', bytes('plain'), false)).toBe('none')
    expect(await templateRedactionOf('a.html', bytes('<p data-gx-redact="x">y</p>'), false)).toBe(
      'redacted',
    )
    expect(await templateRedactionOf('a.html', bytes('<p>y</p>'), false)).toBe('none')
  })

  it('is blocked by the deck engine’s mark, and for a deck that cannot be read', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><a:ext uri="{9F1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D}"/></p:sld>',
    )
    const marked = await zip.generateAsync({ type: 'uint8array' })
    expect(await templateRedactionOf('deck.pptx', marked, false)).toBe('redacted')
    const clean = new JSZip()
    clean.file('ppt/slides/slide1.xml', '<p:sld/>')
    expect(
      await templateRedactionOf(
        'deck.pptx',
        await clean.generateAsync({ type: 'uint8array' }),
        false,
      ),
    ).toBe('none')
    expect(await templateRedactionOf('deck.pptx', bytes('not a zip'), false)).toBe('unknown')
  })

  it('is not known for a PDF open in a tab (its pending marks are the editor’s)', async () => {
    expect(await templateRedactionOf('a.pdf', bytes('%PDF'), true)).toBe('unknown')
    expect(await templateRedactionOf('a.pdf', bytes('%PDF'), false)).toBe('none')
    expect(await templateRedactionOf('a.docx', bytes('x'), true)).toBe('none')
  })
})

describe('the one-time notice and the next-session line', () => {
  it('shows the notice only when due, until it is closed', () => {
    expect(agentSkillNoticeShown(true, false)).toBe(true)
    expect(agentSkillNoticeShown(false, false)).toBe(false)
    expect(agentSkillNoticeShown(null, false)).toBe(false)
    expect(agentSkillNoticeShown(true, true)).toBe(false)
  })

  it('adds "changed skills apply from the next session" once, and not after the end', () => {
    let log = agentLogAfterSend(EMPTY_AGENT_LOG, 'hi', ['Meeting minutes'])
    expect(log.entries[0]).toEqual({ kind: 'you', text: 'hi', skills: ['Meeting minutes'] })
    log = agentLogAfterSkillsChanged(log)
    log = agentLogAfterSkillsChanged(log)
    expect(log.entries.filter((e) => e.kind === 'skills-changed')).toHaveLength(1)
    const ended = agentLogWith(EMPTY_AGENT_LOG, { type: 'ended' })
    expect(agentLogAfterSkillsChanged(ended)).toBe(ended)
  })

  it('places a card or an install proposal in the log once', () => {
    let log = agentLogWithSkillItem(EMPTY_AGENT_LOG, { kind: 'skill-card', key: 'k' })
    log = agentLogWithSkillItem(log, { kind: 'skill-card', key: 'k' })
    log = agentLogWithSkillItem(log, { kind: 'skill-install', key: 'j' })
    expect(log.entries).toEqual([
      { kind: 'skill-card', key: 'k' },
      { kind: 'skill-install', key: 'j' },
    ])
  })
})
