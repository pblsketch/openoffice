import type { zh } from './zh'

export const ru = {
  docPickTitle: 'Прикрепить из документов GenOffice',
  docPickOpen: 'Открытые документы',
  docPickRecent: 'Недавние документы',
  docPickEmpty: 'Нет документов для прикрепления.',
  docPickMissing: 'Файл не найден.',
  docPickUnsaved: 'Сначала сохраните его.',
  docPickUnavailable: 'Не удалось прочитать список документов.',
  docPickLimit: 'Можно выбрать не более 20 документов.',
  docPickSelected: 'Выбрано: {n}',
  docPickAttach: 'Прикрепить',
  docPickCancel: 'Отмена',
  docPickWorking: 'Прикрепление…',
} satisfies Record<keyof typeof zh, string>
