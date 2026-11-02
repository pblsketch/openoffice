import type { zh } from './zh'

export const ru = {
  actMcpTool: 'Инструмент MCP',
  permMcpTool: 'Использовать инструмент «{tool}» сервера {server}',
  permAllowToolSession: 'Всегда разрешать этот инструмент в этом сеансе',
  mcpKeepInsideWarning:
    'В этом окне содержимое, полученное от {server}, может уйти за пределы этого ПК.',
} satisfies Record<keyof typeof zh, string>
