/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGS, PRODUCT_NAME, UPSTREAM_PRODUCT_NAME } from '@genoffice/i18n'
import { aiSubscriptionText, builtinSkillDesc } from '@genoffice/ui'
import type { UserSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import type {
  UserSkillImportCandidateView,
  UserSkillImportPreview,
  UserSkillView,
} from '@genoffice/electron-utils/user-skills-channels'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'
import { SkillsPane } from '../src/renderer/src/skills/SkillsPane'
import {
  failureKey,
  groupSkills,
  skillMenuActions,
  sourceLabel,
} from '../src/renderer/src/skills/skills-model'
import {
  skillsText,
  skillsUiStrings,
  type SkillsStringKey,
} from '../src/renderer/src/i18n/strings-skills'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const ko = (key: SkillsStringKey, params?: Record<string, string | number>) =>
  skillsText('ko', key, params)

let host: HTMLDivElement
let root: Root

const noCan: UserSkillView['can'] = {
  edit: false,
  copyToMine: false,
  export: false,
  checkUpdate: false,
  openFolder: false,
  remove: false,
  hide: false,
}

function view(partial: Partial<UserSkillView> & Pick<UserSkillView, 'source' | 'name'>) {
  const base: UserSkillView = {
    id: `${partial.source}:${partial.name}`,
    source: partial.source,
    plugin: undefined,
    name: partial.name,
    title: partial.name,
    description: `${partial.name} description`,
    enabled: true,
    invoke: 'auto',
    hidden: false,
    hasScripts: false,
    template: undefined,
    templateExists: false,
    agentOnly: false,
    unreadable: undefined,
    files: 1,
    bytes: 100,
    github: undefined,
    owned: partial.source === 'app',
    can: noCan,
    shadowedBy: undefined,
  }
  return { ...base, ...partial }
}

const builtin = view({
  source: 'builtin',
  name: 'meeting-minutes',
  can: { ...noCan, copyToMine: true, hide: true },
})
const mine = view({
  source: 'app',
  name: 'home-letter',
  title: '가정통신문',
  template: 'assets/form.hwpx',
  templateExists: true,
  can: { ...noCan, edit: true, export: true, openFolder: true, remove: true },
})
const fromGitHub = view({
  source: 'app',
  name: 'lint-notes',
  github: { repo: 'owner/repo', ref: 'main', path: 'skills/lint-notes', commit: 'abc' },
  hasScripts: true,
  can: {
    ...noCan,
    edit: true,
    export: true,
    checkUpdate: true,
    openFolder: true,
    remove: true,
  },
})
const claude = view({
  source: 'user',
  name: 'review',
  enabled: false,
  can: { ...noCan, copyToMine: true, openFolder: true },
})
const plugin = view({
  source: 'plugin',
  plugin: 'helper-pack',
  name: 'summarize',
  id: 'plugin:helper-pack:summarize',
  enabled: false,
  can: { ...noCan, copyToMine: true, openFolder: true },
})
const codex = view({
  source: 'codex',
  name: 'broken',
  enabled: false,
  unreadable: 'no-frontmatter',
  can: { ...noCan, openFolder: true },
})
const hiddenBuiltin = view({
  source: 'builtin',
  name: 'humanizer',
  hidden: true,
  enabled: false,
  can: { ...noCan, copyToMine: true, hide: true },
})

function candidate(partial: Partial<UserSkillImportCandidateView> & { key: string }) {
  const base: UserSkillImportCandidateView = {
    key: partial.key,
    rel: partial.key,
    name: partial.key,
    title: partial.key,
    description: `${partial.key} description`,
    files: 2,
    bytes: 2048,
    hasScripts: false,
    hasTemplate: false,
    urls: [],
    urlCount: 0,
    license: undefined,
    collision: false,
    problem: undefined,
  }
  return { ...base, ...partial }
}

const preview: UserSkillImportPreview = {
  token: 'tok-1',
  origin: { kind: 'folder' },
  candidates: [
    candidate({ key: 'alpha', urls: ['https://example.com'], urlCount: 1, license: 'LICENSE' }),
    candidate({ key: 'beta', collision: true, hasScripts: true }),
  ],
  rootLicense: undefined,
}

type Bridge = { [K in keyof UserSkillsBridge]: ReturnType<typeof vi.fn> }

function bridge(views: UserSkillView[]): Bridge {
  const listeners: Array<() => void> = []
  const api = {
    list: vi.fn(async () => views),
    read: vi.fn(async (id: string) => ({
      ok: true,
      skill: {
        id,
        name: 'home-letter',
        title: '가정통신문',
        description: '학교 말투',
        body: '# 본문',
        template: undefined,
        files: [{ rel: 'SKILL.md', size: 10 }],
      },
    })),
    setState: vi.fn(async () => ({ ok: true })),
    hideBuiltin: vi.fn(async () => ({ ok: true })),
    unhideBuiltins: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    copyToMine: vi.fn(async () => ({ ok: true, id: 'app:x' })),
    suggestName: vi.fn(async () => 'new-skill'),
    checkName: vi.fn(async () => ({ ok: true })),
    save: vi.fn(async () => ({ ok: true, id: 'app:new-skill' })),
    saveFromCard: vi.fn(),
    importFolder: vi.fn(async () => ({ ok: true, preview })),
    importZip: vi.fn(async () => ({ ok: false, reason: 'cancelled' })),
    importGitHub: vi.fn(async () => ({ ok: false, reason: 'rate-limited' })),
    cancelImport: vi.fn(async () => {}),
    install: vi.fn(async () => ({
      ok: true,
      installed: [{ key: 'alpha', id: 'app:alpha' }],
      skipped: [],
    })),
    checkUpdate: vi.fn(async () => ({ ok: true, status: 'up-to-date', locallyEdited: false })),
    applyUpdate: vi.fn(async () => ({ ok: true, id: fromGitHub.id })),
    cancelUpdate: vi.fn(async () => {}),
    exportInfo: vi.fn(async () => ({ ok: true, fileName: 'x.zip', includesTemplate: false })),
    exportZip: vi.fn(async () => ({ ok: true, path: 'C:/out/x.zip' })),
    openFolder: vi.fn(async () => ({ ok: true })),
    aiRead: vi.fn(),
    aiReadFile: vi.fn(),
    openSettings: vi.fn(),
    agentNotice: vi.fn(),
    markAgentNoticeSeen: vi.fn(),
    onChanged: vi.fn((listener: () => void) => {
      listeners.push(listener)
      return () => undefined
    }),
  }
  ;(api as unknown as { fire: () => void }).fire = () => listeners.forEach((l) => l())
  return api as unknown as Bridge
}

function install(api: Bridge): void {
  ;(window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills = api
}

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
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as unknown as { aiOfficeUserSkills?: unknown }).aiOfficeUserSkills
})

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
    await Promise.resolve()
  })
  await flush()
}

