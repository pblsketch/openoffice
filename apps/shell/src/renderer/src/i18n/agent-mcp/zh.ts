/**
 * The agent window's relays of the person's MCP servers (user MCP spec 9): the
 * permission card of an `ask` tool and the start warning. This file defines the
 * key set; every other language file satisfies `Record<keyof typeof zh, string>`.
 */
export const zh = {
  actMcpTool: 'MCP 工具',
  permMcpTool: '使用 {server} 服务器的“{tool}”工具',
  permAllowToolSession: '本次会话中始终允许此工具',
  mcpKeepInsideWarning: '在此窗口中，从 {server} 收到的内容可能会被发送到外部。',
}
