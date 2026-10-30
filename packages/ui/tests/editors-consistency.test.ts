/**
 * The editors were moved to the subscription contract one by one and
 * drifted apart in small ways. These guards read their sources and keep three
 * things shared: the AI entry label, the send gate, and the reading of
 * subscription IPC answers.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { AI_SUBSCRIPTION_STRINGS } from '../src/strings-ai-subscription'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const source = (path: string): string => readFileSync(join(REPO, path), 'utf8')

const LABEL_CALL = "aiSubscriptionText(lang, 'aiAssistant')"

interface Editor {
  /** the AI panel: its title and its resizer label */
  panel: string
  /** the ribbon's AI button */
  ribbon: string
  /** where the panel's send path asks the gate */
  gate: string
  /** the editor's own locale files */
  locales: string
  /** keys the label used to live under */
  retiredKeys: string[]
}

const EDITORS: Record<string, Editor> = {
  docs: {
    panel: 'apps/docs/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/docs/src/renderer/components/Ribbon.tsx',
    gate: 'apps/docs/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/docs/src/renderer/i18n',
    retiredKeys: ['aiPanelTitle', 'ribbonAiAssistant'],
  },
  sheets: {
    panel: 'apps/sheets/src/renderer/ai/AiChatPanel.tsx',
    ribbon: 'apps/sheets/src/renderer/ExcelShell.tsx',
    gate: 'apps/sheets/src/renderer/App.tsx',
    locales: 'apps/sheets/src/renderer/i18n',
    retiredKeys: [],
  },
  slides: {
    panel: 'apps/slides/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/slides/src/renderer/components/RibbonHomeTab.tsx',
    gate: 'apps/slides/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/slides/src/renderer/i18n',
    retiredKeys: ['aiPanelTitle', 'ribbonAiAssistant'],
  },
  pdf: {
    panel: 'apps/pdf/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/pdf/src/renderer/App.tsx',
    gate: 'apps/pdf/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/pdf/src/renderer/i18n',
    retiredKeys: ['ribbonAiAssistant'],
  },
  markdown: {
    panel: 'apps/markdown/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/markdown/src/renderer/components/Ribbon.tsx',
    gate: 'apps/markdown/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/markdown/src/renderer/i18n',
    retiredKeys: ['aiEntryLabel'],
  },
  html: {
    panel: 'apps/html/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/html/src/renderer/components/Ribbon.tsx',
    gate: 'apps/html/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/html/src/renderer/i18n',
    retiredKeys: [],
  },
  mindmap: {
    panel: 'apps/mindmap/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/mindmap/src/renderer/components/Toolbar.tsx',
    gate: 'apps/mindmap/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/mindmap/src/renderer/i18n',
    retiredKeys: [],
  },
  // no ribbon of its own (the embedded editor brings its chrome): the AI entry is the dock rail
  hwp: {
    panel: 'apps/hwp/src/renderer/ai/AiPanel.tsx',
    ribbon: 'apps/hwp/src/renderer/ai/AiDock.tsx',
    gate: 'apps/hwp/src/renderer/ai/AiPanel.tsx',
    locales: 'apps/hwp/src/renderer/i18n',
    retiredKeys: [],
  },
}

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(REPO, dir))) {
    const path = `${dir}/${name}`
    if (statSync(join(REPO, path)).isDirectory()) out.push(...filesUnder(path))
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe('the AI entry label', () => {
  it('is one shared key with a value in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      expect(AI_SUBSCRIPTION_STRINGS[lang].aiAssistant.trim().length, lang).toBeGreaterThan(0)
    }
    expect(AI_SUBSCRIPTION_STRINGS.en.aiAssistant).toBe('AI Assistant')
    expect(AI_SUBSCRIPTION_STRINGS.ko.aiAssistant).toBe('AI 도우미')
  })

  it.each(Object.keys(EDITORS))('%s: the panel title and its resizer label use it', (name) => {
    const panel = source(EDITORS[name]!.panel)
    const title = panel.match(/className="ai-panel-title">[\s\S]{0,160}?<\/span>/)
    expect(title?.[0], 'panel title').toContain(LABEL_CALL)
    const resizer = panel.match(/className="ai-panel-resizer"[\s\S]{0,260}?\/>/)
    expect(resizer?.[0], 'resizer label').toContain(`aria-label={${LABEL_CALL}}`)
  })

  it.each(Object.keys(EDITORS))('%s: the ribbon AI button uses it', (name) => {
    const ribbon = source(EDITORS[name]!.ribbon)
    // the button that opens the panel: the `ai-entry` control with the open-assistant tip
    const button = ribbon.match(
      /ai-entry[^\n]*\n\s*data-tip=\{t\('aiOpenAssistant'\)\}[\s\S]{0,420}?<\/button>/,
    )
    expect(button?.[0], 'ribbon AI button').toContain(LABEL_CALL)
    // no bare "AI" left as the button text
    expect(button?.[0]).not.toMatch(/>AI</)
  })

  it.each(Object.keys(EDITORS))('%s: no key of its own carries the label any more', (name) => {
    const editor = EDITORS[name]!
    expect(existsSync(join(REPO, editor.locales))).toBe(true)
    const files = filesUnder(editor.locales)
    for (const key of editor.retiredKeys) {
      const defined = files.filter((file) => new RegExp(`^\\s+${key}:`, 'm').test(source(file)))
      expect(defined, key).toEqual([])
      for (const file of [editor.panel, editor.ribbon]) {
        expect(source(file), `${file} uses ${key}`).not.toContain(`'${key}'`)
      }
    }
  })
})

