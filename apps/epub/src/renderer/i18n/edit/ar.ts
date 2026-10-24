import type { zh } from './zh'

export const ar = {
  editUndo: 'تراجع',
  editRedo: 'إعادة',
  editBold: 'غامق',
  editItalic: 'مائل',
  editReplace: 'استبدال',
  editReplaceWith: 'الاستبدال بـ',
  editReplaceOne: 'استبدال',
  editReplaceAll: 'استبدال الكل',
  editReplaceDone: 'تم استبدال {count}',
  editReplaceSkipped: 'تم تخطي {count} في فصول للقراءة فقط',
  editReplaceFailed: 'تعذر استبدال {count}',
  editReplaceNone: 'لا يوجد ما يُستبدل',
  editReplaceNotHere: 'لا يمكن استبدال هذا التطابق',
  editAutoSave: 'حفظ تلقائي',
  editAutoSaveTip: 'يحفظ كل 30 ثانية وعندما تفقد النافذة التركيز',
  editUnsaved: 'توجد تغييرات غير محفوظة',
  editLocked: 'لا يمكن التحرير أثناء ترجمة الكتاب',
  editRefused: 'تعذر إجراء هذا التغيير',
  editHistoryFailed: 'لم يعد سجل التراجع مطابقًا للكتاب فتم مسحه',
} satisfies Record<keyof typeof zh, string>
