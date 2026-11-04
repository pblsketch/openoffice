import type { zh } from './zh'

export const cs = {
  setHomeKinds: 'Nové dokumenty na domovské stránce',
  setHomeKindsDesc:
    'Vypnuté typy zmizí z karet nového dokumentu na domovské stránce a z nabídek Nový. Soubory těchto typů se dál otevírají jako dřív.',
  homeKindUp: 'Posunout {name} nahoru',
  homeKindDown: 'Posunout {name} dolů',
  homeKindsReset: 'Obnovit původní pořadí',
} satisfies Record<keyof typeof zh, string>
