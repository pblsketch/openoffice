import type { zh } from './zh'

export const hi = {
  setHomeKinds: 'होम पर नए दस्तावेज़',
  setHomeKindsDesc:
    'जिन प्रकारों को आप बंद करते हैं, वे होम के नए दस्तावेज़ कार्ड और “नया” मेनू में नहीं दिखते। उन प्रकारों की फ़ाइलें पहले की तरह खुलती रहती हैं।',
  homeKindUp: '{name} ऊपर ले जाएँ',
  homeKindDown: '{name} नीचे ले जाएँ',
  homeKindsReset: 'मूल क्रम पर लौटाएँ',
} satisfies Record<keyof typeof zh, string>
