import type { zh } from './zh'

export const th = {
  actMcpTool: 'เครื่องมือ MCP',
  permMcpTool: 'ใช้เครื่องมือ “{tool}” ของเซิร์ฟเวอร์ {server}',
  permAllowToolSession: 'อนุญาตเครื่องมือนี้เสมอในเซสชันนี้',
  mcpKeepInsideWarning: 'ในหน้าต่างนี้ เนื้อหาที่ได้รับจาก {server} อาจถูกส่งออกไปภายนอกได้',
} satisfies Record<keyof typeof zh, string>
