import type { zh } from './zh'

export const ko = {
  actMcpTool: 'MCP 도구',
  permMcpTool: '{server} 서버의 “{tool}” 도구 쓰기',
  permAllowToolSession: '이 세션에서 항상 허용',
  mcpKeepInsideWarning: '이 창에서는 {server}에서 받은 내용이 밖으로 나갈 수 있습니다.',
} satisfies Record<keyof typeof zh, string>
