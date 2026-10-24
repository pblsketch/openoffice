import type { zh } from './zh'

export const pl = {
  title: 'Dokumenty z niezapisaną zawartością',
  intro:
    'Te dokumenty wciąż zawierają treść, której nie zapisano. Dla każdego wybierz, czy go przywrócić, czy odrzucić. Odrzuconej treści nie można odzyskać.',
  restore: 'Przywróć',
  discard: 'Odrzuć',
  restoreAll: 'Przywróć wszystkie',
  discardAll: 'Odrzuć wszystkie',
  confirm: 'Zatwierdź',
  later: 'Zdecyduj później',
  laterHint: 'Zamknięcie tej listy niczego nie usuwa; pytanie pojawi się ponownie później.',
  untitledFolder: 'Nowy dokument, nigdy niezapisany',
  lastCopy: 'Zachowano {time}',
  changedAfter: 'Plik zmienił się później',
  changedAfterNote:
    'Mógł go zmienić inny program lub synchronizacja w chmurze. Zaznaczono „Odrzuć”, aby plik pozostał taki, jaki jest teraz.',
  missing: 'Nie znaleziono pliku oryginalnego',
  missingNote:
    'Po przywróceniu otworzy się jako nowy dokument bez tytułu. Przy zapisie zostanie zaproponowana pierwotna lokalizacja.',
  choiceLabel: 'Wybór dla {name}',
} satisfies Record<keyof typeof zh, string>
