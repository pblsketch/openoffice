import type { zh } from './zh'

export const cs = {
  docPickTitle: 'Připojit z dokumentů GenOffice',
  docPickOpen: 'Otevřené dokumenty',
  docPickRecent: 'Nedávné dokumenty',
  docPickEmpty: 'Nejsou žádné dokumenty k připojení.',
  docPickMissing: 'Soubor nebyl nalezen.',
  docPickUnsaved: 'Nejprve jej uložte.',
  docPickUnavailable: 'Seznam dokumentů se nepodařilo načíst.',
  docPickLimit: 'Vybrat lze nejvýše 20 dokumentů.',
  docPickSelected: 'Vybráno: {n}',
  docPickAttach: 'Připojit',
  docPickCancel: 'Zrušit',
  docPickWorking: 'Připojování…',
} satisfies Record<keyof typeof zh, string>