describe('the send gate', () => {
  it.each(Object.keys(EDITORS))('%s: sends go through the shared gate', (name) => {
    const gate = source(EDITORS[name]!.gate)
    expect(gate).toContain('useAiSendGate<')
    // the send path asks it, the message queue asks it, and both panel buttons end in it
    expect(gate).toMatch(/sendGate\.admit\(/)
    expect(gate).toMatch(/\.continueWith\(provider/)
    const wiring = name === 'sheets' ? source('apps/sheets/src/renderer/ai/AiChatPanel.tsx') : gate
    expect(`${gate}\n${wiring}`).toMatch(/admitQueued\(/)
    expect(`${gate}\n${wiring}`).toMatch(/acknowledgeNotice|onAcknowledgeNotice/)
  })

  it.each(Object.keys(EDITORS))(
    '%s: the connect prompt is told when a send was refused',
    (name) => {
      const panel = source(EDITORS[name]!.panel)
      const prompt = panel.match(/<AiConnectPrompt[\s\S]{0,900}?\/>/)
      expect(prompt?.[0], 'connect prompt').toMatch(/attention=\{[\w.]*connectAttention\}/)
    },
  )

  it.each(Object.keys(EDITORS))('%s: only the latest blocked reply can be continued', (name) => {
    const panel = source(EDITORS[name]!.panel)
    const notice = panel.match(/<AiBlockedNotice[\s\S]{0,900}?\/>/)
    // older replies get no statuses, so the notice offers nothing to continue on
    expect(notice?.[0], 'blocked notice').toMatch(/statuses=\{[\s\S]*?&& !(ai)?[bB]usy[\s\S]*?\}/)
  })

  it.each(Object.keys(EDITORS))('%s: carries no gate of its own', (name) => {
    const dir = name === 'sheets' ? 'apps/sheets/src/renderer/ai' : `apps/${name}/src/renderer/ai`
    for (const file of filesUnder(dir)) {
      const text = source(file)
      expect(text, file).not.toMatch(/export function (aiPanelGate|aiSendGate|gateAllowsSend)\b/)
      expect(text, file).not.toMatch(
        /export function (aiGateAllowsSend|firstConnectionNoticeDue)\b/,
      )
      expect(text, file).not.toMatch(
        /export function with(Subscription|AiSubscription)NoticeSeen\b/,
      )
    }
  })
})

describe('the subscription usage heads-up', () => {
  // "83% used · resets at 5:10 PM" is long. Inside the composer footer it was
  // squeezed between the token chip and the attach buttons and painted over
  // them in a narrow panel, so it sits on its own row above the input card.
  const PANELS: Record<string, string> = {
    docs: 'apps/docs/src/renderer/ai/AiPanel.tsx',
    sheets: 'apps/sheets/src/renderer/ai/AiChatPanel.tsx',
    slides: 'apps/slides/src/renderer/ai/AiPanel.tsx',
    pdf: 'apps/pdf/src/renderer/ai/AiPanel.tsx',
    markdown: 'apps/markdown/src/renderer/ai/AiPanel.tsx',
    html: 'apps/html/src/renderer/ai/AiPanel.tsx',
    mindmap: 'apps/mindmap/src/renderer/ai/AiPanel.tsx',
    hwp: 'apps/hwp/src/renderer/ai/AiPanel.tsx',
    epub: 'apps/epub/src/renderer/ai/AiPanel.tsx',
  }

  it.each(Object.entries(PANELS))('%s: renders it above the input card', (_name, path) => {
    const panel = source(path)
    const usage = panel.indexOf('<AiSubscriptionUsageLine')
    expect(usage, 'usage line').toBeGreaterThan(-1)
    const card = Math.min(
      ...['<AiComposer', '<div className="ai-input-box">']
        .map((needle) => panel.indexOf(needle))
        .filter((index) => index >= 0),
    )
    expect(Number.isFinite(card), 'composer card').toBe(true)
    // anything inside AiComposer's footerStart comes after the composer opens
    expect(usage, `${path}: usage line must precede the composer card`).toBeLessThan(card)
  })
})

describe('reading subscription IPC answers', () => {
  const APPS = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html', 'mindmap', 'hwp', 'shell']

  it.each(APPS)('%s: the local contract file re-exports the shared readers', (app) => {
    const text = source(`apps/${app}/src/shared/subscription-api.ts`)
    expect(text).not.toMatch(/export function (subscription\w+Of|checkingSubscriptionStatuses)\b/)
    expect(text).not.toMatch(/export function isSubscriptionProviderId\b/)
    const reexport = text.match(/export \{([^}]*)\} from '@genoffice\/ai-provider\/browser'/)
    expect(reexport?.[1]).toContain('subscriptionStatusMapOf')
    expect(reexport?.[1]).toContain('subscriptionLaunchResultOf')
    expect(reexport?.[1]).toContain('checkingSubscriptionStatuses')
  })
})

describe('the first-connection notice', () => {
  // Codex writes a diagnostic log on the PC that the app can neither read nor
  // prevent; the notice says so wherever it is first shown, not only in the shell.
  it.each(Object.entries(EDITORS))('%s shows the Codex sentence', (_name, editor) => {
    const panel = source(editor.panel)
    expect(panel).toContain('<AiFirstConnectionNotice')
    expect(panel).not.toContain('codexKeepsHistory={false}')
    expect(panel).toMatch(/<AiFirstConnectionNotice[^>]*\bcodexKeepsHistory\b/)
  })

  // only the PDF editor sends page images and whole documents (AI page reading, translation)
  it.each(Object.entries(EDITORS))(
    '%s: the whole-document sentence is PDF only',
    (name, editor) => {
      const panel = source(editor.panel)
      if (name === 'pdf')
        expect(panel).toMatch(/<AiFirstConnectionNotice[^>]*\bsendsWholeDocument\b/)
      else expect(panel).not.toContain('sendsWholeDocument')
    },
  )
})
