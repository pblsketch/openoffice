import type { zh } from './zh'

export const he = {
  editUndo: 'ביטול',
  editRedo: 'ביצוע מחדש',
  editBold: 'מודגש',
  editItalic: 'נטוי',
  editReplace: 'החלפה',
  editReplaceWith: 'להחליף ב־',
  editReplaceOne: 'החלפה',
  editReplaceAll: 'החלפת הכול',
  editReplaceDone: 'הוחלפו {count}',
  editReplaceSkipped: 'דולגו {count} בפרקים לקריאה בלבד',
  editReplaceFailed: 'לא ניתן היה להחליף {count}',
  editReplaceNone: 'אין מה להחליף',
  editReplaceNotHere: 'לא ניתן להחליף את ההתאמה הזו',
  editAutoSave: 'שמירה אוטומטית',
  editAutoSaveTip: 'שומר כל 30 שניות וכשהחלון מאבד את המיקוד',
  editUnsaved: 'יש שינויים שלא נשמרו',
  editLocked: 'לא ניתן לערוך בזמן שהספר מתורגם',
  editRefused: 'לא ניתן היה לבצע את השינוי הזה',
  editHistoryFailed: 'היסטוריית הביטולים כבר לא תאמה את הספר ולכן נמחקה',
} satisfies Record<keyof typeof zh, string>
