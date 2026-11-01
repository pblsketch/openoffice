import type { zh } from './zh'

export const en = {
  actMcpTool: 'MCP tool',
  permMcpTool: 'Use the “{tool}” tool of server {server}',
  permAllowToolSession: 'Always allow this tool for this session',
  mcpKeepInsideWarning: 'In this window, content received from {server} can be sent out.',
} satisfies Record<keyof typeof zh, string>
