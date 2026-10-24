import type { zh } from './zh'

export const hi = {
  editUndo: 'पूर्ववत करें',
  editRedo: 'फिर से करें',
  editBold: 'बोल्ड',
  editItalic: 'इटैलिक',
  editReplace: 'बदलें',
  editReplaceWith: 'इससे बदलें',
  editReplaceOne: 'बदलें',
  editReplaceAll: 'सभी बदलें',
  editReplaceDone: '{count} बदले गए',
  editReplaceSkipped: 'केवल-पढ़ने वाले अध्यायों में {count} छोड़े गए',
  editReplaceFailed: '{count} नहीं बदले जा सके',
  editReplaceNone: 'बदलने के लिए कुछ नहीं है',
  editReplaceNotHere: 'यह मिलान बदला नहीं जा सकता',
  editAutoSave: 'स्वतः सहेजें',
  editAutoSaveTip: 'हर 30 सेकंड में और विंडो से फ़ोकस हटने पर सहेजता है',
  editUnsaved: 'बिना सहेजे बदलाव हैं',
  editLocked: 'पुस्तक का अनुवाद होते समय संपादन नहीं किया जा सकता',
  editRefused: 'यह बदलाव नहीं किया जा सका',
  editHistoryFailed: 'पूर्ववत इतिहास पुस्तक से मेल नहीं खाता था, इसलिए साफ़ कर दिया गया',
} satisfies Record<keyof typeof zh, string>
