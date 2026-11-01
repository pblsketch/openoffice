import type { zh } from './zh'

export const ja = {
  actMcpTool: 'MCP ツール',
  permMcpTool: '{server} サーバーの「{tool}」ツールを使う',
  permAllowToolSession: 'このセッション中はこのツールを常に許可',
  mcpKeepInsideWarning:
    'このウィンドウでは、{server} から受け取った内容が外部に出る可能性があります。',
} satisfies Record<keyof typeof zh, string>
