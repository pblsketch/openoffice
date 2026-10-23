import type { zh } from './zh'

export const hi = {
  loading: 'ड्रॉइंग खोली जा रही है…',
  openFailedTitle: 'यह ड्रॉइंग नहीं खुल सकती',
  openFailedNotDrawing: 'यह फ़ाइल Excalidraw ड्रॉइंग नहीं है।',
  openFailedUnreadable: 'यह फ़ाइल पढ़ी नहीं जा सकती। यह खराब हो सकती है।',
  openFailedTooLarge: 'फ़ाइल खोलने के लिए बहुत बड़ी है।',
  openFailedError: 'फ़ाइल खोलते समय कोई समस्या हुई।',
  saveFailed: 'ड्रॉइंग सहेजी नहीं जा सकी।',
  picturesMissing: 'इस ड्रॉइंग में इस्तेमाल {count} चित्र नोट के वॉल्ट में नहीं मिले।',
  picturesNotInNote: 'Obsidian ड्रॉइंग में अभी यहाँ चित्र नहीं जोड़े जा सकते।',
  linkNotOpened: 'यह लिंक नहीं खुल सकता।',
  autoSave: 'स्वतः सहेजें',
} satisfies Record<keyof typeof zh, string>
