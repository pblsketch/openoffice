import type { zh } from './zh'

export const he = {
  actMcpTool: 'כלי MCP',
  permMcpTool: 'שימוש בכלי „{tool}” של השרת {server}',
  permAllowToolSession: 'לאפשר תמיד את הכלי הזה בהפעלה זו',
  mcpKeepInsideWarning: 'בחלון זה, תוכן שהתקבל מ-{server} עלול לצאת מהמחשב הזה.',
} satisfies Record<keyof typeof zh, string>
