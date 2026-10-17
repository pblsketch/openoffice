import type { zh } from './zh'

export const fr = {
  docPickTitle: 'Joindre depuis des documents GenOffice',
  docPickOpen: 'Documents ouverts',
  docPickRecent: 'Documents récents',
  docPickEmpty: 'Aucun document à joindre.',
  docPickMissing: 'Fichier introuvable.',
  docPickUnsaved: 'Enregistrez-le d’abord.',
  docPickUnavailable: 'Impossible de lire la liste des documents.',
  docPickLimit: 'Vous pouvez choisir jusqu’à 20 documents.',
  docPickSelected: '{n} sélectionné(s)',
  docPickAttach: 'Joindre',
  docPickCancel: 'Annuler',
  docPickWorking: 'Ajout en cours…',
} satisfies Record<keyof typeof zh, string>
