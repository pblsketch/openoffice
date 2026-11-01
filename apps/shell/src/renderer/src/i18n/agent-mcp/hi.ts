import type { zh } from './zh'

export const hi = {
  actMcpTool: 'MCP टूल',
  permMcpTool: 'सर्वर {server} का “{tool}” टूल इस्तेमाल करें',
  permAllowToolSession: 'इस सत्र में यह टूल हमेशा अनुमति दें',
  mcpKeepInsideWarning: 'इस विंडो में {server} से मिली सामग्री इस PC से बाहर जा सकती है।',
} satisfies Record<keyof typeof zh, string>
