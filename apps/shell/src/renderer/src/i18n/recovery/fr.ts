import type { zh } from './zh'

export const fr = {
  title: 'Documents avec du contenu non enregistré',
  intro:
    'Ces documents contiennent encore du contenu que vous n’avez pas enregistré. Choisissez pour chacun de le restaurer ou de l’abandonner. Le contenu abandonné ne peut pas être récupéré.',
  restore: 'Restaurer',
  discard: 'Abandonner',
  restoreAll: 'Tout restaurer',
  discardAll: 'Tout abandonner',
  confirm: 'Valider',
  later: 'Décider plus tard',
  laterHint: 'Fermer cette liste ne supprime rien ; la question vous sera reposée plus tard.',
  untitledFolder: 'Nouveau document jamais enregistré',
  lastCopy: 'Conservé le {time}',
  changedAfter: 'Le fichier a été modifié depuis',
  changedAfterNote:
    'Un autre programme ou une synchronisation cloud l’a peut-être modifié. « Abandonner » est sélectionné pour garder le fichier tel qu’il est.',
  missing: 'Fichier d’origine introuvable',
  missingNote:
    'Si vous le restaurez, il s’ouvre comme nouveau document sans titre. L’enregistrement propose l’emplacement d’origine.',
  choiceLabel: 'Choix pour {name}',
} satisfies Record<keyof typeof zh, string>
