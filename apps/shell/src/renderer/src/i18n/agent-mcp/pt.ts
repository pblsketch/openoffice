import type { zh } from './zh'

export const pt = {
  actMcpTool: 'Ferramenta MCP',
  permMcpTool: 'Usar a ferramenta “{tool}” do servidor {server}',
  permAllowToolSession: 'Permitir sempre esta ferramenta nesta sessão',
  mcpKeepInsideWarning: 'Nesta janela, o conteúdo recebido de {server} pode sair deste PC.',
} satisfies Record<keyof typeof zh, string>
