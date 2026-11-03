import type { zh } from './zh'

export const ru = {
  setHomeKinds: 'Новые документы на главной',
  setHomeKindsDesc:
    'Отключённые типы пропадают с карточек создания на главной и из меню «Создать». Файлы этих типов по-прежнему открываются.',
  homeKindUp: 'Поднять {name}',
  homeKindDown: 'Опустить {name}',
  homeKindsReset: 'Вернуть исходный порядок',
} satisfies Record<keyof typeof zh, string>
