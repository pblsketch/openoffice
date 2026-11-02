import type { zh } from './zh'

export const de = {
  actMcpTool: 'MCP-Werkzeug',
  permMcpTool: 'Werkzeug „{tool}“ des Servers {server} verwenden',
  permAllowToolSession: 'Dieses Werkzeug in dieser Sitzung immer erlauben',
  mcpKeepInsideWarning:
    'In diesem Fenster können Inhalte, die von {server} empfangen wurden, diesen PC verlassen.',
} satisfies Record<keyof typeof zh, string>
