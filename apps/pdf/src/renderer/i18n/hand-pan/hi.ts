import type { zh } from './zh'

export const hi = {
  handTool: 'हाथ टूल',
  handToolTip:
    'चालू होने पर, पेज का दृश्य खिसकाने के लिए खींचें। बीच वाला बटन (व्हील) दबाकर खींचने से यह कभी भी खिसकता है। बंद करने के लिए Esc दबाएँ।',
} satisfies Record<keyof typeof zh, string>
