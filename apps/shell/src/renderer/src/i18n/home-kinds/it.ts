import type { zh } from './zh'

export const it = {
  setHomeKinds: 'Nuovi documenti nella Home',
  setHomeKindsDesc:
    'I tipi disattivati non compaiono più nelle schede di nuovo documento della Home e nei menu Nuovo. I file di quei tipi si aprono come prima.',
  homeKindUp: 'Sposta su {name}',
  homeKindDown: 'Sposta giù {name}',
  homeKindsReset: 'Ripristina l’ordine iniziale',
} satisfies Record<keyof typeof zh, string>
