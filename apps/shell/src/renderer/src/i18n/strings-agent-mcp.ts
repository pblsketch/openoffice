import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './agent-mcp/zh'
import { en } from './agent-mcp/en'
import { ja } from './agent-mcp/ja'
import { ko } from './agent-mcp/ko'
import { fr } from './agent-mcp/fr'
import { de } from './agent-mcp/de'
import { es } from './agent-mcp/es'
import { th } from './agent-mcp/th'
import { id } from './agent-mcp/id'
import { ru } from './agent-mcp/ru'
import { ar } from './agent-mcp/ar'
import { pt } from './agent-mcp/pt'
import { it } from './agent-mcp/it'
import { pl } from './agent-mcp/pl'
import { cs } from './agent-mcp/cs'
import { nl } from './agent-mcp/nl'
import { ms } from './agent-mcp/ms'
import { he } from './agent-mcp/he'
import { hi } from './agent-mcp/hi'
import { zhTW } from './agent-mcp/zh-TW'
import { vi } from './agent-mcp/vi'

/**
 * The agent window's strings for the relays of the person's MCP servers (user
 * MCP spec 9), kept apart from the window's other strings. Sharded per
 * language; `zh` defines the key set.
 */
export const agentMcpStrings = defineStrings({
  zh,
  en,
  ja,
  ko,
  fr,
  de,
  es,
  th,
  id,
  ru,
  ar,
  pt,
  it,
  pl,
  cs,
  nl,
  ms,
  he,
  hi,
  'zh-TW': zhTW,
  vi,
})

export type AgentMcpStringKey = keyof typeof zh

const translate = createI18n(agentMcpStrings)

export function agentMcpText(lang: Lang, key: AgentMcpStringKey, params?: Params): string {
  return translate(lang, key, params)
}
