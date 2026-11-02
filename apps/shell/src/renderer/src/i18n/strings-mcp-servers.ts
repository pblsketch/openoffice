import { createI18n, defineStrings, type Lang, type Params } from '@genoffice/i18n'
import { zh } from './mcp-servers/zh'
import { en } from './mcp-servers/en'
import { ja } from './mcp-servers/ja'
import { ko } from './mcp-servers/ko'
import { fr } from './mcp-servers/fr'
import { de } from './mcp-servers/de'
import { es } from './mcp-servers/es'
import { th } from './mcp-servers/th'
import { id } from './mcp-servers/id'
import { ru } from './mcp-servers/ru'
import { ar } from './mcp-servers/ar'
import { pt } from './mcp-servers/pt'
import { it } from './mcp-servers/it'
import { pl } from './mcp-servers/pl'
import { cs } from './mcp-servers/cs'
import { nl } from './mcp-servers/nl'
import { ms } from './mcp-servers/ms'
import { he } from './mcp-servers/he'
import { hi } from './mcp-servers/hi'
import { zhTW } from './mcp-servers/zh-TW'
import { vi } from './mcp-servers/vi'

/**
 * Settings → Integrations: the MCP server card (user MCP spec 4). Sharded per
 * language; `zh` defines the key set.
 */
export const mcpServersUiStrings = defineStrings({
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

export type McpServersStringKey = keyof typeof zh

const translate = createI18n(mcpServersUiStrings)

export function mcpServersText(lang: Lang, key: McpServersStringKey, params?: Params): string {
  return translate(lang, key, params)
}
