import type { zh } from './zh'

export const ar = {
  docPickTitle: 'إرفاق من مستندات GenOffice',
  docPickOpen: 'المستندات المفتوحة',
  docPickRecent: 'المستندات الأخيرة',
  docPickEmpty: 'لا توجد مستندات لإرفاقها.',
  docPickMissing: 'لم يُعثر على الملف.',
  docPickUnsaved: 'احفظه أولًا.',
  docPickUnavailable: 'تعذّرت قراءة قائمة المستندات.',
  docPickLimit: 'يمكنك تحديد 20 مستندًا كحد أقصى.',
  docPickSelected: 'تم تحديد {n}',
  docPickAttach: 'إرفاق',
  docPickCancel: 'إلغاء',
  docPickWorking: 'جارٍ الإرفاق…',
} satisfies Record<keyof typeof zh, string>
