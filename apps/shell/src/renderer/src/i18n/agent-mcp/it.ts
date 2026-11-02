import type { zh } from './zh'

export const it = {
  actMcpTool: 'Strumento MCP',
  permMcpTool: 'Usa lo strumento “{tool}” del server {server}',
  permAllowToolSession: 'Consenti sempre questo strumento in questa sessione',
  mcpKeepInsideWarning:
    'In questa finestra, i contenuti ricevuti da {server} possono uscire da questo PC.',
} satisfies Record<keyof typeof zh, string>
