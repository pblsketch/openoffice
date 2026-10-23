import type { zh } from './zh'

export const ar = {
  loading: 'جارٍ فتح الرسم…',
  openFailedTitle: 'تعذّر فتح هذا الرسم',
  openFailedNotDrawing: 'هذا الملف ليس رسمًا من Excalidraw.',
  openFailedUnreadable: 'تعذّرت قراءة هذا الملف. ربما يكون تالفًا.',
  openFailedTooLarge: 'الملف كبير جدًا بحيث لا يمكن فتحه.',
  openFailedError: 'حدثت مشكلة أثناء فتح الملف.',
  saveFailed: 'تعذّر حفظ الرسم.',
  picturesMissing: 'لم يُعثر في خزنة الملاحظة على {count} من الصور التي يستخدمها هذا الرسم.',
  picturesNotInNote: 'لا يمكن بعد إضافة صور إلى رسم Obsidian هنا.',
  linkNotOpened: 'تعذّر فتح هذا الرابط.',
  autoSave: 'حفظ تلقائي',
} satisfies Record<keyof typeof zh, string>
