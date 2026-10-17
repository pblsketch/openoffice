import type { zh } from './zh'

export const pl = {
  docPickTitle: 'Załącz z dokumentów GenOffice',
  docPickOpen: 'Otwarte dokumenty',
  docPickRecent: 'Ostatnie dokumenty',
  docPickEmpty: 'Brak dokumentów do załączenia.',
  docPickMissing: 'Nie znaleziono pliku.',
  docPickUnsaved: 'Najpierw go zapisz.',
  docPickUnavailable: 'Nie udało się odczytać listy dokumentów.',
  docPickLimit: 'Można wybrać maksymalnie 20 dokumentów.',
  docPickSelected: 'Zaznaczono: {n}',
  docPickAttach: 'Załącz',
  docPickCancel: 'Anuluj',
  docPickWorking: 'Załączanie…',
} satisfies Record<keyof typeof zh, string>
