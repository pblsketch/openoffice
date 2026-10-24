import type { zh } from './zh'

export const es = {
  editUndo: 'Deshacer',
  editRedo: 'Rehacer',
  editBold: 'Negrita',
  editItalic: 'Cursiva',
  editReplace: 'Reemplazar',
  editReplaceWith: 'Reemplazar por',
  editReplaceOne: 'Reemplazar',
  editReplaceAll: 'Reemplazar todo',
  editReplaceDone: 'Se reemplazaron {count}',
  editReplaceSkipped: 'Se omitieron {count} en capítulos de solo lectura',
  editReplaceFailed: 'No se pudieron reemplazar {count}',
  editReplaceNone: 'No hay nada que reemplazar',
  editReplaceNotHere: 'Esta coincidencia no se puede reemplazar',
  editAutoSave: 'Guardado automático',
  editAutoSaveTip: 'Guarda cada 30 segundos y cuando la ventana pierde el foco',
  editUnsaved: 'Cambios sin guardar',
  editLocked: 'No se puede editar mientras se traduce el libro',
  editRefused: 'No se pudo aplicar este cambio',
  editHistoryFailed: 'El historial de deshacer ya no coincidía con el libro y se borró',
} satisfies Record<keyof typeof zh, string>
