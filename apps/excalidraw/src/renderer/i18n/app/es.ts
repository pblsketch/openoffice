import type { zh } from './zh'

export const es = {
  loading: 'Abriendo el dibujo…',
  openFailedTitle: 'No se puede abrir este dibujo',
  openFailedNotDrawing: 'Este archivo no es un dibujo de Excalidraw.',
  openFailedUnreadable: 'No se puede leer este archivo. Puede estar dañado.',
  openFailedTooLarge: 'El archivo es demasiado grande para abrirlo.',
  openFailedError: 'Se produjo un problema al abrir el archivo.',
  saveFailed: 'No se pudo guardar el dibujo.',
  picturesMissing:
    'No se encontraron en la bóveda de la nota {count} imágenes que usa este dibujo.',
  picturesNotInNote: 'Aún no se pueden añadir imágenes a un dibujo de Obsidian aquí.',
  linkNotOpened: 'No se puede abrir este enlace.',
  autoSave: 'Guardado automático',
} satisfies Record<keyof typeof zh, string>