function buttonWithText(text: string, scope: ParentNode = document.body) {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

function row(id: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[data-skill-id="${id}"]`)
  expect(el, id).toBeTruthy()
  return el!
}

async function renderPane(api: Bridge): Promise<void> {
  install(api)
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'ko' }, createElement(SkillsPane)))
    await Promise.resolve()
  })
  await flush()
}

async function openMenu(id: string): Promise<string[]> {
  const more = row(id).querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
  await click(more)
  const menu = document.querySelector('[role="menu"]')
  expect(menu).toBeTruthy()
  return [...menu!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim() ?? '')
}

describe('skills model', () => {
  it('groups builtin → mine → Claude → plugins → Codex and leaves hidden builtins out', () => {
    const groups = groupSkills(
      [codex, plugin, claude, fromGitHub, mine, builtin, hiddenBuiltin],
      '',
      'ko',
    )
    expect(groups.map((g) => g.id)).toEqual(['builtin', 'app', 'user', 'plugin', 'codex'])
    expect(groups[0]!.skills.map((s) => s.name)).toEqual(['meeting-minutes'])
  })

  it('searches the title, the name and the description', () => {
    const all = [builtin, mine, claude]
    expect(groupSkills(all, '가정통신', 'ko').flatMap((g) => g.skills)).toEqual([mine])
    expect(groupSkills(all, 'REVIEW', 'ko').flatMap((g) => g.skills)).toEqual([claude])
    expect(groupSkills(all, 'home-letter desc', 'ko').flatMap((g) => g.skills)).toEqual([mine])
    expect(groupSkills(all, '회의록', 'ko').flatMap((g) => g.skills)).toEqual([builtin])
  })

  it('labels sources in plain text', () => {
    const text = (key: SkillsStringKey, params?: Record<string, string | number>) =>
      skillsText('ko', key, params)
    expect(sourceLabel(builtin, text)).toBe('기본')
    expect(sourceLabel(mine, text)).toBe('내 스킬')
    expect(sourceLabel(fromGitHub, text)).toBe('내 스킬 · 깃허브')
    expect(sourceLabel(claude, text)).toBe('Claude 스킬 폴더')
    expect(sourceLabel(plugin, text)).toBe('Claude 플러그인 · helper-pack')
    expect(sourceLabel(codex, text)).toBe('Codex 스킬 폴더')
  })

  it('builds the more-menu from what the main process allows', () => {
    expect(skillMenuActions(builtin)).toEqual(['view', 'copyToMine', 'hide'])
    expect(skillMenuActions(mine)).toEqual(['view', 'edit', 'export', 'openFolder', 'remove'])
    expect(skillMenuActions(fromGitHub)).toEqual([
      'view',
      'edit',
      'export',
      'checkUpdate',
      'openFolder',
      'remove',
    ])
    expect(skillMenuActions(claude)).toEqual(['view', 'copyToMine', 'openFolder'])
    // an unreadable skill has nothing to show
    expect(skillMenuActions(codex)).toEqual(['openFolder'])
  })

  it('gives every import failure of spec 5.2 its own sentence and stays quiet on cancel', () => {
    expect(failureKey('no-skills', 'import')).toBe('failNoSkills')
    expect(failureKey('not-found', 'import')).toBe('failRepoNotFound')
    expect(failureKey('not-found')).toBe('failNotFound')
    expect(failureKey('rate-limited', 'import')).toBe('failRateLimited')
    expect(failureKey('network', 'import')).toBe('failNetwork')
    expect(failureKey('trash-failed')).toBe('failTrash')
    expect(failureKey('too-large', 'import')).toBe('failTooLarge')
    expect(failureKey('unsafe', 'import')).toBe('failUnsafe')
    expect(failureKey('cancelled', 'import')).toBeUndefined()
  })
})

describe('Settings → Skills screen', () => {
  it('sits directly below AI in the settings menu and opens on the skills target', async () => {
    install(bridge([builtin]))
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'ko' },
          createElement(SettingsModal, { onClose: vi.fn(), target: { section: 'skills' } }),
        ),
      )
      await Promise.resolve()
    })
    await flush()
    const nav = [...host.querySelectorAll('.set-nav-item')].map((b) => b.textContent?.trim())
    expect(nav[nav.indexOf('AI') + 1]).toBe('스킬')
    const active = host.querySelector('.set-nav-item.active')
    expect(active?.textContent?.trim()).toBe('스킬')
    expect(host.querySelector('[data-skill-id="builtin:meeting-minutes"]')).toBeTruthy()
  })

  it('shows the intro, the help link and an empty state when there are no skills', async () => {
    await renderPane(bridge([]))
    expect(host.textContent).toContain(ko('intro'))
    expect(host.textContent).toContain(ko('empty'))
    const help = host.querySelector('[data-help-topic="skills"]')
    expect(help).toBeTruthy()
    await click(help)
    expect(window.aiOffice.openHelp).toHaveBeenCalledWith('skills')
  })

  it('shows groups in order with plain source labels and every skill by its name', async () => {
    await renderPane(bridge([codex, plugin, claude, fromGitHub, mine, builtin]))
    const groups = [...host.querySelectorAll('[data-group]')].map((g) =>
      g.getAttribute('data-group'),
    )
    expect(groups).toEqual(['builtin', 'app', 'user', 'plugin', 'codex'])
    // a builtin shows its name, with its description in the UI language
    expect(row(builtin.id).textContent).toContain('meeting-minutes')
    expect(row(builtin.id).textContent).toContain(builtinSkillDesc('ko', 'meeting-minutes'))
    // an own skill shows its name, not the title it was made with
    expect(row(mine.id).textContent).toContain('home-letter')
    expect(row(mine.id).textContent).not.toContain('가정통신문')
    expect(row(plugin.id).textContent).toContain('Claude 플러그인 · helper-pack')
    expect(row(mine.id).textContent).toContain(ko('badgeTemplate'))
    expect(row(fromGitHub.id).textContent).toContain(ko('badgeScripts'))
    expect(row(fromGitHub.id).textContent).toContain('내 스킬 · 깃허브')
  })

  it('dims an unreadable skill, tells why, and does not let it be turned on', async () => {
    await renderPane(bridge([codex]))
    const r = row(codex.id)
    expect(r.getAttribute('data-unreadable')).toBe('true')
    expect(r.textContent).toContain(ko('unreadableNoFrontmatter'))
    const toggle = r.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle?.disabled).toBe(true)
  })

  it('turns a skill on and off and picks when it is used', async () => {
    const api = bridge([mine])
    await renderPane(api)
    await click(row(mine.id).querySelector('[role="switch"]'))
    expect(api.setState).toHaveBeenCalledWith(mine.id, { enabled: false })
    await click(buttonWithText(ko('invokeManual'), row(mine.id)))
    expect(api.setState).toHaveBeenCalledWith(mine.id, { invoke: 'manual' })
  })

  it('offers the auto/manual choice only for an enabled skill', async () => {
    await renderPane(bridge([claude]))
    expect(buttonWithText(ko('invokeAuto'), row(claude.id))).toBeUndefined()
  })

  it('offers the more-menu items each source allows', async () => {
    await renderPane(bridge([builtin, mine, fromGitHub, claude, plugin]))
    expect(await openMenu(builtin.id)).toEqual([ko('actView'), ko('actCopy'), ko('actHide')])
    expect(await openMenu(fromGitHub.id)).toEqual([
      ko('actView'),
      ko('actEdit'),
      ko('actExport'),
      ko('actCheckUpdate'),
      ko('actOpenFolder'),
      ko('actRemove'),
    ])
    expect(await openMenu(plugin.id)).toEqual([ko('actView'), ko('actCopy'), ko('actOpenFolder')])
  })

  it('asks before moving an own skill to the trash', async () => {
    const api = bridge([mine])
    await renderPane(api)
    await openMenu(mine.id)
    await click(buttonWithText(ko('actRemove'), document.querySelector('[role="menu"]')!))
    expect(api.remove).not.toHaveBeenCalled()
    expect(host.textContent).toContain(ko('confirmRemove', { title: 'home-letter' }))
    await click(buttonWithText(ko('actRemove'), row(mine.id)))
    expect(api.remove).toHaveBeenCalledWith(mine.id)
  })

  it('asks before hiding a builtin and shows hidden builtins at the bottom', async () => {
    const api = bridge([builtin, hiddenBuiltin])
    await renderPane(api)
    await openMenu(builtin.id)
    await click(buttonWithText(ko('actHide'), document.querySelector('[role="menu"]')!))
    expect(api.hideBuiltin).not.toHaveBeenCalled()
    await click(buttonWithText(ko('actHide'), row(builtin.id)))
    expect(api.hideBuiltin).toHaveBeenCalledWith(builtin.id)
    const footer = host.querySelector('.skl-hidden-footer')
    expect(footer?.textContent).toContain(ko('hiddenFooter', { n: 1 }))
    expect(host.querySelector(`[data-skill-id="${hiddenBuiltin.id}"]`)).toBeNull()
    await click(buttonWithText(ko('unhide'), footer!))
    expect(api.unhideBuiltins).toHaveBeenCalled()
  })

  it('copies to my skills, asks to replace a taken name, and says the original is off', async () => {
    const api = bridge([claude])
    api.copyToMine.mockResolvedValueOnce({ ok: false, reason: 'exists' })
    await renderPane(api)
    await openMenu(claude.id)
    await click(buttonWithText(ko('actCopy'), document.querySelector('[role="menu"]')!))
    expect(api.copyToMine).toHaveBeenLastCalledWith(claude.id, false)
    expect(host.textContent).toContain(ko('confirmOverwrite', { name: 'review' }))
    await click(buttonWithText(ko('overwrite'), row(claude.id)))
    expect(api.copyToMine).toHaveBeenLastCalledWith(claude.id, true)
    expect(host.textContent).toContain(ko('copied'))
  })

  it('warns about the template before exporting a skill that has one', async () => {
    const api = bridge([mine])
    api.exportInfo.mockResolvedValueOnce({
      ok: true,
      fileName: 'home-letter.zip',
      includesTemplate: true,
    })
    await renderPane(api)
    await openMenu(mine.id)
    await click(buttonWithText(ko('actExport'), document.querySelector('[role="menu"]')!))
    expect(host.textContent).toContain(ko('exportNotice'))
    expect(api.exportZip).not.toHaveBeenCalled()
    await click(buttonWithText(ko('exportContinue'), row(mine.id)))
    expect(api.exportZip).toHaveBeenCalledWith(mine.id)
    expect(host.textContent).toContain(ko('exported', { path: 'C:/out/x.zip' }))
  })

  it('exports straight away when no template goes in', async () => {
    const api = bridge([fromGitHub])
    await renderPane(api)
    await openMenu(fromGitHub.id)
    await click(buttonWithText(ko('actExport'), document.querySelector('[role="menu"]')!))
    expect(host.textContent).not.toContain(ko('exportNotice'))
    expect(api.exportZip).toHaveBeenCalledWith(fromGitHub.id)
  })

  it('previews an import with the warning always shown and a name choice per collision', async () => {
    const api = bridge([mine])
    await renderPane(api)
    await click(buttonWithText(ko('add')))
    await click(buttonWithText(ko('addFolder')))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.querySelector('.skl-preview-warning')?.textContent).toBe(ko('previewWarning'))
    const boxes = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map((b) => b.checked)).toEqual([true, true])
    expect(dialog.textContent).toContain(ko('collision'))
    expect(dialog.textContent).toContain(ko('previewScripts'))
    expect(dialog.textContent).toContain('https://example.com')
    const installButton = buttonWithText(ko('install'), dialog)!
    expect(installButton.disabled).toBe(true)
    await click(buttonWithText(ko('collisionReplace'), dialog))
    expect(installButton.disabled).toBe(false)
    await click(installButton)
    expect(api.install).toHaveBeenCalledWith('tok-1', ['alpha', 'beta'], { beta: 'replace' })
    expect(host.textContent).toContain(ko('installed', { n: 1 }))
  })

  it('drops a previewed import on cancel', async () => {
    const api = bridge([])
    await renderPane(api)
    await click(buttonWithText(ko('add')))
    await click(buttonWithText(ko('addFolder')))
    const dialog = document.querySelector('[role="dialog"]')!
    // unchecking the colliding skill needs no choice
    const boxes = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    await click(boxes[1])
    expect(buttonWithText(ko('install'), dialog)!.disabled).toBe(false)
    await click(buttonWithText(ko('cancel'), dialog))
    expect(api.cancelImport).toHaveBeenCalledWith('tok-1')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the spec 5.2 sentence when a GitHub import fails', async () => {
    const api = bridge([])
    await renderPane(api)
    await click(buttonWithText(ko('add')))
    await click(buttonWithText(ko('addGitHub')))
    const dialog = document.querySelector('[role="dialog"]')!
    const input = dialog.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'owner/repo')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(buttonWithText(ko('githubFind'), dialog))
    expect(api.importGitHub).toHaveBeenCalledWith('owner/repo')
    expect(dialog.textContent).toContain(ko('failRateLimited'))
  })

  it('warns that own edits are lost before a GitHub update', async () => {
    const api = bridge([fromGitHub])
    api.checkUpdate.mockResolvedValueOnce({
      ok: true,
      status: 'changed',
      token: 'up-1',
      locallyEdited: true,
      changedFiles: [{ rel: 'SKILL.md', change: 'modified' }],
      candidate: candidate({ key: 'lint-notes' }),
    })
    await renderPane(api)
    await openMenu(fromGitHub.id)
    await click(buttonWithText(ko('actCheckUpdate'), document.querySelector('[role="menu"]')!))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('SKILL.md')
    expect(dialog.textContent).toContain(ko('updateLocalEdits'))
    expect(dialog.textContent).toContain(ko('previewWarning'))
    await click(buttonWithText(ko('cancel'), dialog))
    expect(api.cancelUpdate).toHaveBeenCalledWith('up-1')
  })

  it('leaves the lost-edits line out when nothing was changed locally, and applies', async () => {
    const api = bridge([fromGitHub])
    api.checkUpdate.mockResolvedValueOnce({
      ok: true,
      status: 'changed',
      token: 'up-2',
      locallyEdited: false,
      changedFiles: [{ rel: 'notes.md', change: 'added' }],
      candidate: candidate({ key: 'lint-notes' }),
    })
    await renderPane(api)
    await openMenu(fromGitHub.id)
    await click(buttonWithText(ko('actCheckUpdate'), document.querySelector('[role="menu"]')!))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).not.toContain(ko('updateLocalEdits'))
    await click(buttonWithText(ko('updateApply'), dialog))
    expect(api.applyUpdate).toHaveBeenCalledWith('up-2')
  })

  it('says up to date when the GitHub skill has not changed', async () => {
    const api = bridge([fromGitHub])
    await renderPane(api)
    await openMenu(fromGitHub.id)
    await click(buttonWithText(ko('actCheckUpdate'), document.querySelector('[role="menu"]')!))
    expect(host.textContent).toContain(ko('upToDate'))
  })

  it('creates a new skill: the name comes first and Save waits until one is typed', async () => {
    const api = bridge([])
    await renderPane(api)
    await click(buttonWithText(ko('create')))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain(ko('createHint'))
    expect(dialog.textContent).toContain(ko('nameHint'))
    expect(dialog.querySelector('details')).toBeNull()
    const save = buttonWithText(ko('save'), dialog)!
    expect(save.disabled).toBe(true)
    const fields = [
      ...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ]
    // no title field: the name, the description and the body
    expect(fields).toHaveLength(3)
    const name = fields[0] as HTMLInputElement
    expect(name.getAttribute('data-field')).toBe('name')
    expect(name.placeholder).toBe('meeting-minutes')
    const set = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
        Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await set(fields[1]!, '회의를 정리한다')
    await set(fields[2]!, '본문')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    await flush()
    // description and body are there, but no name yet; none is made up either
    expect(save.disabled).toBe(true)
    expect(api.suggestName).not.toHaveBeenCalled()
    expect(name.value).toBe('')
    await set(name, 'meeting-notes')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    await flush()
    expect(api.checkName).toHaveBeenCalledWith('meeting-notes', undefined)
    expect(save.disabled).toBe(false)
    await click(save)
    expect(api.save).toHaveBeenCalledWith({
      title: '',
      name: 'meeting-notes',
      description: '회의를 정리한다',
      body: '본문',
    })
  })

  it('shows a skill read-only with its files and a folder button', async () => {
    const api = bridge([claude])
    await renderPane(api)
    await openMenu(claude.id)
    await click(buttonWithText(ko('actView'), document.querySelector('[role="menu"]')!))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(api.read).toHaveBeenCalledWith(claude.id)
    expect(buttonWithText(ko('save'), dialog)).toBeUndefined()
    const area = dialog.querySelector('textarea')!
    expect(area.readOnly).toBe(true)
    expect(dialog.textContent).toContain('SKILL.md')
    await click(buttonWithText(ko('actOpenFolder'), dialog))
    expect(api.openFolder).toHaveBeenCalledWith(claude.id)
  })

  it('checks a changed name while editing an own skill', async () => {
    const api = bridge([mine])
    api.checkName.mockResolvedValue({ ok: false, problem: 'characters' })
    await renderPane(api)
    await openMenu(mine.id)
    await click(buttonWithText(ko('actEdit'), document.querySelector('[role="menu"]')!))
    const dialog = document.querySelector('[role="dialog"]')!
    // the name is the first field, shown without opening anything
    const name = dialog.querySelector<HTMLInputElement>('input[data-field="name"]')!
    expect(dialog.querySelector('input, textarea')).toBe(name)
    expect(name.value).toBe('home-letter')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        name,
        'Home Letter',
      )
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    await flush()
    expect(api.checkName).toHaveBeenCalledWith('Home Letter', mine.id)
    expect(dialog.textContent).toContain(ko('nameCharacters'))
    expect(buttonWithText(ko('save'), dialog)!.disabled).toBe(true)
  })

  it('saves an edit of an own skill with an empty title and no name when the name is kept', async () => {
    const api = bridge([mine])
    await renderPane(api)
    await openMenu(mine.id)
    await click(buttonWithText(ko('actEdit'), document.querySelector('[role="menu"]')!))
    const dialog = document.querySelector('[role="dialog"]')!
    const body = dialog.querySelectorAll<HTMLTextAreaElement>('textarea')[1]!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        body,
        '# 새 본문',
      )
      body.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await click(buttonWithText(ko('save'), dialog))
    // the main process keeps the title the skill already has
    expect(api.save).toHaveBeenCalledWith({
      title: '',
      description: '학교 말투',
      body: '# 새 본문',
      id: mine.id,
    })
  })

  it('reads the list again when the main process says it changed', async () => {
    const api = bridge([mine])
    await renderPane(api)
    const calls = api.list.mock.calls.length
    await act(async () => {
      ;(api as unknown as { fire: () => void }).fire()
      await Promise.resolve()
    })
    await flush()
    expect(api.list.mock.calls.length).toBeGreaterThan(calls)
  })
})

describe('Skills strings in 21 languages', () => {
  const keys = Object.keys(skillsUiStrings.zh) as SkillsStringKey[]
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('fills every key in every language with the same placeholders', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      const dict = skillsUiStrings[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...keys].sort())
      for (const key of keys) {
        const text = dict[key]!
        expect(text.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
        expect(placeholders(text), `${lang}.${key}`).toEqual(placeholders(skillsUiStrings.zh[key]))
        expect(text, `${lang}.${key}`).not.toContain(UPSTREAM_PRODUCT_NAME)
        expect(text, `${lang}.${key}`).not.toContain(PRODUCT_NAME)
      }
    }
  })

  it('does not copy the English text into other languages', () => {
    const same = (lang: (typeof LANGS)[number]) =>
      keys.filter(
        (key) =>
          (skillsUiStrings[lang] as Record<string, string>)[key] === skillsUiStrings.en[key] &&
          !/^(https?:|\{|Claude|Codex|zip|AI)/.test(skillsUiStrings.en[key]),
      )
    for (const lang of LANGS) {
      if (lang === 'en') continue
      expect(same(lang).length, `${lang}: ${same(lang).join(', ')}`).toBeLessThan(4)
    }
  })

  it('tells at first connection that every request carries the skills the AI may use on its own', () => {
    // the list of "AI decides" skills goes with each request (agent-core autoSkillsSection);
    // the notice names that setting with the words of the skills screen
    for (const lang of LANGS) {
      expect(aiSubscriptionText(lang, 'noticeSend'), lang).toContain(skillsText(lang, 'invokeAuto'))
    }
  })
})
