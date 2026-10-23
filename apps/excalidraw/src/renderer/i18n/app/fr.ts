import type { zh } from './zh'

export const fr = {
  loading: 'Ouverture du dessin…',
  openFailedTitle: 'Impossible d’ouvrir ce dessin',
  openFailedNotDrawing: 'Ce fichier n’est pas un dessin Excalidraw.',
  openFailedUnreadable: 'Impossible de lire ce fichier. Il est peut-être endommagé.',
  openFailedTooLarge: 'Ce fichier est trop volumineux pour être ouvert.',
  openFailedError: 'Un problème est survenu à l’ouverture du fichier.',
  saveFailed: 'Le dessin n’a pas pu être enregistré.',
  picturesMissing:
    '{count} images utilisées par ce dessin sont introuvables dans le coffre de la note.',
  picturesNotInNote: 'Impossible pour l’instant d’ajouter des images à un dessin Obsidian ici.',
  linkNotOpened: 'Impossible d’ouvrir ce lien.',
  autoSave: 'Enregistrement auto',
} satisfies Record<keyof typeof zh, string>
