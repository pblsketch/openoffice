import type { zh } from './zh'

export const nl = {
  actMcpTool: 'MCP-hulpmiddel',
  permMcpTool: 'Het hulpmiddel ‘{tool}’ van server {server} gebruiken',
  permAllowToolSession: 'Dit hulpmiddel deze sessie altijd toestaan',
  mcpKeepInsideWarning: 'In dit venster kan inhoud die van {server} is ontvangen deze pc verlaten.',
} satisfies Record<keyof typeof zh, string>
