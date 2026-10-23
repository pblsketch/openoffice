import type { zh } from './zh'

export const he = {
  loading: 'פותח את הציור…',
  openFailedTitle: 'לא ניתן לפתוח את הציור הזה',
  openFailedNotDrawing: 'הקובץ הזה אינו ציור של Excalidraw.',
  openFailedUnreadable: 'לא ניתן לקרוא את הקובץ. ייתכן שהוא פגום.',
  openFailedTooLarge: 'הקובץ גדול מכדי לפתוח אותו.',
  openFailedError: 'אירעה בעיה בפתיחת הקובץ.',
  saveFailed: 'לא ניתן היה לשמור את הציור.',
  picturesMissing: '{count} תמונות שהציור משתמש בהן לא נמצאו בכספת של הפתק.',
  picturesNotInNote: 'עדיין לא ניתן להוסיף כאן תמונות לציור של Obsidian.',
  linkNotOpened: 'לא ניתן לפתוח את הקישור הזה.',
  autoSave: 'שמירה אוטומטית',
} satisfies Record<keyof typeof zh, string>
