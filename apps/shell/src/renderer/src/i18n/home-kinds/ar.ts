import type { zh } from './zh'

export const ar = {
  setHomeKinds: 'المستندات الجديدة في الصفحة الرئيسية',
  setHomeKindsDesc:
    'الأنواع التي توقفها لا تظهر في بطاقات المستند الجديد في الصفحة الرئيسية ولا في قوائم «جديد». تبقى ملفات هذه الأنواع تُفتح كالمعتاد.',
  homeKindUp: 'نقل {name} لأعلى',
  homeKindDown: 'نقل {name} لأسفل',
  homeKindsReset: 'استعادة الترتيب الأصلي',
} satisfies Record<keyof typeof zh, string>
