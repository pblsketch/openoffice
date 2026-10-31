import type { zh } from './zh'

export const hi = {
  driveNav: 'Google Drive',
  driveDesc:
    'Google Drive में फ़ाइलें चुनें, फिर उन्हें GenOffice में खोलें और संपादित करें; सहेजने पर वे Drive में वापस चली जाती हैं। GenOffice केवल वही फ़ाइलें खोल सकता है जो आप चुनते हैं।',
  driveConnect: 'Google Drive कनेक्ट करें',
  driveConnecting: 'ब्राउज़र में अपने Google खाते से साइन इन करें और पहुँच की अनुमति दें…',
  driveCancel: 'रद्द करें',
  driveConnectedAs: '{email} के रूप में कनेक्ट',
  driveDisconnect: 'डिस्कनेक्ट करें',
  driveDisconnectConfirm:
    'इससे इस पीसी से Drive साइन-इन हट जाएगा और Google से GenOffice की पहुँच वापस लेने का अनुरोध किया जाएगा। इस पीसी पर मौजूद प्रतियाँ बनी रहेंगी।',
  driveDisconnectYes: 'डिस्कनेक्ट करें',
  driveNotPersisted:
    'यह पीसी साइन-इन को एन्क्रिप्ट करके नहीं रख सकता, इसलिए ऐप बंद करने पर कनेक्शन खत्म हो जाता है।',
  driveExpired:
    'Google ने कनेक्शन खत्म कर दिया: पहुँच वापस ले ली गई या साइन-इन की अवधि खत्म हो गई। फिर से कनेक्ट करें।',
  driveAiAccess: 'AI को Drive में फ़ाइलें खोजने और पढ़ने दें',
  driveAiAccessDesc:
    'चालू होने पर, एडिटर का AI उन Drive फ़ाइलों में खोज सकता है और उन्हें पढ़ सकता है जो आपने यहाँ चुनी हैं। जो वह पढ़ता है, वह आपके उपयोग वाले AI प्रदाता को जाता है। AI Drive की फ़ाइलें बदल, हटा या साझा नहीं कर सकता।',
  drivePrivacy:
    'फ़ाइलों की सूचियाँ और सामग्री केवल इस पीसी और Google के बीच जाती हैं। वे कभी भी GenOffice बनाने वालों के सर्वर से नहीं गुज़रतीं।',
  driveFailDenied: 'कनेक्शन नहीं हुआ क्योंकि Google ने अनुमति नहीं दी।',
  driveFailScope:
    'कनेक्शन नहीं हुआ क्योंकि Drive पहुँच पर निशान नहीं लगाया गया था। फिर से कनेक्ट करें और Drive वाले विकल्प पर निशान लगाएँ।',
  driveFailTimeout: 'साइन-इन 10 मिनट में पूरा नहीं हुआ। फिर से कोशिश करें।',
  driveFailNetwork:
    'Google तक नहीं पहुँचा जा सका। अपना इंटरनेट कनेक्शन जाँचें और फिर से कोशिश करें।',
  driveRecent: 'आपकी चुनी हुई फ़ाइलें',
  driveSearchPlaceholder: 'चुनी हुई फ़ाइलों में खोजें',
  driveSearchResults: '“{q}” के परिणाम',
  driveRefresh: 'रीफ़्रेश करें',
  driveNotConnectedTitle: 'Google Drive कनेक्ट नहीं है',
  driveNotConnectedBody:
    'कनेक्ट होने के बाद आप Drive की फ़ाइलें चुनकर यहाँ खोल और संपादित कर सकते हैं, और सहेजने पर वे Drive में वापस चली जाती हैं।',
  driveOpenSettings: 'सेटिंग्स में कनेक्ट करें',
  driveEmpty: 'अभी कोई फ़ाइल नहीं है। फ़ाइलें चुनने के लिए “Google Drive से चुनें” पर क्लिक करें।',
  driveLoading: 'लोड हो रहा है…',
  driveLoadMore: 'और दिखाएँ',
  driveOpening: 'खुल रहा है…',
  driveGoogleBadge: 'Google फ़ॉर्मेट',
  driveGoogleNote:
    'Google दस्तावेज़ Office फ़ाइल के रूप में खुलता है। सहेजने पर मूल फ़ाइल जैसी है वैसी रहती है और उसके पास या मेरी ड्राइव में Office फ़ाइल सहेजी जाती है।',
  driveReadOnly: 'केवल देखने के लिए',
  driveReadOnlyNote:
    'आप यह फ़ाइल संपादित नहीं कर सकते। सहेजते समय पूछा जाएगा कि क्या Drive में एक प्रति सहेजनी है।',
  driveUnsupported: 'यह ऐप इस प्रकार की फ़ाइल नहीं खोल सकता।',
  driveErrNotConnected: 'Google Drive डिस्कनेक्ट हो गया है। सेटिंग्स में फिर से कनेक्ट करें।',
  driveErrNotFound: 'फ़ाइल नहीं मिली। उसे हटा दिया गया है, या यह खाता उसे नहीं देख सकता।',
  driveErrForbidden: 'इस खाते को यह फ़ाइल डाउनलोड करने की अनुमति नहीं है।',
  driveErrTooLarge: 'फ़ाइल खोलने के लिए बहुत बड़ी है।',
  driveErrRateLimit: 'Google कुछ देर के लिए अनुरोध रोक रहा है। थोड़ी देर में फिर से कोशिश करें।',
  driveErrNetwork: 'Google Drive तक नहीं पहुँचा जा सका। अपना इंटरनेट कनेक्शन जाँचें।',
  driveErrDisk: 'फ़ाइल इस पीसी पर सहेजी नहीं जा सकी।',
  drivePick: 'Google Drive से चुनें',
  drivePicking: 'ब्राउज़र में खुली Google विंडो में फ़ाइलें चुनें…',
  drivePickNote:
    'GenOffice केवल वही Drive फ़ाइलें खोल सकता है जो आप Google की विंडो में चुनते हैं। एक बार चुनी गई फ़ाइलें इस सूची में बनी रहती हैं।',
  driveTrainingTitle: 'AI के साथ Drive फ़ाइलें इस्तेमाल करने से पहले',
  driveTrainingBody:
    'Google ऐसी AI सेवा को Drive फ़ाइलें भेजने की अनुमति नहीं देता जो उनसे अपने मॉडल प्रशिक्षित करती है। Claude, ChatGPT और Codex के निजी प्लान आपकी चैट को प्रशिक्षण के लिए इस्तेमाल कर सकते हैं, जब तक आप इसे बंद न करें: Claude में सेटिंग्स → गोपनीयता में, ChatGPT में सेटिंग्स → डेटा नियंत्रण → “Improve the model for everyone” में। API कुंजी वाले प्रदाता डिफ़ॉल्ट रूप से API डेटा पर प्रशिक्षण नहीं करते। मुफ़्त AI कनेक्शन को कभी Drive फ़ाइलें नहीं दी जातीं।',
  driveTrainingAck:
    'Drive फ़ाइलों के साथ इस्तेमाल होने वाले मेरे AI खातों में मॉडल प्रशिक्षण बंद है',
  driveFailTraining: 'पहले ऊपर मॉडल प्रशिक्षण वाले विकल्प पर निशान लगाएँ।',
} satisfies Record<keyof typeof zh, string>
