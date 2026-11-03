import type { zh } from './zh'

export const fr = {
  setHomeKinds: 'Nouveaux documents sur l’accueil',
  setHomeKindsDesc:
    'Les types désactivés disparaissent des cartes de création de l’accueil et des menus Nouveau. Les fichiers de ces types s’ouvrent toujours normalement.',
  homeKindUp: 'Monter {name}',
  homeKindDown: 'Descendre {name}',
  homeKindsReset: 'Rétablir l’ordre initial',
} satisfies Record<keyof typeof zh, string>
