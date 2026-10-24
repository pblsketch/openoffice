import type { zh } from './zh'

export const es = {
  title: 'Documentos con contenido sin guardar',
  intro:
    'Estos documentos todavía tienen contenido que no guardó. Elija para cada uno si desea restaurarlo o descartarlo. El contenido descartado no se puede recuperar.',
  restore: 'Restaurar',
  discard: 'Descartar',
  restoreAll: 'Restaurar todo',
  discardAll: 'Descartar todo',
  confirm: 'Aceptar',
  later: 'Decidir más tarde',
  laterHint: 'Cerrar esta lista no elimina nada; se le volverá a preguntar más tarde.',
  untitledFolder: 'Documento nuevo, nunca guardado',
  lastCopy: 'Conservado el {time}',
  changedAfter: 'El archivo cambió después',
  changedAfterNote:
    'Puede que otro programa o una sincronización en la nube lo haya modificado. «Descartar» está seleccionado para que el archivo quede como está ahora.',
  missing: 'No se encuentra el archivo original',
  missingNote:
    'Si lo restaura, se abrirá como un documento nuevo sin título. Al guardar se propondrá la ubicación original.',
  choiceLabel: 'Opción para {name}',
} satisfies Record<keyof typeof zh, string>
