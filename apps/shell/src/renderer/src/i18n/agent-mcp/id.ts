import type { zh } from './zh'

export const id = {
  actMcpTool: 'Alat MCP',
  permMcpTool: 'Gunakan alat “{tool}” dari server {server}',
  permAllowToolSession: 'Selalu izinkan alat ini selama sesi ini',
  mcpKeepInsideWarning:
    'Di jendela ini, konten yang diterima dari {server} dapat keluar dari PC ini.',
} satisfies Record<keyof typeof zh, string>
