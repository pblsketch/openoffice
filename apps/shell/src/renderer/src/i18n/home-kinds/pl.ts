import type { zh } from './zh'

export const pl = {
  setHomeKinds: 'Nowe dokumenty na stronie głównej',
  setHomeKindsDesc:
    'Wyłączone typy znikają z kart nowego dokumentu na stronie głównej i z menu Nowy. Pliki tych typów nadal się otwierają.',
  homeKindUp: 'Przesuń {name} w górę',
  homeKindDown: 'Przesuń {name} w dół',
  homeKindsReset: 'Przywróć pierwotną kolejność',
} satisfies Record<keyof typeof zh, string>
