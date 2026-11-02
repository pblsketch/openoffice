import type { zh } from './zh'

export const fr = {
  actMcpTool: 'Outil MCP',
  permMcpTool: 'Utiliser l’outil « {tool} » du serveur {server}',
  permAllowToolSession: 'Toujours autoriser cet outil pendant cette session',
  mcpKeepInsideWarning: 'Dans cette fenêtre, le contenu reçu de {server} peut sortir de ce PC.',
} satisfies Record<keyof typeof zh, string>
