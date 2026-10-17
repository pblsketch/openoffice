import type { zh } from './zh'

export const hi = {
  docPickTitle: 'GenOffice दस्तावेज़ों से संलग्न करें',
  docPickOpen: 'खुले दस्तावेज़',
  docPickRecent: 'हाल के दस्तावेज़',
  docPickEmpty: 'संलग्न करने के लिए कोई दस्तावेज़ नहीं है।',
  docPickMissing: 'फ़ाइल नहीं मिली।',
  docPickUnsaved: 'पहले इसे सहेजें।',
  docPickUnavailable: 'दस्तावेज़ों की सूची पढ़ी नहीं जा सकी।',
  docPickLimit: 'आप अधिकतम 20 दस्तावेज़ चुन सकते हैं।',
  docPickSelected: '{n} चुने गए',
  docPickAttach: 'संलग्न करें',
  docPickCancel: 'रद्द करें',
  docPickWorking: 'संलग्न किया जा रहा है…',
} satisfies Record<keyof typeof zh, string>
