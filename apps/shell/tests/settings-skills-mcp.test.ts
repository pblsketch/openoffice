/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type { UserSkillView } from '@genoffice/electron-utils/user-skills-channels'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SkillsPane } from '../src/renderer/src/skills/SkillsPane'
import { skillMcpServersNeeded } from '../src/renderer/src/skills/skills-model'
import { skillsText, skillsUiStrings } from '../src/renderer/src/i18n/strings-skills'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const brief: UserSkillView = {
  id: 'app:case-brief',
  source: 'app',
  plugin: undefined,
  name: 'case-brief',
  title: 'case-brief',
  description: 'Drafts a brief and checks the cases.',
  enabled: true,
  invoke: 'auto',
  hidden: false,
  hasScripts: false,
  mcpServers: ['korean-law', 'web'],
  template: undefined,
  templateExists: false,
  agentOnly: false,
  unreadable: undefined,
  files: 1,
  bytes: 100,
  github: undefined,
  owned: true,
  can: {
    edit: true,
    copyToMine: false,
    export: true,
    checkUpdate: false,
    openFolder: true,
    remove: true,
    hide: false,
  },
  shadowedBy: undefined,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    openHelp: vi.fn(async () => {}),
  } as unknown as HomeApi
  ;(window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills = {
    list: vi.fn(async () => [brief]),
    onChanged: vi.fn(() => () => undefined),
  }
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills
})

async function rowText(usableMcpServers?: ReadonlySet<string>): Promise<string> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'ko' },
        createElement(SkillsPane, usableMcpServers ? { usableMcpServers } : {}),
      ),
    )
    await Promise.resolve()
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  const row = host.querySelector(`[data-skill-id="${brief.id}"]`)
  expect(row).toBeTruthy()
  return row!.textContent ?? ''
}

describe('Settings → Skills: MCP server mark (spec 8)', () => {
  it('names every referenced server while no server is known to be on', async () => {
    const text = await rowText()
    expect(text).toContain('MCP 서버 필요: korean-law, web')
  })

  it('leaves out a server that is registered and on', async () => {
    expect(await rowText(new Set(['korean-law']))).toContain('MCP 서버 필요: web')
    expect(await rowText(new Set(['korean-law', 'web']))).not.toContain('MCP')
  })

  it('works out the servers to name', () => {
    expect(skillMcpServersNeeded(brief, new Set())).toEqual(['korean-law', 'web'])
    expect(skillMcpServersNeeded(brief, new Set(['web']))).toEqual(['korean-law'])
    expect(skillMcpServersNeeded({ mcpServers: undefined as never }, new Set())).toEqual([])
  })

  it('has the mark in every language with its placeholder', () => {
    for (const lang of LANGS) {
      const text = skillsUiStrings[lang].badgeMcpServer
      expect(text, lang).toContain('{servers}')
      expect(skillsText(lang, 'badgeMcpServer', { servers: 'law' }), lang).toContain('law')
    }
  })
})
