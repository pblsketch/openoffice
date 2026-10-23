import type { zh } from './zh'

export const ru = {
  loading: 'Открытие рисунка…',
  openFailedTitle: 'Не удаётся открыть этот рисунок',
  openFailedNotDrawing: 'Этот файл не является рисунком Excalidraw.',
  openFailedUnreadable: 'Не удаётся прочитать файл. Возможно, он повреждён.',
  openFailedTooLarge: 'Файл слишком большой, чтобы его открыть.',
  openFailedError: 'При открытии файла возникла проблема.',
  saveFailed: 'Не удалось сохранить рисунок.',
  picturesMissing:
    'В хранилище заметки не найдено изображений, используемых этим рисунком: {count}.',
  picturesNotInNote: 'Добавлять изображения в рисунок Obsidian здесь пока нельзя.',
  linkNotOpened: 'Не удаётся открыть эту ссылку.',
  autoSave: 'Автосохранение',
} satisfies Record<keyof typeof zh, string>
