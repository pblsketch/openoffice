import type { zh } from './zh'

export const ru = {
  editUndo: 'Отменить',
  editRedo: 'Повторить',
  editBold: 'Полужирный',
  editItalic: 'Курсив',
  editReplace: 'Заменить',
  editReplaceWith: 'Заменить на',
  editReplaceOne: 'Заменить',
  editReplaceAll: 'Заменить все',
  editReplaceDone: 'Заменено: {count}',
  editReplaceSkipped: 'Пропущено в главах только для чтения: {count}',
  editReplaceFailed: 'Не удалось заменить: {count}',
  editReplaceNone: 'Нечего заменять',
  editReplaceNotHere: 'Это совпадение нельзя заменить',
  editAutoSave: 'Автосохранение',
  editAutoSaveTip: 'Сохраняет каждые 30 секунд и когда окно теряет фокус',
  editUnsaved: 'Есть несохранённые изменения',
  editLocked: 'Пока книга переводится, редактировать нельзя',
  editRefused: 'Не удалось внести это изменение',
  editHistoryFailed: 'Журнал отмены перестал совпадать с книгой и был очищен',
} satisfies Record<keyof typeof zh, string>
