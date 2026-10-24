import type { zh } from './zh'

export const he = {
  title: 'מסמכים עם תוכן שלא נשמר',
  intro:
    'במסמכים אלה עדיין יש תוכן שלא שמרת. בחר לכל מסמך אם לשחזר אותו או להשליך אותו. לא ניתן לשחזר תוכן שהושלך.',
  restore: 'שחזור',
  discard: 'השלכה',
  restoreAll: 'שחזור הכול',
  discardAll: 'השלכת הכול',
  confirm: 'אישור',
  later: 'להחליט מאוחר יותר',
  laterHint: 'סגירת הרשימה לא מוחקת דבר; השאלה תופיע שוב מאוחר יותר.',
  untitledFolder: 'מסמך חדש שמעולם לא נשמר',
  lastCopy: 'נשמר ב-{time}',
  changedAfter: 'הקובץ השתנה לאחר מכן',
  changedAfterNote:
    'ייתכן שתוכנה אחרת או סנכרון ענן שינו אותו. נבחרה "השלכה" כדי שהקובץ יישאר כפי שהוא עכשיו.',
  missing: 'הקובץ המקורי לא נמצא',
  missingNote: 'בשחזור הוא ייפתח כמסמך חדש ללא שם. בשמירה יוצע המיקום המקורי.',
  choiceLabel: 'בחירה עבור {name}',
} satisfies Record<keyof typeof zh, string>
