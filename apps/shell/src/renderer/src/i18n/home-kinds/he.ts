import type { zh } from './zh'

export const he = {
  setHomeKinds: 'מסמכים חדשים בדף הבית',
  setHomeKindsDesc:
    'סוגים כבויים לא יופיעו בכרטיסי המסמך החדש בדף הבית ובתפריטי "חדש". קבצים מסוגים אלה עדיין נפתחים כרגיל.',
  homeKindUp: 'הזזת {name} למעלה',
  homeKindDown: 'הזזת {name} למטה',
  homeKindsReset: 'שחזור הסדר המקורי',
} satisfies Record<keyof typeof zh, string>
