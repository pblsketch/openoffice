import type { zh } from './zh'

export const vi = {
  actMcpTool: 'Công cụ MCP',
  permMcpTool: 'Dùng công cụ “{tool}” của máy chủ {server}',
  permAllowToolSession: 'Luôn cho phép công cụ này trong phiên này',
  mcpKeepInsideWarning: 'Trong cửa sổ này, nội dung nhận từ {server} có thể đi ra ngoài PC này.',
} satisfies Record<keyof typeof zh, string>
