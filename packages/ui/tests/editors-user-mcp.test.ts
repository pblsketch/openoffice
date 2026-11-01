/**
 * Every AI window shows the person's MCP servers the same way (user MCP spec
 * 7.4 to 7.6, 8): the permission card after the chat's messages, the server
 * button in the composer footer, a clean MCP state for every new or reopened
 * chat, and the usable servers handed to the skill chips and `use_skill`.
 * These guards read the panels' sources and keep the wiring the same everywhere.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const source = (path: string): string => readFileSync(join(REPO, path), 'utf8')

/** where a panel builds its loop, and where it renders its chat and composer */
const PANELS: Record<string, { loop: string; view: string }> = {
  docs: {
    loop: 'apps/docs/src/renderer/ai/AiPanel.tsx',
    view: 'apps/docs/src/renderer/ai/AiPanel.tsx',
  },
  sheets: {
    loop: 'apps/sheets/src/renderer/App.tsx',
    view: 'apps/sheets/src/renderer/ai/AiChatPanel.tsx',
  },
  slides: {
    loop: 'apps/slides/src/renderer/ai/AiPanel.tsx',
    view: 'apps/slides/src/renderer/ai/AiPanel.tsx',
  },
  pdf: {
    loop: 'apps/pdf/src/renderer/ai/AiPanel.tsx',
    view: 'apps/pdf/src/renderer/ai/AiPanel.tsx',
  },
  markdown: {
    loop: 'apps/markdown/src/renderer/ai/AiPanel.tsx',
    view: 'apps/markdown/src/renderer/ai/AiPanel.tsx',
  },
  html: {
    loop: 'apps/html/src/renderer/ai/AiPanel.tsx',
    view: 'apps/html/src/renderer/ai/AiPanel.tsx',
  },
  mindmap: {
    loop: 'apps/mindmap/src/renderer/ai/AiPanel.tsx',
    view: 'apps/mindmap/src/renderer/ai/AiPanel.tsx',
  },
  hwp: {
    loop: 'apps/hwp/src/renderer/ai/AiPanel.tsx',
    view: 'apps/hwp/src/renderer/ai/AiPanel.tsx',
  },
  epub: {
    loop: 'apps/epub/src/renderer/ai/AiPanel.tsx',
    view: 'apps/epub/src/renderer/ai/AiPanel.tsx',
  },
  'home ask': {
    loop: 'apps/shell/src/renderer/src/KbAskPanel.tsx',
    view: 'apps/shell/src/renderer/src/KbAskPanel.tsx',
  },
}

const HOME = 'apps/shell/src/renderer/src/KbAskPanel.tsx'
const NEW_CONVERSATION = 'windowMcpState()?.newConversation()'
/** the loop's own reset and restore, by whatever name the panel holds the loop */
const LOOP_CALL = /\b(?:loopRef\.current|agentLoopRef\.current|loop)\?\.(reset|restore)\(/g
/** a function declared in the component body (two spaces in) */
const COMPONENT_FUNCTION = /^ {2}(?:const \w+ = |function \w+\(|async function \w+\()/

describe.each(Object.entries(PANELS))('%s AI panel', (_name, panel) => {
  const loop = source(panel.loop)
  const view = source(panel.view)

  it('shows the permission card once, after the chat’s messages', () => {
    expect(view.split('<McpPermissionCard lang={lang} />')).toHaveLength(2)
    const notes = panel.view.includes('AiChatPanel') ? '{skillNotes}' : '{skillTemplates.notes}'
    const card = view.indexOf('<McpPermissionCard')
    expect(card).toBeGreaterThan(view.indexOf(notes))
  })

  it('puts the server button once in the composer footer', () => {
    expect(view.split('<McpServerButton lang={lang} />')).toHaveLength(2)
    // beside the attach buttons where the panel has them, else in AiComposer's footer
    const anchor = view.includes('<DocAttachButton') ? '<DocAttachButton' : 'footerStart={'
    const at = view.indexOf(anchor)
    expect(at).toBeGreaterThan(-1)
    expect(view.indexOf('<McpServerButton')).toBeGreaterThan(at)
  })

  it('hands the usable servers to the skill chips and to use_skill', () => {
    expect(view).toContain('const mcpWindow = useMcpWindow()')
    expect(view).toContain('usableMcpServers: mcpWindow.state?.usableServers()')
    const userSkills = loop.match(/\.\.\.panelUserSkills\(\{[\s\S]*?\n {8}\}\),/)?.[0] ?? ''
    expect(userSkills).toContain('mcpServerUsable: (name) => windowMcpUsableServers().has(name)')
  })

  it('starts the MCP state over wherever the chat is cleared or a stored one is opened', () => {
    const lines = loop.split('\n')
    const calls = lines.flatMap((line, i) => (line.match(LOOP_CALL) ? [i] : []))
    expect(calls.length).toBeGreaterThan(0)
    for (const at of calls) {
      // the body of the enclosing component-level function up to just after the call
      let start = at
      while (start > 0 && !COMPONENT_FUNCTION.test(lines[start]!)) start -= 1
      const scope = lines.slice(start + 1, at + 4).join('\n')
      const clean = scope.includes(NEW_CONVERSATION) || /\bresetConversation\(\)/.test(scope)
      expect(clean, `line ${at + 1}: ${lines[at]!.trim()}`).toBe(true)
    }
  })
})

describe('the home window', () => {
  const home = source(HOME)

  it('composes with the outbound guards and MCP but no Drive tools', () => {
    expect(home).toMatch(
      /skill: composeWithGuards\('kb\+skills', '', \(\) => loopRef\.current\?\.messages \?\? \[\], \[/,
    )
    expect(home).not.toMatch(/\bcomposeSkills\(/)
    expect(home).not.toContain('composeWithDrive')
    expect(home).not.toMatch(/drive_search|drive_read|createBridgedDriveSkill|DriveAttachButton/)
  })
})
