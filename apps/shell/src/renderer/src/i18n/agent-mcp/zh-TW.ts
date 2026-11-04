import type { zh } from './zh'

export const zhTW = {
  actMcpTool: 'MCP 工具',
  permMcpTool: '使用 {server} 伺服器的「{tool}」工具',
  permAllowToolSession: '本次工作階段中一律允許此工具',
  mcpKeepInsideWarning: '在此視窗中，從 {server} 收到的內容可能會傳到外部。',
} satisfies Record<keyof typeof zh, string>
