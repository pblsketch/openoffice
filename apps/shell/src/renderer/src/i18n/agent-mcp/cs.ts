import type { zh } from './zh'

export const cs = {
  actMcpTool: 'Nástroj MCP',
  permMcpTool: 'Použít nástroj „{tool}“ serveru {server}',
  permAllowToolSession: 'V této relaci tento nástroj vždy povolit',
  mcpKeepInsideWarning:
    'V tomto okně může obsah přijatý ze serveru {server} opustit tento počítač.',
} satisfies Record<keyof typeof zh, string>
