import type { zh } from './zh'

export const es = {
  actMcpTool: 'Herramienta MCP',
  permMcpTool: 'Usar la herramienta «{tool}» del servidor {server}',
  permAllowToolSession: 'Permitir siempre esta herramienta en esta sesión',
  mcpKeepInsideWarning:
    'En esta ventana, el contenido recibido de {server} puede salir de este PC.',
} satisfies Record<keyof typeof zh, string>
