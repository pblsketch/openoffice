import type { zh } from './zh'

export const ar = {
  actMcpTool: 'أداة MCP',
  permMcpTool: 'استخدام الأداة “{tool}” من الخادم {server}',
  permAllowToolSession: 'السماح بهذه الأداة دائمًا في هذه الجلسة',
  mcpKeepInsideWarning: 'في هذه النافذة، قد يخرج المحتوى المستلم من {server} خارج هذا الحاسوب.',
} satisfies Record<keyof typeof zh, string>
