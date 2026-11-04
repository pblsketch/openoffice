import type { zh } from './zh'

export const de = {
  setHomeKinds: 'Neue Dokumente auf der Startseite',
  setHomeKindsDesc:
    'Ausgeschaltete Typen erscheinen nicht mehr in den Karten für neue Dokumente auf der Startseite und in den Menüs „Neu“. Dateien dieser Typen lassen sich weiterhin öffnen.',
  homeKindUp: '{name} nach oben',
  homeKindDown: '{name} nach unten',
  homeKindsReset: 'Ursprüngliche Reihenfolge',
} satisfies Record<keyof typeof zh, string>
