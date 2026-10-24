import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  AGENT_CHANNELS,
  type AgentEventPayload,
  type AgentInit,
  type AgentInstallProposalPayload,
  type AgentPrefs,
  type AgentProjectPrefs,
  type AgentProjectSkillsView,
  type AgentSkillProposalPayload,
  type AgentStartResponse,
  type AgentTemplateAsIs,
  type AgentTemplateBlank,
  type AgentTemplateCheck,
  type AgentWindowApi,
} from '../shared/agent-api'
import type { UserSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import type { UserSkillPreviewEnded } from '@genoffice/electron-utils/user-skills-channels'

type Theme = 'light' | 'dark' | 'system'

function themeOf(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// The agent window's narrow API (decision 0032): its own sessions and the theme
// broadcast. Nothing else from the shell; no subscription sign-in or sign-out.
const api: AgentWindowApi = {
  async getInit() {
    return (await ipcRenderer.invoke(AGENT_CHANNELS.getInit)) as AgentInit
  },
  async getTheme() {
    return themeOf(await ipcRenderer.invoke(AGENT_CHANNELS.getTheme))
  },
  onThemeChanged(handler) {
    const listener = (_event: IpcRendererEvent, theme: unknown) => handler(themeOf(theme))
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  async pickFolder() {
    const folder: unknown = await ipcRenderer.invoke(AGENT_CHANNELS.pickFolder)
    return typeof folder === 'string' ? folder : null
  },
  async setPrefs(prefs) {
    return (await ipcRenderer.invoke(AGENT_CHANNELS.setPrefs, prefs)) as AgentPrefs
  },
  async start(request) {
    return (await ipcRenderer.invoke(AGENT_CHANNELS.start, request)) as AgentStartResponse
  },
  async send(sessionId, text) {
    return (await ipcRenderer.invoke(AGENT_CHANNELS.send, sessionId, text)) === true
  },
  async answer(sessionId, requestId, allow, scope) {
    await ipcRenderer.invoke(AGENT_CHANNELS.answer, sessionId, requestId, allow, scope ?? 'once')
  },
  async getProjectPrefs(folder) {
    return (await ipcRenderer.invoke(
      AGENT_CHANNELS.getProjectPrefs,
      folder,
    )) as AgentProjectPrefs | null
  },
  async setProjectPrefs(folder, patch) {
    return (await ipcRenderer.invoke(
      AGENT_CHANNELS.setProjectPrefs,
      folder,
      patch,
    )) as AgentProjectPrefs | null
  },
  async getProjectSkills(folder) {
    return (await ipcRenderer.invoke(
      AGENT_CHANNELS.getProjectSkills,
      folder,
    )) as AgentProjectSkillsView | null
  },
  async setProjectSkills(folder, on) {
    return (await ipcRenderer.invoke(
      AGENT_CHANNELS.setProjectSkills,
      folder,
      on === true,
    )) as AgentProjectSkillsView | null
  },
  async stop(sessionId) {
    await ipcRenderer.invoke(AGENT_CHANNELS.stop, sessionId)
  },
  async openFile(sessionId, path) {
    return (await ipcRenderer.invoke(AGENT_CHANNELS.openFile, sessionId, path)) === true
  },
  onEvent(handler) {
    const listener = (_event: IpcRendererEvent, payload: AgentEventPayload) => handler(payload)
    ipcRenderer.on(AGENT_CHANNELS.event, listener)
    return () => ipcRenderer.removeListener(AGENT_CHANNELS.event, listener)
  },
  onSkillProposal(handler) {
    const listener = (_event: IpcRendererEvent, payload: AgentSkillProposalPayload) =>
      handler(payload)
    ipcRenderer.on(AGENT_CHANNELS.skillProposal, listener)
    return () => ipcRenderer.removeListener(AGENT_CHANNELS.skillProposal, listener)
  },
  onInstallProposal(handler) {
    const listener = (_event: IpcRendererEvent, payload: AgentInstallProposalPayload) =>
      handler(payload)
    ipcRenderer.on(AGENT_CHANNELS.installProposal, listener)
    return () => ipcRenderer.removeListener(AGENT_CHANNELS.installProposal, listener)
  },
  async templateCheck(proposalKey, candidateId) {
    const answer: unknown = await ipcRenderer
      .invoke(AGENT_CHANNELS.templateCheck, proposalKey, candidateId)
      .catch(() => null)
    return resultOf<AgentTemplateCheck>(answer)
  },
  async templateAsIs(proposalKey, candidateId) {
    const answer: unknown = await ipcRenderer
      .invoke(AGENT_CHANNELS.templateAsIs, proposalKey, candidateId)
      .catch(() => null)
    return resultOf<AgentTemplateAsIs>(answer)
  },
  async templateBlank(proposalKey, candidateId, request) {
    const answer: unknown = await ipcRenderer
      .invoke(AGENT_CHANNELS.templateBlank, proposalKey, candidateId, request)
      .catch(() => null)
    return resultOf<AgentTemplateBlank>(answer)
  },
}

contextBridge.exposeInMainWorld('aiOfficeAgentWindow', api)

// The agent window's part of the skills bridge (`aiOfficeUserSkills`): the `/`
// list, skill cards, the one-time notice and the way to the settings page.
// The channel names are written out here on purpose: the shell preload
// bundles user-skills-channels, and a value module both preloads import
// becomes a shared chunk this sandboxed preload cannot load. The wiring test
// (tests/user-skills-wiring.test.ts) keeps these names equal to the shared ones.
const SKILLS_CHANNELS = {
  list: 'skills:list',
  read: 'skills:read',
  suggestName: 'skills:suggest-name',
  checkName: 'skills:check-name',
  saveFromCard: 'skills:save-from-card',
  openSettings: 'skills:open-settings',
  agentNotice: 'skills:agent-notice',
  agentNoticeSeen: 'skills:agent-notice-seen',
  changed: 'skills:changed',
  // the GitHub preview of an install a session proposed (spec 6.4): the main
  // process lets this window make these three management calls and no other
  importGitHub: 'skills:import-github',
  cancelImport: 'skills:cancel-import',
  install: 'skills:install',
  // a template preview tab a card opened (spec 6.3)
  focusTab: 'skills:focus-tab',
  previewEnded: 'skills:preview-ended',
} as const

type AgentSkillsApi = Pick<
  UserSkillsBridge,
  | 'list'
  | 'read'
  | 'suggestName'
  | 'checkName'
  | 'saveFromCard'
  | 'openSettings'
  | 'agentNotice'
  | 'markAgentNoticeSeen'
  | 'onChanged'
  | 'importGitHub'
  | 'cancelImport'
  | 'install'
  | 'focusTab'
  | 'onPreviewEnded'
>

/** A template preview's end as the main process sends it, checked here */
function previewEndedOf(raw: unknown): UserSkillPreviewEnded | null {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof value.previewId !== 'string' || !value.previewId) return null
  if (value.outcome !== 'saved' && value.outcome !== 'unsaved') return null
  return {
    previewId: value.previewId,
    outcome: value.outcome,
    ...(typeof value.skillId === 'string' ? { skillId: value.skillId } : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
  }
}

function resultOf<T>(value: unknown): T {
  return (
    value && typeof value === 'object' && typeof (value as { ok?: unknown }).ok === 'boolean'
      ? value
      : { ok: false, reason: 'failed' }
  ) as T
}

const skillsApi: AgentSkillsApi = {
  async list() {
    const list: unknown = await ipcRenderer.invoke(SKILLS_CHANNELS.list).catch(() => [])
    return (Array.isArray(list) ? list : []).filter(
      (item) => item && typeof item === 'object' && typeof item.id === 'string',
    )
  },
  async read(id) {
    return resultOf(await ipcRenderer.invoke(SKILLS_CHANNELS.read, String(id)).catch(() => null))
  },
  async suggestName(title) {
    const name: unknown = await ipcRenderer
      .invoke(SKILLS_CHANNELS.suggestName, String(title))
      .catch(() => '')
    return typeof name === 'string' ? name : ''
  },
  async checkName(name, forId) {
    const answer: unknown = await ipcRenderer
      .invoke(SKILLS_CHANNELS.checkName, String(name), forId)
      .catch(() => null)
    const value = (answer && typeof answer === 'object' ? answer : {}) as {
      ok?: unknown
      problem?: unknown
    }
    if (value.ok === true) return { ok: true }
    return {
      ok: false,
      problem: typeof value.problem === 'string' ? (value.problem as 'taken') : 'empty',
    }
  },
  async saveFromCard(input) {
    return resultOf(await ipcRenderer.invoke(SKILLS_CHANNELS.saveFromCard, input).catch(() => null))
  },
  async openSettings() {
    await ipcRenderer.invoke(SKILLS_CHANNELS.openSettings).catch(() => undefined)
  },
  async agentNotice() {
    return (await ipcRenderer.invoke(SKILLS_CHANNELS.agentNotice).catch(() => false)) === true
  },
  async markAgentNoticeSeen() {
    await ipcRenderer.invoke(SKILLS_CHANNELS.agentNoticeSeen).catch(() => undefined)
  },
  onChanged(listener) {
    const handler = () => listener()
    ipcRenderer.on(SKILLS_CHANNELS.changed, handler)
    return () => ipcRenderer.removeListener(SKILLS_CHANNELS.changed, handler)
  },
  async importGitHub(address) {
    return resultOf(
      await ipcRenderer.invoke(SKILLS_CHANNELS.importGitHub, String(address)).catch(() => null),
    )
  },
  async cancelImport(token) {
    await ipcRenderer.invoke(SKILLS_CHANNELS.cancelImport, token).catch(() => undefined)
  },
  async install(token, selected, onCollision) {
    return resultOf(
      await ipcRenderer
        .invoke(SKILLS_CHANNELS.install, { token, selected, onCollision: onCollision ?? {} })
        .catch(() => null),
    )
  },
  async focusTab(tabId) {
    return resultOf(
      await ipcRenderer.invoke(SKILLS_CHANNELS.focusTab, String(tabId)).catch(() => null),
    )
  },
  onPreviewEnded(listener) {
    const handler = (_event: IpcRendererEvent, raw: unknown) => {
      const ended = previewEndedOf(raw)
      if (ended) listener(ended)
    }
    ipcRenderer.on(SKILLS_CHANNELS.previewEnded, handler)
    return () => ipcRenderer.removeListener(SKILLS_CHANNELS.previewEnded, handler)
  },
}

contextBridge.exposeInMainWorld('aiOfficeUserSkills', skillsApi)
